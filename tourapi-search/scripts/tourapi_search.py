#!/usr/bin/env python3
"""한국관광공사 TourAPI 4.0(KorService2) 관광정보 조회 helper (read-only).

공개 접근 경로:
  GET https://apis.data.go.kr/B551011/KorService2/<operation>?<params>&_type=json

upstream이 공공데이터포털 서비스키를 요구하므로 BYOK 방식으로 동작한다.
키는 환경변수 KSKILL_TOURAPI_KEY(또는 DATA_GO_KR_API_KEY)에서만 읽는다.
dotenv/시크릿 파일은 읽지 않는다.

조회 전용이다. 예약/결제/전송/게시 같은 side effect는 하지 않는다.
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
from typing import Any, Dict, List, Optional, Sequence, Tuple

BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
DEFAULT_TIMEOUT = 20
USER_AGENT = "k-skill-tourapi-search/1"

# TourAPI 공통 인증/포맷 파라미터. MobileOS/MobileApp이 없으면 게이트웨이가 거부한다.
MOBILE_OS = "ETC"
MOBILE_APP = "k-skill-tourapi-search"
MAX_NUM_OF_ROWS = 100  # TourAPI numOfRows 상한

ENV_KEYS = ("KSKILL_TOURAPI_KEY", "DATA_GO_KR_API_KEY")

MISSING_KEY_MSG = (
    "TourAPI 서비스키가 없다. 공공데이터포털에서 '한국관광공사_국문 관광정보 서비스_GW'"
    "(15101578)를 활용신청한 뒤 KSKILL_TOURAPI_KEY(또는 DATA_GO_KR_API_KEY) 환경변수로 "
    "설정할 것. 이 helper는 시크릿 파일을 읽지 않는다."
)

# 데이터.go.kr GW 공통 에러코드 → 사람이 읽는 실패 모드.
GATEWAY_ERROR_MESSAGES = {
    "01": "관광공사 GW 내부 처리 오류(APPLICATION_ERROR). 잠시 후 재시도.",
    "04": "허용되지 않은 HTTP 요청 또는 기관 API 응답 처리 실패(HTTP_ERROR).",
    "05": "기관 API 연결/대기시간 초과(SERVICETIMEOUT_ERROR). 잠시 후 재시도.",
    "10": "요청 파라미터 값/형식 오류(INVALID_REQUEST_PARAMETER_ERROR).",
    "12": "존재하지 않거나 폐기된 오픈API 서비스(NO_OPENAPI_SERVICE_ERROR).",
    "20": "인증키 누락/권한 거부/활용신청 미승인(SERVICE_KEY_IS_NULL 또는 PERMISSION_DENIED).",
    "22": "일일 호출 허용량 초과(LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR).",
    "23": "초당 호출 허용량 초과(LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR).",
    "29": "차단된 IP에서 호출(BLACKLIST_IP_ACCESS_ERROR).",
    "30": "등록되지 않은 인증키(SERVICE_KEY_IS_NOT_REGISTERED_ERROR).",
    "31": "인증키 사용기한 만료(DEADLINE_HAS_EXPIRED_ERROR).",
}

# contentTypeId: 분류별 검색에 쓰는 공식 콘텐츠 타입.
CONTENT_TYPES = {
    "관광지": "12",
    "문화시설": "14",
    "축제공연행사": "15",
    "축제": "15",
    "행사": "15",
    "여행코스": "25",
    "레포츠": "28",
    "숙박": "32",
    "쇼핑": "38",
    "음식점": "39",
}
CONTENT_TYPE_NAMES = {
    "12": "관광지",
    "14": "문화시설",
    "15": "축제공연행사",
    "25": "여행코스",
    "28": "레포츠",
    "32": "숙박",
    "38": "쇼핑",
    "39": "음식점",
}

# areaCode: 지역 기반 조회에 쓰는 공식 시도 코드.
AREA_CODES = {
    "서울": "1",
    "인천": "2",
    "대전": "3",
    "대구": "4",
    "광주": "5",
    "부산": "6",
    "울산": "7",
    "세종": "8",
    "경기": "31",
    "강원": "32",
    "충북": "33",
    "충남": "34",
    "경북": "35",
    "경남": "36",
    "전북": "37",
    "전남": "38",
    "제주": "39",
}

# arrange: 목록 정렬 코드. 공식 문서가 보장하는 값만 허용한다.
ARRANGE_CODES = {
    "A": "제목순",
    "C": "수정일순",
    "D": "생성일순",
    "O": "제목순(이미지 있는 항목)",
    "Q": "수정일순(이미지 있는 항목)",
    "R": "생성일순(이미지 있는 항목)",
}

DATE_RE = re.compile(r"^\d{8}$")


class TourApiError(RuntimeError):
    """조회 실패를 명시적 실패 모드로 올린다."""

    def __init__(self, message: str, code: Optional[str] = None) -> None:
        super().__init__(message)
        self.code = code


def service_key_from_env(env: Optional[Dict[str, str]] = None) -> Optional[str]:
    """환경변수에서만 서비스키를 읽는다(시크릿 파일 미사용)."""
    source = os.environ if env is None else env
    for name in ENV_KEYS:
        value = (source.get(name) or "").strip()
        if value:
            return value
    return None


def normalize_service_key(key: str) -> str:
    """서비스키를 URL에 넣을 수 있게 정규화한다.

    공공데이터포털은 '인코딩 키'와 '디코딩 키'를 함께 보여준다. 디코딩 키는
    `+`, `/`, `=` 같은 문자를 포함하므로 quote로 인코딩하고, 이미 `%XX`가 있는
    인코딩 키는 이중 인코딩을 피하려고 그대로 쓴다.
    """
    stripped = (key or "").strip()
    if not stripped:
        raise TourApiError(MISSING_KEY_MSG)
    if re.search(r"%[0-9A-Fa-f]{2}", stripped):
        return stripped
    return urllib.parse.quote(stripped, safe="")


def build_url(operation: str, params: Dict[str, Any], service_key: str) -> str:
    """operation과 파라미터로 요청 URL을 만든다. serviceKey는 마지막에 직접 붙인다."""
    clean = {k: v for k, v in params.items() if v is not None}
    query = urllib.parse.urlencode(clean)
    key = normalize_service_key(service_key)
    base = f"{BASE_URL}/{operation}"
    return f"{base}?serviceKey={key}&{query}" if query else f"{base}?serviceKey={key}"


def fetch_json(url: str, timeout: int = DEFAULT_TIMEOUT) -> Dict[str, Any]:
    """URL을 호출해 JSON을 돌려준다. 테스트에서는 urlopen을 mock한다."""
    request = urllib.request.Request(
        url, headers={"user-agent": USER_AGENT, "accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        body = ""
        try:
            body = error.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001 - 오류 본문 실패는 무시한다
            body = ""
        parsed: Any = None
        try:
            parsed = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            parsed = None
        if isinstance(parsed, dict) and "OpenAPI_ServiceResponse" in parsed:
            # 403/429 등으로 와도 본문이 GW 오류 JSON이면 코드별 메시지로 올린다.
            check_gateway_error(parsed)
        detail = body.strip()[:200]
        raise TourApiError(f"관광공사 API HTTP {error.code} ({detail or '응답 본문 없음'})") from error
    except urllib.error.URLError as error:
        raise TourApiError(f"네트워크 오류: {error.reason}") from error

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise TourApiError("관광공사 API 응답이 JSON이 아니다(게이트웨이/upstream 변경 가능)") from error
    if not isinstance(payload, dict):
        raise TourApiError("관광공사 API 응답이 객체가 아니다")
    return payload


def check_gateway_error(payload: Dict[str, Any]) -> None:
    """GW 레벨 오류(코드 12/20/22/30/31 등)를 명시적 실패로 올린다."""
    gateway = payload.get("OpenAPI_ServiceResponse")
    if not isinstance(gateway, dict):
        return
    header = gateway.get("cmmMsgHeader") or {}
    code = str(header.get("returnReasonCode") or "")
    message = GATEWAY_ERROR_MESSAGES.get(code) or header.get("returnAuthMsg") or "관광공사 GW 오류"
    raise TourApiError(message, code or None)


def check_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """GW 오류와 정상 응답의 resultCode를 검사하고 response 본문을 돌려준다."""
    check_gateway_error(payload)
    response = payload.get("response")
    if not isinstance(response, dict):
        raise TourApiError("관광공사 API 응답에 response 본문이 없다")
    header = response.get("header") or {}
    code = str(header.get("resultCode") or "")
    if code not in ("0000", "00"):
        message = header.get("resultMsg") or "관광공사 API 오류"
        raise TourApiError(f"{message} (resultCode={code or '없음'})", code or None)
    return response


def extract_items(response: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], int]:
    """response.body에서 item 목록과 totalCount를 꺼낸다.

    TourAPI는 결과가 없으면 items를 빈 문자열로, 단건이면 item을 객체로 돌려준다.
    """
    body = response.get("body") or {}
    try:
        total = int(body.get("totalCount") or 0)
    except (TypeError, ValueError):
        total = 0
    raw = body.get("items")
    items: List[Dict[str, Any]] = []
    if isinstance(raw, dict):
        item = raw.get("item")
        if isinstance(item, dict):
            items = [item]
        elif isinstance(item, list):
            items = [entry for entry in item if isinstance(entry, dict)]
    elif isinstance(raw, list):
        items = [entry for entry in raw if isinstance(entry, dict)]
    return items, total


def _to_float_or_none(value: Any) -> Optional[float]:
    text = str(value).strip() if value is not None else ""
    if not text or text == "0":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _text(value: Any) -> Optional[str]:
    text = str(value).strip() if value is not None else ""
    return text or None


def normalize_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """목록/공통 item을 정규화된 필드로 변환한다."""
    address_parts = [_text(item.get("addr1")), _text(item.get("addr2"))]
    address = " ".join(part for part in address_parts if part) or None
    content_type_id = _text(item.get("contenttypeid"))
    return {
        "content_id": _text(item.get("contentid")),
        "content_type_id": content_type_id,
        "content_type": CONTENT_TYPE_NAMES.get(content_type_id or "", None),
        "title": _text(item.get("title")),
        "address": address,
        "tel": _text(item.get("tel")),
        "zipcode": _text(item.get("zipcode")),
        "lat": _to_float_or_none(item.get("mapy")),
        "lon": _to_float_or_none(item.get("mapx")),
        "area_code": _text(item.get("areacode")),
        "sigungu_code": _text(item.get("sigungucode")),
        "cat1": _text(item.get("cat1")),
        "cat2": _text(item.get("cat2")),
        "cat3": _text(item.get("cat3")),
        "homepage": _text(item.get("homepage")),
        "first_image": _text(item.get("firstimage")),
        "first_image_thumbnail": _text(item.get("firstimage2")),
        "event_start_date": _text(item.get("eventstartdate")),
        "event_end_date": _text(item.get("eventenddate")),
        "modified_time": _text(item.get("modifiedtime")),
    }


def normalize_detail(
    common: Dict[str, Any],
    intro: Optional[Dict[str, Any]],
    images: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    """공통정보/소개정보/이미지정보를 하나의 상세 결과로 합친다."""
    detail = normalize_item(common)
    detail["overview"] = _text(common.get("overview"))
    detail["intro"] = {
        key: value
        for key, value in (intro or {}).items()
        if key not in {"contentid", "contenttypeid"} and _text(value) is not None
    }
    detail["images"] = [
        {
            "url": _text(image.get("originimgurl")),
            "thumbnail": _text(image.get("smallimageurl")),
            "name": _text(image.get("imgname")),
        }
        for image in images
    ]
    return detail


def resolve_content_type(value: Optional[str]) -> Optional[str]:
    """`관광지`/`39` 같은 입력을 공식 contentTypeId로 바꾼다."""
    text = (value or "").strip()
    if not text:
        return None
    if text.isdigit():
        return text
    mapped = CONTENT_TYPES.get(text)
    if mapped is None:
        raise TourApiError(f"알 수 없는 콘텐츠 타입: {value} (예: 관광지, 축제, 음식점, 39)")
    return mapped


def resolve_area_code(value: Optional[str]) -> Optional[str]:
    """`제주`/`39` 같은 입력을 공식 areaCode로 바꾼다."""
    text = (value or "").strip()
    if not text:
        return None
    if text.isdigit():
        return text
    mapped = AREA_CODES.get(text)
    if mapped is None:
        names = ", ".join(AREA_CODES)
        raise TourApiError(f"알 수 없는 지역: {value} (예: {names}, 또는 숫자 areaCode)")
    return mapped


def normalize_date(value: Optional[str], label: str) -> str:
    """YYYYMMDD 형식을 검증한다."""
    text = (value or "").strip()
    if not DATE_RE.match(text):
        raise TourApiError(f"{label} 값은 YYYYMMDD 8자리여야 한다 (예: 20261001)")
    return text


def validate_limit(value: int) -> int:
    if value < 1 or value > MAX_NUM_OF_ROWS:
        raise TourApiError(f"--limit 값은 1~{MAX_NUM_OF_ROWS} 범위여야 한다(TourAPI numOfRows 상한).")
    return value


def validate_page(value: int) -> int:
    if value < 1:
        raise TourApiError("--page 값은 1 이상이어야 한다.")
    return value


def _base_params(page: int, limit: int) -> Dict[str, str]:
    return {
        "numOfRows": str(limit),
        "pageNo": str(page),
        "MobileOS": MOBILE_OS,
        "MobileApp": MOBILE_APP,
        "_type": "json",
    }


def _list_filters(args: argparse.Namespace) -> Dict[str, str]:
    params: Dict[str, str] = {}
    content_type = resolve_content_type(getattr(args, "content_type", None))
    if content_type:
        params["contentTypeId"] = content_type
    area_code = resolve_area_code(getattr(args, "area_code", None))
    if area_code:
        params["areaCode"] = area_code
    sigungu_code = _text(getattr(args, "sigungu_code", None))
    if sigungu_code:
        params["sigunguCode"] = sigungu_code
    for name in ("cat1", "cat2", "cat3"):
        value = _text(getattr(args, name, None))
        if value:
            params[name] = value
    arrange = _text(getattr(args, "arrange", None))
    if arrange:
        arrange = arrange.upper()
        if arrange not in ARRANGE_CODES:
            raise TourApiError(f"--arrange 값은 {', '.join(sorted(ARRANGE_CODES))} 중 하나여야 한다.")
        params["arrange"] = arrange
    return params


def _request(operation: str, params: Dict[str, Any], service_key: str, timeout: int) -> Tuple[List[Dict[str, Any]], int]:
    url = build_url(operation, params, service_key)
    payload = fetch_json(url, timeout=timeout)
    response = check_response(payload)
    return extract_items(response)


def run_list(command: str, args: argparse.Namespace, service_key: str, timeout: int) -> Dict[str, Any]:
    """keyword/area/festival/stay 공통 실행 경로."""
    limit = validate_limit(args.limit)
    page = validate_page(args.page)
    params: Dict[str, Any] = _base_params(page, limit)
    params.update(_list_filters(args))

    if command == "keyword":
        operation = "searchKeyword2"
        params["keyword"] = args.query
    elif command == "area":
        operation = "areaBasedList2"
    elif command == "festival":
        operation = "searchFestival2"
        params["eventStartDate"] = normalize_date(args.start_date, "--start-date")
        if args.end_date:
            params["eventEndDate"] = normalize_date(args.end_date, "--end-date")
    elif command == "stay":
        operation = "searchStay2"
    else:  # pragma: no cover - argparse가 막지만 방어적으로 남긴다
        raise TourApiError(f"알 수 없는 명령: {command}")

    items, total = _request(operation, params, service_key, timeout)
    return {
        "command": command,
        "operation": operation,
        "total": total,
        "page": page,
        "limit": limit,
        "items": [normalize_item(item) for item in items],
    }


def run_detail(args: argparse.Namespace, service_key: str, timeout: int) -> Dict[str, Any]:
    """공통정보 + 소개정보 + 이미지정보를 조합해 상세를 만든다."""
    content_id = _text(args.content_id)
    if not content_id:
        raise TourApiError("--content-id 값이 필요하다.")

    common_params: Dict[str, Any] = {
        "contentId": content_id,
        "defaultYN": "Y",
        "firstImageYN": "Y",
        "areacodeYN": "Y",
        "catcodeYN": "Y",
        "addrinfoYN": "Y",
        "mapinfoYN": "Y",
        "overviewYN": "Y",
    }
    common_params.update(_base_params(1, 1))
    common_items, _ = _request("detailCommon2", common_params, service_key, timeout)
    if not common_items:
        raise TourApiError(f"contentId={content_id} 공통정보 결과가 없다(존재하지 않거나 삭제된 항목).")
    common = common_items[0]

    content_type_id = resolve_content_type(args.content_type) or _text(common.get("contenttypeid"))

    intro: Optional[Dict[str, Any]] = None
    if content_type_id:
        intro_params: Dict[str, Any] = {
            "contentId": content_id,
            "contentTypeId": content_type_id,
        }
        intro_params.update(_base_params(1, 1))
        intro_items, _ = _request("detailIntro2", intro_params, service_key, timeout)
        intro = intro_items[0] if intro_items else None

    image_limit = validate_limit(args.images)
    image_params: Dict[str, Any] = {
        "contentId": content_id,
        "imageYN": "Y",
        "subImageYN": "Y",
    }
    image_params.update(_base_params(1, image_limit))
    image_items, _ = _request("detailImage2", image_params, service_key, timeout)

    return {
        "command": "detail",
        "operation": "detailCommon2+detailIntro2+detailImage2",
        "content_id": content_id,
        "item": normalize_detail(common, intro, image_items),
    }


def execute(args: argparse.Namespace, service_key: str, timeout: int = DEFAULT_TIMEOUT) -> Dict[str, Any]:
    if args.command == "detail":
        return run_detail(args, service_key, timeout)
    return run_list(args.command, args, service_key, timeout)


def _format_list(result: Dict[str, Any]) -> str:
    lines = [
        f"TourAPI {result['operation']} · 전체 {result['total']}건 중 {len(result['items'])}건 "
        f"(page {result['page']}, 최대 {result['limit']}건)"
    ]
    lines.append("")
    items = result["items"]
    if not items:
        lines.append("조건에 맞는 관광정보가 없다. 키워드/지역/분류를 넓혀 다시 조회할 것.")
        return "\n".join(lines)

    for index, item in enumerate(items, start=1):
        label = item.get("content_type") or item.get("content_type_id") or "관광정보"
        lines.append(f"{index}. {item.get('title') or '(제목 없음)'}  ({label})")
        if item.get("address"):
            lines.append(f"   {item['address']}")
        if item.get("lat") is not None and item.get("lon") is not None:
            lines.append(f"   좌표 {item['lat']:.5f}, {item['lon']:.5f}")
        if item.get("event_start_date"):
            end = item.get("event_end_date") or "?"
            lines.append(f"   기간 {item['event_start_date']} ~ {end}")
        contact = []
        if item.get("tel"):
            contact.append(f"전화 {item['tel']}")
        if item.get("homepage"):
            contact.append(item["homepage"])
        if contact:
            lines.append("   " + "  ".join(contact))
        if item.get("content_id"):
            lines.append(f"   상세 contentId={item['content_id']} (detail 명령으로 조회)")
        if item.get("first_image_thumbnail"):
            lines.append(f"   이미지 {item['first_image_thumbnail']}")
        lines.append("")

    lines.append("출처: 한국관광공사 TourAPI 4.0(KorService2). 공식 관광 메타데이터이며 여행 추천이 아니다.")
    return "\n".join(lines).rstrip()


def _format_detail(item: Dict[str, Any]) -> str:
    lines = [f"{item.get('title') or '(제목 없음)'}  ({item.get('content_type') or item.get('content_type_id')})"]
    if item.get("address"):
        lines.append(f"주소: {item['address']}")
    if item.get("lat") is not None and item.get("lon") is not None:
        lines.append(f"좌표: {item['lat']:.5f}, {item['lon']:.5f}")
    if item.get("tel"):
        lines.append(f"전화: {item['tel']}")
    if item.get("overview"):
        lines.append("")
        lines.append("소개:")
        lines.append(item["overview"])

    intro = item.get("intro") or {}
    if intro:
        lines.append("")
        lines.append("이용 정보:")
        for key, value in intro.items():
            lines.append(f"  - {key}: {value}")

    images = item.get("images") or []
    if images:
        lines.append("")
        lines.append(f"이미지 {len(images)}건:")
        for image in images:
            lines.append(f"  - {image.get('name') or '이미지'}: {image.get('url')}")

    lines.append("")
    lines.append("출처: 한국관광공사 TourAPI 4.0(KorService2). 공식 관광 메타데이터이며 여행 추천이 아니다.")
    return "\n".join(lines)


def format_output(result: Dict[str, Any]) -> str:
    if result["command"] == "detail":
        return _format_detail(result["item"])
    return _format_list(result)


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--json", action="store_true", help="정규화된 JSON으로 출력")
    parser.add_argument("--dry-run", action="store_true", help="네트워크 호출 없이 요청 URL만 출력(키는 REDACTED)")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help=f"HTTP 타임아웃(초, 기본 {DEFAULT_TIMEOUT})")


def add_list_filters(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--content-type", help="콘텐츠 타입 이름 또는 contentTypeId (예: 관광지, 축제, 음식점, 39)")
    parser.add_argument("--area-code", help="지역 이름 또는 areaCode (예: 제주, 서울, 39)")
    parser.add_argument("--sigungu-code", help="시군구 코드 (선택)")
    parser.add_argument("--cat1", help="분류체계 cat1 코드 (선택)")
    parser.add_argument("--cat2", help="분류체계 cat2 코드 (선택)")
    parser.add_argument("--cat3", help="분류체계 cat3 코드 (선택)")
    parser.add_argument("--arrange", help=f"정렬 코드 (선택: {', '.join(sorted(ARRANGE_CODES))})")
    parser.add_argument("--limit", type=int, default=10, help=f"결과 수 (기본 10, 최대 {MAX_NUM_OF_ROWS})")
    parser.add_argument("--page", type=int, default=1, help="페이지 번호 (기본 1)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tourapi_search",
        description="한국관광공사 TourAPI 4.0(KorService2) 관광정보 조회 (read-only)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    keyword = sub.add_parser("keyword", help="키워드 검색 (searchKeyword2)")
    keyword.add_argument("query")
    add_list_filters(keyword)
    add_common_arguments(keyword)

    area = sub.add_parser("area", help="지역 기반 목록 (areaBasedList2)")
    add_list_filters(area)
    add_common_arguments(area)

    festival = sub.add_parser("festival", help="축제/행사 검색 (searchFestival2)")
    festival.add_argument("--start-date", required=True, help="행사 시작일 YYYYMMDD (필수)")
    festival.add_argument("--end-date", help="행사 종료일 YYYYMMDD (선택)")
    add_list_filters(festival)
    add_common_arguments(festival)

    stay = sub.add_parser("stay", help="숙박 검색 (searchStay2)")
    add_list_filters(stay)
    add_common_arguments(stay)

    detail = sub.add_parser("detail", help="공통/소개/이미지 상세 (detailCommon2+detailIntro2+detailImage2)")
    detail.add_argument("content_id", help="contentId (목록 결과의 content_id)")
    detail.add_argument("--content-type", help="contentTypeId (선택, 없으면 공통정보에서 읽음)")
    detail.add_argument("--images", type=int, default=5, help=f"이미지 개수 (기본 5, 최대 {MAX_NUM_OF_ROWS})")
    add_common_arguments(detail)

    return parser


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def _dry_run_lines(args: argparse.Namespace) -> List[str]:
    """네트워크 없이 예상 요청 URL만 만든다.

    detail은 소개정보의 contentTypeId를 공통정보에서 읽으므로, 미지정 시
    `12`를 placeholder로 써서 URL 형태만 보여준다.
    """
    probe = "REDACTED"  # dry-run은 항상 키를 가린다
    lines: List[str] = []
    if args.command == "detail":
        common = {"contentId": _text(args.content_id) or "CONTENT_ID"}
        common.update(_base_params(1, 1))
        lines.append(build_url("detailCommon2", common, probe))
        type_id = resolve_content_type(args.content_type) or "12"
        intro = {"contentId": _text(args.content_id) or "CONTENT_ID", "contentTypeId": type_id}
        intro.update(_base_params(1, 1))
        lines.append(build_url("detailIntro2", intro, probe))
        images = {"contentId": _text(args.content_id) or "CONTENT_ID", "imageYN": "Y", "subImageYN": "Y"}
        images.update(_base_params(1, validate_limit(args.images)))
        lines.append(build_url("detailImage2", images, probe))
        return lines

    limit = validate_limit(args.limit)
    page = validate_page(args.page)
    params: Dict[str, Any] = _base_params(page, limit)
    params.update(_list_filters(args))
    if args.command == "keyword":
        params["keyword"] = args.query
        operation = "searchKeyword2"
    elif args.command == "area":
        operation = "areaBasedList2"
    elif args.command == "festival":
        params["eventStartDate"] = normalize_date(args.start_date, "--start-date")
        if args.end_date:
            params["eventEndDate"] = normalize_date(args.end_date, "--end-date")
        operation = "searchFestival2"
    else:
        operation = "searchStay2"
    lines.append(build_url(operation, params, probe))
    return lines


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    try:
        service_key = service_key_from_env()
        if args.dry_run:
            for line in _dry_run_lines(args):
                print(line)
            return 0
        if not service_key:
            raise TourApiError(MISSING_KEY_MSG)

        result = execute(args, service_key, timeout=args.timeout)
    except TourApiError as error:
        print(f"조회 실패: {error}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_output(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
