"""나라장터 발주계획현황 조회 via k-skill-proxy.

The helper calls k-skill-proxy /v1/g2b/order-plans so DATA_GO_KR_API_KEY stays
server-side. It is read-only and does not automate g2b.go.kr login flows.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from typing import Any

PROXY_BASE_URL_ENV_VAR = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
PROXY_DOWN_MSG = "설정된 k-skill-proxy 서버가 응답하지 않습니다. 잠시 후 재시도하거나 운영자에게 문의하세요."
PROXY_KEY_NOT_CONFIGURED_MSG = "k-skill-proxy에 필요한 API 키가 설정되어 있지 않습니다. 운영자에게 문의하세요."
ROUTE = "/v1/g2b/order-plans"
USER_AGENT = "k-skill-g2b-order-plan-search/0.1 (+https://github.com/NomaDamas/k-skill)"


class ApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _text_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def resolve_proxy_base_url(explicit: str | None = None, env: Mapping[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    raw = _text_or_none(explicit) or _text_or_none(env.get(PROXY_BASE_URL_ENV_VAR))
    if raw:
        parsed = urllib.parse.urlparse(raw)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"{PROXY_BASE_URL_ENV_VAR} must be an http(s) URL")
        return raw.rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def _normalize_month(value: str | None, label: str) -> str | None:
    raw = _text_or_none(value)
    if raw is None:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) != 6 or not 1 <= int(digits[4:6]) <= 12:
        raise ValueError(f"{label} must be YYYY-MM or YYYYMM")
    return digits


def _normalize_date(value: str | None, label: str) -> str | None:
    raw = _text_or_none(value)
    if raw is None:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) not in {8, 12}:
        raise ValueError(f"{label} must be YYYY-MM-DD, YYYYMMDD, or YYYYMMDDHHMM")
    return digits


def build_query(args: argparse.Namespace) -> dict[str, str]:
    query: dict[str, str] = {
        "kind": args.kind,
        "page": str(args.page),
        "limit": str(args.limit),
    }
    optional = {
        "keyword": args.keyword,
        "orderFrom": _normalize_month(args.order_from, "--order-from"),
        "orderTo": _normalize_month(args.order_to, "--order-to"),
        "postedFrom": _normalize_date(args.posted_from, "--posted-from"),
        "postedTo": _normalize_date(args.posted_to, "--posted-to"),
        "institution": args.institution,
        "institutionCode": args.institution_code,
        "region": args.region,
        "procurementMethod": args.procurement_method,
        "productCode": args.product_code,
        "businessType": args.business_type,
        "constructionType": args.construction_type,
    }
    for key, value in optional.items():
        text = _text_or_none(value)
        if text is not None:
            query[key] = text
    return query


def read_json_response(request: urllib.request.Request) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return json.loads(response.read().decode(charset))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"message": body}
        if error.code == 503 and parsed.get("error") == "upstream_not_configured":
            raise ApiError(PROXY_KEY_NOT_CONFIGURED_MSG, status_code=error.code) from error
        message = parsed.get("message") or parsed.get("error") or body or str(error)
        raise ApiError(f"g2b order-plan proxy returned HTTP {error.code}: {message}", status_code=error.code) from error
    except urllib.error.URLError as error:
        raise ApiError(f"{PROXY_DOWN_MSG} (상세: {error.reason})") from error


def search_order_plans(query: dict[str, str], *, base_url: str | None = None,
                       read_json: Any = read_json_response) -> dict[str, Any]:
    resolved_base = resolve_proxy_base_url(base_url)
    url = f"{resolved_base}{ROUTE}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    return read_json(request)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="나라장터 발주계획현황 조회 (k-skill-proxy 경유)")
    parser.add_argument("--kind", default="goods", help="goods/물품, construction/공사, service/용역, foreign/외자, all/전체")
    parser.add_argument("--keyword", "-q", help="사업명 검색어(bizNm)")
    parser.add_argument("--order-from", help="발주시작년월 YYYY-MM 또는 YYYYMM")
    parser.add_argument("--order-to", help="발주종료년월 YYYY-MM 또는 YYYYMM")
    parser.add_argument("--posted-from", help="게시 시작일 YYYY-MM-DD 또는 YYYYMMDD[HHMM]")
    parser.add_argument("--posted-to", help="게시 종료일 YYYY-MM-DD 또는 YYYYMMDD[HHMM]")
    parser.add_argument("--institution", help="발주기관명")
    parser.add_argument("--institution-code", help="발주기관코드")
    parser.add_argument("--region", help="기관소재지명")
    parser.add_argument("--procurement-method", help="조달방식")
    parser.add_argument("--product-code", help="세부품명번호(물품)")
    parser.add_argument("--business-type", help="업무유형명/업무유형코드(공사/용역/외자)")
    parser.add_argument("--construction-type", help="공종구분명(공사)")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--proxy-base-url", help=f"override {PROXY_BASE_URL_ENV_VAR}")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = search_order_plans(build_query(args), base_url=args.proxy_base_url)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ApiError, ValueError) as error:
        print(json.dumps({"error": error.__class__.__name__, "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
