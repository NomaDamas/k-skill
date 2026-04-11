"""Shared HTTP utilities for Naver blog scripts (SSL handling, URL validation, urlopen wrapper)."""

from __future__ import annotations

import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request


TAG_RE = re.compile(r"<[^>]+>")

_ssl_ctx_secure: ssl.SSLContext | None = None
_ssl_ctx_insecure: ssl.SSLContext | None = None


def _get_ssl_context(*, insecure: bool = False) -> ssl.SSLContext:
    global _ssl_ctx_secure, _ssl_ctx_insecure
    if insecure:
        if _ssl_ctx_insecure is None:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            _ssl_ctx_insecure = ctx
        return _ssl_ctx_insecure
    if _ssl_ctx_secure is None:
        _ssl_ctx_secure = ssl.create_default_context()
    return _ssl_ctx_secure


_NAVER_DOMAINS = (".naver.com", ".naver.net", ".pstatic.net")


def is_naver_url(url: str) -> bool:
    host = urllib.parse.urlparse(url).hostname or ""
    return any(host == d.lstrip(".") or host.endswith(d) for d in _NAVER_DOMAINS)


def urlopen(request: urllib.request.Request, timeout: int, *, insecure: bool = False):
    """urlopen with explicit SSL insecure mode for Naver domains.

    When *insecure* is True and the target is a Naver domain, SSL certificate
    verification is skipped.  A warning is printed to stderr on every call so
    the caller is always aware.
    """
    if insecure:
        if not is_naver_url(request.full_url):
            raise ValueError("insecure 모드는 네이버 도메인에만 사용할 수 있습니다.")
        print(
            "[warn] SSL 인증서 검증이 비활성화되었습니다. 연결이 안전하지 않을 수 있습니다.",
            file=sys.stderr,
        )
        return urllib.request.urlopen(
            request, timeout=timeout, context=_get_ssl_context(insecure=True),
        )
    return urllib.request.urlopen(request, timeout=timeout, context=_get_ssl_context())
