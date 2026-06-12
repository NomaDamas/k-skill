"""Procurement (나라장터) sanctioned-supplier lookup via k-skill-proxy.

The proxy holds DATA_GO_KR_API_KEY server-side; this helper only builds the
query and reads the structured response. No user secret is required.
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
from typing import Any

PROXY_BASE_URL_ENV_VAR = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
ROUTE = "/v1/g2b/sanctioned-supplier"


class ApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _text_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def resolve_proxy_base_url(explicit: str | None = None, env: dict[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    candidate = _text_or_none(explicit or env.get(PROXY_BASE_URL_ENV_VAR))
    if candidate and candidate.casefold() in {"off", "false", "0", "disable", "disabled", "none"}:
        raise ValueError("KSKILL_PROXY_BASE_URL 가 비활성화되어 있습니다.")
    if candidate and candidate != "replace-me":
        return candidate.rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def normalize_bizno(value: Any) -> str:
    raw = _text_or_none(value)
    if not raw:
        raise ValueError("사업자등록번호(bizno)를 입력하세요.")
    normalized = re.sub(r"\D", "", raw)
    if not re.fullmatch(r"\d{10}", normalized):
        raise ValueError("사업자등록번호는 숫자 10자리여야 합니다.")
    return normalized


def read_json_response(request: urllib.request.Request) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            try:
                payload = json.loads(response.read().decode("utf-8"))
            except json.JSONDecodeError as error:
                raise ApiError("g2b sanction proxy returned invalid JSON.") from error
            if not isinstance(payload, dict):
                raise ApiError("g2b sanction proxy returned a non-object JSON payload.")
            return payload
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict) and payload.get("message"):
            raise ApiError(str(payload["message"]), status_code=error.code) from error
        raise ApiError(f"g2b sanction proxy request failed with HTTP {error.code}", status_code=error.code) from error
    except urllib.error.URLError as error:
        raise ApiError(f"g2b sanction proxy request failed: {error.reason}") from error


def query_sanctions(bizno: str, *, base_url: str | None = None,
                    read_json: Any = read_json_response) -> dict[str, Any]:
    normalized = normalize_bizno(bizno)
    url = f"{resolve_proxy_base_url(base_url)}{ROUTE}?{urllib.parse.urlencode({'bizno': normalized})}"
    request = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "k-skill-g2b-sanctioned-supplier/1.0",
    }, method="GET")
    return read_json(request)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="나라장터 부정당제재업체정보 조회 (k-skill-proxy 경유)")
    parser.add_argument("--bizno", required=True, help="사업자등록번호 10자리(하이픈 허용)")
    parser.add_argument("--proxy-base-url")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = query_sanctions(args.bizno, base_url=args.proxy_base_url)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, ApiError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
