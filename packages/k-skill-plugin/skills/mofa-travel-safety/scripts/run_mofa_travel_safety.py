#!/usr/bin/env python3
"""Read MOFA 0404 travel alerts through the hosted proxy."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROXY = "https://k-skill-proxy.nomadamas.org"


def main(argv=None):
    parser = argparse.ArgumentParser(description="외교부 국가별 여행경보 조회")
    parser.add_argument("--country-iso")
    parser.add_argument("--country-name")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--per-page", type=int, default=10)
    parser.add_argument("--text", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--proxy-base-url", default=os.getenv("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY))
    args = parser.parse_args(argv)
    if args.country_iso and args.country_name:
        print("[error] use either --country-iso or --country-name", file=sys.stderr)
        return 2
    if not 1 <= args.page or not 1 <= args.per_page <= 100:
        print("[error] invalid page or per-page", file=sys.stderr)
        return 2
    params = {"page": args.page, "perPage": args.per_page}
    if args.country_iso:
        if len(args.country_iso) != 2 or not args.country_iso.isalpha():
            print("[error] --country-iso must be two letters", file=sys.stderr)
            return 2
        params["country_iso_alp2"] = args.country_iso.upper()
    if args.country_name:
        params["country_nm"] = args.country_name
    url = f"{args.proxy_base_url.rstrip('/')}/v1/mofa-travel-safety/travel-alerts?{urllib.parse.urlencode(params)}"
    if args.dry_run:
        print(json.dumps({"url": url, "query": params}, ensure_ascii=False, indent=2))
        return 0
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "k-skill/mofa-travel-safety"}), timeout=30) as response:
            payload = json.loads(response.read())
    except (OSError, ValueError, urllib.error.HTTPError) as error:
        print(f"[error] MOFA request failed: {error}", file=sys.stderr)
        return 3
    if args.text:
        for item in payload.get("items", []):
            print(f"{item.get('country_nm')} ({item.get('country_iso_alp2')}): level={item.get('alarm_lvl')} region={item.get('region_ty')}")
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
