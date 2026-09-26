#!/usr/bin/env python3
"""Read-only HIRA medical-institution lookup helper (BYOK, stdlib only)."""
# allow: SIZE_OK - Cohesive HIRA search/detail CLI adapter covering transport, normalization, and output contracts.

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Sequence, Tuple

GATEWAY_BASE_URL = "https://apis.data.go.kr"
BASIC_SERVICE_PATH = "B551182/hospInfoServicev2/getHospBasisList"
DETAIL_SERVICE_BASE_PATH = "B551182/MadmDtlInfoService2.8"
DATASET_BASIC = "15001698"
DATASET_DETAIL = "15001699"
DATASET_BASIC_URL = "https://www.data.go.kr/data/15001698/openapi.do"
DATASET_DETAIL_URL = "https://www.data.go.kr/data/15001699/openapi.do"
DEFAULT_SECRETS_PATH = pathlib.Path("~/.config/k-skill/secrets.env").expanduser()
USER_AGENT = "k-skill-hira-medical-institution-search/1"
KEY_ENV_NAMES = ("KSKILL_HIRA_API_KEY", "DATA_GO_KR_API_KEY")
MAX_NUM_OF_ROWS = 100

DETAIL_SECTIONS: Dict[str, Tuple[str, str]] = {
    "facility": ("getEqpInfo2.8", "시설정보(주소·전화·종별·병상)"),
    "schedule": ("getDtlInfo2.8", "세부정보(진료시간·주차·응급실)"),
    "departments": ("getDgsbjtInfo2.8", "진료과목정보"),
    "equipment": ("getMedOftInfo2.8", "의료장비정보"),
    "special": ("getSpclDiagInfo2.8", "특수진료정보(진료가능분야)"),
    "transport": ("getTrnsprtInfo2.8", "교통정보"),
    "specialists": ("getSpcSbjtSdrInfo2.8", "전문과목별 전문의 수"),
    "nursing": ("getNursigGrdInfo2.8", "간호등급정보"),
    "staff": ("getEtcHstInfo2.8", "기타인력수"),
}
DEFAULT_SECTIONS = ("facility", "schedule", "departments", "equipment", "special")

SUCCESS_CODES = {"", "0", "00", "03"}
EMPTY_CODES = {"03"}
AUTH_ERROR_CODES = {"20", "30", "31"}
QUOTA_ERROR_CODES = {"22"}
RATE_ERROR_CODES = {"23"}
PARAM_ERROR_CODES = {"10"}
SERVICE_ERROR_CODES = {"12"}
GATEWAY_ERROR_CODES = {"01", "04", "05", "29"}

