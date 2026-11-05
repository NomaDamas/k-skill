#!/usr/bin/env python3
"""Read-only building-register title lookup helper using stdlib only."""
# allow: SIZE_OK - Cohesive Building Register CLI adapter covering normalization, transport, and output contracts.

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

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
from building_register_xml import parse_direct_xml


DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
DEFAULT_SECRETS_PATH = pathlib.Path("~/.config/k-skill/secrets.env").expanduser()
UPSTREAM_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
PROXY_DOWN_MSG = "설정된 k-skill-proxy 프록시 서버가 응답하지 않습니다. 잠시 후 재시도하거나 운영자에게 문의하세요."
PROXY_NOT_CONFIGURED_MSG = "k-skill-proxy에 건축물대장 API 키가 설정되어 있지 않습니다. 운영자에게 문의하세요."
KAKAO_NOT_CONFIGURED_MSG = (
    "k-skill-proxy에 Kakao Local API 키가 설정되어 있지 않습니다. "
    "주소 조회는 Kakao geocode가 필요합니다. 운영자에게 문의하거나 PNU/개별 필지를 사용하세요."
)


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


def resolve_api_key(args: argparse.Namespace) -> Optional[str]:
    env_key = os.environ.get("KSKILL_BUILDING_REGISTER_API_KEY") or os.environ.get("DATA_GO_KR_API_KEY")
    if env_key and env_key.strip():
        return env_key.strip()
    secrets = load_secrets(pathlib.Path(args.secrets_path).expanduser())
    value = secrets.get("KSKILL_BUILDING_REGISTER_API_KEY") or secrets.get("DATA_GO_KR_API_KEY")
    return value.strip() if value and value.strip() else None


def _bounded_integer(value: int, label: str, maximum: int) -> int:
    if value < 1 or value > maximum:
        raise HelperError(f"{label} 값은 1~{maximum} 범위여야 합니다.")
    return value


def _exact_digits(value: Optional[str], length: int, label: str) -> str:
    text = (value or "").strip()
    if len(text) != length or not text.isdigit():
        raise HelperError(f"{label} 값은 {length}자리 숫자여야 합니다.")
    return text


def _parcel(value: Optional[str], label: str, required: bool = False) -> str:
    text = (value or "").strip()
    if not text:
        if required:
            raise HelperError(f"{label} 값이 필요합니다.")
        return "0000"
    if not text.isdigit() or len(text) > 4:
        raise HelperError(f"{label} 값은 1~4자리 숫자여야 합니다.")
    return text.zfill(4)


def normalize_parcel(pnu: Optional[str], sigungu_cd: Optional[str], bjdong_cd: Optional[str],
                     plat_gb_cd: Optional[str], bun: Optional[str], ji: Optional[str]) -> Dict[str, str]:
    explicit = any((sigungu_cd, bjdong_cd, plat_gb_cd, bun, ji))
    if pnu and explicit:
        raise HelperError("PNU와 개별 법정동/필지 값은 같이 입력할 수 없습니다.")
    if pnu:
        normalized_pnu = _exact_digits(pnu, 19, "PNU")
        land_category = normalized_pnu[10:11]
        plat_gb_cd_by_land_category = {"1": "0", "2": "1"}
        if land_category not in plat_gb_cd_by_land_category:
            raise HelperError("PNU 토지구분 값은 1(일반 토지) 또는 2(산)여야 합니다.")
        result = {
            "pnu": normalized_pnu,
            "sigunguCd": normalized_pnu[:5],
            "bjdongCd": normalized_pnu[5:10],
            "platGbCd": plat_gb_cd_by_land_category[land_category],
            "bun": normalized_pnu[11:15],
            "ji": normalized_pnu[15:19],
        }
        return result
    if not explicit:
        raise HelperError("--pnu, --address 또는 개별 법정동/필지 값을 입력하세요.")
    sigungu = _exact_digits(sigungu_cd, 5, "sigunguCd")
    bjdong = _exact_digits(bjdong_cd, 5, "bjdongCd")
    plat = (plat_gb_cd or "").strip()
    if plat not in {"0", "1", "2"}:
        raise HelperError("platGbCd 값은 0, 1, 2 중 하나여야 합니다.")
    main = _parcel(bun, "bun", required=True)
    sub = _parcel(ji, "ji")
    result = {
        "sigunguCd": sigungu,
        "bjdongCd": bjdong,
        "platGbCd": plat,
        "bun": main,
        "ji": sub,
    }
    land_category_by_plat_gb_cd = {"0": "1", "1": "2"}
    land_category = land_category_by_plat_gb_cd.get(plat)
    if land_category is not None:
        result["pnu"] = f"{sigungu}{bjdong}{land_category}{main}{sub}"
    return result


