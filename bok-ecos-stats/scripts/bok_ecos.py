#!/usr/bin/env python3
"""Read-only Bank of Korea ECOS economic statistics helper (stdlib only).

Site-dependent access path (discovered live 2026-07-21):

    GET https://ecos.bok.or.kr/api/<Service>/<key>/json/kr/<start>/<end>/<segments...>

- Positional URL segments, no query string.
- The published demo key ``sample`` works without registration but caps each
  call at 10 rows (exceeding it returns ERROR-301).
- Invalid keys return HTTP 200 with {"RESULT": {"CODE": "INFO-100", ...}}.
- Empty results return {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}.

Services used:
- StatisticSearch/<stat>/<cycle>/<start>/<end>[/<item1>] — time series cells
- StatisticTableList — table catalog
- StatisticItemList/<stat> — items of one table
- KeyStatisticList — 100+ headline indicators (환율/금리/물가 등)
- StatisticWord/<keyword> — glossary

Because the demo key works without registration, this skill calls upstream
directly (no k-skill-proxy route). Users may set KSKILL_BOK_ECOS_API_KEY for
larger row limits.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

ECOS_BASE_URL = "https://ecos.bok.or.kr/api"
ECOS_DEMO_KEY = "sample"
SAMPLE_MAX_ROWS = 10
DEFAULT_SECRETS_PATH = pathlib.Path("~/.config/k-skill/secrets.env").expanduser()
USER_AGENT = "k-skill-bok-ecos/0.1 (+https://github.com/NomaDamas/k-skill)"

# 자주 쓰는 지표 alias → (stat_code, cycle, item_code)
ALIASES = {
    "기준금리": ("722Y001", "D", "0101000"),
    "원달러환율": ("731Y001", "D", "0000001"),
    "원/달러환율": ("731Y001", "D", "0000001"),
    "소비자물가지수": ("901Y009", "M", "0"),
    "cpi": ("901Y009", "M", "0"),
    "m2": ("101Y004", "M", "BBHA00"),
    "통화량": ("101Y004", "M", "BBHA00"),
    "국고채3년": ("817Y002", "D", "010200000"),
}

SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9_.\-]+$")

ERROR_HINTS = {
    "INFO-100": "인증키가 유효하지 않습니다. KSKILL_BOK_ECOS_API_KEY를 확인하거나 https://ecos.bok.or.kr/api 에서 키를 발급받으세요.",
    "ERROR-301": "sample 키는 최대 10건까지만 조회할 수 있습니다. 더 많은 행이 필요하면 개인 키를 발급받아 KSKILL_BOK_ECOS_API_KEY로 지정하세요.",
}

EMPTY_CODES = {"INFO-200"}


class HelperError(RuntimeError):
    pass


def load_secrets(path: pathlib.Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return values
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_api_key(secrets_path: str) -> Optional[str]:
    env_value = os.environ.get("KSKILL_BOK_ECOS_API_KEY")
    if env_value and env_value.strip():
        return env_value.strip()
    secrets = load_secrets(pathlib.Path(secrets_path).expanduser())
    value = secrets.get("KSKILL_BOK_ECOS_API_KEY")
    return value.strip() if value and value.strip() else None


def _check_segment(value: str, label: str) -> str:
    if not SEGMENT_PATTERN.match(value or ""):
        raise HelperError(f"올바른 {label} 값이 아닙니다: {value!r}")
    return value


def _resolve_series(args: argparse.Namespace) -> tuple[str, str, Optional[str]]:
    if args.alias:
        needle = args.alias.strip().lower()
        if needle not in ALIASES:
            known = ", ".join(sorted(ALIASES))
            raise HelperError(f"알 수 없는 alias 입니다: {args.alias!r} (지원: {known})")
        stat_code, cycle, item_code = ALIASES[needle]
        return stat_code, cycle, item_code
    if not args.stat_code:
        raise HelperError("--stat-code 또는 --alias 중 하나가 필요합니다.")
    if not args.cycle:
        raise HelperError("--stat-code 사용 시 --cycle(A/S/Q/M/SM/D)이 필요합니다.")
    return (
        _check_segment(args.stat_code, "stat-code"),
        _check_segment(args.cycle, "cycle"),
        _check_segment(args.item_code, "item-code") if args.item_code else None,
    )


def build_url(args: argparse.Namespace, api_key: Optional[str]) -> str:
    key = api_key or ECOS_DEMO_KEY
    limit = max(1, args.limit)
    if key == ECOS_DEMO_KEY:
        limit = min(limit, SAMPLE_MAX_ROWS)

    if args.command == "search":
        stat_code, cycle, item_code = _resolve_series(args)
        start = _check_segment(args.start, "start")
        end = _check_segment(args.end, "end")
        segments = [ECOS_BASE_URL, "StatisticSearch", key, "json", "kr", "1", str(limit), stat_code, cycle, start, end]
        if item_code:
            segments.append(item_code)
        return "/".join(segments)
    if args.command == "tables":
        return "/".join([ECOS_BASE_URL, "StatisticTableList", key, "json", "kr", "1", str(limit)]) + "/"
    if args.command == "items":
        stat_code = _check_segment(args.stat_code, "stat-code")
        return "/".join([ECOS_BASE_URL, "StatisticItemList", key, "json", "kr", "1", str(limit), stat_code])
    if args.command == "key":
        return "/".join([ECOS_BASE_URL, "KeyStatisticList", key, "json", "kr", "1", str(limit)]) + "/"
    # word
    query = (args.query or "").strip()
    if not query:
        raise HelperError("--query 검색어가 필요합니다.")
    encoded = urllib.parse.quote(query, safe="")
    return "/".join([ECOS_BASE_URL, "StatisticWord", key, "json", "kr", "1", str(limit), encoded])


def http_get_json(url: str, timeout: int) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raise HelperError(f"ECOS HTTP 오류: {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise HelperError(f"ECOS 접속 실패: {exc.reason}") from exc
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise HelperError("ECOS 응답이 JSON이 아닙니다 (차단 또는 점검 가능성).") from exc


def normalize_payload(payload: Dict[str, Any], service: str) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        raise HelperError("ECOS 응답 형식이 올바르지 않습니다.")
    result = payload.get("RESULT")
    if isinstance(result, dict):
        code = str(result.get("CODE") or "")
        if code in EMPTY_CODES:
            return []
        message = ERROR_HINTS.get(code) or f"ECOS 오류 [{code}]: {result.get('MESSAGE', '')}"
        raise HelperError(message)
    body = payload.get(service)
    if not isinstance(body, dict) or not isinstance(body.get("row"), list):
        raise HelperError("ECOS 응답에서 데이터 행을 찾지 못했습니다 (서비스명/파라미터 확인).")
    return [row for row in body["row"] if isinstance(row, dict)]


def _project(rows: List[Dict[str, Any]], mapping: Dict[str, str]) -> List[Dict[str, Any]]:
    return [{out: row.get(src) for out, src in mapping.items()} for row in rows]


PROJECTIONS = {
    "search": {
        "stat_code": "STAT_CODE",
        "stat_name": "STAT_NAME",
        "item_name": "ITEM_NAME1",
        "unit": "UNIT_NAME",
        "time": "TIME",
        "value": "DATA_VALUE",
    },
    "tables": {
        "stat_code": "STAT_CODE",
        "stat_name": "STAT_NAME",
        "cycle": "CYCLE",
        "searchable": "SRCH_YN",
        "org": "ORG_NAME",
    },
    "items": {
        "stat_code": "STAT_CODE",
        "item_code": "ITEM_CODE",
        "item_name": "ITEM_NAME",
        "cycle": "CYCLE",
        "start_time": "START_TIME",
        "end_time": "END_TIME",
    },
    "key": {
        "class_name": "CLASS_NAME",
        "name": "KEYSTAT_NAME",
        "value": "DATA_VALUE",
        "cycle": "CYCLE",
        "unit": "UNIT_NAME",
    },
    "word": {
        "word": "WORD",
        "content": "CONTENT",
    },
}

SERVICES = {
    "search": "StatisticSearch",
    "tables": "StatisticTableList",
    "items": "StatisticItemList",
    "key": "KeyStatisticList",
    "word": "StatisticWord",
}


def render_text(command: str, rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return "조건에 맞는 데이터가 없습니다."
    lines = []
    for row in rows:
        if command == "search":
            lines.append(f"{row['time']} · {row['item_name']}: {row['value']} {row['unit'] or ''}".rstrip())
        elif command == "key":
            lines.append(f"[{row['class_name']}] {row['name']}: {row['value']} {row['unit'] or ''} ({row['cycle']})")
        elif command == "tables":
            lines.append(f"{row['stat_code']} · {row['stat_name']} (주기 {row['cycle'] or '-'})")
        elif command == "items":
            lines.append(f"{row['item_code']} · {row['item_name']} ({row['cycle']}, {row['start_time']}~{row['end_time']})")
        else:
            lines.append(f"{row['word']}: {row['content']}")
    return "\n".join(lines)


def parse_args(argv: List[str]) -> argparse.Namespace:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--secrets-path", default=str(DEFAULT_SECRETS_PATH))
    common.add_argument("--timeout", type=int, default=30)
    common.add_argument("--limit", type=int, default=10, help="조회 행 수 (sample 키는 최대 10)")
    common.add_argument("--text", action="store_true", help="사람용 요약 출력")

    parser = argparse.ArgumentParser(description="한국은행 ECOS 경제통계 조회")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search = subparsers.add_parser("search", parents=[common], help="통계코드/alias 기반 시계열 조회")
    search.add_argument("--stat-code", help="통계표 코드 (예: 722Y001)")
    search.add_argument("--cycle", help="주기: A/S/Q/M/SM/D")
    search.add_argument("--item-code", help="통계항목 코드 (선택)")
    search.add_argument("--alias", help="자주 쓰는 지표 별칭 (기준금리/원달러환율/소비자물가지수/M2/국고채3년)")
    search.add_argument("--start", required=True, help="시작 시점 (주기 형식에 맞춤, 예: 20260101, 202601, 2026)")
    search.add_argument("--end", required=True, help="종료 시점")

    subparsers.add_parser("tables", parents=[common], help="통계표 목록")

    items = subparsers.add_parser("items", parents=[common], help="통계표의 항목 목록")
    items.add_argument("--stat-code", required=True)

    subparsers.add_parser("key", parents=[common], help="100대 핵심 지표 (환율/금리/물가 등)")

    word = subparsers.add_parser("word", parents=[common], help="통계 용어 사전 검색")
    word.add_argument("--query", required=True)

    return parser.parse_args(argv)


def run(argv: List[str]) -> int:
    args = parse_args(argv)
    try:
        api_key = resolve_api_key(args.secrets_path)
        url = build_url(args, api_key)
        payload = http_get_json(url, args.timeout)
        raw_rows = normalize_payload(payload, SERVICES[args.command])
        rows = _project(raw_rows, PROJECTIONS[args.command])
        if args.text:
            print(render_text(args.command, rows))
        else:
            print(json.dumps({
                "result": "ok" if rows else "empty",
                "rows": rows,
                "source": "ecos.bok.or.kr Open API",
            }, ensure_ascii=False, indent=2))
        return 0
    except HelperError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:]))
