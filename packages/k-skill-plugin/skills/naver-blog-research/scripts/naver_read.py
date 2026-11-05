from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from html import unescape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _naver_http import TAG_RE, is_naver_url, urlopen

MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)

DEFAULT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko,en-US;q=0.9,en;q=0.8",
    "User-Agent": MOBILE_UA,
}

BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
BLOCK_END_RE = re.compile(r"</(p|div|li)>", re.IGNORECASE)
WHITESPACE_RE = re.compile(r"[ \t]+")
BLANK_LINES_RE = re.compile(r"\n{3,}")

_IMG_CDN_HOSTS = r"(?:blogfiles\.naver\.net|postfiles\.pstatic\.net|mblogthumb-phinf\.pstatic\.net)"

IMAGE_LAZY_PATTERN = re.compile(
    rf'data-lazy-src="(https?://{_IMG_CDN_HOSTS}[^"]+)"'
)
IMAGE_SRC_PATTERN = re.compile(
    rf'src="(https?://{_IMG_CDN_HOSTS}[^"]+)"'
)
IMAGE_ALT_PATTERN = re.compile(
    r'alt="([^"]*)"'
)

TITLE_PATTERN = re.compile(
    r'<title[^>]*>(.*?)</title>', re.DOTALL | re.IGNORECASE
)

SCRIPT_STYLE_RE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)

PC_BLOG_RE = re.compile(r"^https?://blog\.naver\.com/")
BLOG_ID_RE = re.compile(r"blog\.naver\.com/([a-zA-Z0-9_]+)/(\d+)")


def to_mobile_url(url: str) -> str:
    url = url.strip()
    url = PC_BLOG_RE.sub("https://m.blog.naver.com/", url)
    if not url.startswith("https://m.blog.naver.com/"):
        match = BLOG_ID_RE.search(url)
        if match:
            url = f"https://m.blog.naver.com/{match.group(1)}/{match.group(2)}"
    return url


def fetch_blog_page(url: str, timeout: int = 20, *, insecure: bool = False) -> str:
    mobile_url = to_mobile_url(url)
    if not is_naver_url(mobile_url):
        raise ValueError(f"Not a Naver blog URL: {url}")
    request = urllib.request.Request(mobile_url, headers=DEFAULT_HEADERS)

    try:
        with urlopen(request, timeout, insecure=insecure) as response:
            return response.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"Naver blog returned HTTP {error.code} for {mobile_url}. "
            "The post may not exist or access may be restricted."
        ) from error


def extract_title(html: str) -> str:
    match = TITLE_PATTERN.search(html)
    if not match:
        return ""
    title = unescape(TAG_RE.sub("", match.group(1))).strip()
    title = re.sub(r"\s*[-:|]?\s*네이버\s*블로그$", "", title).strip()
    return title


def _extract_div_block(html: str, start_pos: int) -> str:
    tag_start = html.rfind("<div", 0, start_pos)
    if tag_start < 0:
        tag_start = start_pos

    depth = 0
    pos = tag_start
    started = False
    length = len(html)
    while pos < length:
        # HTML 주석 건너뛰기
        if html[pos : pos + 4] == "<!--":
            end = html.find("-->", pos + 4)
            pos = end + 3 if end >= 0 else length
            continue
        if html[pos : pos + 4] == "<div" and (pos + 4 >= length or html[pos + 4] in (" ", ">", "\t", "\n", "/")):
            depth += 1
            started = True
        elif html[pos : pos + 6] == "</div>":
            depth -= 1
            if started and depth == 0:
                return html[tag_start : pos + 6]
        pos += 1

    return html[tag_start:]


def extract_content_area(html: str) -> str:
    cleaned = SCRIPT_STYLE_RE.sub("", html)

    match = re.search(r'class="[^"]*\bse-main-container\b[^"]*"', cleaned)
    if match:
        return _extract_div_block(cleaned, match.start())

    for class_name in ("post_ct", "postViewArea", "post-view"):
        match = re.search(rf'class="[^"]*\b{re.escape(class_name)}\b[^"]*"', cleaned)
        if match:
            return _extract_div_block(cleaned, match.start())

    marker = cleaned.find('id="viewTypeSelector"')
    if marker >= 0:
        return _extract_div_block(cleaned, marker)

    return ""


def extract_text(html_fragment: str) -> str:
    text = BR_RE.sub("\n", html_fragment)
    text = BLOCK_END_RE.sub("\n", text)
    text = TAG_RE.sub("", text)
    text = unescape(text)

    lines = []
    for line in text.split("\n"):
        stripped = WHITESPACE_RE.sub(" ", line).strip()
        if stripped:
            lines.append(stripped)

    result = "\n".join(lines)
    result = BLANK_LINES_RE.sub("\n\n", result)
    return result.strip()


def extract_images(html_fragment: str) -> list[dict]:
    images: list[dict] = []
    seen_base: set[str] = set()

    img_tags = re.finditer(r"<img\s[^>]+>", html_fragment, re.IGNORECASE)
    for img_match in img_tags:
        img_tag = img_match.group(0)

        lazy_match = IMAGE_LAZY_PATTERN.search(img_tag)
        src_match = IMAGE_SRC_PATTERN.search(img_tag)
        url_match = lazy_match or src_match
        if not url_match:
            continue

        url = url_match.group(1)

        base_url = re.sub(r"\?type=.*$", "", url)
        if base_url in seen_base:
            continue
        seen_base.add(base_url)

        if "?type=" not in url:
            url = base_url
        elif "_blur" in url:
            url = re.sub(r"\?type=w\d+_blur", "?type=w800", url)

        alt_match = IMAGE_ALT_PATTERN.search(img_tag)
        alt = unescape(alt_match.group(1)).strip() if alt_match else ""

        images.append({"url": url, "alt": alt})

    return images


def read_blog(url: str, include_images: bool = True, max_length: int = 0, timeout: int = 20, *, insecure: bool = False) -> dict:
    html = fetch_blog_page(url, timeout=timeout, insecure=insecure)
    mobile_url = to_mobile_url(url)

    title = extract_title(html)
    content_area = extract_content_area(html)
    content = extract_text(content_area)

    if max_length > 0 and len(content) > max_length:
        content = content[:max_length] + "..."

    result: dict = {
        "url": mobile_url,
        "title": title,
        "content": content,
        "char_count": len(content),
    }

    if not content:
        result["warning"] = "본문 영역을 찾지 못했습니다. 네이버 HTML 구조가 변경되었을 수 있습니다."

    if include_images:
        result["images"] = extract_images(content_area)

    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read a Naver blog post and extract text content and images."
    )
    parser.add_argument("url", help="Naver blog post URL (PC or mobile).")
    parser.add_argument(
        "--no-images", action="store_true",
        help="Exclude image URLs from output.",
    )
    parser.add_argument(
        "--max-length", type=int, default=0,
        help="Maximum content length in characters (0 = unlimited). Default: 0.",
    )
    parser.add_argument(
        "--timeout", type=int, default=20,
        help="HTTP request timeout in seconds. Default: 20.",
    )
    parser.add_argument(
        "--insecure", action="store_true",
        help="Skip SSL certificate verification (use only when certificate errors occur).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    try:
        result = read_blog(
            args.url,
            include_images=not args.no_images,
            max_length=args.max_length,
            timeout=args.timeout,
            insecure=args.insecure,
        )
    except (RuntimeError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
