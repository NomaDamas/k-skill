from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from typing import Callable

SERVICE_KEY_ENV_VAR = "KIPRIS_PLUS_API_KEY"
DEFAULT_TIMEOUT = 30
DEFAULT_NUM_ROWS = 10
DEFAULT_PAGE_NO = 1
BASE_API_URL = "https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice"
SEARCH_OPERATION = "getWordSearch"
DETAIL_OPERATION = "getBibliographyDetailInfoSearch"
DEFAULT_HEADERS = {
    "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
}


@dataclass(frozen=True)
class PatentSearchResult:
    index_no: int | None
    application_number: str
    invention_title: str | None
    register_status: str | None
    application_date: str | None
    open_number: str | None
    open_date: str | None
    publication_number: str | None
    publication_date: str | None
    register_number: str | None
    register_date: str | None
    ipc_number: str | None
    abstract_text: str | None
    applicant_name: str | None
    drawing: str | None
    big_drawing: str | None


@dataclass(frozen=True)
class PatentSearchResponse:
    query: str
    page_no: int
    num_of_rows: int
    total_count: int
    items: list[PatentSearchResult]


@dataclass(frozen=True)
class PatentDetail:
    application_number: str
    invention_title: str | None
    register_status: str | None
    application_date: str | None
    open_number: str | None
    open_date: str | None
    publication_number: str | None
    publication_date: str | None
    register_number: str | None
    register_date: str | None
    ipc_number: str | None
    abstract_text: str | None
    applicant_name: str | None
    drawing: str | None
    big_drawing: str | None


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split()).strip()
    return cleaned or None


def parse_positive_int(raw_value: str) -> int:
    value = int(raw_value)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return value


def resolve_service_key(explicit_key: str | None = None) -> str:
    candidate = clean_text(explicit_key) or clean_text(os.getenv(SERVICE_KEY_ENV_VAR))
    if candidate:
        return urllib.parse.unquote(candidate)
    raise ValueError(
        f"missing {SERVICE_KEY_ENV_VAR}. Export {SERVICE_KEY_ENV_VAR} or pass --service-key "
        "(mapped to the KIPRIS Plus ServiceKey query parameter)."
    )


def build_operation_url(operation: str) -> str:
    return f"{BASE_API_URL}/{operation}"


def build_search_params(
    *,
    query: str,
    year: int | None = None,
    page_no: int = DEFAULT_PAGE_NO,
    num_of_rows: int = DEFAULT_NUM_ROWS,
    patent: bool = True,
    utility: bool = True,
    service_key: str,
) -> dict[str, str]:
    if not patent and not utility:
        raise ValueError("At least one of patent or utility must remain enabled for keyword search.")
    params = {
        "word": query,
        "patent": "true" if patent else "false",
        "utility": "true" if utility else "false",
        "pageNo": str(page_no),
        "numOfRows": str(num_of_rows),
        "ServiceKey": urllib.parse.unquote(service_key),
    }
    if year is not None:
        params["year"] = str(year)
    return params


def build_detail_params(*, application_number: str, service_key: str) -> dict[str, str]:
    return {"applicationNumber": application_number, "ServiceKey": urllib.parse.unquote(service_key)}


def fetch_xml(url: str, params: dict[str, str], timeout: int = DEFAULT_TIMEOUT) -> str:
    request_url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(request_url, headers=DEFAULT_HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"KIPRIS Plus HTTP {exc.code}: {body or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Failed to reach KIPRIS Plus API: {exc.reason}") from exc


def get_child_text(element: ET.Element | None, tag_name: str) -> str | None:
    if element is None:
        return None
    child = element.find(tag_name)
    return clean_text(child.text if child is not None else None)


def parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    return int(value)


def parse_xml_response(xml_text: str) -> ET.Element:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise RuntimeError(f"Failed to parse KIPRIS Plus XML response: {exc}") from exc

    result_code = get_child_text(root.find("header"), "resultCode")
    result_msg = get_child_text(root.find("header"), "resultMsg")
    if result_code and result_code != "00":
        raise RuntimeError(result_msg or f"KIPRIS Plus API error code {result_code}")
    return root


def parse_patent_item(item: ET.Element) -> PatentSearchResult:
    application_number = get_child_text(item, "applicationNumber")
    if not application_number:
        raise RuntimeError("KIPRIS Plus response item is missing applicationNumber")

    return PatentSearchResult(
        index_no=parse_int(get_child_text(item, "indexNo")),
        application_number=application_number,
        invention_title=get_child_text(item, "inventionTitle"),
        register_status=get_child_text(item, "registerStatus"),
        application_date=get_child_text(item, "applicationDate"),
        open_number=get_child_text(item, "openNumber"),
        open_date=get_child_text(item, "openDate"),
        publication_number=get_child_text(item, "publicationNumber"),
        publication_date=get_child_text(item, "publicationDate"),
        register_number=get_child_text(item, "registerNumber"),
        register_date=get_child_text(item, "registerDate"),
        ipc_number=get_child_text(item, "ipcNumber"),
        abstract_text=get_child_text(item, "astrtCont"),
        applicant_name=get_child_text(item, "applicantName"),
        drawing=get_child_text(item, "drawing"),
        big_drawing=get_child_text(item, "bigDrawing"),
    )


