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
H2_TAG_RE = re.compile(r"<h2\b[^>]*>.*?</h2>", re.DOTALL | re.IGNORECASE)
NUMBERED_H2_INNER_TEXT_RE = re.compile(r"^\s*\d+(?:\.\d+)*\.\s+\S")
SECTION_NUMBER_PREFIX_RE = re.compile(r"^\s*\d+(?:\.\d+)*\.\s+", re.MULTILINE)
EDIT_AFFORDANCE_RE = re.compile(r"\[\s*편집\s*\]")
CATEGORY_NAV_RE = re.compile(r"\[\s*펼치기\s*[·・•]\s*접기\s*\][^\n]*")
DETAILS_PELCHIGI_RE = re.compile(
    r"<details\b[^>]*>"
    r"\s*<summary\b[^>]*>[^<]*펼치기[^<]*</summary>"
    r".*?"
    r"</details>",
    re.DOTALL | re.IGNORECASE,
)
OG_DESCRIPTION_RE = re.compile(
    r'<meta\s+[^>]*property\s*=\s*"og:description"\s+[^>]*content\s*=\s*"([^"]*)"',
    re.IGNORECASE,
)
OG_DESCRIPTION_REVERSED_RE = re.compile(
    r'<meta\s+[^>]*content\s*=\s*"([^"]*)"\s+[^>]*property\s*=\s*"og:description"',
    re.IGNORECASE,
)

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


def _h2_inner_text(h2_tag_html: str) -> str:
    opening_end = h2_tag_html.index(">") + 1
    closing_start = h2_tag_html.rindex("<")
    inner = h2_tag_html[opening_end:closing_start]
    return unescape(TAG_RE.sub("", inner)).strip()


def _is_numbered_section_h2(h2_tag_html: str) -> bool:
    return bool(NUMBERED_H2_INNER_TEXT_RE.match(_h2_inner_text(h2_tag_html)))


def _extract_first_section_between_h2(cleaned_html: str) -> str:
    all_matches = list(H2_TAG_RE.finditer(cleaned_html))
    numbered = [m for m in all_matches if _is_numbered_section_h2(m.group(0))]
    if not numbered:
        return ""
    start = numbered[0].end()
    end = numbered[1].start() if len(numbered) > 1 else len(cleaned_html)
    return cleaned_html[start:end]


def _extract_og_description(html: str) -> str:
    match = OG_DESCRIPTION_RE.search(html) or OG_DESCRIPTION_REVERSED_RE.search(html)
    if not match:
        return ""
    return unescape(match.group(1)).strip()


def _html_fragment_to_text(fragment: str) -> str:
    text = BR_RE.sub("\n", fragment)
    text = BLOCK_END_RE.sub("\n", text)
    text = TAG_RE.sub("", text)
    text = unescape(text)
    text = EDIT_AFFORDANCE_RE.sub("", text)
    text = CATEGORY_NAV_RE.sub("", text)
    text = SECTION_NUMBER_PREFIX_RE.sub("", text)
    lines: list[str] = []
    for line in text.split("\n"):
        stripped = WHITESPACE_RE.sub(" ", line).strip()
        if stripped:
            lines.append(stripped)
    joined = "\n".join(lines)
    return BLANK_LINES_RE.sub("\n\n", joined).strip()


def _truncate(text: str, max_length: int) -> str:
    if max_length > 0 and len(text) > max_length:
        return text[:max_length] + "..."
    return text


def extract_summary(html: str, *, max_length: int = DEFAULT_MAX_LENGTH) -> str:
    cleaned = SCRIPT_STYLE_RE.sub("", html)
    cleaned = DETAILS_PELCHIGI_RE.sub("", cleaned)

    h2_section = _extract_first_section_between_h2(cleaned)
    if h2_section:
        text = _html_fragment_to_text(h2_section)
        if text:
            return _truncate(text, max_length)

    region = _find_main_content(cleaned)
    if region:
        text = _html_fragment_to_text(region)
        if text:
            return _truncate(text, max_length)

    og_description = _extract_og_description(html)
    if og_description:
        return _truncate(og_description, max_length)

    return ""


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
