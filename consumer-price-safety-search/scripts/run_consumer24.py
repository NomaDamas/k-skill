#!/usr/bin/env python3
"""Query Consumer24 through the hosted proxy without exposing service keys."""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

DEFAULT_PROXY = "https://k-skill-proxy.nomadamas.org"


def main(argv=None):
    parser = argparse.ArgumentParser(description="소비자24 물품·리콜정보 조회")
    parser.add_argument("kind", choices=("recalls", "goods"))
    parser.add_argument("--service-id", default="00000010")
    parser.add_argument("--goods-cd")
    parser.add_argument("--product")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--per-page", type=int, default=10)
    parser.add_argument("--text", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--proxy-base-url", default=os.getenv("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY))
    args = parser.parse_args(argv)
    params = {"pageNo": args.page, "cntPerPage": args.per_page}
    if args.kind == "recalls":
        params["service_id"] = args.service_id
        if args.product:
            params["productNm"] = args.product
        path = "/v1/consumer24/recalls"
    else:
        if not args.goods_cd:
            print("[error] --goods-cd is required for goods", file=sys.stderr)
            return 2
        params["goodsCd"] = args.goods_cd
        path = "/v1/consumer24/goods"
    url = f"{args.proxy_base_url.rstrip('/')}{path}?{urllib.parse.urlencode(params)}"
    if args.dry_run:
        print(json.dumps({"url": url, "query": params}, ensure_ascii=False, indent=2))
        return 0
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"accept": "application/json"}), timeout=30) as response:
            payload = json.loads(response.read())
    except Exception as error:
        print(f"[error] Consumer24 request failed: {error}", file=sys.stderr)
        return 3
    if args.text:
        for item in payload.get("items", []):
            print(item.get("productNm") or item.get("productNm", json.dumps(item, ensure_ascii=False)))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
