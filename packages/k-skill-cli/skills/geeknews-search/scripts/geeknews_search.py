#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from dataclasses import asdict, dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

GEEKNEWS_FEED_URL = "https://feeds.feedburner.com/geeknews-feed"


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return " ".join(part.strip() for part in self.parts if part.strip())


@dataclass(frozen=True)
class GeekNewsItem:
    id: str
    title: str
    link: str
    published: str | None
    updated: str | None
    author_name: str | None
    author_url: str | None
    summary: str
    content_html: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class GeekNewsFeed:
    title: str
    source_id: str | None
    updated: str | None
    home_url: str | None
    feed_url: str | None
    category: str | None
    items: list[GeekNewsItem]

    def source_dict(self) -> dict[str, object]:
        return {
            "title": self.title,
            "id": self.source_id,
            "updated": self.updated,
            "home_url": self.home_url,
            "feed_url": self.feed_url,
            "category": self.category,
        }


def _strip_cdata(value: str | None) -> str:
    if not value:
        return ""
    stripped = value.strip()
    if stripped.startswith("<![CDATA[") and stripped.endswith("]]>"):
        return stripped[9:-3]
    return stripped


def _collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _clean_xml_text(value: str | None) -> str:
    return _collapse_whitespace(unescape(_strip_cdata(value)))


def _html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    return _collapse_whitespace(unescape(parser.text()))


def _first_tag(block: str, tag: str) -> str | None:
    match = re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", block, re.DOTALL)
    if not match:
        return None
    return _clean_xml_text(match.group(1))


def _first_raw_tag(block: str, tag: str) -> str | None:
    match = re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", block, re.DOTALL)
    if not match:
        return None
    return _strip_cdata(match.group(1)).strip()


def _first_link_href(block: str) -> str | None:
    patterns = (
        r"<link\b[^>]*rel=['\"]alternate['\"][^>]*href=['\"]([^'\"]+)['\"]",
        r"<link\b[^>]*href=['\"]([^'\"]+)['\"]",
    )
    for pattern in patterns:
        match = re.search(pattern, block)
        if match:
            return unescape(match.group(1).strip())
    return None


def _link_href(block: str, *, rel: str | None = None) -> str | None:
    if rel:
        match = re.search(
            rf"<link\b[^>]*(?:rel|ref)=['\"]{re.escape(rel)}['\"][^>]*href=['\"]([^'\"]+)['\"]",
            block,
        )
        if match:
            return unescape(match.group(1).strip())
    return _first_link_href(block)


def _feed_prefix(xml_text: str) -> str:
    if "<entry" not in xml_text:
        return xml_text
    return xml_text.split("<entry", 1)[0]


def _entry_blocks(xml_text: str) -> list[str]:
    return re.findall(r"<entry\b[^>]*>(.*?)</entry>", xml_text, re.DOTALL)


def _validate_limit(limit: int) -> int:
    if limit <= 0:
        raise ValueError("limit must be positive")
    return limit


def load_feed(xml_text: str) -> GeekNewsFeed:
    prefix = _feed_prefix(xml_text)
    items = []
    for entry in _entry_blocks(xml_text):
        author_block_match = re.search(r"<author\b[^>]*>(.*?)</author>", entry, re.DOTALL)
        author_block = author_block_match.group(1) if author_block_match else ""
        content_html = (_first_raw_tag(entry, "content") or "").strip()
        items.append(
            GeekNewsItem(
                id=_first_tag(entry, "id") or "",
                title=_first_tag(entry, "title") or "",
                link=_first_link_href(entry) or (_first_tag(entry, "id") or ""),
                published=_first_tag(entry, "published") or _first_tag(entry, "updated"),
                updated=_first_tag(entry, "updated"),
                author_name=_first_tag(author_block, "name"),
                author_url=_first_tag(author_block, "uri"),
                summary=_html_to_text(content_html),
                content_html=content_html,
            )
        )

    category_match = re.search(r"<category\b[^>]*term=['\"]([^'\"]+)['\"]", prefix)
    return GeekNewsFeed(
        title=_first_tag(prefix, "title") or "GeekNews",
        source_id=_first_tag(prefix, "id"),
        updated=_first_tag(prefix, "updated"),
        home_url=_link_href(prefix, rel="alternate"),
        feed_url=_link_href(prefix, rel="self") or _first_tag(prefix, "id"),
        category=category_match.group(1) if category_match else None,
        items=items,
    )


