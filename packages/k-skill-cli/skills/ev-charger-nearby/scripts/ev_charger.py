#!/usr/bin/env python3
"""Read-only EV charger info/status helper using stdlib only."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional


DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
DEFAULT_SECRETS_PATH = pathlib.Path("~/.config/k-skill/secrets.env").expanduser()
UPSTREAM_BASE_URL = "https://apis.data.go.kr/B552584/EvCharger"
OPERATIONS = {"info": "getChargerInfo", "status": "getChargerStatus"}
PROXY_DOWN_MSG = "설정된 k-skill-proxy 프록시 서버가 응답하지 않습니다. 잠시 후 재시도하거나 운영자에게 문의하세요."
PROXY_NOT_CONFIGURED_MSG = "k-skill-proxy에 EV 충전소 API 키가 설정되어 있지 않습니다. 운영자에게 문의하세요."


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
        value = value.strip().strip('"').strip("'")
        values[key.strip()] = value
    return values


def resolve_api_key(args: argparse.Namespace) -> Optional[str]:
    env_key = os.environ.get("KSKILL_EV_CHARGER_API_KEY") or os.environ.get("DATA_GO_KR_API_KEY")
    if env_key and env_key.strip():
        return env_key.strip()
    secrets = load_secrets(pathlib.Path(args.secrets_path).expanduser())
    value = secrets.get("KSKILL_EV_CHARGER_API_KEY") or secrets.get("DATA_GO_KR_API_KEY")
    return value.strip() if value and value.strip() else None


def _bounded_integer(value: int, label: str, minimum: int, maximum: int) -> int:
    if value < minimum or value > maximum:
        raise HelperError(f"{label} 값은 {minimum}~{maximum} 범위여야 합니다.")
    return value


def _validate_code(value: Optional[str], label: str, maximum: int, digits: Optional[int] = None) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if len(text) > maximum or (digits is not None and (len(text) != digits or not text.isdigit())):
        raise HelperError(f"올바른 {label} 값을 입력하세요.")
    if digits is None and not all(ch.isalnum() or ch in "_-" for ch in text):
        raise HelperError(f"올바른 {label} 값을 입력하세요.")
    return text


def build_query(args: argparse.Namespace) -> Dict[str, Any]:
    query: Dict[str, Any] = {
        "pageNo": _bounded_integer(args.page_no, "pageNo", 1, 100000),
        "numOfRows": _bounded_integer(args.num_of_rows, "numOfRows", 10, 9999),
    }
    for key, maximum, digits in (("zcode", 2, 2), ("zscode", 5, 5), ("stat_id", 40, None), ("chger_id", 10, None)):
        value = _validate_code(getattr(args, key), key.replace("_", ""), maximum, digits)
        if value is not None:
            query[{"stat_id": "statId", "chger_id": "chgerId"}.get(key, key)] = value
    if args.command == "info" and args.location:
        location = args.location.strip()
        if len(location) > 100:
            raise HelperError("location 값은 100자 이하여야 합니다.")
        if args.direct:
            raise HelperError("--direct에서는 location을 지원하지 않습니다. --zcode와 --zscode를 사용하세요.")
        query["location"] = location
    if args.command == "status":
        if args.limit_yn:
            limit_yn = args.limit_yn.strip().upper()
            if limit_yn not in {"Y", "N"}:
                raise HelperError("limitYn 값은 Y 또는 N이어야 합니다.")
            query["limitYn"] = limit_yn
        if args.period is not None:
            query["period"] = _bounded_integer(args.period, "period", 1, 10)
    return query


def build_url(args: argparse.Namespace, query: Dict[str, Any], api_key: Optional[str]) -> str:
    if args.direct:
        if not api_key:
            raise HelperError(
                "KSKILL_EV_CHARGER_API_KEY 또는 DATA_GO_KR_API_KEY가 없습니다. "
                "공공데이터포털 데이터셋 15076352 활용신청 후 키를 환경변수나 ~/.config/k-skill/secrets.env에 설정하세요."
            )
        direct_query = dict(query)
        direct_query["serviceKey"] = api_key
        direct_query["dataType"] = "JSON"
        return f"{UPSTREAM_BASE_URL}/{OPERATIONS[args.command]}?{urllib.parse.urlencode(direct_query)}"
    return f"{args.proxy_base_url.rstrip('/')}/v1/ev-charger/{args.command}?{urllib.parse.urlencode(query)}"


def http_get_json(url: str, timeout: int, via_proxy: bool) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "k-skill/ev-charger-nearby"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace") if error.fp else ""
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {}
        if via_proxy and error.code == 503 and payload.get("error") == "upstream_not_configured":
            raise HelperError(PROXY_NOT_CONFIGURED_MSG) from error
        message = payload.get("message") or f"API HTTP 오류: {error.code} {error.reason}"
        raise HelperError(str(message)) from error
    except urllib.error.URLError as error:
        if via_proxy:
            raise HelperError(f"{PROXY_DOWN_MSG} (상세: {error.reason})") from error
        raise HelperError(f"상류 API 네트워크 오류: {error.reason}") from error
    except TimeoutError as error:
        target = "프록시 서버" if via_proxy else "상류 API"
        raise HelperError(f"{target} 요청 시간이 초과되었습니다.") from error
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise HelperError("API 응답이 올바른 JSON이 아닙니다.") from error
    if not isinstance(payload, dict):
        raise HelperError("API 응답 형식이 올바르지 않습니다.")
    return payload


def format_text(payload: Dict[str, Any]) -> str:
    response = payload.get("response")
    if isinstance(response, dict) and isinstance(response.get("body"), dict):
        payload = response["body"]
    items_value = payload.get("items") or []
    if isinstance(items_value, dict):
        items_value = items_value.get("item") or []
    items = items_value if isinstance(items_value, list) else [items_value]
    total_count = payload.get("total_count", payload.get("totalCount", len(items)))
    lines = [f"전기차 충전기 조회 결과: {total_count}건"]
    for item in items:
        name = item.get("statNm") or item.get("statId") or "이름 없음"
        address = item.get("addr") or item.get("location") or "주소 없음"
        charger = item.get("chgerId") or "-"
        status = item.get("stat") or "상태 미상"
        lines.append(f"- {name} / {address} / 충전기 {charger} / 상태 {status}")
    if not items:
        lines.append("조건에 맞는 충전기 정보가 없습니다.")
    return "\n".join(lines)


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--zcode")
    parser.add_argument("--zscode")
    parser.add_argument("--stat-id")
    parser.add_argument("--chger-id")
    parser.add_argument("--page-no", type=int, default=1)
    parser.add_argument("--num-of-rows", type=int, default=10)
    parser.add_argument("--proxy-base-url", default=os.environ.get("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY_BASE_URL))
    parser.add_argument("--direct", action="store_true")
    parser.add_argument("--secrets-path", default=str(DEFAULT_SECRETS_PATH))
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="전기차 충전소 정보와 상태 조회")
    subparsers = parser.add_subparsers(dest="command", required=True)
    info = subparsers.add_parser("info", help="충전소 위치와 기본 정보 조회")
    add_common_arguments(info)
    info.add_argument("--location")
    status = subparsers.add_parser("status", help="충전기 운영 상태 조회")
    add_common_arguments(status)
    status.add_argument("--limit-yn")
    status.add_argument("--period", type=int)
    return parser


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def run(argv: Optional[list[str]] = None) -> int:
    try:
        args = parse_args(argv)
        query = build_query(args)
        api_key = resolve_api_key(args) if args.direct else None
        if args.dry_run and args.direct:
            url = build_url(args, query, "REDACTED")
        else:
            url = build_url(args, query, api_key)
        if args.dry_run:
            print(json.dumps({"operation": args.command, "url": url, "query": query}, ensure_ascii=False, indent=2))
            return 0
        payload = http_get_json(url, args.timeout, via_proxy=not args.direct)
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(format_text(payload))
        return 0
    except HelperError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
