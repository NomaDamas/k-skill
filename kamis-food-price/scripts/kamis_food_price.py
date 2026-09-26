#!/usr/bin/env python3
"""KAMIS 농수축산물 도소매 가격 조회 helper (read-only).

한국농수산식품유통공사 KAMIS 의 ``dailyPriceByCategoryList`` 계약을 조회해
부류별 도·소매 가격과 전일/1주일/1개월/1년/평년 비교값을 정규화한다.

접근 경로 (fallback 순서):
1. hosted ``k-skill-proxy`` 의 ``GET /v1/kamis/food-price/daily-category`` (기본).
   사용자는 KAMIS 키가 필요 없고 proxy 운영자가 ``KAMIS_API_KEY`` 를 보관한다.
2. ``--direct`` (BYOK): ``KSKILL_KAMIS_API_KEY`` 로 KAMIS upstream ``xml.do`` 를
   직접 호출한다. 키는 ``~/.config/k-skill/secrets.env`` 또는 환경변수에서만
   읽고 출력/URL/로그에 노출하지 않는다.

가격은 조사 시점의 공식 유통가격이며 구매 보장·투자 조언이 아니다.
네트워크 호출은 :func:`http_get_json` 한 곳으로 모아 두어 테스트에서 대체한다.
"""

from __future__ import annotations

import argparse
import datetime as _datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
PROXY_PATH = "/v1/kamis/food-price/daily-category"
UPSTREAM_BASE_URL = "https://www.kamis.or.kr/service/price/xml.do"
UPSTREAM_ACTION = "dailyPriceByCategoryList"
UPSTREAM_CERT_ID = "TEST"

DEFAULT_SECRETS_PATH = "~/.config/k-skill/secrets.env"
API_KEY_ENV_VARS = ("KSKILL_KAMIS_API_KEY", "KAMIS_API_KEY")
API_ID_ENV_VARS = ("KSKILL_KAMIS_API_ID",)

PRODUCT_CLASSES = {"01": "소매", "02": "도매"}
ITEM_CATEGORIES = {
    "100": "식량작물",
    "200": "채소류",
    "300": "특용작물",
    "400": "과일류",
    "500": "축산물",
    "600": "수산물",
}
CONVERT_KG_VALUES = {"Y", "N"}

# (KAMIS field, normalized name, 기간 설명)
PRICE_FIELDS = (
    ("dpr1", "price", "조회일"),
    ("dpr2", "day_before", "1일 전"),
    ("dpr3", "week_before", "1주일 전"),
    ("dpr4", "two_weeks_before", "2주일 전"),
    ("dpr5", "month_before", "1개월 전"),
    ("dpr6", "year_before", "1년 전"),
    ("dpr7", "year_average", "평년"),
)
COMPARISON_FIELDS = ("day_before", "week_before", "month_before", "year_before")


class HelperError(Exception):
    """Base class for typed helper failures."""


class UsageError(HelperError):
    """Invalid input that the caller can fix (bad enum, date, region code)."""


class RequestError(HelperError):
    """Network, upstream, or response-shape failure."""


# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------
def read_secrets(path: str) -> dict[str, str]:
    """Read a simple ``KEY=VALUE`` dotenv file, ignoring comments/blank lines."""
    values: dict[str, str] = {}
    try:
        with open(os.path.expanduser(path), encoding="utf-8") as stream:
            for raw_line in stream:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("\"'")
    except OSError:
        return {}
    return values


def resolve_api_key(explicit: str | None = None, env: dict[str, str] | None = None, secrets_path: str | None = None) -> str | None:
    """Resolve the KAMIS key: explicit arg > environment > personal dotenv."""
    environment = os.environ if env is None else env
    if explicit and explicit.strip():
        return explicit.strip()
    for name in API_KEY_ENV_VARS:
        value = environment.get(name)
        if value and value.strip():
            return value.strip()
    local = read_secrets(secrets_path or DEFAULT_SECRETS_PATH)
    for name in API_KEY_ENV_VARS:
        value = local.get(name)
        if value and value.strip():
            return value.strip()
    return None


