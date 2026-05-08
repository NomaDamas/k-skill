#!/usr/bin/env python3
"""Read-only KOSIS (kosis.kr) Open API helper.

The script wraps four KOSIS endpoints needed to answer everyday Korean
official-statistics questions:

    - statisticsSearch.do        : keyword search of statistical tables
    - statisticsData.do?getMeta  : table metadata (dimensions, units)
    - statisticsParameterData.do : actual data cells filtered by classifier
    - statisticsBigData.do       : large datasets (requires userStatsId)

It only reads. It never registers user statistics, edits anything, or
performs aggressive polling.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SEARCH_URL = "https://kosis.kr/openapi/statisticsSearch.do"
META_URL = "https://kosis.kr/openapi/statisticsData.do"
DATA_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
BIGDATA_URL = "https://kosis.kr/openapi/statisticsBigData.do"

DEFAULT_TIMEOUT = 30
PRD_SE_VALUES = {"M", "Q", "S", "Y", "F", "IR"}
BIGDATA_FORMATS = {"json", "sdmx", "csv", "xls"}

ERROR_CODE_HINTS: dict[str, str] = {
    "10": "인증키가 누락되었습니다. KSKILL_KOSIS_API_KEY 환경변수를 확인하세요.",
    "11": "인증키가 만료되었습니다. https://kosis.kr/openapi/ 에서 갱신하세요.",
    "20": "필수 요청 변수가 누락되었습니다. 인자 목록을 확인하세요.",
    "21": "잘못된 요청 변수입니다. orgId/tblId/기간 형식을 재확인하세요.",
    "30": "조회 결과가 없습니다. 키워드/기간/분류 필터를 완화해 보세요.",
    "31": "조회 결과가 한도(40,000셀)를 초과했습니다. 기간/분류를 분할하거나 bigdata 서브커맨드를 사용하세요.",
    "40": "분당 호출 한도(1,000건)를 초과했습니다. 잠시 대기 후 재시도하세요.",
    "41": "1회 호출 ROW 한도를 초과했습니다. 쿼리를 분할하세요.",
    "42": "사용자별 이용이 제한되었습니다. KOSIS 운영팀에 문의하세요.",
    "50": "KOSIS 서버 오류입니다. 1~2초 대기 후 재시도하세요.",
}


@dataclass
class KosisConfig:
    api_key: str
    timeout: int = DEFAULT_TIMEOUT


class KosisError(RuntimeError):
    def __init__(self, code: str | None, message: str) -> None:
        self.code = code or ""
        super().__init__(message)


def parse_resultcount(value: str) -> int:
    try:
        result = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if not 1 <= result <= 5000:
        raise argparse.ArgumentTypeError("must be between 1 and 5000")
    return result


def parse_prd_se(value: str) -> str:
    upper = value.strip().upper()
    if upper not in PRD_SE_VALUES:
        raise argparse.ArgumentTypeError(
            "must be one of: " + ", ".join(sorted(PRD_SE_VALUES))
        )
    return upper


def parse_bigdata_format(value: str) -> str:
    lower = value.strip().lower()
    if lower not in BIGDATA_FORMATS:
        raise argparse.ArgumentTypeError(
            "must be one of: " + ", ".join(sorted(BIGDATA_FORMATS))
        )
    return lower


def _add_common_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default {DEFAULT_TIMEOUT}).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the request URL and parameters without calling KOSIS.",
    )
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true", help="Print JSON output.")
    output.add_argument("--text", action="store_true", help="Print human-readable output.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only KOSIS Open API helper. "
        "Place output flags (--json/--text/--dry-run/--timeout) AFTER the subcommand.",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="Search statistical tables by keyword.")
    _add_common_flags(search)
    search.add_argument("--query", required=True, help="Korean keyword (e.g. '1인 가구').")
    search.add_argument(
        "--result-count",
        type=parse_resultcount,
        default=20,
        help="Result count, 1-5000 (default 20).",
    )
    search.add_argument(
        "--start-count",
        type=int,
        default=1,
        help="Result offset for pagination (default 1).",
    )

    meta = sub.add_parser("meta", help="Fetch table metadata (dimensions, units).")
    _add_common_flags(meta)
    meta.add_argument("--org-id", default="101", help="Organization ID (default 101).")
    meta.add_argument("--table-id", required=True, help="KOSIS table ID, e.g. DT_1IN0001.")
    meta.add_argument(
        "--meta-type",
        default="TBL",
        choices=["TBL", "ITM", "OBJ"],
        help="Meta type (default TBL).",
    )

    data = sub.add_parser("data", help="Fetch table data filtered by classifiers.")
    _add_common_flags(data)
    data.add_argument("--org-id", default="101", help="Organization ID (default 101).")
    data.add_argument("--table-id", required=True, help="KOSIS table ID.")
    data.add_argument(
        "--prd-se",
        type=parse_prd_se,
        required=True,
        help="Period frequency: M Q S Y F IR.",
    )
    data.add_argument("--start", required=True, help="Start period (format depends on --prd-se).")
    data.add_argument("--end", required=True, help="End period.")
    data.add_argument("--itm-id", default="ALL", help="Item ID filter (default ALL).")
    data.add_argument(
        "--obj-l",
        action="append",
        default=[],
        metavar="N=VALUE",
        help="Classifier filter, e.g. --obj-l 1=ALL --obj-l 2=00. Repeatable. "
        "If omitted, --obj-l 1=ALL is used.",
    )

    bigdata = sub.add_parser(
        "bigdata",
        help="Fetch large datasets via statisticsBigData (requires userStatsId).",
    )
    _add_common_flags(bigdata)
    bigdata.add_argument(
        "--user-stats-id",
        required=True,
        help="userStatsId pre-registered on KOSIS (개발가이드 > 대용량 통계자료 > URL생성).",
    )
    bigdata.add_argument(
        "--format",
        dest="bigdata_format",
        type=parse_bigdata_format,
        default="json",
        help="Output format: json sdmx csv xls (default json).",
    )
    bigdata.add_argument(
        "--prd-se",
        type=parse_prd_se,
        help="Period frequency override.",
    )
    bigdata.add_argument(
        "--new-est-prd-cnt",
        type=int,
        help="Count of latest periods to fetch (alternative to start/end).",
    )

    return parser.parse_args(argv)


def load_secrets_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    secrets: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        secrets[key.strip()] = value.strip().strip('"').strip("'")
    return secrets


def resolve_api_key(
    *,
    env: dict[str, str] | None = None,
    secrets_path: Path | None = None,
) -> str:
    env_map = env if env is not None else os.environ
    direct = env_map.get("KSKILL_KOSIS_API_KEY")
    if direct:
        return direct.strip()

    candidate = secrets_path or Path("~/.config/k-skill/secrets.env").expanduser()
    secrets = load_secrets_env(candidate)
    fallback = secrets.get("KSKILL_KOSIS_API_KEY")
    if fallback:
        return fallback.strip()

    raise SystemExit(
        "missing required environment variable: KSKILL_KOSIS_API_KEY\n"
        "발급: https://kosis.kr/openapi/ (무료, KOSIS 회원가입 후 활용신청)\n"
        "참조: kosis-stats/references/kosis-openapi-guide.md"
    )


def parse_obj_l(values: list[str]) -> dict[str, str]:
    objs: dict[str, str] = {}
    for raw in values:
        if "=" not in raw:
            raise SystemExit(f"--obj-l must be N=VALUE, got: {raw}")
        key, _, value = raw.partition("=")
        key = key.strip()
        if not key.isdigit() or not 1 <= int(key) <= 8:
            raise SystemExit(f"--obj-l index must be 1..8, got: {key}")
        objs[f"objL{key}"] = value.strip() or "ALL"
    if not objs:
        objs["objL1"] = "ALL"
    return objs


def build_search_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    return {
        "method": "getList",
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "searchNm": args.query,
        "resultCount": str(args.result_count),
        "startCount": str(args.start_count),
    }


def build_meta_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    return {
        "method": "getMeta",
        "type": args.meta_type,
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "orgId": args.org_id,
        "tblId": args.table_id,
    }


def build_data_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    params: dict[str, str] = {
        "method": "getList",
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "orgId": args.org_id,
        "tblId": args.table_id,
        "itmId": args.itm_id,
        "prdSe": args.prd_se,
        "startPrdDe": args.start,
        "endPrdDe": args.end,
    }
    params.update(parse_obj_l(args.obj_l))
    return params


def build_bigdata_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    params: dict[str, str] = {
        "method": "getList",
        "apiKey": api_key,
        "format": args.bigdata_format,
        "jsonVD": "Y",
        "userStatsId": args.user_stats_id,
    }
    if args.prd_se:
        params["prdSe"] = args.prd_se
    if args.new_est_prd_cnt is not None:
        params["newEstPrdCnt"] = str(args.new_est_prd_cnt)
    return params


def build_url(base: str, params: dict[str, str]) -> str:
    query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return f"{base}?{query}"


def fetch_text(url: str, timeout: int) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "k-skill/kosis-stats"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise KosisError(str(exc.code), f"HTTP {exc.code}: {body[:200]}") from exc
    except urllib.error.URLError as exc:
        raise KosisError(None, f"network error: {exc.reason}") from exc


def fix_unquoted_keys(text: str) -> str:
    """KOSIS sometimes returns JSON with unquoted keys."""
    return re.sub(r'([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', text)


def parse_kosis_json(text: str) -> Any:
    body = text.strip()
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return json.loads(fix_unquoted_keys(body))


_XML_ERROR_RE = re.compile(
    r"<error>\s*<err>([^<]*)</err>\s*<errMsg>([^<]*)</errMsg>", re.IGNORECASE
)


def detect_xml_error(text: str) -> KosisError | None:
    match = _XML_ERROR_RE.search(text)
    if not match:
        return None
    code = match.group(1).strip()
    message = match.group(2).strip()
    hint = ERROR_CODE_HINTS.get(code, "")
    full = f"KOSIS error {code or '?'}: {message}"
    if hint:
        full += f" ({hint})"
    return KosisError(code, full)


def detect_kosis_error(payload: Any) -> KosisError | None:
    if isinstance(payload, dict):
        message = payload.get("errMsg")
        if message:
            code = str(payload.get("err") or payload.get("errCode") or "").strip()
            hint = ERROR_CODE_HINTS.get(code, "")
            full = f"KOSIS error {code or '?'}: {message}"
            if hint:
                full += f" ({hint})"
            return KosisError(code, full)
    return None


def call_kosis(url: str, timeout: int, *, format_hint: str = "json") -> Any:
    text = fetch_text(url, timeout)
    xml_err = detect_xml_error(text)
    if xml_err is not None:
        raise xml_err
    if format_hint != "json":
        return text
    payload = parse_kosis_json(text)
    err = detect_kosis_error(payload)
    if err is not None:
        raise err
    return payload


def render_search_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return "조회 결과가 없습니다."
    lines = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        org = entry.get("ORG_NM", "?")
        tbl = entry.get("TBL_NM", "?")
        org_id = entry.get("ORG_ID", "?")
        tbl_id = entry.get("TBL_ID", "?")
        prd = f"{entry.get('STRT_PRD_DE', '?')}~{entry.get('END_PRD_DE', '?')}"
        lines.append(f"- [{org_id}/{tbl_id}] {org} / {tbl} ({prd})")
    return "\n".join(lines) if lines else "조회 결과가 없습니다."


def render_meta_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return "메타 정보가 없습니다."
    lines = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        kr = entry.get("TBL_NM") or entry.get("ITM_NM") or entry.get("C_NM") or "?"
        en = entry.get("TBL_NM_ENG") or entry.get("ITM_NM_ENG") or entry.get("C_NM_ENG") or ""
        suffix = f" / {en}" if en else ""
        lines.append(f"- {kr}{suffix}")
    return "\n".join(lines)


def render_data_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return "데이터가 없습니다."
    lines = []
    for entry in payload[:50]:
        if not isinstance(entry, dict):
            continue
        prd = entry.get("PRD_DE", "?")
        unit = entry.get("UNIT_NM", "")
        item = entry.get("ITM_NM", "?")
        c1 = entry.get("C1_NM", "")
        value = entry.get("DT", "?")
        suffix = f" ({c1})" if c1 else ""
        lines.append(f"- {prd} | {item}{suffix} = {value} {unit}".rstrip())
    if len(payload) > 50:
        lines.append(f"... ({len(payload) - 50} rows omitted)")
    return "\n".join(lines)


def render_text(command: str, payload: Any) -> str:
    if command == "search":
        return render_search_text(payload)
    if command == "meta":
        return render_meta_text(payload)
    if command == "data":
        return render_data_text(payload)
    return json.dumps(payload, ensure_ascii=False, indent=2)


def cite_endpoint(command: str) -> str:
    return {
        "search": SEARCH_URL,
        "meta": META_URL,
        "data": DATA_URL,
        "bigdata": BIGDATA_URL,
    }[command]


def run(args: argparse.Namespace) -> int:
    use_json = args.json or not args.text

    if args.dry_run:
        api_key = "<DRY-RUN>"
    else:
        api_key = resolve_api_key()

    builder = {
        "search": build_search_params,
        "meta": build_meta_params,
        "data": build_data_params,
        "bigdata": build_bigdata_params,
    }[args.command]
    base = cite_endpoint(args.command)
    params = builder(api_key, args)
    url = build_url(base, params)

    if args.dry_run:
        redacted = dict(params)
        redacted["apiKey"] = "<DRY-RUN>"
        if use_json:
            print(json.dumps({"endpoint": base, "params": redacted, "url": build_url(base, redacted)}, ensure_ascii=False, indent=2))
        else:
            print(f"endpoint: {base}")
            print(f"url: {build_url(base, redacted)}")
            for key, value in redacted.items():
                print(f"  {key}={value}")
        return 0

    format_hint = params.get("format", "json")
    try:
        payload = call_kosis(url, args.timeout, format_hint=format_hint)
    except KosisError as exc:
        sys.stderr.write(f"{exc}\n")
        return 2

    if use_json:
        if isinstance(payload, str):
            sys.stdout.write(payload)
            if not payload.endswith("\n"):
                sys.stdout.write("\n")
        else:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(render_text(args.command, payload))
        print(f"\nsource: {base}")

    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
