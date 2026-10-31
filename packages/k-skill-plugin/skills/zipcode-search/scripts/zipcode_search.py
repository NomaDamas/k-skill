#!/usr/bin/env python3

from __future__ import annotations

import argparse
import html
import json
import subprocess
from dataclasses import asdict, dataclass
import re
from typing import Callable, Sequence

SEARCH_URL = "https://www.epost.kr/search.RetrieveIntegrationNewZipCdList.comm"
DEFAULT_LIMIT = 5
VIEW_DETAIL_PATTERN = re.compile(
    r"viewDetail\(\s*'(?P<zip>(?:\\'|[^'])*)'\s*,\s*'(?P<road>(?:\\'|[^'])*)'\s*,\s*'(?P<english>(?:\\'|[^'])*)'\s*,\s*'(?P<jibun>(?:\\'|[^'])*)'\s*,\s*'(?P<row>(?:\\'|[^'])*)'\s*\)",
    re.S,
)


@dataclass(frozen=True)
class AddressSearchResult:
    zip_code: str
    road_address: str
    english_address: str
    jibun_address: str | None = None


@dataclass(frozen=True)
class AddressSearchResponse:
    query: str
    results: list[AddressSearchResult]

    def to_json(self) -> str:
        return json.dumps(
            {
                "query": self.query,
                "results": [asdict(item) for item in self.results],
            },
            ensure_ascii=False,
            indent=2,
        )


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = html.unescape(value).replace("\\'", "'")
    cleaned = " ".join(cleaned.split()).strip()
    return cleaned or None


def parse_search_results(page: str) -> list[AddressSearchResult]:
    items: list[AddressSearchResult] = []
    for match in VIEW_DETAIL_PATTERN.finditer(page):
        zip_code = clean_text(match.group("zip"))
        road_address = clean_text(match.group("road"))
        english_address = clean_text(match.group("english"))
        jibun_address = clean_text(match.group("jibun"))
        if not zip_code or not road_address or not english_address:
            continue
        items.append(
            AddressSearchResult(
                zip_code=zip_code,
                road_address=road_address,
                english_address=english_address,
                jibun_address=jibun_address,
            )
        )
    return items


def build_search_command(query: str) -> list[str]:
    return [
        "curl",
        "--http1.1",
        "--tls-max",
        "1.2",
        "--silent",
        "--show-error",
        "--location",
        "--retry",
        "3",
        "--retry-all-errors",
        "--retry-delay",
        "1",
        "--max-time",
        "20",
        "--get",
        "--data-urlencode",
        f"keyword={query}",
        SEARCH_URL,
    ]


Runner = Callable[..., subprocess.CompletedProcess[str]]


def fetch_search_page(query: str, *, runner: Runner = subprocess.run) -> str:
    result = runner(
        build_search_command(query),
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.stdout


Fetcher = Callable[[str], str]


def lookup_korean_address(
    query: str,
    *,
    limit: int = DEFAULT_LIMIT,
    fetcher: Fetcher = fetch_search_page,
) -> AddressSearchResponse:
    normalized_query = " ".join(query.split()).strip()
    if not normalized_query:
        raise ValueError("query must not be blank")
    if limit <= 0:
        raise ValueError("limit must be a positive integer")

    page = fetcher(normalized_query)
    return AddressSearchResponse(
        query=normalized_query,
        results=parse_search_results(page)[:limit],
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Look up Korean postcodes and official English addresses from ePost.",
    )
    parser.add_argument("query", help="Korean road-name or jibun address query")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="maximum number of rows to keep")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    response = lookup_korean_address(args.query, limit=args.limit)
    print(response.to_json())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