SERVICE_SOURCE = {
    "provider": "건강보험심사평가원(HIRA)",
    "gateway": GATEWAY_BASE_URL,
    "datasets": {
        "basic_list": {"id": DATASET_BASIC, "doc": DATASET_BASIC_URL, "operation": "getHospBasisList"},
        "detail": {"id": DATASET_DETAIL, "doc": DATASET_DETAIL_URL},
    },
}
DISCLAIMER = (
    "공식 공공데이터 요약이며 진단·처방·응급 판단이 아닙니다. 응급상황은 119 또는 "
    "응급의료포털(E-Gen)을 먼저 이용하세요."
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


def resolve_api_key(secrets_path: str) -> str:
    for name in KEY_ENV_NAMES:
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    secrets = load_secrets(pathlib.Path(secrets_path).expanduser())
    for name in KEY_ENV_NAMES:
        value = secrets.get(name)
        if value and value.strip():
            return value.strip()
    raise HelperError(
        "HIRA/공공데이터 인증키가 없습니다. KSKILL_HIRA_API_KEY 또는 DATA_GO_KR_API_KEY "
        "환경변수나 ~/.config/k-skill/secrets.env 에 설정하세요. 검색에는 데이터셋 "
        f"{DATASET_BASIC}(병원정보서비스), 상세에는 {DATASET_DETAIL}(의료기관별상세정보서비스) "
        "활용신청이 필요합니다."
    )


def _bounded(value: int, label: str, low: int, high: int) -> int:
    if value < low or value > high:
        raise HelperError(f"{label} 값은 {low}~{high} 범위여야 합니다.")
    return value


def _code(value: Optional[str], label: str, max_len: int) -> Optional[str]:
    text = (value or "").strip()
    if not text:
        return None
    if not text.isdigit() or len(text) > max_len:
        raise HelperError(f"{label} 값은 최대 {max_len}자리 숫자여야 합니다.")
    return text


def _request_url(service_path: str, query: Dict[str, str], redact_key: bool = False) -> str:
    params = dict(query)
    if redact_key:
        for field in ("ServiceKey", "serviceKey"):
            if field in params:
                params[field] = "REDACTED"
    return f"{GATEWAY_BASE_URL}/{service_path}?{urllib.parse.urlencode(params)}"


def http_get(url: str, timeout: int) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"accept": "application/json, application/xml", "user-agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        if status in (401, 403):
            raise HelperError(f"HIRA API HTTP {status}: 인증키/활용신청 상태를 확인하세요.") from error
        if status == 429:
            raise HelperError("HIRA API HTTP 429: 호출 한도를 초과했습니다. 잠시 후 재시도하세요.") from error
        raise HelperError(f"HIRA API HTTP 오류: {status}") from error
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", "unknown")
        raise HelperError(f"HIRA API 네트워크 오류: {reason}") from error
    except TimeoutError as error:
        raise HelperError("HIRA API 요청 시간이 초과되었습니다.") from error


def _json_items(items: Any) -> List[Dict[str, Any]]:
    if items is None or items == "":
        return []
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    if isinstance(items, dict):
        item = items.get("item")
        if item is None or item == "":
            return []
        if isinstance(item, list):
            return [entry for entry in item if isinstance(entry, dict)]
        if isinstance(item, dict):
            return [item]
    raise HelperError("HIRA 응답 items 형식이 올바르지 않습니다.")


def _coerce_int(value: Any, default: int, label: str) -> int:
    if value is None or value == "":
        return default
    try:
        return int(str(value))
    except (TypeError, ValueError) as error:
        raise HelperError(f"HIRA 응답 {label} 값이 올바른 정수가 아닙니다.") from error


def _assemble(
    result_code: Any,
    result_msg: Any,
    items: List[Dict[str, Any]],
    page_no: Any,
    num_of_rows: Any,
    total_count: Any,
) -> Dict[str, Any]:
    return {
        "result_code": str(result_code or "").strip(),
        "result_msg": str(result_msg or "").strip(),
        "page_no": _coerce_int(page_no, 1, "pageNo"),
        "num_of_rows": _coerce_int(num_of_rows, len(items), "numOfRows"),
        "total_count": _coerce_int(total_count, len(items), "totalCount"),
        "items": items,
    }


def _normalize_json(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, list):
        return _assemble("00", "", [item for item in payload if isinstance(item, dict)], 1, len(payload), len(payload))
    if not isinstance(payload, dict):
        raise HelperError("HIRA 응답 JSON이 객체가 아닙니다.")
    wrapper = payload.get("response")
    if isinstance(wrapper, dict):
        payload = wrapper
    header = payload.get("header") if isinstance(payload.get("header"), dict) else {}
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    return _assemble(
        header.get("resultCode"),
        header.get("resultMsg"),
        _json_items(body.get("items")),
        body.get("pageNo"),
        body.get("numOfRows"),
        body.get("totalCount"),
    )


def _normalize_xml(raw: bytes) -> Dict[str, Any]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        raise HelperError("HIRA 응답을 JSON/XML로 해석할 수 없습니다.") from error
    if root.tag.lower() != "response":
        raise HelperError("HIRA 응답을 JSON/XML로 해석할 수 없습니다.")
    header = root.find("./header")
    body = root.find("./body")
    if header is None:
        header = root
    items: List[Dict[str, Any]] = []
    if body is not None:
        items_node = body.find("./items")
        if items_node is not None:
            for item in items_node.findall("./item"):
                items.append({child.tag: (child.text or "").strip() for child in item})
    return _assemble(
        header.findtext("./resultCode"),
        header.findtext("./resultMsg"),
        items,
        body.findtext("./pageNo") if body is not None else None,
        body.findtext("./numOfRows") if body is not None else None,
        body.findtext("./totalCount") if body is not None else None,
    )


def normalize_payload(raw: bytes) -> Dict[str, Any]:
    stripped = raw.lstrip()
    if stripped.startswith(b"{") or stripped.startswith(b"["):
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HelperError("HIRA 응답이 올바른 JSON이 아닙니다.") from error
        return _normalize_json(payload)
    return _normalize_xml(raw)


def ensure_success(payload: Dict[str, Any]) -> Dict[str, Any]:
    code = payload["result_code"]
    if code in SUCCESS_CODES:
        return payload
    message = payload["result_msg"] or "상류 API 오류"
    if code in AUTH_ERROR_CODES:
        raise HelperError(
            f"HIRA 인증/권한 오류({code}): {message}. 데이터셋 {DATASET_BASIC}/{DATASET_DETAIL} "
            "활용신청과 인증키 상태를 확인하세요."
        )
    if code in QUOTA_ERROR_CODES:
        raise HelperError(f"HIRA 일일 호출 한도 초과({code}): {message}. 초기화 후 재시도하거나 트래픽 증설을 신청하세요.")
    if code in RATE_ERROR_CODES:
        raise HelperError(f"HIRA 초당 호출 한도 초과({code}): {message}. 잠시 후 재시도하세요.")
    if code in PARAM_ERROR_CODES:
        raise HelperError(f"HIRA 요청 파라미터 오류({code}): {message}. 입력값 형식을 확인하세요.")
    if code in SERVICE_ERROR_CODES:
        raise HelperError(f"HIRA 서비스 없음/폐기({code}): {message}. operation 이름을 확인하세요.")
    if code in GATEWAY_ERROR_CODES:
        raise HelperError(f"HIRA 게이트웨이/상류 장애({code}): {message}. 잠시 후 재시도하세요.")
    raise HelperError(f"HIRA API 오류({code}): {message}")


def add_search_filters(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--name", help="기관명(yadmNm)")
    parser.add_argument("--sido-cd", help="시도코드(예: 110000)")
    parser.add_argument("--sggu-cd", help="시군구코드(예: 110019)")
    parser.add_argument("--emdong", help="읍면동명")
    parser.add_argument("--dgsbjt-cd", help="진료과목코드(예: 01)")
    parser.add_argument("--cl-cd", help="종별코드(예: 11)")


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--secrets-path", default=str(DEFAULT_SECRETS_PATH))
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")


def build_search_query(args: argparse.Namespace, api_key: str) -> Dict[str, str]:
    query = {
        "ServiceKey": api_key,
        "pageNo": str(_bounded(args.page_no, "pageNo", 1, 100000)),
        "numOfRows": str(_bounded(args.num_of_rows, "numOfRows", 1, MAX_NUM_OF_ROWS)),
        "_type": "json",
    }
    for field, value, max_len, label in (
        ("sidoCd", args.sido_cd, 6, "sidoCd"),
        ("sgguCd", args.sggu_cd, 6, "sgguCd"),
        ("yadmNm", args.name, 0, "yadmNm"),
        ("dgsbjtCd", args.dgsbjt_cd, 3, "dgsbjtCd"),
        ("clCd", args.cl_cd, 3, "clCd"),
    ):
        if max_len:
            normalized = _code(value, label, max_len)
        else:
            normalized = (value or "").strip() or None
        if normalized:
            query[field] = normalized
    emdong = (args.emdong or "").strip()
    if emdong:
        query["emdongNm"] = emdong
    return query


def search_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    items = []
    for item in payload["items"]:
        items.append(
            {
                "ykiho": str(item.get("ykiho", "")).strip(),
                "name": str(item.get("yadmNm", "")).strip(),
                "type": str(item.get("clCdNm", "")).strip(),
                "address": str(item.get("addr", "")).strip(),
                "phone": str(item.get("telno", "")).strip(),
                "homepage": str(item.get("hospUrl", "")).strip(),
                "sido": str(item.get("sidoCdNm", "")).strip(),
                "sigungu": str(item.get("sgguCdNm", "")).strip(),
                "dong": str(item.get("emdongNm", "")).strip(),
                "established": str(item.get("estbDd", "")).strip(),
                "x": str(item.get("XPos", "")).strip(),
                "y": str(item.get("YPos", "")).strip(),
            }
        )
    return {
        "total_count": payload["total_count"],
        "page_no": payload["page_no"],
        "num_of_rows": payload["num_of_rows"],
        "items": items,
        "source": SERVICE_SOURCE,
        "disclaimer": DISCLAIMER,
    }


def fetch_search(args: argparse.Namespace, api_key: str) -> Dict[str, Any]:
    query = build_search_query(args, api_key)
    url = _request_url(BASIC_SERVICE_PATH, query)
    return search_payload(ensure_success(normalize_payload(http_get(url, args.timeout))))


def resolve_ykiho(args: argparse.Namespace, api_key: str) -> Tuple[str, str]:
    if args.ykiho:
        text = args.ykiho.strip()
        if not text:
            raise HelperError("--ykiho 값이 비어 있습니다.")
        return text, ""
    if not args.name:
        raise HelperError("--ykiho 또는 --name 중 하나가 필요합니다.")
    result = fetch_search(args, api_key)
    matched = [item for item in result["items"] if item["ykiho"]]
    if not result["items"]:
        raise HelperError("검색 결과가 없습니다. 기관명/지역을 더 정확히 입력하거나 --ykiho 를 사용하세요.")
    if not matched:
        raise HelperError("검색 결과에 요양기호(ykiho)가 없어 상세 조회를 진행할 수 없습니다.")
    if len(matched) > 1:
        preview = ", ".join(f"{item['name']}({item['ykiho']})" for item in matched[:5])
        raise HelperError(f"검색 결과가 {len(matched)}건입니다. --ykiho 로 하나를 지정하세요: {preview}")
    return matched[0]["ykiho"], matched[0]["name"]


def parse_sections(value: Optional[str]) -> List[str]:
    if not value:
        return list(DEFAULT_SECTIONS)
    text = value.strip()
    if text == "all":
        return list(DETAIL_SECTIONS)
    result: List[str] = []
    for raw in text.split(","):
        key = raw.strip()
        if key not in DETAIL_SECTIONS:
            raise HelperError(
                f"알 수 없는 섹션 '{key}'. 사용 가능: {', '.join(DETAIL_SECTIONS)}, all"
            )
        if key not in result:
            result.append(key)
    if not result:
        raise HelperError("--sections 값이 비어 있습니다.")
    return result


def fetch_section(args: argparse.Namespace, api_key: str, ykiho: str, section: str) -> Dict[str, Any]:
    operation, label = DETAIL_SECTIONS[section]
    query = {
        "serviceKey": api_key,
        "ykiho": ykiho,
        "pageNo": "1",
        "numOfRows": str(_bounded(args.num_of_rows, "numOfRows", 1, MAX_NUM_OF_ROWS)),
        "_type": "json",
    }
    url = _request_url(f"{DETAIL_SERVICE_BASE_PATH}/{operation}", query)
    payload = ensure_success(normalize_payload(http_get(url, args.timeout)))
    return {
        "key": section,
        "operation": operation,
        "label": label,
        "total_count": payload["total_count"],
        "items": payload["items"],
    }


def _first(item: Optional[Dict[str, Any]], field: str) -> str:
    if not item:
        return ""
    return str(item.get(field, "")).strip()


def _listed(items: Sequence[Dict[str, Any]], field: str, limit: int = 8) -> str:
    values = []
    for item in items:
        text = str(item.get(field, "")).strip()
        if text:
            values.append(text)
    if not values:
        return ""
    shown = ", ".join(values[:limit])
    if len(values) > limit:
        shown += f" 외 {len(values) - limit}건"
    return shown


def summarize_section(section: Dict[str, Any]) -> str:
    key = section["key"]
    items = section["items"]
    if not items:
        return "정보 없음"
    if key == "facility":
        item = items[0]
        parts = [
            _first(item, "yadmNm"),
            _first(item, "clCdNm"),
            _first(item, "addr"),
            f"전화 {_first(item, 'telno')}" if _first(item, "telno") else "",
            f"홈페이지 {_first(item, 'hospUrl')}" if _first(item, "hospUrl") else "",
        ]
        return " · ".join(part for part in parts if part) or "정보 없음"
    if key == "departments":
        special = _listed(items, "dgsbjtCdNm")
        return special or "정보 없음"
    if key == "equipment":
        values = [
            f"{str(item.get('oftCdNm', '')).strip()} x{str(item.get('oftCnt', '')).strip()}"
            for item in items
            if str(item.get("oftCdNm", "")).strip()
        ]
        return ", ".join(values[:8]) + (f" 외 {len(values) - 8}건" if len(values) > 8 else "") if values else "정보 없음"
    if key == "special":
        return _listed(items, "srchCdNm") or "정보 없음"
    if key == "schedule":
        item = items[0]
        parts = []
        if _first(item, "emyDayYn"):
            parts.append(f"주간 응급실 {_first(item, 'emyDayYn')}")
        if _first(item, "emyNgtYn"):
            parts.append(f"야간 응급실 {_first(item, 'emyNgtYn')}")
        if _first(item, "rcvWeek"):
            parts.append(f"평일 접수 {_first(item, 'rcvWeek')}")
        if _first(item, "parkQty"):
            parts.append(f"주차 {_first(item, 'parkQty')}대")
        return " · ".join(parts) or "정보 없음"
    if key == "transport":
        return _listed(items, "trafNm") or "정보 없음"
    if key == "specialists":
        values = [f"{str(i.get('dgsbjtCdNm', '')).strip()} {str(i.get('dtlSdrCnt', '')).strip()}명" for i in items]
        return ", ".join(values[:8]) or "정보 없음"
    if key == "nursing":
        values = [f"{str(i.get('tyCdNm', '')).strip()} {str(i.get('careGrd', '')).strip()}" for i in items]
        return ", ".join(v for v in values if v.strip()) or "정보 없음"
    if key == "staff":
        values = [f"{str(i.get('dtlGnlNopCdNm', '')).strip()} {str(i.get('gnlNopCnt', '')).strip()}명" for i in items]
        return ", ".join(values[:8]) or "정보 없음"
    if key == "special-hospital":
        return _listed(items, "srchCdNm") or "정보 없음"
    item = items[0]
    return ", ".join(f"{k}: {v}" for k, v in list(item.items())[:5]) or "정보 없음"


def format_search(payload: Dict[str, Any]) -> str:
    lines = [
        f"HIRA 병원·의료기관 검색 결과: {len(payload['items'])}건 (page {payload['page_no']}, total {payload['total_count']})"
    ]
    for item in payload["items"]:
        detail = " · ".join(
            part for part in (item["type"], item["address"], item["phone"]) if part
        )
        lines.append(f"- {item['name'] or '(이름 없음)'}" + (f" · {detail}" if detail else ""))
        if item["ykiho"]:
            lines.append(f"  ykiho={item['ykiho']}")
    if not payload["items"]:
        lines.append("검색 결과가 없습니다.")
    lines.append(f"※ {DISCLAIMER}")
    return "\n".join(lines)


def format_detail(payload: Dict[str, Any]) -> str:
    title = payload.get("name") or payload["ykiho"]
    lines = [f"HIRA 의료기관 상세정보: {title}"]
    for section in payload["sections"]:
        lines.append(f"• [{section['label']}] {summarize_section(section)}")
    lines.append(f"※ {DISCLAIMER}")
    return "\n".join(lines)


def _run_search(args: argparse.Namespace, api_key: str) -> int:
    if args.dry_run:
        query = build_search_query(args, api_key)
        print(
            json.dumps(
                {
                    "operation": "search",
                    "url": _request_url(BASIC_SERVICE_PATH, query, redact_key=True),
                    "source": SERVICE_SOURCE,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    payload = fetch_search(args, api_key)
    print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else format_search(payload))
    return 0


def _run_detail(args: argparse.Namespace, api_key: str) -> int:
    sections = parse_sections(args.sections)
    if args.dry_run and not args.ykiho:
        query = build_search_query(args, api_key)
        preview = {
            "operation": "detail",
            "resolve_url": _request_url(BASIC_SERVICE_PATH, query, redact_key=True),
            "sections": [DETAIL_SECTIONS[key][0] for key in sections],
        }
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return 0
    ykiho, matched_name = resolve_ykiho(args, api_key)
    if args.dry_run:
        query = {
            "serviceKey": api_key,
            "ykiho": ykiho,
            "pageNo": "1",
            "numOfRows": str(_bounded(args.num_of_rows, "numOfRows", 1, MAX_NUM_OF_ROWS)),
            "_type": "json",
        }
        urls = [
            _request_url(f"{DETAIL_SERVICE_BASE_PATH}/{DETAIL_SECTIONS[key][0]}", query, redact_key=True)
            for key in sections
        ]
        print(json.dumps({"operation": "detail", "ykiho": ykiho, "urls": urls}, ensure_ascii=False, indent=2))
        return 0
    results = [fetch_section(args, api_key, ykiho, key) for key in sections]
    payload = {
        "ykiho": ykiho,
        "name": matched_name,
        "sections": results,
        "source": SERVICE_SOURCE,
        "disclaimer": DISCLAIMER,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else format_detail(payload))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="HIRA 의료기관 검색·상세정보 조회 (read-only, BYOK)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search = subparsers.add_parser("search", help="기관명/지역/진료과 기준 병·의원 검색")
    add_search_filters(search)
    search.add_argument("--page-no", type=int, default=1)
    search.add_argument("--num-of-rows", type=int, default=20)
    add_common(search)

    detail = subparsers.add_parser("detail", help="요양기호(ykiho) 또는 기관명으로 상세정보 조회")
    detail.add_argument("--ykiho", help="암호화된 요양기호(검색 결과의 ykiho)")
    add_search_filters(detail)
    detail.add_argument("--sections", help=f"쉼표 구분 섹션 (기본: {','.join(DEFAULT_SECTIONS)}, all)")
    detail.add_argument("--page-no", type=int, default=1)
    detail.add_argument("--num-of-rows", type=int, default=MAX_NUM_OF_ROWS)
    add_common(detail)
    return parser


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def run(argv: Optional[Sequence[str]] = None) -> int:
    try:
        args = parse_args(argv)
        if args.timeout < 1 or args.timeout > 120:
            raise HelperError("--timeout 값은 1~120 범위여야 합니다.")
        api_key = resolve_api_key(args.secrets_path)
        if args.command == "search":
            return _run_search(args, api_key)
        return _run_detail(args, api_key)
    except HelperError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
