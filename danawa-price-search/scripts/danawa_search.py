#!/usr/bin/env python3
"""Read-only Danawa search/price comparison helper for Hermes.

Usage:
  python scripts/danawa_search.py search "에어팟 프로 2세대" --limit 8
  python scripts/danawa_search.py offers 28208783 --limit 10
  python scripts/danawa_search.py compare "에어팟 프로 2세대" --limit 5 --offers 5
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html import unescape
from typing import Any, Dict, List, Optional

try:
    from bs4 import BeautifulSoup
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("beautifulsoup4 is required: python -m pip install beautifulsoup4") from exc

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121 Safari/537.36"


def fetch(url: str, *, method: str = "GET", data: Optional[dict] = None, referer: Optional[str] = None) -> str:
    headers = {
        "User-Agent": UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    }
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
        headers["X-Requested-With"] = "XMLHttpRequest"
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", "replace")


def soup_for(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def clean_text(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    return " ".join(unescape(s).split())


def parse_int(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    return int(digits) if digits else None


def abs_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return "https://prod.danawa.com" + url
    return url


def search(query: str, limit: int = 10) -> Dict[str, Any]:
    url = "https://search.danawa.com/dsearch.php?query=" + urllib.parse.quote(query)
    html = fetch(url)
    soup = soup_for(html)
    items: List[Dict[str, Any]] = []
    for li in soup.select("li.prod_item"):
        pid = (li.get("id") or "").replace("productItem", "") or None
        name_el = li.select_one(".prod_name a") or li.select_one("p.prod_name a") or li.select_one('a[name="productName"]')
        if not name_el:
            continue
        name = clean_text(name_el.get_text(" ", strip=True))
        link = abs_url(name_el.get("href"))
        min_input = li.select_one(f"#min_price_{pid}") if pid else None
        price = parse_int(min_input.get("value") if min_input else None)
        if price is None:
            price_el = li.select_one(".price_sect strong") or li.select_one(".prod_pricelist strong")
            price = parse_int(price_el.get_text() if price_el else None)
        img = li.select_one(".thumb_image img")
        image = abs_url((img.get("data-original") or img.get("src")) if img else None)
        mall_el = li.select_one(".prod_pricelist .memory_sect") or li.select_one(".meta_item")
        spec = " / ".join(clean_text(e.get_text(" ", strip=True)) or "" for e in li.select(".spec_list a, .spec_list span")[:10])
        items.append(
            {
                "pcode": pid,
                "title": name,
                "price": price,
                "price_text": f"{price:,}원" if price else None,
                "mall_text": clean_text(mall_el.get_text(" ", strip=True)) if mall_el else None,
                "url": link,
                "image_url": image,
                "spec": spec[:300] if spec else None,
            }
        )
        if len(items) >= limit:
            break
    return {"query": query, "source_url": url, "count": len(items), "items": items, "meta": {"extraction": "danawa-search-html", "ts": int(time.time())}}


def js_value(html: str, key: str) -> str:
    patterns = [
        rf"{re.escape(key)}\s*:\s*\"([^\"]*)\"",
        rf"{re.escape(key)}\s*:\s*'([^']*)'",
        rf"{re.escape(key)}\s*:\s*([0-9]+)",
    ]
    for pat in patterns:
        m = re.search(pat, html)
        if m:
            raw = m.group(1)
            if "\\u" in raw or "\\/" in raw:
                try:
                    return json.loads('"' + raw.replace('"', '\\"') + '"')
                except Exception:
                    return raw.replace("\\/", "/")
            return raw
    return ""


def product_meta(pcode: str) -> Dict[str, str]:
    url = f"https://prod.danawa.com/info/?pcode={urllib.parse.quote(str(pcode))}"
    html = fetch(url)
    meta = {
        "pcode": str(pcode),
        "source_url": url,
        "cate1": js_value(html, "nCategoryCode1"),
        "cate2": js_value(html, "nCategoryCode2"),
        "cate3": js_value(html, "nCategoryCode3"),
        "cate4": js_value(html, "nCategoryCode4") or "0",
        "UICategoryCode": js_value(html, "nCategoryCode"),
        "powerLinkKeyword": js_value(html, "powerLinkKeyword"),
        "minPrice": js_value(html, "nMinPrice"),
        "keyword": js_value(html, "sKeyword"),
        "NaPm": js_value(html, "sNaPm"),
        "sProductFullName": js_value(html, "sProductName"),
        "makerCode": js_value(html, "makerCode"),
        "makerName": js_value(html, "makerName"),
    }
    title = soup_for(html).select_one(".prod_tit .title")
    if title:
        meta["sProductFullName"] = clean_text(title.get_text(" ", strip=True)) or meta["sProductFullName"]
    return meta


def offers(pcode: str, limit: int = 20, include_shipping: bool = False) -> Dict[str, Any]:
    meta = product_meta(pcode)
    post_price = "Y" if include_shipping else "N"
    data = {
        "pcode": meta["pcode"],
        "cate1": meta.get("cate1", ""),
        "cate2": meta.get("cate2", ""),
        "cate3": meta.get("cate3", ""),
        "cate4": meta.get("cate4", "0"),
        "UICategoryCode": meta.get("UICategoryCode", "0"),
        "powerLinkKeyword": meta.get("powerLinkKeyword", ""),
        "minPrice": meta.get("minPrice", ""),
        "keyword": meta.get("keyword", ""),
        "NaPm": meta.get("NaPm", ""),
        "bDeliveryLeftRightYN": "N",
        "bQuickPostSortYN": "N",
        "sSortType": "minPrice",
        "sProductFullName": meta.get("sProductFullName", ""),
        "bPostPriceYN": post_price,
        "bBadgeDefaultYN": "N",
        "bWarrantyDefaultYN": "N",
        "nOpenMarketMoreCount": "30",
        "nAffiliateMoreCount": "30",
        "nOverseasShoppingMoreCount": "30",
        "nGeneralAffiliateMoreCount": "3",
        "sRelationMenuType": "",
        "sRelationType": "",
        "bCoupangSortYN": "N",
        "makerCode": meta.get("makerCode", ""),
        "makerName": meta.get("makerName", ""),
    }
    html = fetch("https://prod.danawa.com/info/ajax/getAllPriceCompareMallList.ajax.php", method="POST", data=data, referer=meta["source_url"])
    soup = soup_for(html)
    rows: List[Dict[str, Any]] = []
    for div in soup.select(".diff_item"):
        mall_img = div.select_one(".d_mall img")
        mall = mall_img.get("alt") if mall_img else None
        price_el = div.select_one("em.prc_c") or div.select_one("em.prc_t")
        price = parse_int(price_el.get_text() if price_el else None)
        if not mall or price is None:
            continue
        ship_el = div.select_one(".ship") or div.select_one(".stxt")
        shipping = clean_text(ship_el.get_text(" ", strip=True)) if ship_el else None
        shipping_fee = 0 if shipping and "무료" in shipping else parse_int(shipping)
        card_line = div.select_one(".card_line")
        card_price_el = card_line.select_one(".card_prc") if card_line else None
        card_name_el = card_line.select_one(".txt") if card_line else None
        card_price = parse_int(card_price_el.get_text() if card_price_el else None)
        installment_el = div.select_one(".btn_foi .txt")
        installment_detail_el = div.select_one(".foi_layer .ly_cont")
        link = div.select_one("a.priceCompareBuyLink")
        rows.append(
            {
                "mall": clean_text(mall),
                "price": price,
                "price_text": f"{price:,}원",
                "shipping": shipping,
                "is_free_shipping": bool(shipping and "무료" in shipping),
                "shipping_fee": shipping_fee,
                "total_price": price + (shipping_fee or 0),
                "total_price_text": f"{price + (shipping_fee or 0):,}원",
                "card_price": card_price,
                "card_price_text": f"{card_price:,}원" if card_price else None,
                "card_name": clean_text(card_name_el.get_text(" ", strip=True)) if card_name_el else None,
                "card_discount": (price - card_price) if card_price else None,
                "card_discount_text": f"{price - card_price:,}원" if card_price else None,
                "installment": clean_text(installment_el.get_text(" ", strip=True)) if installment_el else None,
                "installment_detail": clean_text(installment_detail_el.get_text(" ", strip=True)) if installment_detail_el else None,
                "url": abs_url(link.get("href") if link else None),
            }
        )
    rows.sort(key=lambda row: (row["total_price"] is None, row["total_price"] or row["price"], row["price"], row["mall"] or ""))
    rows = rows[:limit]
    return {"pcode": str(pcode), "title": meta.get("sProductFullName"), "source_url": meta["source_url"], "count": len(rows), "offers": rows, "meta": {"extraction": "danawa-price-ajax", "include_shipping": include_shipping, "sort": "total_price", "ts": int(time.time())}}


def compare(query: str, limit: int, offer_limit: int) -> Dict[str, Any]:
    result = search(query, limit=limit)
    enriched = []
    for item in result["items"]:
        row = dict(item)
        if item.get("pcode"):
            try:
                off = offers(item["pcode"], limit=offer_limit)
                row["offers"] = off.get("offers", [])
            except Exception as exc:  # keep search result usable if a detail call fails
                row["offers_error"] = f"{type(exc).__name__}: {exc}"
        enriched.append(row)
    result["items"] = enriched
    result["meta"]["detail_extraction"] = "best-effort"
    return result


def positive_int(raw: str) -> int:
    value = int(raw)
    if value < 1:
        raise argparse.ArgumentTypeError("must be >= 1")
    return value


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--limit", type=positive_int, default=10)
    o = sub.add_parser("offers")
    o.add_argument("pcode")
    o.add_argument("--limit", type=positive_int, default=20)
    o.add_argument("--include-shipping", action="store_true")
    c = sub.add_parser("compare")
    c.add_argument("query")
    c.add_argument("--limit", type=positive_int, default=5)
    c.add_argument("--offers", type=positive_int, default=5)
    args = ap.parse_args()
    try:
        if args.cmd == "search":
            out = search(args.query, args.limit)
        elif args.cmd == "offers":
            out = offers(args.pcode, args.limit, args.include_shipping)
        else:
            out = compare(args.query, args.limit, args.offers)
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