def list_items(feed: GeekNewsFeed, limit: int = 10) -> list[GeekNewsItem]:
    return feed.items[:_validate_limit(limit)]


def search_items(feed: GeekNewsFeed, query: str, limit: int = 10) -> list[GeekNewsItem]:
    if not query.strip():
        raise ValueError("query is required")
    limit = _validate_limit(limit)
    needle = query.casefold()
    matches = []
    for item in feed.items:
        haystack = "\n".join(
            part
            for part in (
                item.title,
                item.summary,
                item.author_name or "",
                item.author_url or "",
                item.id,
                item.link,
            )
            if part
        ).casefold()
        if needle in haystack:
            matches.append(item)
        if len(matches) >= limit:
            break
    return matches


def get_item_detail(feed: GeekNewsFeed, lookup: str) -> GeekNewsItem:
    normalized_lookup = lookup.strip().casefold()
    if not normalized_lookup:
        raise ValueError("lookup is required")
    for item in feed.items:
        candidates = [item.id, item.link, item.title]
        lowered = [candidate.casefold() for candidate in candidates if candidate]
        if normalized_lookup in lowered or any(normalized_lookup in candidate for candidate in lowered):
            return item
    raise LookupError(f"No GeekNews entry matched: {lookup}")


def _serialize_items(items: list[GeekNewsItem]) -> list[dict[str, object]]:
    return [item.to_dict() for item in items]


def build_list_payload(feed: GeekNewsFeed, limit: int = 10) -> dict[str, object]:
    items = list_items(feed, limit=limit)
    return {"source": feed.source_dict(), "count": len(items), "items": _serialize_items(items)}


def build_search_payload(feed: GeekNewsFeed, query: str, limit: int = 10) -> dict[str, object]:
    items = search_items(feed, query=query, limit=limit)
    return {
        "source": feed.source_dict(),
        "query": query,
        "count": len(items),
        "items": _serialize_items(items),
    }


def build_detail_payload(feed: GeekNewsFeed, lookup: str) -> dict[str, object]:
    item = get_item_detail(feed, lookup)
    return {"source": feed.source_dict(), "item": item.to_dict()}


def fetch_feed(url: str = GEEKNEWS_FEED_URL, timeout: int = 20) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "k-skill-geeknews/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def _add_feed_source_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--feed-url", default=GEEKNEWS_FEED_URL, help="기본값: GeekNews public feed URL")
    parser.add_argument("--feed-file", help="테스트/오프라인 검증용 로컬 Atom XML 파일")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read GeekNews entries from the public RSS/Atom feed.")

    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="최신 GeekNews 항목 목록")
    _add_feed_source_args(list_parser)
    list_parser.add_argument("--limit", type=int, default=10)

    search_parser = subparsers.add_parser("search", help="제목/요약/작성자 기준 검색")
    _add_feed_source_args(search_parser)
    search_parser.add_argument("--query", required=True)
    search_parser.add_argument("--limit", type=int, default=10)

    detail_parser = subparsers.add_parser("detail", help="항목 상세 확인")
    _add_feed_source_args(detail_parser)
    detail_parser.add_argument("--id", required=True, help="entry id/link/topic id 일부")

    return parser.parse_args(argv)


def _load_feed_text(args: argparse.Namespace) -> str:
    if args.feed_file:
        return Path(args.feed_file).read_text(encoding="utf-8")
    return fetch_feed(url=args.feed_url)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    feed = load_feed(_load_feed_text(args))

    if args.command == "list":
        payload = build_list_payload(feed, limit=args.limit)
    elif args.command == "search":
        payload = build_search_payload(feed, query=args.query, limit=args.limit)
    else:
        payload = build_detail_payload(feed, lookup=args.id)

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
