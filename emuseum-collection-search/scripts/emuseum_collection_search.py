#!/usr/bin/env python3
"""Read-only National Museum of Korea e뮤지엄 소장품 검색 helper.

This helper builds the e뮤지엄 OpenAPI collection-search request, resolves the
user's OpenAPI key from the environment or ``~/.config/k-skill/secrets.env``,
normalizes the official JSON/XML response, and reports typed failures for
missing keys, auth/quota problems, network failures, and malformed responses.

It is stdlib-only and never performs network calls at import time. The search
endpoint/page parameters are kept as module constants plus CLI/env overrides so
a portal rename can be handled without editing the code.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

DEFAULT_BASE_URL = "https://www.emuseum.go.kr/openApi"
DEFAULT_SEARCH_PATH = "/selectRelicList.do"
OPEN_API_GUIDE_URL = "https://www.emuseum.go.kr/openApi"
USER_AGENT = "k-skill-emuseum-collection-search/1.0"
DEFAULT_SECRETS_PATH = "~/.config/k-skill/secrets.env"
KEY_ENV_VARS = ("KSKILL_EMUSEUM_API_KEY", "EMUSEUM_API_KEY")
BASE_URL_ENV_VARS = ("KSKILL_EMUSEUM_BASE_URL",)
SEARCH_PATH_ENV_VARS = ("KSKILL_EMUSEUM_SEARCH_PATH",)
MIN_LIMIT = 1
MAX_LIMIT = 100

# data.go.kr style result codes reused by many Korean public museum APIs.
DATA_GO_KR_RESULT_MESSAGES = {
    "01": "APPLICATION_ERROR",
    "02": "DB_ERROR",
    "04": "HTTP_ERROR",
    "05": "SERVICETIMEOUT_ERROR",
    "10": "INVALID_REQUEST_PARAMETER_ERROR",
    "11": "NO_MANDATORY_REQUEST_PARAMETERS_ERROR",
    "12": "NO_OPENAPI_SERVICE_ERROR",
    "20": "SERVICE_ACCESS_DENIED_ERROR",
    "21": "TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR",
    "22": "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
    "30": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
    "31": "DEADLINE_HAS_EXPIRED_ERROR",
    "32": "UNREGISTERED_IP_ERROR",
}
SUCCESS_RESULT_CODES = {"00", "0", "200", "success", "normal service."}
NODATA_RESULT_CODES = {"03"}


class EmuseumError(RuntimeError):
    """Raised when the e뮤지엄 OpenAPI cannot return a usable response."""


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_text(value: Any) -> str:
    if value is None or isinstance(value, (dict, list)):
        return ""
    return str(value).strip()


def _clean_text(value: Any) -> str:
    text = _as_text(value)
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(
        r"</?(?:p|div|li|ul|ol|h[1-6]|span|table|tr|td)[^>]*>",
        "\n",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _int_or_none(value: Any) -> int | None:
    text = _as_text(value)
    if not text:
        return None
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _key_norm(key: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def _pick(mapping: Any, *names: str) -> Any:
    if not isinstance(mapping, dict):
        return ""
    normalized = {_key_norm(key): value for key, value in mapping.items()}
    for name in names:
        value = normalized.get(_key_norm(name))
        if value not in (None, ""):
            return value
    return ""


# --------------------------------------------------------------------------- #
# credentials and endpoint resolution
# --------------------------------------------------------------------------- #
def read_secrets_file(path: str) -> dict[str, str]:
    resolved = os.path.expanduser(path)
    values: dict[str, str] = {}
    if not os.path.isfile(resolved):
        return values
    try:
        with open(resolved, encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                if key.startswith("export "):
                    key = key[len("export ") :].strip()
                if key:
                    values[key] = value.strip().strip('"').strip("'")
    except OSError:
        return {}
    return values


def resolve_api_key(args: argparse.Namespace) -> str | None:
    for name in KEY_ENV_VARS:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    secrets_path = getattr(args, "secrets_path", None) or DEFAULT_SECRETS_PATH
    secrets = read_secrets_file(secrets_path)
    for name in KEY_ENV_VARS:
        value = (secrets.get(name) or "").strip()
        if value:
            return value
    return None


def _first_env(names: tuple[str, ...]) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def resolve_base_url(args: argparse.Namespace) -> str:
    explicit = (getattr(args, "base_url", "") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    return (_first_env(BASE_URL_ENV_VARS) or DEFAULT_BASE_URL).rstrip("/")


def resolve_search_path(args: argparse.Namespace) -> str:
    explicit = (getattr(args, "search_path", "") or "").strip()
    if not explicit:
        explicit = _first_env(SEARCH_PATH_ENV_VARS)
    if not explicit:
        return DEFAULT_SEARCH_PATH
    return explicit if explicit.startswith("/") else f"/{explicit}"


def is_proxy_mode(base_url: str) -> bool:
    return base_url.rstrip("/") != DEFAULT_BASE_URL


# --------------------------------------------------------------------------- #
# request building
# --------------------------------------------------------------------------- #
def build_query_params(
    *,
    api_key: str,
    query: str,
    era: str,
    museum: str,
    page: int,
    limit: int,
) -> dict[str, str]:
    params: dict[str, str] = {"pageNo": str(page), "numOfRows": str(limit)}
    if query.strip():
        params["relicName"] = query.strip()
    if era.strip():
        params["eraName"] = era.strip()
    if museum.strip():
        params["museumName"] = museum.strip()
    if api_key:
        params["serviceKey"] = api_key
    return params


def build_search_url(base_url: str, search_path: str, params: dict[str, str]) -> str:
    return f"{base_url}{search_path}?{urllib.parse.urlencode(params)}"


def redact_url(url: str) -> str:
    return re.sub(r"serviceKey=[^&\s]+", "serviceKey=REDACTED", url, flags=re.IGNORECASE)


# --------------------------------------------------------------------------- #
# network
# --------------------------------------------------------------------------- #
def _http_error_message(code: int) -> str:
    if code in (401, 403):
        return f"e뮤지엄 API 인증에 실패했습니다(HTTP {code}): API 키와 이용신청 상태를 확인하세요."
    if code == 429:
        return "e뮤지엄 API 호출 한도를 초과했습니다(HTTP 429): 잠시 후 재시도하거나 쿼터를 확인하세요."
    if code == 404:
        return "e뮤지엄 API endpoint를 찾지 못했습니다(HTTP 404): OpenAPI 경로가 변경되었을 수 있습니다."
    if code >= 500:
        return f"e뮤지엄 서버 오류입니다(HTTP {code}): 잠시 후 재시도하세요."
    return f"e뮤지엄 API가 HTTP {code} 오류를 반환했습니다."


def http_get(url: str, timeout: float = 20.0) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json, application/xml;q=0.9, */*;q=0.8",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise EmuseumError(_http_error_message(exc.code)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        reason = exc.reason if isinstance(exc, urllib.error.URLError) else exc
        raise EmuseumError(f"e뮤지엄 API 요청이 실패했습니다: {reason}") from exc


# --------------------------------------------------------------------------- #
# response parsing / normalization
# --------------------------------------------------------------------------- #
def normalize_item(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise EmuseumError("e뮤지엄 API item 형식이 올바르지 않습니다.")

    def pick(*names: str) -> Any:
        return _pick(raw, *names)

    item = {
        "id": _as_text(pick("id", "relicId", "uniqId", "relicCode")),
        "name": _as_text(pick("relicName", "name", "title", "relicNm", "objectName")),
        "era": _as_text(pick("eraName", "era", "period", "relicEra", "age", "times")),
        "museum": _as_text(
            pick(
                "museumName",
                "museum",
                "ownership",
                "collectionName",
                "organization",
                "relicPlace",
            )
        ),
        "management_number": _as_text(
            pick(
                "managementNumber",
                "manageNo",
                "managementNo",
                "relicNo",
                "registerNo",
                "accessionNumber",
            )
        ),
        "description": _clean_text(
            pick("description", "content", "summary", "relicDesc", "detail", "explanation")
        ),
        "image_url": _as_text(pick("imageUrl", "imgUrl", "image", "relicImage", "photoUrl")),
        "detail_url": _as_text(pick("detailUrl", "url", "linkUrl", "homepage", "relicUrl")),
    }
    # Absent fields stay blank. The item id is an internal identifier, not a
    # management number, so it must never be substituted for a missing one.
    return item


def _check_header(header: Any) -> None:
    if not isinstance(header, dict) or not header:
        return
    code = _as_text(_pick(header, "resultCode", "result_code", "code"))
    if not code:
        return
    lowered = code.lower()
    if lowered in SUCCESS_RESULT_CODES or lowered in NODATA_RESULT_CODES:
        return
    message = _as_text(_pick(header, "resultMsg", "result_msg", "message"))
    mapped = DATA_GO_KR_RESULT_MESSAGES.get(code) or DATA_GO_KR_RESULT_MESSAGES.get(code.zfill(2))
    detail = message or mapped or "알 수 없는 오류"
    raise EmuseumError(f"e뮤지엄 API 오류(resultCode={code}): {detail}")


def _coerce_item_list(node: Any) -> list[dict[str, Any]]:
    if node is None:
        return []
    if isinstance(node, list):
        return [entry for entry in node if isinstance(entry, dict)]
    if isinstance(node, dict):
        return [node]
    return []


def _looks_like_item(mapping: dict[str, Any]) -> bool:
    keys = {_key_norm(key) for key in mapping.keys()}
    return bool(keys & {"relicname", "name", "title", "relicid", "managementnumber"})


# Container/pagination keys that identify a recognizable OpenAPI response body.
ITEM_CONTAINER_KEYS = ("items", "item", "list", "relics", "relicList", "data", "rows")
PAGINATION_KEYS = (
    "totalCount",
    "totalCnt",
    "total_count",
    "total",
    "pageNo",
    "pageIndex",
    "page",
    "numOfRows",
    "pageSize",
    "pageUnit",
    "page_size",
)


def _looks_like_body(body: Any) -> bool:
    """True when a decoded JSON node is a plausible response body.

    A bare list of items, a dict carrying an item container, pagination
    metadata, or a single item shape all count. Anything else (for example a
    JSON error object) is not a recognized envelope and must fail loudly.
    """
    if isinstance(body, list):
        return True
    if not isinstance(body, dict):
        return False
    normalized = {_key_norm(key) for key in body.keys()}
    known = {_key_norm(key) for key in ITEM_CONTAINER_KEYS + PAGINATION_KEYS}
    if normalized & known:
        return True
    return _looks_like_item(body)


def _extract_items_node(body: Any) -> Any:
    if isinstance(body, list):
        return body
    if not isinstance(body, dict):
        return []
    for key in ("items", "item", "list", "relics", "relicList", "data", "rows"):
        if key in body:
            node = body[key]
            if isinstance(node, dict) and "item" in node:
                return node["item"]
            return node
    if _looks_like_item(body):
        return [body]
    return []


def _split_json_envelope(data: Any) -> tuple[Any, Any, bool]:
    """Split a decoded JSON node into ``(header, body, recognized)``.

    ``recognized`` is False when the node is not a known data.go.kr style
    envelope and does not look like a response body. Callers must treat that as
    a malformed response instead of an empty success.
    """
    if isinstance(data, dict):
        response = data.get("response")
        if isinstance(response, dict):
            body = response.get("body", response)
            header = response.get("header")
            recognized = header is not None or "body" in response or _looks_like_body(body)
            return header, body, recognized
        if "body" in data or "header" in data:
            return data.get("header"), data.get("body", data), True
        if _looks_like_body(data):
            return None, data, True
    elif isinstance(data, list):
        return None, data, True
    return None, data, False


def _payload(
    total: int | None,
    page: int,
    page_size: int,
    raw_items: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "total_count": total if total is not None else len(raw_items),
        "page": page,
        "page_size": page_size,
        "items": [normalize_item(item) for item in raw_items],
    }


def _parse_json_response(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise EmuseumError("e뮤지엄 API가 올바른 JSON을 반환하지 않았습니다.") from exc
    header, body, recognized = _split_json_envelope(data)
    if not recognized:
        raise EmuseumError(
            "e뮤지엄 API 응답에서 알려진 봉투(items/body/header) 구조를 찾지 못했습니다."
        )
    _check_header(header)
    raw_items = _coerce_item_list(_extract_items_node(body))
    total = _int_or_none(_pick(body, "totalCount", "totalCnt", "total_count", "total"))
    page = _int_or_none(_pick(body, "pageNo", "pageIndex", "page")) or 1
    page_size = _int_or_none(_pick(body, "numOfRows", "pageSize", "pageUnit", "page_size")) or len(raw_items)
    return _payload(total, page, page_size, raw_items)


def _local_name(tag: Any) -> str:
    return str(tag).rsplit("}", 1)[-1]


def _find_child(parent: ET.Element, *names: str) -> ET.Element | None:
    wanted = {name.lower() for name in names}
    for child in list(parent):
        if _local_name(child.tag).lower() in wanted:
            return child
    return None


def _find_children(parent: ET.Element, name: str) -> list[ET.Element]:
    wanted = name.lower()
    return [child for child in list(parent) if _local_name(child.tag).lower() == wanted]


def _element_text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return _clean_text("".join(element.itertext()))


def _parse_xml_response(text: str) -> dict[str, Any]:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise EmuseumError("e뮤지엄 API가 올바른 JSON/XML을 반환하지 않았습니다.") from exc
    header_el = _find_child(root, "header")
    if header_el is not None:
        _check_header({_local_name(child.tag): _element_text(child) for child in list(header_el)})
    body_el = _find_child(root, "body")
    if body_el is None:
        body_el = root
    items_container = _find_child(body_el, "items")
    item_els: list[ET.Element] = []
    if items_container is not None:
        item_els = _find_children(items_container, "item")
    if not item_els:
        item_els = [el for el in body_el.iter() if _local_name(el.tag).lower() == "item"]
    total_el = _find_child(body_el, "totalCount", "totalCnt", "total")
    if header_el is None and body_el is root and not item_els and total_el is None:
        raise EmuseumError(
            "e뮤지엄 API 응답에서 알려진 XML 봉투(items/body/header) 구조를 찾지 못했습니다."
        )
    raw_items = [
        {_local_name(child.tag): _element_text(child) for child in list(item_el)}
        for item_el in item_els
    ]
    total = _int_or_none(_element_text(total_el))
    page = _int_or_none(_element_text(_find_child(body_el, "pageNo", "pageIndex", "page"))) or 1
    page_size = _int_or_none(
        _element_text(_find_child(body_el, "numOfRows", "pageSize", "pageUnit"))
    ) or len(raw_items)
    return _payload(total, page, page_size, raw_items)


def parse_response(body: bytes | str) -> dict[str, Any]:
    if isinstance(body, bytes):
        text = body.decode("utf-8", errors="replace")
    elif isinstance(body, str):
        text = body
    else:
        raise EmuseumError("e뮤지엄 API 응답 형식을 이해할 수 없습니다.")
    stripped = text.lstrip("\ufeff \t\r\n")
    if not stripped:
        raise EmuseumError("e뮤지엄 API가 빈 응답을 반환했습니다.")
    if stripped[0] in "{[":
        return _parse_json_response(stripped)
    return _parse_xml_response(stripped)


# --------------------------------------------------------------------------- #
# search flow
# --------------------------------------------------------------------------- #
def _validate_page(page: int) -> None:
    if not isinstance(page, int) or page < 1:
        raise ValueError("page must be at least 1")


def _validate_limit(limit: int) -> None:
    if not isinstance(limit, int) or not MIN_LIMIT <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between {MIN_LIMIT} and {MAX_LIMIT}")


def search_collection(
    *,
    query: str = "",
    era: str = "",
    museum: str = "",
    page: int = 1,
    limit: int = 10,
    api_key: str,
    base_url: str,
    search_path: str,
    timeout: float = 20.0,
) -> dict[str, Any]:
    _validate_page(page)
    _validate_limit(limit)
    params = build_query_params(
        api_key=api_key, query=query, era=era, museum=museum, page=page, limit=limit
    )
    url = build_search_url(base_url, search_path, params)
    public_params = build_query_params(
        api_key="", query=query, era=era, museum=museum, page=page, limit=limit
    )
    public_url = build_search_url(base_url, search_path, public_params)
    fetched_at = _now_iso()
    body = http_get(url, timeout=timeout)
    payload = parse_response(body)
    payload["query"] = {"name": query.strip(), "era": era.strip(), "museum": museum.strip()}
    payload["source"] = {
        "endpoint": f"{base_url}{search_path}",
        "url": public_url,
        "fetched_at": fetched_at,
    }
    return payload


def format_text(payload: dict[str, Any]) -> str:
    query = payload.get("query") or {}
    filters: list[str] = []
    if query.get("name"):
        filters.append(f'소장품명 "{query["name"]}"')
    if query.get("era"):
        filters.append(f"시대 {query['era']}")
    if query.get("museum"):
        filters.append(f"기관 {query['museum']}")
    heading = "e뮤지엄 소장품 검색"
    if filters:
        heading += " — " + " · ".join(filters)

    items = payload.get("items") or []
    lines = [heading, f"총 {payload.get('total_count', 0)}건 중 {len(items)}건 표시"]
    source = payload.get("source") or {}
    if source.get("fetched_at"):
        lines.append(f"조회 시각: {source['fetched_at']}")
    if source.get("endpoint"):
        lines.append(f"출처: {source['endpoint']}")

    if not items:
        lines.append("")
        lines.append("조건에 맞는 소장품을 찾지 못했습니다. 소장품명/시대/기관 조건을 바꿔 보세요.")
        return "\n".join(lines)

    for index, item in enumerate(items, 1):
        lines.append("")
        lines.append(f"{index}. {item.get('name') or '(이름 없음)'}")
        meta: list[str] = []
        if item.get("era"):
            meta.append(f"시대: {item['era']}")
        if item.get("museum"):
            meta.append(f"소장: {item['museum']}")
        if item.get("management_number"):
            meta.append(f"관리번호: {item['management_number']}")
        if meta:
            lines.append("   " + " · ".join(meta))
        if item.get("description"):
            lines.append(f"   설명: {item['description']}")
        if item.get("image_url"):
            lines.append(f"   이미지: {item['image_url']}")
        if item.get("detail_url"):
            lines.append(f"   상세: {item['detail_url']}")
    return "\n".join(lines)


def _missing_key_message() -> str:
    return (
        "e뮤지엄 OpenAPI 키가 없습니다. "
        f"{KEY_ENV_VARS[0]}(호환 {KEY_ENV_VARS[1]}) 환경변수 또는 "
        f"{DEFAULT_SECRETS_PATH} 에 설정하세요. "
        f"키 발급: {OPEN_API_GUIDE_URL} 의 이용신청/인증키 발급 절차를 따르세요. "
        "--dry-run 으로 요청 URL을 먼저 확인할 수 있습니다."
    )


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Search National Museum of Korea e뮤지엄 OpenAPI collection metadata (read-only)."
    )
    subparsers = parser.add_subparsers(dest="command")
    search = subparsers.add_parser("search", help="search e뮤지엄 소장품")
    search.add_argument("--query", default="", help="소장품명 keyword (relicName)")
    search.add_argument("--era", default="", help="시대 keyword (eraName)")
    search.add_argument("--museum", default="", help="소장기관 keyword (museumName)")
    search.add_argument("--page", type=int, default=1)
    search.add_argument("--limit", type=int, default=10)
    search.add_argument("--json", action="store_true", help="print the normalized JSON payload")
    search.add_argument(
        "--dry-run",
        action="store_true",
        help="print the request URL with the key redacted without calling the API",
    )
    search.add_argument(
        "--base-url",
        default="",
        help=f"override OpenAPI base URL (default {DEFAULT_BASE_URL}, or KSKILL_EMUSEUM_BASE_URL)",
    )
    search.add_argument(
        "--search-path",
        default="",
        help=f"override search operation path (default {DEFAULT_SEARCH_PATH}, or KSKILL_EMUSEUM_SEARCH_PATH)",
    )
    search.add_argument(
        "--secrets-path",
        default=DEFAULT_SECRETS_PATH,
        help=f"path to the k-skill secrets file (default {DEFAULT_SECRETS_PATH})",
    )
    search.add_argument("--timeout", type=float, default=20.0)
    return parser


def run(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if getattr(args, "command", None) != "search":
        parser.error("expected the 'search' subcommand")

    try:
        _validate_page(args.page)
        _validate_limit(args.limit)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    api_key = resolve_api_key(args)
    base_url = resolve_base_url(args)
    search_path = resolve_search_path(args)
    proxy_mode = is_proxy_mode(base_url)

    if args.dry_run:
        preview_key = api_key or ""
        params = build_query_params(
            api_key=preview_key,
            query=args.query,
            era=args.era,
            museum=args.museum,
            page=args.page,
            limit=args.limit,
        )
        if not preview_key and not proxy_mode:
            # Keyless direct preview: show where serviceKey would go without
            # requiring or inventing a key.
            params["serviceKey"] = "REDACTED"
        payload = {
            "mode": "proxy" if proxy_mode else "direct",
            "base_url": base_url,
            "search_path": search_path,
            "url": redact_url(build_search_url(base_url, search_path, params)),
            "query": {
                "name": args.query.strip(),
                "era": args.era.strip(),
                "museum": args.museum.strip(),
            },
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if not api_key and not proxy_mode:
        print(_missing_key_message(), file=sys.stderr)
        return 1

    try:
        payload = search_collection(
            query=args.query,
            era=args.era,
            museum=args.museum,
            page=args.page,
            limit=args.limit,
            api_key=api_key or "",
            base_url=base_url,
            search_path=search_path,
            timeout=args.timeout,
        )
    except (EmuseumError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(format_text(payload))
    return 0


def main(argv: list[str] | None = None) -> int:
    return run(argv)


if __name__ == "__main__":
    raise SystemExit(main())