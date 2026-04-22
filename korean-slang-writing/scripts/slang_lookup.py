#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from html import unescape
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _slang_http import (  # noqa: E402
    BlockedError,
    NotFoundError,
    UpstreamError,
    build_namuwiki_url,
    fetch_html,
)


DEFAULT_TIMEOUT = 15
DEFAULT_MAX_LENGTH = 1500

TAG_RE = re.compile(r"<[^>]+>")
SCRIPT_STYLE_RE = re.compile(
    r"<(script|style|noscript)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE
)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL | re.IGNORECASE)
NAMUWIKI_TITLE_SUFFIX_RE = re.compile(r"\s*[-|]?\s*나무위키\s*$")
BLOCK_END_RE = re.compile(r"</(p|div|li|h[1-6])>", re.IGNORECASE)
BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
WHITESPACE_RE = re.compile(r"[ \t]+")
BLANK_LINES_RE = re.compile(r"\n{3,}")

MAIN_CONTENT_CLASSES = (
    "wiki-paragraph",
    "wiki-content",
    "namu-wiki-content",
    "article-content",
    "wiki-body",
    "wiki-heading-content",
)


def fetch_page(url: str, timeout: int) -> str:
    return fetch_html(url, timeout=timeout)


def extract_title(html: str) -> str:
    match = TITLE_RE.search(html)
    if not match:
        return ""
    title = unescape(TAG_RE.sub("", match.group(1))).strip()
    title = NAMUWIKI_TITLE_SUFFIX_RE.sub("", title).strip()
    return title


def _find_main_content(cleaned_html: str) -> str:
    for class_name in MAIN_CONTENT_CLASSES:
        pattern = re.compile(
            rf'<[a-zA-Z]+[^>]*class="[^"]*\b{re.escape(class_name)}\b[^"]*"[^>]*>',
            re.IGNORECASE,
        )
        match = pattern.search(cleaned_html)
        if match:
            return cleaned_html[match.start():]

    article_match = re.search(r"<article[^>]*>", cleaned_html, re.IGNORECASE)
    if article_match:
        return cleaned_html[article_match.start():]

    return ""


def _html_fragment_to_text(fragment: str) -> str:
    text = BR_RE.sub("\n", fragment)
    text = BLOCK_END_RE.sub("\n", text)
    text = TAG_RE.sub("", text)
    text = unescape(text)
    lines: list[str] = []
    for line in text.split("\n"):
        stripped = WHITESPACE_RE.sub(" ", line).strip()
        if stripped:
            lines.append(stripped)
    joined = "\n".join(lines)
    return BLANK_LINES_RE.sub("\n\n", joined).strip()


def extract_summary(html: str, *, max_length: int = DEFAULT_MAX_LENGTH) -> str:
    cleaned = SCRIPT_STYLE_RE.sub("", html)
    region = _find_main_content(cleaned)
    if not region:
        return ""
    text = _html_fragment_to_text(region)
    if not text:
        return ""
    if max_length > 0 and len(text) > max_length:
        return text[:max_length] + "..."
    return text


def _is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def lookup(
    term_or_url: str,
    *,
    timeout: int = DEFAULT_TIMEOUT,
    max_length: int = DEFAULT_MAX_LENGTH,
) -> dict[str, Any]:
    input_value = term_or_url.strip()
    if not input_value:
        raise ValueError("term_or_url is empty")

    url = build_namuwiki_url(input_value)
    result: dict[str, Any] = {
        "input": term_or_url,
        "url": url,
        "fetched": False,
        "title": "",
        "summary": "",
        "error": None,
        "block_reason": None,
    }

    try:
        html = fetch_page(url, timeout=timeout)
    except BlockedError as error:
        result["error"] = str(error)
        result["block_reason"] = "blocked"
        return result
    except NotFoundError as error:
        result["error"] = str(error)
        result["block_reason"] = "not_found"
        return result
    except UpstreamError as error:
        result["error"] = str(error)
        result["block_reason"] = "upstream_error"
        return result

    result["fetched"] = True
    result["title"] = extract_title(html)
    result["summary"] = extract_summary(html, max_length=max_length)
    if not result["summary"]:
        result["warning"] = (
            "Main content region not detected. Namu Wiki HTML layout may have changed; "
            "treat this as a hint and verify meaning from seed index or other sources."
        )
    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch a Namu Wiki page for a trending slang term and return a best-effort "
            "summary. Gracefully reports when the upstream blocks the request."
        )
    )
    parser.add_argument(
        "term_or_url",
        help="Slang term (e.g. '중꺾마') or full Namu Wiki URL.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds. Default: {DEFAULT_TIMEOUT}.",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=DEFAULT_MAX_LENGTH,
        help=f"Summary truncation length (0 = unlimited). Default: {DEFAULT_MAX_LENGTH}.",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format.",
    )
    return parser.parse_args(argv)


def _format_text(result: dict) -> str:
    lines: list[str] = []
    lines.append(f"URL: {result['url']}")
    if result["fetched"]:
        lines.append(f"Title: {result['title']}")
        lines.append("")
        lines.append(result["summary"] or "(summary not extracted)")
    else:
        lines.append("Fetch failed.")
        lines.append(f"Reason: {result.get('block_reason')}")
        lines.append(f"Detail: {result.get('error')}")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    try:
        result = lookup(
            args.term_or_url,
            timeout=args.timeout,
            max_length=args.max_length,
        )
    except ValueError as error:
        print(
            json.dumps({"error": str(error)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        sys.stdout.write(_format_text(result))
    return 0 if result["fetched"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