def parse_patent_search_response(xml_text: str, *, query: str) -> PatentSearchResponse:
    root = parse_xml_response(xml_text)
    body = root.find("body")
    items_parent = body.find("items") if body is not None else None
    item_elements = items_parent.findall("item") if items_parent is not None else []
    items = [parse_patent_item(item) for item in item_elements]
    return PatentSearchResponse(
        query=query,
        page_no=parse_int(get_child_text(body, "pageNo")) or DEFAULT_PAGE_NO,
        num_of_rows=parse_int(get_child_text(body, "numOfRows")) or len(items),
        total_count=parse_int(get_child_text(body, "totalCount")) or len(items),
        items=items,
    )


def parse_patent_detail_response(xml_text: str) -> PatentDetail:
    root = parse_xml_response(xml_text)
    body = root.find("body")
    item = body.find("item") if body is not None else None
    if item is None and body is not None:
        items_parent = body.find("items")
        item = items_parent.find("item") if items_parent is not None else None
    if item is None:
        raise RuntimeError("KIPRIS Plus detail response did not include an item payload")

    search_item = parse_patent_item(item)
    return PatentDetail(
        application_number=search_item.application_number,
        invention_title=search_item.invention_title,
        register_status=search_item.register_status,
        application_date=search_item.application_date,
        open_number=search_item.open_number,
        open_date=search_item.open_date,
        publication_number=search_item.publication_number,
        publication_date=search_item.publication_date,
        register_number=search_item.register_number,
        register_date=search_item.register_date,
        ipc_number=search_item.ipc_number,
        abstract_text=search_item.abstract_text,
        applicant_name=search_item.applicant_name,
        drawing=search_item.drawing,
        big_drawing=search_item.big_drawing,
    )


def search_patents(
    query: str,
    *,
    year: int | None = None,
    page_no: int = DEFAULT_PAGE_NO,
    num_of_rows: int = DEFAULT_NUM_ROWS,
    patent: bool = True,
    utility: bool = True,
    service_key: str | None = None,
    fetcher: Callable[[str, dict[str, str], int], str] = fetch_xml,
    timeout: int = DEFAULT_TIMEOUT,
) -> PatentSearchResponse:
    key = resolve_service_key(service_key)
    xml_text = fetcher(
        build_operation_url(SEARCH_OPERATION),
        build_search_params(
            query=query,
            year=year,
            page_no=page_no,
            num_of_rows=num_of_rows,
            patent=patent,
            utility=utility,
            service_key=key,
        ),
        timeout,
    )
    return parse_patent_search_response(xml_text, query=query)


def get_patent_detail(
    application_number: str,
    *,
    service_key: str | None = None,
    fetcher: Callable[[str, dict[str, str], int], str] = fetch_xml,
    timeout: int = DEFAULT_TIMEOUT,
) -> PatentDetail:
    key = resolve_service_key(service_key)
    xml_text = fetcher(
        build_operation_url(DETAIL_OPERATION),
        build_detail_params(application_number=application_number, service_key=key),
        timeout,
    )
    return parse_patent_detail_response(xml_text)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search Korean patent information via the official KIPRIS Plus Open API."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--query", help="Keyword for KIPRIS getWordSearch")
    mode.add_argument("--application-number", help="Application number for bibliography detail lookup")
    parser.add_argument("--year", type=parse_positive_int, help="Optional year filter for keyword search")
    parser.add_argument("--page-no", type=parse_positive_int, default=DEFAULT_PAGE_NO, help="Response page number")
    parser.add_argument("--num-rows", type=parse_positive_int, default=DEFAULT_NUM_ROWS, help="Rows per page")
    parser.add_argument("--service-key", help=f"KIPRIS Plus ServiceKey (defaults to ${SERVICE_KEY_ENV_VAR})")
    parser.add_argument("--exclude-patent", action="store_true", help="Exclude patent results from keyword search")
    parser.add_argument("--exclude-utility", action="store_true", help="Exclude utility-model results from keyword search")
    parser.add_argument("--timeout", type=parse_positive_int, default=DEFAULT_TIMEOUT, help="HTTP timeout seconds")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.query:
            payload = search_patents(
                args.query,
                year=args.year,
                page_no=args.page_no,
                num_of_rows=args.num_rows,
                patent=not args.exclude_patent,
                utility=not args.exclude_utility,
                service_key=args.service_key,
                timeout=args.timeout,
            )
        else:
            payload = get_patent_detail(
                args.application_number,
                service_key=args.service_key,
                timeout=args.timeout,
            )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(json.dumps(asdict(payload), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
