"""XML normalization for the building-register direct API."""

import xml.etree.ElementTree as ET
from typing import Any, Dict, Type


def parse_direct_xml(raw: bytes, error_type: Type[RuntimeError]) -> Dict[str, Any]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        raise error_type("건축물대장 API 응답 XML이 올바르지 않습니다.") from error
    result_code = (root.findtext("./header/resultCode") or "").strip()
    result_message = (root.findtext("./header/resultMsg") or "").strip()
    if result_code not in {"", "0", "00"}:
        raise error_type(f"건축물대장 API 오류: {result_message or result_code}")
    body = root.find("./body")
    if body is None:
        raise error_type("건축물대장 API 응답 본문이 없습니다.")
    items = [{child.tag: child.text or "" for child in item} for item in body.findall("./items/item")]
    pagination = {}
    for field, default in (("pageNo", 1), ("numOfRows", len(items)), ("totalCount", len(items))):
        try:
            pagination[field] = int(body.findtext(field) or default)
        except ValueError as error:
            raise error_type(f"건축물대장 API 응답 {field}가 올바른 정수가 아닙니다.") from error
        if pagination[field] < 0:
            raise error_type(f"건축물대장 API 응답 {field}가 음수입니다.")
    return {
        "page": pagination["pageNo"], "page_size": pagination["numOfRows"],
        "total_count": pagination["totalCount"], "items": items,
        "source": {"data_go_kr_dataset": "15134735", "operation": "getBrTitleInfo", "response_format": "XML"},
    }