def build_query(args: argparse.Namespace) -> Dict[str, Any]:
    if args.address:
        if args.direct:
            raise HelperError("--address는 Kakao hosted proxy를 사용하는 proxy mode에서만 지원합니다. 직접 호출은 PNU나 개별 필지 값을 사용하세요.")
        if any((args.pnu, args.sigungu_cd, args.bjdong_cd, args.plat_gb_cd, args.bun, args.ji)):
            raise HelperError("--address와 PNU/개별 필지 값은 같이 입력할 수 없습니다.")
        raise HelperError("주소를 먼저 법정동 코드와 필지로 변환해야 합니다.")
    query: Dict[str, Any] = normalize_parcel(
        args.pnu, args.sigungu_cd, args.bjdong_cd, args.plat_gb_cd, args.bun, args.ji
    )
    query["pageNo"] = _bounded_integer(args.page_no, "pageNo", 100000)
    query["numOfRows"] = _bounded_integer(args.num_of_rows, "numOfRows", 100)
    return query


def query_from_address_payload(payload: Dict[str, Any]) -> Dict[str, str]:
    documents = payload.get("documents")
    if not isinstance(documents, list) or len(documents) != 1:
        raise HelperError("주소 검색 결과가 없거나 하나로 확정되지 않았습니다. 법정동 주소와 필지 번호를 더 정확히 입력하세요.")
    address = documents[0].get("address") if isinstance(documents[0], dict) else None
    if not isinstance(address, dict):
        raise HelperError("주소 결과에 법정동 필지 정보가 없습니다. 도로명만이 아니라 번지까지 포함한 주소를 입력하세요.")
    b_code = str(address.get("b_code") or "").strip()
    main = str(address.get("main_address_no") or "").strip()
    sub = str(address.get("sub_address_no") or "0").strip() or "0"
    mountain = str(address.get("mountain_yn") or "N").strip().upper()
    if len(b_code) != 10 or not b_code.isdigit():
        raise HelperError("주소 결과에 10자리 법정동 코드(b_code)가 없습니다.")
    if not main:
        raise HelperError("주소 결과에 본번이 없어 필지를 확정할 수 없습니다.")
    return normalize_parcel(None, b_code[:5], b_code[5:], "1" if mountain == "Y" else "0", main, sub)


def build_title_url(args: argparse.Namespace, query: Dict[str, Any], api_key: Optional[str]) -> str:
    if args.direct:
        if not api_key:
            raise HelperError(
                "KSKILL_BUILDING_REGISTER_API_KEY 또는 DATA_GO_KR_API_KEY가 없습니다. "
                "공공데이터포털 데이터셋 15134735 활용신청 후 키를 설정하세요."
            )
        direct_query = {key: value for key, value in query.items() if key != "pnu"}
        direct_query["serviceKey"] = api_key
        return f"{UPSTREAM_URL}?{urllib.parse.urlencode(direct_query)}"
    if args.pnu:
        proxy_query = {key: value for key, value in query.items() if key not in {"sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"}}
    else:
        proxy_query = {key: value for key, value in query.items() if key != "pnu"}
    return f"{args.proxy_base_url.rstrip('/')}/v1/building-register/title?{urllib.parse.urlencode(proxy_query)}"


def http_get_json(url: str, timeout: int, via_proxy: bool) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "k-skill/building-register-search"})
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
            message = str(payload.get("message") or "")
            if "KAKAO" in message.upper() or "/kakao-local/" in url:
                raise HelperError(KAKAO_NOT_CONFIGURED_MSG) from error
            raise HelperError(PROXY_NOT_CONFIGURED_MSG) from error
        raise HelperError(str(payload.get("message") or f"API HTTP 오류: {error.code} {error.reason}")) from error
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


