from __future__ import annotations

import argparse
import html
import json
import math
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from http.cookiejar import CookieJar
from typing import Any, Iterable

try:
    import requests
except ImportError:  # pragma: no cover - optional runtime dependency
    requests = None


BASE_URL = "https://sillok.history.go.kr"
SEARCH_URL = f"{BASE_URL}/search/searchResultList.do"
DETAIL_URL_TEMPLATE = f"{BASE_URL}/id/{{article_id}}"
DEFAULT_TIMEOUT = 30
DEFAULT_LIMIT = 5
MAX_PAGES = 20

DEFAULT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/main/main.do",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
}

COMMENT_PATTERN = re.compile(r"<!--.*?-->", re.S)
BR_PATTERN = re.compile(r"<br\s*/?>", re.I)
TAG_PATTERN = re.compile(r"<[^>]+>")
WHITESPACE_PATTERN = re.compile(r"\s+")
DIGITS_PATTERN = re.compile(r"\d+")
DETAIL_FOOTER_PATTERN = re.compile(
    r"\s*(?:[【〖](?:태백산사고본|국편영인본|분류)[】〗]|ⓒ\s*세종대왕기념사업회).*",
    re.S,
)

CATEGORY_PATTERN = re.compile(
    r"<a\s+href=\"javascript:searchCategory\('([^']*)'\);\"\s+class=\"cate-item[^\"]*\">(.*?)</a>",
    re.S,
)
RESULT_PATTERN = re.compile(
    r"<div\s+class=\"result-box\">.*?"
    r"<a\s+href=\"javascript:goView\('([^']+)',\s*\d+\);\"\s+class=\"subject\">(.*?)</a>\s*"
    r"<p\s+class=\"text\">(.*?)</p>",
    re.S,
)
TITLE_HEAD_PATTERN = re.compile(
    r"<div\s+class=\"title\">\s*<p\s+class=\"date\">(.*?)</p>\s*<h3>(.*?)</h3>",
    re.S,
)
LEFT_VIEW_PATTERN = re.compile(
    r"<div\s+class=\"view-item\s+left\">.*?<div\s+class=\"view-text\">(.*?)</div>",
    re.S,
)
RIGHT_VIEW_PATTERN = re.compile(
    r"<div\s+class=\"view-item\s+right\">.*?<div\s+class=\"view-text\">(.*?)</div>",
    re.S,
)
CLASSIFICATION_PATTERN = re.compile(r"<li\s+class=\"view_font02\">\s*[【〖]분류[】〗]\s*(.*?)</li>", re.S)
TOTAL_COUNT_PATTERN = re.compile(r"검색결과\s*<strong>(\d+)</strong>개")
HIDDEN_VALUE_TEMPLATE = '<input[^>]+id="{field}"[^>]+value="([^"]*)"'

KING_ACCESSION_YEARS = {
    "태조": 1392,
    "정종": 1399,
    "태종": 1401,
    "세종": 1418,
    "문종": 1450,
    "단종": 1452,
    "세조": 1455,
    "예종": 1468,
    "성종": 1469,
    "연산군": 1494,
    "중종": 1506,
    "인종": 1545,
    "명종": 1545,
    "선조": 1567,
    "선조수정": 1567,
    "광해군중초본": 1608,
    "광해군정초본": 1608,
    "인조": 1623,
    "효종": 1649,
    "현종": 1659,
    "현종개수": 1659,
    "숙종": 1674,
    "숙종보궐정오": 1674,
    "경종": 1720,
    "경종수정": 1720,
    "영조": 1724,
    "정조": 1776,
    "순조": 1800,
    "헌종": 1834,
    "철종": 1849,
    "고종": 1863,
    "순종": 1907,
    "순종부록": 1910,
}

