"""당근부동산 TanStack Router SSR 스트림(seroval `$R[n]=...`) 파서.

2026-11 realty.daangn.com 은 window.RELAY_STORE 대신
`<script class="$tsr">` 안에 seroval 형식으로 라우터 loaderData 를 직렬화한다.

  $R[75]={mode:"dong",city:"서울특별시",district:"강서구",dong:"염창동",
          dongRegion:$R[20],regionId:258,propertyFilter:$R[76]={salesTypes:$R[77]=[]},
          articleCount:1000,articles:$R[78]=[$R[79]={originalId:"4997721",
          salesType:"OFFICETEL",tradeType:"BUY",tradePrice:17500,monthlyPay:0,
          area:"28.45",regionName3:"등촌동"},...],complexes:...,siblings:...}

JS 전체를 실행하지 않고 객체/배열/문자열/숫자/불리언/`$R[n]` 참조만 해석하는
작은 리터럴 파서로 `articles` 배열과 그 loaderData 객체를 꺼낸다.

가격 단위는 만원. tradePrice 는 거래유형에 따라 의미가 다르다:
  BUY → 매매가, BORROW → 전세 보증금, MONTH/SHORT → 보증금(+monthlyPay 월세),
  YEAR → 보증금(+monthlyPay 자리에 연세).
"""
import re

from daangn_relay_store import DETAIL_BASE, PY_PER_SQM, TRADE_LABEL, parse_area, per_pyeong

_TSR_SCRIPT = re.compile(r'<script[^>]*class="\$tsr"[^>]*>(.*?)</script>', re.S)
_DEF = re.compile(r"\$R\[(\d+)\]=")
_ARTICLES_KEY = re.compile(r"(?<![\w$])articles:")
_RELAY_RECORDS_KEY = re.compile(r"(?<![\w$])relayRecords:")
_IDENT = re.compile(r"[A-Za-z_$][\w$]*")
_NUMBER = re.compile(r"-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")
_SIMPLE_ESCAPES = {
    "n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0",
}
_KEYWORDS = (
    ("!0", True), ("!1", False), ("null", None), ("void 0", None),
    ("undefined", None), ("NaN", None), ("Infinity", None), ("-Infinity", None),
)


class Unsupported(ValueError):
    """리터럴 서브셋 밖의 JS 구문을 만났다."""


def stream_source(html):
    """`$tsr` 스크립트 본문을 이어 붙인다. 없으면 None."""
    chunks = _TSR_SCRIPT.findall(html)
    return "".join(chunks) if chunks else None


class _Reader:
    def __init__(self, src):
        self.src = src
        self.defs = {}
        for match in _DEF.finditer(src):
            self.defs.setdefault(int(match.group(1)), match.end())
        self.cache = {}

    def resolve(self, ref):
        if ref in self.cache:
            return self.cache[ref]
        start = self.defs.get(ref)
        if start is None:
            return None
        self.cache[ref] = None  # 순환 참조 가드
        value, _ = self.parse_value(start, ref)
        return value

    def parse_value(self, pos, ref=None):
        src = self.src
        pos = self._skip_ws(pos)
        if src.startswith("$R[", pos):
            close = src.index("]", pos)
            target = int(src[pos + 3 : close])
            pos = close + 1
            if pos < len(src) and src[pos] == "=":
                return self.parse_value(pos + 1, target)
            return self.resolve(target), pos
        ch = src[pos : pos + 1]
        if ch == "{":
            return self._parse_object(pos, ref)
        if ch == "[":
            return self._parse_array(pos, ref)
        if ch == '"':
            value, pos = self._parse_string(pos)
        elif src.startswith("new Date(", pos):
            value, pos = self._parse_string(self._skip_ws(pos + len("new Date(")))
            pos = self._expect(pos, ")")
        else:
            for token, literal in _KEYWORDS:
                if src.startswith(token, pos):
                    value, pos = literal, pos + len(token)
                    break
            else:
                match = _NUMBER.match(src, pos)
                if not match:
                    raise Unsupported(f"unsupported token at {pos}: {src[pos:pos + 30]!r}")
                text = match.group(0)
                value = float(text) if any(c in text for c in ".eE") else int(text)
                pos = match.end()
        if ref is not None:
            self.cache[ref] = value
        return value, pos

    def _parse_object(self, pos, ref):
        obj = {}
        if ref is not None:
            self.cache[ref] = obj
        pos = self._skip_ws(pos + 1)
        while self.src[pos] != "}":
            key, pos = self._parse_key(pos)
            pos = self._expect(pos, ":")
            obj[key], pos = self.parse_value(pos)
            pos = self._skip_ws(pos)
            if self.src[pos] == ",":
                pos = self._skip_ws(pos + 1)
        return obj, pos + 1

    def _parse_array(self, pos, ref):
        arr = []
        if ref is not None:
            self.cache[ref] = arr
        pos = self._skip_ws(pos + 1)
        while self.src[pos] != "]":
            if self.src[pos] == ",":  # sparse hole
                arr.append(None)
                pos = self._skip_ws(pos + 1)
                continue
            value, pos = self.parse_value(pos)
            arr.append(value)
            pos = self._skip_ws(pos)
            if self.src[pos] == ",":
                pos = self._skip_ws(pos + 1)
        return arr, pos + 1

    def _parse_key(self, pos):
        if self.src[pos] == '"':
            return self._parse_string(pos)
        match = _IDENT.match(self.src, pos) or _NUMBER.match(self.src, pos)
        if not match:
            raise Unsupported(f"bad object key at {pos}")
        return match.group(0), match.end()

    def _parse_string(self, pos):
        src = self.src
        if src[pos] != '"':
            raise Unsupported(f"expected string at {pos}")
        out = []
        i = pos + 1
        while True:
            ch = src[i]
            if ch == '"':
                return "".join(out), i + 1
            if ch != "\\":
                out.append(ch)
                i += 1
                continue
            esc = src[i + 1]
            if esc in _SIMPLE_ESCAPES:
                out.append(_SIMPLE_ESCAPES[esc])
                i += 2
            elif esc == "x":
                out.append(chr(int(src[i + 2 : i + 4], 16)))
                i += 4
            elif esc == "u" and src[i + 2] == "{":
                close = src.index("}", i)
                out.append(chr(int(src[i + 3 : close], 16)))
                i = close + 1
            elif esc == "u":
                code = int(src[i + 2 : i + 6], 16)
                i += 6
                if 0xD800 <= code < 0xDC00 and src.startswith("\\u", i):
                    low = int(src[i + 2 : i + 6], 16)
                    if 0xDC00 <= low < 0xE000:
                        code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
                        i += 6
                out.append(chr(code))
            else:  # \" \\ \/ \< 등
                out.append(esc)
                i += 2

    def _expect(self, pos, ch):
        pos = self._skip_ws(pos)
        if self.src[pos : pos + 1] != ch:
            raise Unsupported(f"expected {ch!r} at {pos}")
        return pos + 1

    def _skip_ws(self, pos):
        src = self.src
        while pos < len(src) and src[pos] in " \t\r\n":
            pos += 1
        return pos


