#!/usr/bin/env python3
"""Government support survey helper. Proxy-first, stdlib only."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
VALID_SOURCES = ("kstartup", "bizinfo", "nipa", "kocca", "smtech")


def build_url(args: argparse.Namespace) -> str:
    base = (args.proxy_base_url or os.environ.get("KSKILL_PROXY_BASE_URL")
            or DEFAULT_PROXY_BASE_URL).rstrip("/")
    params = {
        "sources": ",".join(args.sources),
        "maxPages": str(args.max_pages),
        "perPage": str(args.per_page),
    }
    if args.keyword:
        params["keyword"] = args.keyword
    return f"{base}/v1/government-support/survey?{urllib.parse.urlencode(params)}"


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="K-Startup·기업마당·NIPA·KOCCA·SMTECH 정부지원 공고 전수조사"
    )
    result.add_argument("--sources", nargs="+", choices=VALID_SOURCES, default=list(VALID_SOURCES))
    result.add_argument("--keyword", default="")
    result.add_argument("--max-pages", type=int, default=1)
    result.add_argument("--per-page", type=int, default=100)
    result.add_argument("--proxy-base-url")
    result.add_argument("--timeout", type=float, default=30)
    result.add_argument("--compact", action="store_true")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if not 1 <= args.max_pages <= 10:
        parser().error("--max-pages must be between 1 and 10")
    if not 1 <= args.per_page <= 100:
        parser().error("--per-page must be between 1 and 100")
    request = urllib.request.Request(
        build_url(args),
        headers={"Accept": "application/json", "User-Agent": "k-skill-government-support-survey/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        print(body or f"HTTP {error.code}", file=sys.stderr)
        return 2
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"k-skill-proxy request failed: {error}", file=sys.stderr)
        return 2

    json.dump(payload, sys.stdout, ensure_ascii=False, indent=None if args.compact else 2)
    sys.stdout.write("\n")
    return 0 if payload.get("complete") else 2


if __name__ == "__main__":
    raise SystemExit(main())
