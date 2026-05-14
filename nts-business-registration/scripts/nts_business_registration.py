from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any

PROXY_BASE_URL_ENV_VAR = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
BATCH_LIMIT = 100
VALIDATE_TEXT_FIELD_LIMITS = {
    "p_nm": 30,
    "p_nm2": 30,
    "b_nm": 200,
    "b_sector": 100,
    "b_type": 100,
    "b_adr": 500,
}


class ApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, url: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.url = url


def _text_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def resolve_proxy_base_url(explicit_base_url: str | None = None, env: dict[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    candidate = _text_or_none(explicit_base_url or env.get(PROXY_BASE_URL_ENV_VAR))
    if candidate and candidate.casefold() in {"off", "false", "0", "disable", "disabled", "none"}:
        raise ValueError("KSKILL_PROXY_BASE_URL 가 비활성화되어 있습니다.")
    if candidate and candidate != "replace-me":
        return candidate.rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def normalize_business_number(value: Any) -> str:
    raw = _text_or_none(value)
    if not raw:
        raise ValueError("사업자등록번호(b_no)를 입력하세요.")
    normalized = re.sub(r"\D", "", raw)
    if not re.fullmatch(r"\d{10}", normalized):
        raise ValueError("사업자등록번호는 숫자 10자리여야 합니다.")
    return normalized


def normalize_start_date(value: Any) -> str:
    raw = _text_or_none(value)
    if not raw:
        raise ValueError("개업일자(start_dt)를 YYYYMMDD 형식으로 입력하세요.")
    normalized = re.sub(r"\D", "", raw)
    if not re.fullmatch(r"\d{8}", normalized):
        raise ValueError("개업일자는 YYYYMMDD 형식이어야 합니다.")
    try:
        dt.date(int(normalized[:4]), int(normalized[4:6]), int(normalized[6:8]))
    except ValueError as error:
        raise ValueError("개업일자는 유효한 날짜여야 합니다.") from error
    return normalized


def normalize_validate_text(value: Any, field_name: str, *, required: bool = False) -> str | None:
    text = _text_or_none(value)
    if not text:
        if required:
            raise ValueError(f"{field_name}을(를) 입력하세요.")
        return None
    max_length = VALIDATE_TEXT_FIELD_LIMITS.get(field_name)
    if max_length and len(text) > max_length:
        raise ValueError(f"{field_name}은(는) {max_length}자 이하여야 합니다.")
    return text


def normalize_corp_no(value: Any) -> str | None:
    raw = _text_or_none(value)
    if not raw:
        return None
    normalized = re.sub(r"\D", "", raw)
    if not re.fullmatch(r"\d{13}", normalized):
        raise ValueError("corp_no는 숫자 13자리여야 합니다.")
    return normalized


def build_status_payload(business_numbers: list[Any]) -> dict[str, list[str]]:
    numbers = [normalize_business_number(value) for value in business_numbers]
    numbers = list(dict.fromkeys(numbers))
    if not numbers:
        raise ValueError("사업자등록번호를 1개 이상 입력하세요.")
    if len(numbers) > BATCH_LIMIT:
        raise ValueError("한 번에 조회할 수 있는 사업자등록번호는 100개까지입니다.")
    return {"b_no": numbers}


def build_validate_business(**kwargs: Any) -> dict[str, str]:
    p_nm = normalize_validate_text(kwargs.get("p_nm"), "p_nm", required=True)

    business = {
        "b_no": normalize_business_number(kwargs.get("b_no")),
        "start_dt": normalize_start_date(kwargs.get("start_dt")),
        "p_nm": p_nm,
    }

    for key in ("p_nm2", "b_nm", "b_sector", "b_type", "b_adr"):
        value = normalize_validate_text(kwargs.get(key), key)
        if value:
            business[key] = value

    corp_no = normalize_corp_no(kwargs.get("corp_no"))
    if corp_no:
        business["corp_no"] = corp_no
    return business


def build_validate_payload(businesses: list[dict[str, Any]]) -> dict[str, list[dict[str, str]]]:
    if not businesses:
        raise ValueError("진위확인 대상 businesses를 1개 이상 입력하세요.")
    if len(businesses) > BATCH_LIMIT:
        raise ValueError("한 번에 진위확인할 수 있는 사업자는 100개까지입니다.")
    return {"businesses": [build_validate_business(**business) for business in businesses]}


def read_json_response(request: urllib.request.Request) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict) and payload.get("message"):
            raise ApiError(str(payload["message"]), status_code=error.code, url=getattr(error, "url", None)) from error
        raise ApiError(f"NTS business proxy request failed with HTTP {error.code}", status_code=error.code, url=getattr(error, "url", None)) from error
    except urllib.error.URLError as error:
        raise ApiError(f"NTS business proxy request failed: {error.reason}") from error


def _post_json(path: str, payload: dict[str, Any], *, base_url: str | None = None, read_json: Any = read_json_response) -> dict[str, Any]:
    resolved_base_url = resolve_proxy_base_url(base_url)
    request = urllib.request.Request(
        f"{resolved_base_url}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "k-skill-nts-business-registration/1.0",
        },
        method="POST",
    )
    return read_json(request)


def query_status(business_numbers: list[Any], *, base_url: str | None = None, read_json: Any = read_json_response) -> dict[str, Any]:
    return _post_json("/v1/nts-business/status", build_status_payload(business_numbers), base_url=base_url, read_json=read_json)


def validate_businesses(businesses: list[dict[str, Any]], *, base_url: str | None = None, read_json: Any = read_json_response) -> dict[str, Any]:
    return _post_json("/v1/nts-business/validate", build_validate_payload(businesses), base_url=base_url, read_json=read_json)


def _parse_business_json(value: str) -> dict[str, Any]:
    payload = json.loads(value)
    if not isinstance(payload, dict):
        raise argparse.ArgumentTypeError("business JSON must be an object")
    return payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NTS business registration status/authenticity helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status = subparsers.add_parser("status", help="사업자등록번호 상태조회")
    status.add_argument("--b-no", action="append", required=True, help="사업자등록번호(10자리; 하이픈 허용). 여러 번 지정 가능")
    status.add_argument("--proxy-base-url")

    validate = subparsers.add_parser("validate", help="사업자등록정보 진위확인")
    validate.add_argument("--business-json", action="append", type=_parse_business_json, required=True, help='예: {"b_no":"1234567890","start_dt":"20200101","p_nm":"홍길동"}')
    validate.add_argument("--proxy-base-url")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "status":
            print(json.dumps(query_status(args.b_no, base_url=args.proxy_base_url), ensure_ascii=False, indent=2))
            return 0
        if args.command == "validate":
            print(json.dumps(validate_businesses(args.business_json, base_url=args.proxy_base_url), ensure_ascii=False, indent=2))
            return 0
    except (ValueError, ApiError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