def extract_feeds(html):
    """SSR 스트림에서 `articles` 를 가진 loaderData 객체 목록을 반환한다.

    loaderData 객체 자체를 해석하지 못하면 `{"articles": [...]}` 만 담는다.
    스트림이 없으면 None.
    """
    src = stream_source(html)
    if src is None:
        return None
    reader = _Reader(src)
    feeds = []
    for match in _ARTICLES_KEY.finditer(src):
        try:
            articles, _ = reader.parse_value(match.end())
        except (Unsupported, IndexError, ValueError):
            continue
        if not isinstance(articles, list):
            continue
        feed = _enclosing_object(reader, match.start()) or {"articles": articles}
        feeds.append(feed)
    return feeds


def extract_relay_records(html):
    """스트림의 `dehydratedData.relayRecords` (구 RELAY_STORE 와 같은 Relay 정규화 스토어).

    loaderData.articles 에 없는 전체 trades·층수·건물명을 담고 있다. 없으면 None.
    """
    src = stream_source(html)
    if src is None:
        return None
    reader = _Reader(src)
    for match in _RELAY_RECORDS_KEY.finditer(src):
        try:
            records, _ = reader.parse_value(match.end())
        except (Unsupported, IndexError, ValueError):
            continue
        if isinstance(records, dict):
            return records
    return None


def _enclosing_object(reader, key_pos):
    """key_pos 를 감싸는 가장 가까운 `$R[n]={...}` 객체."""
    candidates = sorted(
        ((start, ref) for ref, start in reader.defs.items() if start < key_pos),
        reverse=True,
    )
    for start, ref in candidates:
        if reader.src[start : start + 1] != "{":
            continue
        try:
            obj, end = reader.parse_value(start, ref)
        except (Unsupported, IndexError, ValueError):
            continue
        if end > key_pos and isinstance(obj, dict) and "articles" in obj:
            return obj
    return None


def stream_trade(article):
    """SSR article 의 tradeType/tradePrice/monthlyPay → trade dict."""
    kind = article.get("tradeType")
    price = article.get("tradePrice")
    pay = article.get("monthlyPay")
    deposit = monthly = yearly = sale = None
    if kind == "BUY":
        sale = price
    elif kind == "BORROW":
        deposit = price
    elif kind == "YEAR":
        deposit, yearly = price, pay
    else:  # MONTH, SHORT
        deposit, monthly = price, pay
    area = parse_area(article.get("area"))
    pyeong = round(area / PY_PER_SQM, 2) if area else None
    trade = {
        "type": kind,
        "label": TRADE_LABEL.get(kind, kind),
        "deposit_manwon": deposit,
        "monthly_manwon": monthly,
        "price_manwon": sale,
        "per_pyeong_manwon": per_pyeong(kind, deposit, monthly, sale, pyeong, yearly=yearly),
    }
    if kind == "YEAR":
        trade["yearly_manwon"] = yearly
    return trade


def stream_items(feed):
    """loaderData.articles → 기존 RELAY_STORE 경로와 같은 모양의 매물 dict 목록."""
    items = []
    for article in feed.get("articles") or []:
        if not isinstance(article, dict) or not article.get("originalId"):
            continue
        article_id = str(article["originalId"])
        area = parse_area(article.get("area"))
        items.append(
            {
                "article_id": article_id,
                "salesType": article.get("salesType"),
                "area_sqm": area,
                "area_pyeong": round(area / PY_PER_SQM, 2) if area else None,
                "trades": [stream_trade(article)],
                "url": DETAIL_BASE + article_id,
                "region_name3": article.get("regionName3"),
            }
        )
    return items
