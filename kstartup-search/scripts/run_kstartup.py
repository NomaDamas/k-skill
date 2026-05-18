#!/usr/bin/env python3
"""K-Startup (data.go.kr 15125364) CLI helper for the kstartup-search skill.

조회 전용. 일반 호출은 k-skill-proxy 경유, `--direct` 는 사용자 API 키로 직접 호출.
stdlib only (urllib, json, argparse, ssl).
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple

DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
KSTARTUP_UPSTREAM_BASE_URL = "https://apis.data.go.kr/B552735/kisedKstartupService01"
DEFAULT_SECRETS_PATH = os.path.expanduser("~/.config/k-skill/secrets.env")

OPERATIONS: Dict[str, Dict[str, Any]] = {
    "business-info": {
        "path": "getBusinessInformation01",
        "allowed": ("biz_category_cd", "supt_biz_titl_nm", "biz_yr"),
    },
    "announcements": {
        "path": "getAnnouncementInformation01",
        "allowed": (
            "intg_pbanc_yn", "intg_pbanc_biz_nm", "biz_pbanc_nm",
            "supt_biz_clsfc", "aply_trgt_ctnt", "supt_regin",
            "pbanc_rcpt_bgng_dt", "pbanc_rcpt_end_dt",
            "aply_trgt", "biz_enyy", "biz_trgt_age", "prfn_matr",
            "rcrt_prgs_yn",
        ),
    },
    "contents": {
        "path": "getContentInformation01",
        "allowed": ("clss_cd", "titl_nm"),
    },
    "statistics": {
        "path": "getStatisticalInformation01",
        "allowed": ("titl_nm", "file_nm"),
    },
}

YN_FIELDS = {"intg_pbanc_yn", "rcrt_prgs_yn"}
DATE_FIELDS = {"pbanc_rcpt_bgng_dt", "pbanc_rcpt_end_dt"}


class HelperError(RuntimeError):
    """User-facing CLI error."""


def load_secrets(path: str = DEFAULT_SECRETS_PATH) -> Dict[str, str]:
    """Read dotenv-like secrets file. Returns {} if missing."""
    data: Dict[str, str] = {}
    if not os.path.exists(path):
        return data
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw_line in fh:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                if value.startswith('"') and value.endswith('"') and len(value) >= 2:
                    value = value[1:-1]
                if value.startswith("'") and value.endswith("'") and len(value) >= 2:
                    value = value[1:-1]
                if key:
                    data[key] = value
    except OSError:
        return data
    return data


def resolve_api_key(args: argparse.Namespace) -> Optional[str]:
    """`--direct` 전용 API 키 해석. env > secrets file 순서."""
    env_key = os.environ.get("KSKILL_KSTARTUP_API_KEY") or os.environ.get("DATA_GO_KR_API_KEY")
    if env_key:
        return env_key.strip() or None
    secrets = load_secrets(args.secrets_path or DEFAULT_SECRETS_PATH)
    return (secrets.get("KSKILL_KSTARTUP_API_KEY") or secrets.get("DATA_GO_KR_API_KEY") or "").strip() or None


def validate_yyyymmdd(value: str, field: str) -> str:
    digits = "".join(c for c in value if c.isdigit())
    if len(digits) != 8:
        raise HelperError(f"{field} must be YYYYMMDD (got: {value!r})")
    year = int(digits[0:4])
    month = int(digits[4:6])
    day = int(digits[6:8])
    try:
        datetime.date(year, month, day)
    except ValueError as exc:
        raise HelperError(f"{field} must be a valid YYYYMMDD date (got: {value!r})") from exc
    return digits


def build_query(args: argparse.Namespace, operation: str) -> Dict[str, Any]:
    if operation not in OPERATIONS:
        raise HelperError(f"Unknown operation: {operation}")
    if args.page < 1:
        raise HelperError("--page must be >= 1")
    if args.per_page < 1 or args.per_page > 100:
        raise HelperError("--per-page must be in [1, 100]")

    query: Dict[str, Any] = {
        "page": args.page,
        "perPage": args.per_page,
        "returnType": "json",
    }
    for field in OPERATIONS[operation]["allowed"]:
        attr = field.lower()
        raw = getattr(args, attr, None)
        if raw is None or str(raw).strip() == "":
            continue
        value = str(raw).strip()
        if field in DATE_FIELDS:
            value = validate_yyyymmdd(value, field)
        elif field in YN_FIELDS:
            upper = value.upper()
            if upper not in {"Y", "N"}:
                raise HelperError(f"{field} must be Y or N (got: {value!r})")
            value = upper
        elif field == "biz_yr":
            if not (len(value) == 4 and value.isdigit()):
                raise HelperError(f"biz_yr must be 4 digits (got: {value!r})")
        query[field] = value

    if (
        operation == "announcements"
        and query.get("pbanc_rcpt_bgng_dt")
        and query.get("pbanc_rcpt_end_dt")
        and query["pbanc_rcpt_bgng_dt"] > query["pbanc_rcpt_end_dt"]
    ):
        raise HelperError("pbanc_rcpt_bgng_dt must be <= pbanc_rcpt_end_dt")
    return query


def encode_query(query: Dict[str, Any]) -> str:
    pairs: List[Tuple[str, str]] = [(k, str(v)) for k, v in query.items()]
    return urllib.parse.urlencode(pairs, doseq=False, safe="")


def build_url(operation: str, query: Dict[str, Any], *, direct: bool, api_key: Optional[str], proxy_base_url: str) -> str:
    if direct:
        if not api_key:
            raise HelperError(
                "KSKILL_KSTARTUP_API_KEY (또는 DATA_GO_KR_API_KEY) 가 없습니다. "
                "공공데이터포털 15125364 활용신청 후 키를 발급받아 환경변수나 ~/.config/k-skill/secrets.env 에 두세요."
            )
        path = OPERATIONS[operation]["path"]
        with_key = dict(query)
        with_key["ServiceKey"] = api_key
        return f"{KSTARTUP_UPSTREAM_BASE_URL}/{path}?{encode_query(with_key)}"
    base = proxy_base_url.rstrip("/")
    return f"{base}/v1/kstartup/{operation}?{encode_query(query)}"


def http_get(url: str, *, timeout: int) -> Tuple[int, str, str]:
    headers = {
        "accept": "application/json",
        "user-agent": "k-skill/kstartup-search",
    }
    request = urllib.request.Request(url, headers=headers, method="GET")
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, response.headers.get("content-type", ""), body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        return exc.code, exc.headers.get("content-type", "") if exc.headers else "", body
    except urllib.error.URLError as exc:
        raise HelperError(f"network error: {exc.reason}") from exc


def summarise(operation: str, payload: Dict[str, Any]) -> str:
    items: Iterable[Dict[str, Any]] = []
    if isinstance(payload, dict):
        data = payload.get("data") or payload.get("items")
        if isinstance(data, list):
            items = data
        elif isinstance(payload.get("response"), dict):
            response = payload["response"]
            body = response.get("body") or {}
            items = body.get("items") or []
    items = list(items or [])
    if not items:
        return "[summary] 매칭되는 항목이 없습니다. 필터를 완화하거나 페이지를 넘기세요."
    lines = [f"[summary] operation={operation} count={len(items)} (page={payload.get('query', {}).get('page', payload.get('page'))} perPage={payload.get('query', {}).get('perPage', payload.get('perPage'))})"]
    for index, item in enumerate(items, start=1):
        title = (
            item.get("biz_pbanc_nm")
            or item.get("supt_biz_titl_nm")
            or item.get("titl_nm")
            or item.get("intg_pbanc_biz_nm")
            or "(제목 없음)"
        )
        region = item.get("supt_regin") or item.get("biz_category_cd") or item.get("clss_cd") or ""
        period = ""
        if item.get("pbanc_rcpt_bgng_dt") or item.get("pbanc_rcpt_end_dt"):
            period = f" {item.get('pbanc_rcpt_bgng_dt','?')} ~ {item.get('pbanc_rcpt_end_dt','?')}"
        url = item.get("detl_pg_url") or ""
        lines.append(f"  {index:>2}. {title} {region}{period}")
        if url:
            lines.append(f"      → {url}")
    return "\n".join(lines)


def _add_filter_args(parser: argparse.ArgumentParser, operation: str) -> None:
    allowed = OPERATIONS[operation]["allowed"]
    for field in allowed:
        flag = "--" + field.replace("_", "-").lower()
        parser.add_argument(flag, dest=field.lower(), default=None,
                            help=f"K-Startup field: {field}")


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run_kstartup.py",
        description="창업진흥원 K-Startup Open API (data.go.kr 15125364) 조회 helper",
    )
    subparsers = parser.add_subparsers(dest="operation", required=True)

    for operation in OPERATIONS:
        sub = subparsers.add_parser(operation, help=f"K-Startup {operation} endpoint")
        sub.add_argument("--page", type=int, default=1)
        sub.add_argument("--per-page", dest="per_page", type=int, default=10)
        format_group = sub.add_mutually_exclusive_group()
        format_group.add_argument("--text", action="store_true", help="사람용 요약")
        format_group.add_argument("--json", action="store_true", help="구조화 JSON 출력 (기본)")
        sub.add_argument("--dry-run", action="store_true", dest="dry_run",
                         help="요청 URL/파라미터만 출력, 네트워크 호출 없음")
        sub.add_argument("--timeout", type=int, default=30)
        sub.add_argument("--proxy-base-url", default=os.environ.get("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY_BASE_URL))
        sub.add_argument("--direct", action="store_true",
                         help="proxy 우회, KSKILL_KSTARTUP_API_KEY 로 직접 호출")
        sub.add_argument("--secrets-path", default=DEFAULT_SECRETS_PATH,
                         help=f"--direct 시 secrets 파일 경로 (기본 {DEFAULT_SECRETS_PATH})")
        _add_filter_args(sub, operation)
    return parser


def run(argv: Optional[List[str]] = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    operation = args.operation

    try:
        query = build_query(args, operation)
    except HelperError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 2

    if args.dry_run:
        if args.direct:
            preview = build_url(operation, query, direct=True, api_key="<DRY-RUN>", proxy_base_url=args.proxy_base_url)
        else:
            preview = build_url(operation, query, direct=False, api_key=None, proxy_base_url=args.proxy_base_url)
        preview = preview.replace(os.environ.get("KSKILL_KSTARTUP_API_KEY", ""), "<DRY-RUN>") if os.environ.get("KSKILL_KSTARTUP_API_KEY") else preview
        preview = preview.replace(os.environ.get("DATA_GO_KR_API_KEY", ""), "<DRY-RUN>") if os.environ.get("DATA_GO_KR_API_KEY") else preview
        result = {"operation": operation, "url": preview, "query": query, "direct": bool(args.direct)}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    api_key = resolve_api_key(args) if args.direct else None
    try:
        url = build_url(operation, query, direct=args.direct, api_key=api_key, proxy_base_url=args.proxy_base_url)
    except HelperError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 3

    try:
        status, content_type, body = http_get(url, timeout=args.timeout)
    except HelperError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 4

    payload: Any
    try:
        payload = json.loads(body) if body else {}
    except json.JSONDecodeError:
        print(f"[error] upstream returned non-JSON content-type={content_type!r} status={status}", file=sys.stderr)
        print(body[:500])
        return 5

    if not isinstance(payload, dict):
        payload = {"raw": payload}
    payload.setdefault("query", query)

    if args.text:
        print(summarise(operation, payload))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    if status >= 400:
        return 6
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
