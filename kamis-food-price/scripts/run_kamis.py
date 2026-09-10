#!/usr/bin/env python3
"""Read KAMIS prices through the hosted proxy, with an optional direct mode."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROXY = "https://k-skill-proxy.nomadamas.org"
UPSTREAM = "https://www.kamis.or.kr/service/price/xml.do"


def secrets(path):
    values = {}
    try:
        with open(path, encoding="utf-8") as stream:
            for line in stream:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    values[key.strip()] = value.strip().strip("\"'")
    except OSError:
        pass
    return values


def query(args):
    if args.product_class not in {"01", "02"}:
        raise ValueError("--product-class must be 01 or 02")
    if args.category not in {"100", "200", "300", "400", "500", "600"}:
        raise ValueError("--category must be 100, 200, 300, 400, 500, or 600")
    if args.convert_kg not in {"Y", "N"}:
        raise ValueError("--convert-kg must be Y or N")
    result = {
        "p_productclscode": args.product_class,
        "p_itemcategorycode": args.category,
        "p_convert_kg_yn": args.convert_kg,
        "p_returntype": "json",
    }
    if args.county:
        if not args.county.isdigit() or len(args.county) != 4:
            raise ValueError("--county must be a four-digit KAMIS code")
        result["p_countycode"] = args.county
    if args.date:
        if len(args.date) != 10 or args.date[4] != "-" or args.date[7] != "-":
            raise ValueError("--date must be YYYY-MM-DD")
        result["p_regday"] = args.date
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="KAMIS 농수축산물 가격 조회")
    parser.add_argument("--product-class", default="01")
    parser.add_argument("--category", default="100")
    parser.add_argument("--county")
    parser.add_argument("--date")
    parser.add_argument("--convert-kg", default="N")
    parser.add_argument("--text", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--direct", action="store_true")
    parser.add_argument("--proxy-base-url", default=os.getenv("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY))
    parser.add_argument("--secrets-path", default=os.path.expanduser("~/.config/k-skill/secrets.env"))
    args = parser.parse_args(argv)
    key = None
    try:
        params = query(args)
    except ValueError as error:
        print(f"[error] {error}", file=sys.stderr)
        return 2

    if args.direct:
        local = secrets(args.secrets_path)
        key = os.getenv("KSKILL_KAMIS_API_KEY") or local.get("KSKILL_KAMIS_API_KEY")
        if not key:
            print("[error] --direct requires KSKILL_KAMIS_API_KEY", file=sys.stderr)
            return 3
        assert key is not None
        params = {**params, "action": "dailyPriceByCategoryList", "p_cert_key": key, "p_cert_id": "TEST"}
        url = f"{UPSTREAM}?{urllib.parse.urlencode(params)}"
    else:
        url = f"{args.proxy_base_url.rstrip('/')}/v1/kamis/food-price/daily-category?{urllib.parse.urlencode(params)}"

    if args.dry_run:
        display_params = {**params}
        if args.direct:
            display_params["p_cert_key"] = "<redacted>"
        display_url = url.replace(key, "<redacted>") if args.direct and key is not None else url
        print(json.dumps({"url": display_url, "query": display_params}, ensure_ascii=False, indent=2))
        return 0

    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"accept": "application/json"}), timeout=30) as response:
            payload = json.loads(response.read())
    except (OSError, ValueError, urllib.error.HTTPError) as error:
        print(f"[error] KAMIS request failed: {error}", file=sys.stderr)
        return 4

    if args.text:
        items = payload.get("items", payload.get("data", {}).get("item", []))
        for item in items:
            print(f"{item.get('item_name', '?')} {item.get('kind_name', '')} {item.get('dpr1', '-')}{item.get('unit', '')}")
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
