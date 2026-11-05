import json
import re

DETAIL_BASE = "https://realty.daangn.com/articles/"
PY_PER_SQM = 3.305785
TRADE_LABEL = {"MONTH": "월세", "BUY": "매매", "BORROW": "전세"}


def extract_relay_store(html):
    match = re.search(r'window\.RELAY_STORE\s*=\s*"((?:[^"\\]|\\.)*)"', html)
    if match:
        try:
            return json.loads(json.loads('"' + match.group(1) + '"'))
        except json.JSONDecodeError:
            return None

    start = html.find("window.RELAY_STORE")
    if start < 0:
        return None
    eq = html.find("=", start)
    if eq < 0:
        return None

    literal = _scan_object_literal(html[eq + 1 :])
    if literal is None:
        return None
    try:
        return json.loads(literal)
    except json.JSONDecodeError:
        return None


def _scan_object_literal(source):
    depth = 0
    in_string = False
    escaped = False
    quote = ""
    end = 0
    for idx, ch in enumerate(source):
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                in_string = False
            continue
        if ch in "\"'":
            in_string = True
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = idx + 1
                break
    if end == 0:
        return None
    return source[:end]


def _deref(store, ref):
    if isinstance(ref, dict) and "__ref" in ref:
        return store.get(ref["__ref"])
    return ref


def _refs(store, node, key):
    value = node.get(key)
    out = []
    if isinstance(value, dict):
        if "__refs" in value:
            out = [store.get(ref) for ref in value["__refs"]]
        elif "__ref" in value:
            out = [store.get(value["__ref"])]
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and "__ref" in item:
                out.append(store.get(item["__ref"]))
    return [item for item in out if item]


def sales_type(store, article):
    sales = _deref(store, article.get("salesTypeV3"))
    if isinstance(sales, dict):
        return sales.get("type") or sales.get("name")
    return None


def parse_trade(trade):
    typename = trade.get("__typename")
    if typename == "MonthTrade":
        return ("MONTH", trade.get("deposit"), trade.get("monthlyPay"), None)
    if typename == "BuyTrade":
        return ("BUY", None, None, trade.get("price"))
    if typename == "BorrowTrade":
        return ("BORROW", trade.get("deposit"), None, None)
    return (
        trade.get("type"),
        trade.get("deposit"),
        trade.get("monthlyPay"),
        trade.get("price"),
    )


def per_pyeong(kind, deposit, monthly, price, pyeong):
    if not pyeong or pyeong <= 0:
        return None
    base = None
    if kind == "MONTH":
        base = monthly
    elif kind == "BUY":
        base = price
    elif kind == "BORROW":
        base = deposit
    if base is None:
        return None
    try:
        numeric_base = float(base)
    except (TypeError, ValueError):
        return None
    return round(numeric_base / pyeong, 2)


def extract_articles(store, max_items):
    items = []
    cards = [
        value
        for value in store.values()
        if isinstance(value, dict) and value.get("__typename") == "ArticleFeedCard"
    ]
    for card in cards:
        article = _deref(store, card.get("article"))
        if not article or article.get("__typename") != "Article":
            continue
        area = _parse_area(article.get("area"))
        pyeong = round(area / PY_PER_SQM, 2) if area else None
        trades = []
        for trade in _refs(store, article, "trades"):
            kind, deposit, monthly, price = parse_trade(trade)
            trades.append(
                {
                    "type": kind,
                    "label": TRADE_LABEL.get(kind, kind),
                    "deposit_manwon": deposit,
                    "monthly_manwon": monthly,
                    "price_manwon": price,
                    "per_pyeong_manwon": per_pyeong(
                        kind, deposit, monthly, price, pyeong
                    ),
                }
            )
        article_id = article.get("originalId")
        items.append(
            {
                "article_id": article_id,
                "salesType": sales_type(store, article),
                "area_sqm": area,
                "area_pyeong": pyeong,
                "trades": trades,
                "url": DETAIL_BASE + str(article_id) if article_id else None,
            }
        )
        if len(items) >= max_items:
            break
    return items


def _parse_area(value):
    try:
        return float(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None