def resolve_api_id(explicit: str | None = None, env: dict[str, str] | None = None) -> str:
    """Resolve the KAMIS ``p_cert_id`` (not a secret); defaults to ``TEST``."""
    environment = os.environ if env is None else env
    if explicit and explicit.strip():
        return explicit.strip()
    for name in API_ID_ENV_VARS:
        value = environment.get(name)
        if value and value.strip():
            return value.strip()
    return UPSTREAM_CERT_ID


# ---------------------------------------------------------------------------
# Input normalization
# ---------------------------------------------------------------------------
def normalize_date(value: str) -> str:
    """Return ``YYYY-MM-DD``, accepting ``YYYY/MM/DD`` and rejecting fake dates."""
    text = (value or "").strip().replace("/", "-")
    if len(text) != 10 or text[4] != "-" or text[7] != "-":
        raise UsageError("p_regday must be YYYY-MM-DD")
    try:
        parsed = _datetime.date(int(text[0:4]), int(text[5:7]), int(text[8:10]))
    except ValueError as error:
        raise UsageError(f"p_regday is not a valid calendar date: {value!r}") from error
    return parsed.isoformat()


def normalize_choice(value: str | None, field: str, allowed: dict[str, str] | None = None, values: set[str] | None = None, default: str | None = None) -> str | None:
    text = (value or "").strip()
    if not text:
        return default
    universe = set(values) if values is not None else set(allowed or {})
    if text not in universe:
        raise UsageError(f"{field} must be one of {', '.join(sorted(universe))}")
    return text


def build_query(*, product_class: str = "01", category: str = "100", county: str | None = None, date: str | None = None, convert_kg: str = "N") -> dict[str, str]:
    """Build the normalized upstream/proxy query dict.

    Accepts the documented alias names as well as the real KAMIS parameter
    names so callers can pass either through.
    """
    query: dict[str, str] = {
        "p_productclscode": normalize_choice(product_class, "p_productclscode", allowed=PRODUCT_CLASSES, default="01") or "01",
        "p_itemcategorycode": normalize_choice(category, "p_itemcategorycode", allowed=ITEM_CATEGORIES, default="100") or "100",
        "p_convert_kg_yn": normalize_choice(convert_kg, "p_convert_kg_yn", values=CONVERT_KG_VALUES, default="N") or "N",
    }
    if county:
        text = county.strip()
        if not text.isdigit() or len(text) != 4:
            raise UsageError("p_countycode must be a four-digit KAMIS region code")
        query["p_countycode"] = text
    if date:
        query["p_regday"] = normalize_date(date)
    return query


def build_query_from_params(params: dict | None) -> dict[str, str]:
    """Build a query from a raw parameter mapping, honoring KAMIS doc aliases."""
    data = params or {}

    def pick(*keys: str) -> str | None:
        for key in keys:
            value = data.get(key)
            if value is not None:
                return str(value)
        return None

    return build_query(
        product_class=pick("p_productclscode", "p_product_cls_code") or "01",
        category=pick("p_itemcategorycode", "p_item_category_code") or "100",
        county=pick("p_countycode", "p_country_code"),
        date=pick("p_regday"),
        convert_kg=pick("p_convert_kg_yn") or "N",
    )


