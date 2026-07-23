from __future__ import annotations

import ssl
import urllib.error
import urllib.parse
import urllib.request


NAMUWIKI_BASE = "https://namu.wiki/w/"
_NAMUWIKI_HOSTS = ("namu.wiki", "en.namu.wiki")

_BROWSER_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko,en-US;q=0.9,en;q=0.8",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
}

_ssl_ctx: ssl.SSLContext | None = None


class LookupError(Exception):
    pass


class BlockedError(LookupError):
    pass


class NotFoundError(LookupError):
    pass


class UpstreamError(LookupError):
    pass


def _get_ssl_context() -> ssl.SSLContext:
    global _ssl_ctx
    if _ssl_ctx is None:
        _ssl_ctx = ssl.create_default_context()
    return _ssl_ctx


def is_namuwiki_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    return host in _NAMUWIKI_HOSTS


def build_namuwiki_url(term_or_url: str) -> str:
    value = term_or_url.strip()
    if not value:
        raise ValueError("term is empty")
    if is_namuwiki_url(value):
        return value
    # Preserve slash so namuwiki subpage titles (e.g. "한국/서울") survive encoding.
    quoted = urllib.parse.quote(value, safe="/")
    return f"{NAMUWIKI_BASE}{quoted}"


def browser_headers() -> dict[str, str]:
    return dict(_BROWSER_HEADERS)


def fetch_html(url: str, timeout: int) -> str:
    if not is_namuwiki_url(url):
        raise ValueError(f"not a namuwiki URL: {url}")
    request = urllib.request.Request(url, headers=browser_headers())
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_get_ssl_context()) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        if status == 404:
            raise NotFoundError(f"HTTP 404: {url}") from error
        if status in (401, 403, 429):
            raise BlockedError(
                f"HTTP {status} (possibly Cloudflare / rate-limited) for {url}"
            ) from error
        raise UpstreamError(f"HTTP {status} for {url}") from error
    except urllib.error.URLError as error:
        raise UpstreamError(f"URL error for {url}: {error.reason}") from error
    except TimeoutError as error:
        raise UpstreamError(f"timeout after {timeout}s for {url}") from error

    return body.decode("utf-8", "ignore")