KING_ALIASES = {
    "태조실록": "태조",
    "정종실록": "정종",
    "태종실록": "태종",
    "세종실록": "세종",
    "문종실록": "문종",
    "단종실록": "단종",
    "세조실록": "세조",
    "예종실록": "예종",
    "성종실록": "성종",
    "연산군일기": "연산군",
    "중종실록": "중종",
    "인종실록": "인종",
    "명종실록": "명종",
    "선조실록": "선조",
    "선조수정실록": "선조수정",
    "광해군중초본": "광해군중초본",
    "광해군정초본": "광해군정초본",
    "인조실록": "인조",
    "효종실록": "효종",
    "현종실록": "현종",
    "현종개수실록": "현종개수",
    "숙종실록": "숙종",
    "숙종보궐정오": "숙종보궐정오",
    "경종실록": "경종",
    "경종수정실록": "경종수정",
    "영조실록": "영조",
    "정조실록": "정조",
    "순조실록": "순조",
    "헌종실록": "헌종",
    "철종실록": "철종",
    "고종실록": "고종",
    "순종실록": "순종",
    "순종실록부록": "순종부록",
    "순종부록": "순종부록",
}

for canonical in KING_ACCESSION_YEARS:
    KING_ALIASES.setdefault(canonical, canonical)


@dataclass(frozen=True)
class SearchCategory:
    label: str
    count: int
    token: str


@dataclass(frozen=True)
class ResultTitleMetadata:
    king: str | None
    regnal_year: int | None
    gregorian_year: int | None
    article_title: str


@dataclass(frozen=True)
class SearchResult:
    article_id: str
    url: str
    title: str
    article_title: str
    summary: str
    king: str | None
    regnal_year: int | None
    gregorian_year: int | None


@dataclass(frozen=True)
class SearchReport:
    query: str
    search_type: str
    total_results: int
    type_count: int
    categories: list[SearchCategory]
    items: list[SearchResult]


@dataclass(frozen=True)
class ArticleDetail:
    article_id: str
    url: str
    header: str
    title: str
    translated_text: str
    original_text: str
    classification: str | None


def clean_text(value: str | None) -> str:
    text = COMMENT_PATTERN.sub(" ", value or "")
    text = BR_PATTERN.sub("\n", text)
    text = TAG_PATTERN.sub(" ", text)
    text = html.unescape(text)
    return WHITESPACE_PATTERN.sub(" ", text).strip()


def clean_article_text(value: str | None) -> str:
    text = COMMENT_PATTERN.sub(" ", value or "")
    text = BR_PATTERN.sub("\n", text)
    text = TAG_PATTERN.sub(" ", text)
    text = html.unescape(text)
    lines = [WHITESPACE_PATTERN.sub(" ", line).strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line)
    text = DETAIL_FOOTER_PATTERN.sub("", text).strip()
    return WHITESPACE_PATTERN.sub(" ", text).strip()


def positive_int(raw_value: str) -> int:
    value = int(raw_value)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return value


def normalize_king_name(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = clean_text(value).replace(" ", "")
    if not cleaned:
        return None
    return KING_ALIASES.get(cleaned, cleaned)


def build_opener() -> urllib.request.OpenerDirector:
    cookie_jar = CookieJar()
    context = ssl.create_default_context()
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar),
        urllib.request.HTTPSHandler(context=context),
    )


def build_http_client() -> Any:
    return build_opener()


def should_fallback_to_opener(error: Exception) -> bool:
    if requests is None:
        return False

    exceptions = getattr(requests, "exceptions", None)
    http_error = getattr(exceptions, "HTTPError", None)
    if isinstance(http_error, type) and isinstance(error, http_error):
        return False

    request_exception = getattr(exceptions, "RequestException", None)
    if isinstance(request_exception, type) and isinstance(error, request_exception):
        return True

    return isinstance(error, OSError)