# ---------------------------------------------------------------------------
# Output normalization
# ---------------------------------------------------------------------------
def parse_price(value: object) -> int | float | None:
    """Parse a KAMIS price string, preserving empty/dash as ``None``."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip().replace(",", "").replace(" ", "")
    if text in {"", "-", "–", "—", "N/A", "n/a"}:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if number.is_integer():
        return int(number)
    return number


def change_direction(current: int | float | None, previous: int | float | None) -> str:
    if current is None or previous is None:
        return "unknown"
    if current > previous:
        return "up"
    if current < previous:
        return "down"
    return "flat"


def _extract_raw_items(payload: object) -> list[dict]:
    if not isinstance(payload, dict):
        raise RequestError("KAMIS response must be a JSON object")
    items = payload.get("items")
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    data = payload.get("data")
    if isinstance(data, dict):
        item = data.get("item")
        if isinstance(item, list):
            return [entry for entry in item if isinstance(entry, dict)]
        if isinstance(item, dict):
            return [item]
    raise RequestError("KAMIS response has no items/data.item array")


def upstream_error_code(payload: object) -> str | None:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict) and data.get("error_code") is not None:
            return str(data["error_code"])
    return None


def normalize_items(payload: object) -> list[dict]:
    """Normalize proxy (``items``) or upstream (``data.item``) items."""
    normalized: list[dict] = []
    for raw in _extract_raw_items(payload):
        raw_prices = {field: raw.get(field) for field, _, _ in PRICE_FIELDS}
        item = {
            "item_name": raw.get("item_name"),
            "kind_name": raw.get("kind_name"),
            "rank": raw.get("rank"),
            "unit": raw.get("unit"),
            "raw_prices": raw_prices,
        }
        for field, name, _ in PRICE_FIELDS:
            item[name] = parse_price(raw.get(field))
        item["change"] = {
            name: change_direction(item["price"], item.get(name))
            for name in COMPARISON_FIELDS
        }
        normalized.append(item)
    return normalized


def summarize(items: list[dict]) -> dict:
    """Summarize counts, units, and 전일/전년 대비 방향 분포."""
    units: list[str] = []
    day_over_day = {"up": 0, "down": 0, "flat": 0, "unknown": 0}
    year_over_year = {"up": 0, "down": 0, "flat": 0, "unknown": 0}
    for item in items:
        unit = item.get("unit")
        if unit and unit not in units:
            units.append(unit)
        day_over_day[item.get("change", {}).get("day_before", "unknown")] += 1
        year_over_year[item.get("change", {}).get("year_before", "unknown")] += 1
    return {
        "count": len(items),
        "units": units,
        "day_over_day": day_over_day,
        "year_over_year": year_over_year,
    }


def format_table(items: list[dict]) -> str:
    arrows = {"up": "▲", "down": "▼", "flat": "＝", "unknown": "?"}
    lines = []
    for item in items:
        price = item.get("price")
        price_text = "-" if price is None else f"{price:,}"
        direction = arrows.get(item.get("change", {}).get("day_before", "unknown"), "?")
        label = " ".join(
            part for part in (item.get("item_name"), item.get("kind_name"), item.get("rank")) if part
        )
        lines.append(f"{label} {price_text}{item.get('unit') or ''} (전일 {direction})".strip())
    return "\n".join(lines)


def redact_url(url: str, *secrets: str | None) -> str:
    redacted = url
    for secret in secrets:
        if secret:
            redacted = redacted.replace(secret, "<redacted>")
    return redacted


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------
def http_get_json(url: str, timeout: float = 30, opener=urllib.request.urlopen) -> object:
    request = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "k-skill/kamis-food-price"})
    try:
        with opener(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        raise RequestError(f"HTTP {error.code} from KAMIS endpoint") from error
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise RequestError(f"KAMIS request failed: {error}") from error
    try:
        return json.loads(body)
    except (TypeError, ValueError) as error:
        raise RequestError("KAMIS endpoint did not return valid JSON (upstream_invalid_response)") from error


def build_proxy_url(base_url: str, query: dict[str, str]) -> str:
    return f"{base_url.rstrip('/')}{PROXY_PATH}?{urllib.parse.urlencode(query)}"


def build_upstream_url(query: dict[str, str], api_key: str, cert_id: str = UPSTREAM_CERT_ID) -> str:
    params = {
        **query,
        "action": UPSTREAM_ACTION,
        "p_cert_key": api_key,
        "p_cert_id": cert_id,
        "p_returntype": "json",
    }
    return f"{UPSTREAM_BASE_URL}?{urllib.parse.urlencode(params)}"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="KAMIS 농수축산물 도소매 가격 조회 (read-only)")
    parser.add_argument("--product-class", default="01", help="01 소매, 02 도매 (기본 01)")
    parser.add_argument("--category", default="100", help="100~600 부류 코드 (기본 100)")
    parser.add_argument("--county", help="4자리 지역 코드 (예: 1101 서울)")
    parser.add_argument("--date", help="조사일 YYYY-MM-DD")
    parser.add_argument("--convert-kg", default="N", help="Y 또는 N (기본 N)")
    parser.add_argument("--text", action="store_true", help="표 형태로 출력")
    parser.add_argument("--dry-run", action="store_true", help="요청 URL만 출력하고 호출하지 않음")
    parser.add_argument("--direct", action="store_true", help="proxy 대신 KAMIS upstream 직접 호출 (BYOK)")
    parser.add_argument("--api-key", help="KSKILL_KAMIS_API_KEY 대신 사용할 키 (--direct 전용)")
    parser.add_argument("--cert-id", help="KAMIS p_cert_id (기본 TEST)")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--proxy-base-url", default=os.getenv("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY_BASE_URL))
    parser.add_argument("--secrets-path", default=DEFAULT_SECRETS_PATH)
    return parser


def run(argv: list[str] | None = None, stdout=None, stderr=None) -> int:
    stdout = sys.stdout if stdout is None else stdout
    stderr = sys.stderr if stderr is None else stderr
    args = build_parser().parse_args(argv)

    try:
        query = build_query(
            product_class=args.product_class,
            category=args.category,
            county=args.county,
            date=args.date,
            convert_kg=args.convert_kg,
        )
    except UsageError as error:
        print(f"[error] {error}", file=stderr)
        return 2

    api_key: str | None = None
    if args.direct:
        api_key = resolve_api_key(args.api_key, secrets_path=args.secrets_path)
        if not api_key:
            print("[error] --direct requires KSKILL_KAMIS_API_KEY (env or secrets file)", file=stderr)
            return 3
        url = build_upstream_url(query, api_key, resolve_api_id(args.cert_id))
        source = "kamis-upstream"
    else:
        url = build_proxy_url(args.proxy_base_url, query)
        source = "k-skill-proxy"

    if args.dry_run:
        print(
            json.dumps(
                {"source": source, "query": query, "url": redact_url(url, api_key)},
                ensure_ascii=False,
                indent=2,
            ),
            file=stdout,
        )
        return 0

    try:
        payload = http_get_json(url, timeout=args.timeout)
    except RequestError as error:
        print(f"[error] {error}", file=stderr)
        return 4

    if isinstance(payload, dict) and payload.get("error"):
        code = str(payload["error"])
        message = str(payload.get("message", code))
        print(f"[error] {code}: {message}", file=stderr)
        return 2 if code == "bad_request" else 4

    error_code = upstream_error_code(payload)
    if error_code not in (None, "000", "001"):
        print(f"[error] KAMIS upstream error code {error_code}", file=stderr)
        return 4

    try:
        items = normalize_items(payload)
    except RequestError as error:
        print(f"[error] {error}", file=stderr)
        return 4

    if args.text:
        if items:
            print(format_table(items), file=stdout)
        else:
            print("[empty] 조건에 맞는 가격이 없습니다.", file=stdout)
        return 0

    print(
        json.dumps(
            {
                "result": "ok" if items else "empty",
                "source": source,
                "query": query,
                "url": redact_url(url, api_key),
                "items": items,
                "summary": summarize(items),
            },
            ensure_ascii=False,
            indent=2,
        ),
        file=stdout,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    return run(argv)


if __name__ == "__main__":
    raise SystemExit(main())
