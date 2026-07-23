from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from html import unescape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _naver_http import TAG_RE, urlopen

SEARCH_URL = "https://search.naver.com/search.naver"
DEFAULT_COUNT = 10
MAX_COUNT = 30
FIRST_PAGE_START = 1
RESULTS_PER_PAGE = 15

DEFAULT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko,en-US;q=0.9,en;q=0.8",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
}

BLOG_ANCHOR_PATTERN = re.compile(
    r'<a[^>]*href="(https?://blog\.naver\.com/([a-zA-Z0-9_]+)/(\d+))"[^>]*>(.*?)</a>',
    re.DOTALL,
)


def strip_html(text: str) -> str:
    return unescape(TAG_RE.sub("", text)).strip()


def build_search_params(query: str, start: int = FIRST_PAGE_START, sort: str = "sim") -> dict[str, str]:
    return {
        "query": query,
        "ssc": "tab.blog.all",
        "sm": "tab_jum" if start <= FIRST_PAGE_START else "tab_pge",
        "start": str(start),
        "nso": {"sim": "so:r,p:all,a:all", "date": "so:dd,p:all,a:all"}.get(sort, "so:r,p:all,a:all"),
    }


def fetch_search_page(query: str, start: int = 1, sort: str = "sim", timeout: int = 15, *, insecure: bool = False) -> str:
    params = build_search_params(query, start=start, sort=sort)
    url = f"{SEARCH_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers=DEFAULT_HEADERS)

    try:
        with urlopen(request, timeout, insecure=insecure) as response:
            return response.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"Naver search returned HTTP {error.code}. "
            "The request may have been blocked. Retry later or reduce request volume."
        ) from error


def parse_search_results(html: str) -> list[dict]:
    results: list[dict] = []
    anchors = BLOG_ANCHOR_PATTERN.findall(html)

    pending: dict[str, dict] = {}

    for full_url, user_id, post_id, inner_html in anchors:
        if full_url not in pending:
            pending[full_url] = {
                "url": full_url,
                "mobile_url": f"https://m.blog.naver.com/{user_id}/{post_id}",
                "author": user_id,
                "title": "",
                "snippet": "",
            }

        text = strip_html(inner_html)
        if not text:
            continue

        entry = pending[full_url]

        if "headline1" in inner_html or "text-type-headline" in inner_html:
            if not entry["title"]:
                entry["title"] = text
        elif "body1" in inner_html or "text-type-body" in inner_html:
            if not entry["snippet"]:
                entry["snippet"] = text
        else:
            if not entry["title"]:
                entry["title"] = text

    for entry in pending.values():
        results.append(entry)

    return results


def search(query: str, count: int = DEFAULT_COUNT, sort: str = "sim", timeout: int = 15, *, insecure: bool = False) -> dict:
    count = max(1, min(count, MAX_COUNT))
    all_results: list[dict] = []
    seen_urls: set[str] = set()
    start = FIRST_PAGE_START
    # 네이버 검색이 페이지당 정확히 RESULTS_PER_PAGE개를 반환하지 않을 수 있으므로 여유 페이지 확보
    max_pages = (count // RESULTS_PER_PAGE) + 3

    for page_num in range(max_pages):
        if len(all_results) >= count:
            break

        if page_num > 0:
            time.sleep(0.5)

        html = fetch_search_page(query, start=start, sort=sort, timeout=timeout, insecure=insecure)
        page_results = parse_search_results(html)[:RESULTS_PER_PAGE]

        if not page_results:
            if start == 1:
                print("[warn] 검색 결과 파싱 실패. 네이버 HTML 구조가 변경되었을 수 있습니다.", file=sys.stderr)
            break

        new_count = 0
        for result in page_results:
            if result["url"] not in seen_urls:
                seen_urls.add(result["url"])
                all_results.append(result)
                new_count += 1
                if len(all_results) >= count:
                    break

        if new_count == 0:
            break

        start += RESULTS_PER_PAGE

    return {
        "query": query,
        "total_results": len(all_results),
        "results": all_results,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search Naver blogs and return structured JSON results."
    )
    parser.add_argument("query", help="Search query string.")
    parser.add_argument(
        "--count", type=int, default=DEFAULT_COUNT,
        help=f"Number of results to return (max {MAX_COUNT}, default {DEFAULT_COUNT}).",
    )
    parser.add_argument(
        "--sort", choices=["sim", "date"], default="sim",
        help="Sort order: sim (relevance) or date (newest first). Default: sim.",
    )
    parser.add_argument(
        "--timeout", type=int, default=15,
        help="HTTP request timeout in seconds. Default: 15.",
    )
    parser.add_argument(
        "--insecure", action="store_true",
        help="Skip SSL certificate verification (use only when certificate errors occur).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    try:
        result = search(
            args.query,
            count=args.count,
            sort=args.sort,
            timeout=args.timeout,
            insecure=args.insecure,
        )
    except RuntimeError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