def fetch_text(
    opener: Any,
    url: str,
    *,
    data: dict[str, str] | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    referer: str | None = None,
) -> str:
    headers = dict(DEFAULT_HEADERS)
    if referer is not None:
        headers["Referer"] = referer

    if requests is not None:
        try:
            if data is not None:
                response = requests.post(url, data=data, timeout=timeout, headers=headers)
            else:
                response = requests.get(url, timeout=timeout, headers=headers)
            response.raise_for_status()
            return response.text
        except Exception as error:  # noqa: BLE001
            if opener is None or not should_fallback_to_opener(error):
                raise RuntimeError(f"Sillok request failed for {url}: {error}") from error

    body = urllib.parse.urlencode(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")

    try:
        with opener.open(request, timeout=timeout) as response:
            return response.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as error:  # type: ignore[attr-defined]
        raise RuntimeError(f"Sillok request failed with HTTP {error.code} for {url}") from error
    except urllib.error.URLError as error:  # type: ignore[attr-defined]
        raise RuntimeError(f"Sillok request failed for {url}: {error.reason}") from error


def extract_hidden_int(html_text: str, field: str) -> int | None:
    pattern = re.compile(HIDDEN_VALUE_TEMPLATE.format(field=re.escape(field)))
    match = pattern.search(html_text)
    if not match:
        return None
    digits = DIGITS_PATTERN.search(match.group(1))
    return int(digits.group(0)) if digits else None


def parse_result_title_metadata(title: str) -> ResultTitleMetadata:
    cleaned_title = clean_text(title)
    article_title = cleaned_title.split("/", 1)[1].strip() if "/" in cleaned_title else cleaned_title
    metadata_match = re.search(r",\s*([^,]+?)\s+(즉위년|\d+년)\b", cleaned_title)

    if not metadata_match:
        return ResultTitleMetadata(None, None, None, article_title)

    king = normalize_king_name(metadata_match.group(1))
    year_token = metadata_match.group(2)
    regnal_year = 1 if year_token == "즉위년" else int(year_token.removesuffix("년"))
    accession_year = KING_ACCESSION_YEARS.get(king or "")
    if accession_year is None:
        gregorian_year = None
    elif year_token == "즉위년":
        gregorian_year = accession_year
    else:
        gregorian_year = accession_year + regnal_year

    return ResultTitleMetadata(king, regnal_year, gregorian_year, article_title)


def parse_search_results(html_text: str, *, query: str, search_type: str) -> SearchReport:
    total_results = extract_hidden_int(html_text, "totalCount")
    if total_results is None:
        total_match = TOTAL_COUNT_PATTERN.search(html_text)
        total_results = int(total_match.group(1)) if total_match else 0

    count_field = {"k": "countK", "w": "countW", "m": "countM", "c": "countC"}.get(search_type, "")
    type_count = extract_hidden_int(html_text, count_field) if count_field else None
    if type_count is None:
        type_count = total_results

    categories: list[SearchCategory] = []
    for token, label_html in CATEGORY_PATTERN.findall(html_text):
        label = clean_text(label_html)
        match = re.match(r"(.+?)\s*\((\d+)\)", label)
        if not match:
            continue
        categories.append(SearchCategory(label=match.group(1), count=int(match.group(2)), token=token))

    items: list[SearchResult] = []
    for article_id, subject_html, summary_html in RESULT_PATTERN.findall(html_text):
        title = clean_text(subject_html)
        title = re.sub(r"^\d+\.\s*", "", title)
        metadata = parse_result_title_metadata(title)
        items.append(
            SearchResult(
                article_id=article_id,
                url=DETAIL_URL_TEMPLATE.format(article_id=article_id),
                title=title,
                article_title=metadata.article_title,
                summary=clean_text(summary_html),
                king=metadata.king,
                regnal_year=metadata.regnal_year,
                gregorian_year=metadata.gregorian_year,
            )
        )

    return SearchReport(
        query=query,
        search_type=search_type,
        total_results=total_results,
        type_count=type_count,
        categories=categories,
        items=items,
    )


def filter_results(
    items: Iterable[SearchResult],
    *,
    king: str | None = None,
    year: int | None = None,
) -> list[SearchResult]:
    normalized_king = normalize_king_name(king)
    filtered: list[SearchResult] = []

    for item in items:
        if normalized_king is not None and item.king != normalized_king:
            continue
        if year is not None and item.gregorian_year != year:
            continue
        filtered.append(item)

    return filtered


def parse_detail_page(html_text: str, *, article_id: str) -> ArticleDetail:
    title_head = TITLE_HEAD_PATTERN.search(html_text)
    if not title_head:
        raise ValueError("Unable to find the article header on the detail page.")

    translated_match = LEFT_VIEW_PATTERN.search(html_text)
    original_match = RIGHT_VIEW_PATTERN.search(html_text)
    if not translated_match or not original_match:
        raise ValueError("Unable to find translated/original article text on the detail page.")

    classification_match = CLASSIFICATION_PATTERN.search(html_text)

    return ArticleDetail(
        article_id=article_id,
        url=DETAIL_URL_TEMPLATE.format(article_id=article_id),
        header=clean_text(title_head.group(1)),
        title=clean_text(title_head.group(2)),
        translated_text=clean_article_text(translated_match.group(1)),
        original_text=clean_article_text(original_match.group(1)),
        classification=clean_text(classification_match.group(1)) if classification_match else None,
    )


def build_search_payload(*, query: str, search_type: str, page_index: int) -> dict[str, str]:
    return {
        "topSearchWord": query,
        "pageIndex": str(page_index),
        "initPageUnit": "0",
        "type": search_type,
        "sillokType": "S",
        "topSearchWord_ime": f'<span class="newbatang">{html.escape(query)}</span>',
    }


def fetch_search_page(
    opener: urllib.request.OpenerDirector,
    *,
    query: str,
    search_type: str,
    page_index: int,
    timeout: int,
) -> SearchReport:
    payload = build_search_payload(query=query, search_type=search_type, page_index=page_index)
    html_text = fetch_text(opener, SEARCH_URL, data=payload, timeout=timeout, referer=f"{BASE_URL}/main/main.do")
    return parse_search_results(html_text, query=query, search_type=search_type)


def fetch_detail_page(
    opener: urllib.request.OpenerDirector,
    *,
    article_id: str,
    timeout: int,
) -> ArticleDetail:
    url = DETAIL_URL_TEMPLATE.format(article_id=article_id)
    html_text = fetch_text(opener, url, timeout=timeout, referer=SEARCH_URL)
    return parse_detail_page(html_text, article_id=article_id)


def search_sillok(
    query: str,
    *,
    king: str | None = None,
    year: int | None = None,
    limit: int = DEFAULT_LIMIT,
    search_type: str = "k",
    timeout: int = DEFAULT_TIMEOUT,
) -> dict:
    opener = build_http_client()
    reports: list[SearchReport] = []
    filtered_results: list[SearchResult] = []

    page_index = 1
    total_pages = 1
    while page_index <= total_pages and page_index <= MAX_PAGES:
        report = fetch_search_page(opener, query=query, search_type=search_type, page_index=page_index, timeout=timeout)
        reports.append(report)
        page_filtered = filter_results(report.items, king=king, year=year)
        filtered_results.extend(page_filtered)

        if page_index == 1:
            page_size = len(report.items) or 1
            total_pages = max(1, math.ceil((report.type_count or report.total_results or 0) / page_size))
        if len(filtered_results) >= limit or not report.items:
            break
        page_index += 1

    first_report = reports[0] if reports else SearchReport(query, search_type, 0, 0, [], [])
    limited_results = filtered_results[:limit]
    details = [fetch_detail_page(opener, article_id=item.article_id, timeout=timeout) for item in limited_results]
    detail_map = {detail.article_id: detail for detail in details}

    serialized_items = []
    for item in limited_results:
        detail = detail_map.get(item.article_id)
        serialized_items.append(
            {
                **asdict(item),
                "detail": asdict(detail) if detail else None,
                "excerpt": detail.translated_text[:280] if detail and detail.translated_text else item.summary[:280],
            }
        )

    return {
        "query": query,
        "type": search_type,
        "filters": {"king": normalize_king_name(king), "year": year, "limit": limit},
        "total_results": first_report.total_results,
        "type_count": first_report.type_count,
        "returned_count": len(serialized_items),
        "categories": [asdict(category) for category in first_report.categories],
        "items": serialized_items,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search Joseon Sillok records from sillok.history.go.kr")
    parser.add_argument("--query", required=True, help="Search keyword to send to the Joseon Sillok site")
    parser.add_argument("--king", help="Optional king filter, e.g. 세종 or 세종실록")
    parser.add_argument("--year", type=positive_int, help="Optional Gregorian year filter, e.g. 1443")
    parser.add_argument("--limit", type=positive_int, default=DEFAULT_LIMIT, help="Number of results to return")
    parser.add_argument(
        "--type",
        dest="search_type",
        choices=["k", "w"],
        default="k",
        help="Search translated text (k) or original text (w)",
    )
    parser.add_argument("--timeout", type=positive_int, default=DEFAULT_TIMEOUT, help="HTTP timeout in seconds")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        report = search_sillok(
            args.query,
            king=args.king,
            year=args.year,
            limit=args.limit,
            search_type=args.search_type,
            timeout=args.timeout,
        )
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