def http_get_direct_xml(url: str, timeout: int) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers={"accept": "application/xml", "user-agent": "k-skill/building-register-search"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        raise HelperError(f"건축물대장 API HTTP 오류: {error.code} {error.reason}") from error
    except urllib.error.URLError as error:
        raise HelperError(f"건축물대장 API 네트워크 오류: {error.reason}") from error
    except TimeoutError as error:
        raise HelperError("건축물대장 API 요청 시간이 초과되었습니다.") from error
    return parse_direct_xml(raw, HelperError)


def format_text(payload: Dict[str, Any]) -> str:
    items = payload.get("items") or []
    if not isinstance(items, list):
        items = [items]
    total = payload.get("total_count", len(items))
    lines = [f"건축물대장 표제부 조회 결과: {total}건"]
    for item in items:
        address = item.get("platPlc") or item.get("newPlatPlc") or "주소 없음"
        purpose = item.get("mainPurpsCdNm") or "주용도 없음"
        area = item.get("totArea") or "-"
        floors = f"지상 {item.get('grndFlrCnt', '-')} / 지하 {item.get('ugrndFlrCnt', '-')}"
        approved = item.get("useAprDay") or "-"
        lines.append(f"- {address} / {purpose} / 연면적 {area}㎡ / {floors} / 사용승인일 {approved}")
    if not items:
        lines.append("해당 필지의 건축물대장 표제부가 없습니다.")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="건축물대장 표제부 조회")
    subparsers = parser.add_subparsers(dest="command", required=True)
    title = subparsers.add_parser("title", help="건축물대장 표제부 조회")
    title.add_argument("--pnu")
    title.add_argument("--sigungu-cd")
    title.add_argument("--bjdong-cd")
    title.add_argument("--plat-gb-cd")
    title.add_argument("--bun")
    title.add_argument("--ji")
    title.add_argument("--address")
    title.add_argument("--page-no", type=int, default=1)
    title.add_argument("--num-of-rows", type=int, default=10)
    title.add_argument("--proxy-base-url", default=os.environ.get("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY_BASE_URL))
    title.add_argument("--direct", action="store_true")
    title.add_argument("--secrets-path", default=str(DEFAULT_SECRETS_PATH))
    title.add_argument("--timeout", type=int, default=20)
    title.add_argument("--dry-run", action="store_true")
    title.add_argument("--json", action="store_true")
    return parser


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def run(argv: Optional[list[str]] = None) -> int:
    try:
        args = parse_args(argv)
        if args.address:
            if args.direct:
                raise HelperError("--address는 proxy mode에서만 지원합니다. 직접 호출은 PNU나 개별 필지 값을 사용하세요.")
            if any((args.pnu, args.sigungu_cd, args.bjdong_cd, args.plat_gb_cd, args.bun, args.ji)):
                raise HelperError("--address와 PNU/개별 필지 값은 같이 입력할 수 없습니다.")
            geocode_url = f"{args.proxy_base_url.rstrip('/')}/v1/kakao-local/geocode?{urllib.parse.urlencode({'q': args.address, 'limit': 2})}"
            if args.dry_run:
                print(json.dumps({
                    "operation": "title",
                    "geocode_url": geocode_url,
                    "next": (
                        "/v1/building-register/title?sigunguCd=<derived>&bjdongCd=<derived>"
                        "&platGbCd=<derived>&bun=<derived>&ji=<derived>"
                    ),
                }, ensure_ascii=False, indent=2))
                return 0
            address_payload = http_get_json(geocode_url, args.timeout, via_proxy=True)
            query = query_from_address_payload(address_payload)
            query["pageNo"] = _bounded_integer(args.page_no, "pageNo", 100000)
            query["numOfRows"] = _bounded_integer(args.num_of_rows, "numOfRows", 100)
        else:
            query = build_query(args)
        api_key = resolve_api_key(args) if args.direct else None
        url = build_title_url(args, query, "REDACTED" if args.dry_run and args.direct else api_key)
        if args.dry_run:
            print(json.dumps({"operation": "title", "url": url, "query": query}, ensure_ascii=False, indent=2))
            return 0
        payload = http_get_direct_xml(url, args.timeout) if args.direct else http_get_json(url, args.timeout, via_proxy=True)
        print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else format_text(payload))
        return 0
    except HelperError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
