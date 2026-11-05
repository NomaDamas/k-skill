from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Iterable

LIST_URL = "https://www.khs.go.kr/cha/SearchKindOpenapiList.do"
DETAIL_URL = "https://www.khs.go.kr/cha/SearchKindOpenapiDt.do"
EVENT_URL = "https://www.khs.go.kr/cha/openapi/selectEventListOpenapi.do"
OPEN_API_GUIDE_URL = "https://www.khs.go.kr/html/HtmlPage.do?mn=NS_04_04_03&pg=%2Fpublicinfo%2Fpbinfo3_0201.jsp"
USER_AGENT = "k-skill-korean-heritage-search/1.0"

REGION_CODES = {
    "서울": "11",
    "부산": "21",
    "대구": "22",
    "인천": "23",
    "광주": "24",
    "대전": "25",
    "울산": "26",
    "경기": "31",
    "강원": "32",
    "충북": "33",
    "충남": "34",
    "전북": "35",
    "전남": "36",
    "경북": "37",
    "경남": "38",
    "제주": "39",
    "세종": "45",
}


class HeritageApiError(RuntimeError):
    """Raised when the official heritage API cannot return valid XML."""


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = html.unescape(value)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(?:p|div|li|ul|ol|h[1-6])[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    return text.strip()


def _child_text(parent: ET.Element, name: str) -> str:
    child = parent.find(name)
    return _clean_text(child.text if child is not None else "")


def _int_or_none(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float_or_none(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _request_xml(url: str, params: dict[str, str], timeout: float = 20.0) -> ET.Element:
    query = urllib.parse.urlencode({key: value for key, value in params.items() if value != ""})
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"Accept": "application/xml", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise HeritageApiError(f"official heritage API returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HeritageApiError(f"official heritage API request failed: {exc.reason if isinstance(exc, urllib.error.URLError) else exc}") from exc

    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise HeritageApiError("official heritage API returned invalid XML") from exc
    if root.tag.rsplit("}", 1)[-1] != "result":
        raise HeritageApiError("official heritage API returned an unexpected XML root")
    return root


def _source_payload(url: str, fetched_at: str) -> dict[str, str]:
    return {"url": url, "fetched_at": fetched_at}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_region(region: str) -> str:
    value = region.strip()
    if value in REGION_CODES:
        return REGION_CODES[value]
    if value in REGION_CODES.values():
        return value
    raise ValueError(f"unknown region: {region}; use a Korean region name or code")


def _list_item(item: ET.Element) -> dict[str, object]:
    return {
        "name": _child_text(item, "ccbaMnm1"),
        "name_hanja": _child_text(item, "ccbaMnm2"),
        "heritage_type": _child_text(item, "ccmaName"),
        "province": _child_text(item, "ccbaCtcdNm"),
        "district": _child_text(item, "ccsiName"),
        "admin": _child_text(item, "ccbaAdmin"),
        "latitude": _float_or_none(_child_text(item, "latitude")),
        "longitude": _float_or_none(_child_text(item, "longitude")),
        "designated_status": _child_text(item, "ccbaCncl"),
        "updated_at": _child_text(item, "regDt"),
        "heritage_code": {
            "kind": _child_text(item, "ccbaKdcd"),
            "number": _child_text(item, "ccbaAsno"),
            "province": _child_text(item, "ccbaCtcd"),
        },
    }


def parse_search_result(root: ET.Element, *, url: str, fetched_at: str) -> dict[str, object]:
    items = [_list_item(item) for item in root.findall("./item")]
    return {
        "total_results": _int_or_none(_child_text(root, "totalCnt")) or 0,
        "page": _int_or_none(_child_text(root, "pageIndex")) or 1,
        "page_size": _int_or_none(_child_text(root, "pageUnit")) or len(items),
        "items": items,
        "source": _source_payload(url, fetched_at),
    }


def search_heritage(query: str = "", region: str = "", page: int = 1, limit: int = 10) -> dict[str, object]:
    if page < 1:
        raise ValueError("page must be at least 1")
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    params = {
        "pageUnit": str(limit),
        "pageIndex": str(page),
        "ccbaCncl": "N",
        "ccbaMnm1": query.strip(),
        "ccbaCtcd": normalize_region(region) if region else "",
    }
    fetched_at = _now_iso()
    root = _request_xml(LIST_URL, params)
    return parse_search_result(root, url=LIST_URL, fetched_at=fetched_at)


def parse_detail_result(root: ET.Element, *, url: str, fetched_at: str) -> dict[str, object]:
    item = root.find("./item")
    if item is None:
        raise HeritageApiError("heritage detail was not found")
    if not _child_text(item, "ccbaMnm1") or any(
        not _child_text(root, field) for field in ("ccbaKdcd", "ccbaAsno", "ccbaCtcd")
    ):
        raise HeritageApiError("heritage detail was not found")
    return {
        "name": _child_text(item, "ccbaMnm1"),
        "name_hanja": _child_text(item, "ccbaMnm2"),
        "heritage_type": _child_text(item, "ccmaName"),
        "classification": [
            value for value in (
                _child_text(item, "gcodeName"),
                _child_text(item, "bcodeName"),
                _child_text(item, "mcodeName"),
                _child_text(item, "scodeName"),
            ) if value
        ],
        "quantity": _child_text(item, "ccbaQuan"),
        "designated_date": _child_text(item, "ccbaAsdt"),
        "province": _child_text(item, "ccbaCtcdNm"),
        "district": _child_text(item, "ccsiName"),
        "address": _child_text(item, "ccbaLcad"),
        "built_or_created": _child_text(item, "ccceName"),
        "ownership": _child_text(item, "ccbaPoss"),
        "admin": _child_text(item, "ccbaAdmin"),
        "description": _child_text(item, "content"),
        "image_url": _child_text(item, "imageUrl"),
        "latitude": _float_or_none(_child_text(root, "latitude")),
        "longitude": _float_or_none(_child_text(root, "longitude")),
        "heritage_code": {
            "kind": _child_text(root, "ccbaKdcd"),
            "number": _child_text(root, "ccbaAsno"),
            "province": _child_text(root, "ccbaCtcd"),
        },
        "source": _source_payload(url, fetched_at),
    }


def get_heritage_detail(kind: str, number: str, province_code: str) -> dict[str, object]:
    values = {"ccbaKdcd": kind.strip(), "ccbaAsno": number.strip(), "ccbaCtcd": province_code.strip()}
    if any(not value for value in values.values()):
        raise ValueError("detail requires ccba-kdcd, ccba-asno, and ccba-ctcd")
    fetched_at = _now_iso()
    root = _request_xml(DETAIL_URL, values)
    return parse_detail_result(root, url=DETAIL_URL, fetched_at=fetched_at)


def _event_item(item: ET.Element) -> dict[str, object]:
    return {
        "title": _child_text(item, "subTitle"),
        "description": _child_text(item, "subContent"),
        "start_date": _child_text(item, "sDate"),
        "end_date": _child_text(item, "eDate"),
        "display_date": _child_text(item, "subDate"),
        "province": _child_text(item, "sido"),
        "district": _child_text(item, "gugun"),
        "venue": _child_text(item, "subDesc"),
        "organizer": _child_text(item, "groupName"),
        "audience": _child_text(item, "subDesc_2"),
        "fee": _child_text(item, "subDesc_3"),
        "contact": _child_text(item, "contact"),
        "url": _child_text(item, "subPath"),
    }


def parse_event_result(
    root: ET.Element,
    *,
    year: int,
    month: int,
    region: str,
    limit: int,
    url: str,
    fetched_at: str,
) -> dict[str, object]:
    items: Iterable[dict[str, object]] = (_event_item(item) for item in root.findall("./item"))
    if region:
        needle = region.strip()
        items = (
            item for item in items
            if needle in str(item["province"]) or needle in str(item["district"])
        )
    selected = list(items)[:limit]
    return {
        "year": year,
        "month": month,
        "returned_count": len(selected),
        "items": selected,
        "source": _source_payload(url, fetched_at),
    }


def search_events(year: int, month: int, region: str = "", limit: int = 20) -> dict[str, object]:
    if not 1 <= year <= 9999:
        raise ValueError("year must be between 1 and 9999")
    if not 1 <= month <= 12:
        raise ValueError("month must be between 1 and 12")
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    params = {"searchYear": str(year), "searchMonth": str(month)}
    fetched_at = _now_iso()
    root = _request_xml(EVENT_URL, params)
    return parse_event_result(
        root,
        year=year,
        month=month,
        region=region,
        limit=limit,
        url=EVENT_URL,
        fetched_at=fetched_at,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Search official Korean heritage records and events.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search = subparsers.add_parser("search", help="search heritage records")
    search.add_argument("--query", default="", help="heritage name keyword")
    search.add_argument("--region", default="", help="Korean province name or code")
    search.add_argument("--page", type=int, default=1)
    search.add_argument("--limit", type=int, default=10)

    detail = subparsers.add_parser("detail", help="show one heritage record")
    detail.add_argument("--ccba-kdcd", required=True)
    detail.add_argument("--ccba-asno", required=True)
    detail.add_argument("--ccba-ctcd", required=True)

    events = subparsers.add_parser("events", help="search monthly heritage events")
    events.add_argument("--year", type=int, required=True)
    events.add_argument("--month", type=int, required=True)
    events.add_argument("--region", default="", help="province or district text filter")
    events.add_argument("--limit", type=int, default=20)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "search":
            payload = search_heritage(args.query, args.region, args.page, args.limit)
        elif args.command == "detail":
            payload = get_heritage_detail(args.ccba_kdcd, args.ccba_asno, args.ccba_ctcd)
        else:
            payload = search_events(args.year, args.month, args.region, args.limit)
    except (HeritageApiError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
