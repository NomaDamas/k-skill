#!/usr/bin/env python3
"""Read-only KERIS/RISS academic metadata search helper using stdlib only.

RISS 검색 Open API는 기관/대학 전용 인증키를 요구하므로 k-skill-proxy를 거치지
않고, 사용자가 직접 발급받은 RISS 키로 상류(``https://www.riss.kr/openApi``)를
호출한다.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

DEFAULT_SECRETS_PATH = pathlib.Path("~/.config/k-skill/secrets.env").expanduser()
RISS_OPEN_API_URL = "https://www.riss.kr/openApi"
RESOURCE_TYPE_MAP = {"ALL": ["T", "A", "O", "U", "F", "S"], "T": ["T"], "A": ["A", "O"], "D": ["A"], "B": ["U"]}
MISSING_KEY_MSG = (
    "RISS API 키가 없습니다. RISS API 센터(https://www.riss.kr/apicenter/apiMain.do)에서 "
    "검색 API 키를 발급받아 KSKILL_RISS_API_KEY(호환 RISS_API_KEY) 환경변수 또는 "
    "~/.config/k-skill/secrets.env 에 설정하세요. RISS 키는 비영리 기관/대학에 발급됩니다."
)


class HelperError(RuntimeError):
    pass


def load_secrets(path: pathlib.Path) -> Dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    values = {}
    for raw in lines:
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_api_key(args: argparse.Namespace) -> Optional[str]:
    for name in ("KSKILL_RISS_API_KEY", "RISS_API_KEY"):
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    secrets = load_secrets(pathlib.Path(args.secrets_path).expanduser())
    value = secrets.get("KSKILL_RISS_API_KEY") or secrets.get("RISS_API_KEY")
    return value.strip() if value and value.strip() else None


def build_query(args: argparse.Namespace) -> Dict[str, Any]:
    query = {}
    for field in ("keyword", "title", "author", "subject", "publisher"):
        value = getattr(args, field)
        if value and value.strip():
            text = value.strip()
            if len(text) > 200 or any(ord(char) < 32 or ord(char) == 127 for char in text):
                raise HelperError(f"{field} 값은 1~200자의 일반 텍스트여야 합니다.")
            query[field] = text
    if not query:
        raise HelperError("--keyword, --title, --author, --subject, --publisher 중 하나 이상을 입력하세요.")
    if not 1 <= args.page <= 100000:
        raise HelperError("page 값은 1~100000 범위여야 합니다.")
    if not 1 <= args.page_size <= 100:
        raise HelperError("pageSize 값은 1~100 범위여야 합니다.")
    if len(RESOURCE_TYPE_MAP[args.resource_type]) > 1 and args.page > 1:
        raise HelperError("Combined resourceType searches support page 1 only; later pages require a single resource type.")
    query.update({"resourceType": args.resource_type, "page": args.page, "pageSize": args.page_size})
    return query


def build_riss_urls(query: Dict[str, Any], api_key: str) -> List[str]:
    rsnum = ((query["page"] - 1) * query["pageSize"]) + 1
    urls = []
    for upstream_type in RESOURCE_TYPE_MAP[query["resourceType"]]:
        params = {key: value for key, value in query.items() if key not in {"resourceType", "page", "pageSize"}}
        params.update({"key": api_key, "version": "1.0", "type": upstream_type, "rsnum": rsnum, "rowcount": query["pageSize"]})
        urls.append(f"{RISS_OPEN_API_URL}?{urllib.parse.urlencode(params)}")
    return urls


def parse_riss_xml(raw: bytes) -> Dict[str, Any]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        raise HelperError("RISS API 응답 XML이 올바르지 않습니다.") from error
    if root.tag != "record":
        raise HelperError("RISS API 응답 envelope가 올바르지 않습니다.")
    error_text = root.findtext("./head/Error")
    if error_text is None or not error_text.strip():
        raise HelperError("RISS API 응답에 상태 메타데이터가 없습니다.")
    code = error_text.strip()
    message = (root.findtext("./head/ErrorMessage") or "Unknown RISS error").strip()
    if code not in {"0", "000"}:
        raise HelperError(f"RISS API 오류 {code}: {message}")
    items = []
    for metadata in root.findall("./metadata"):
        values: Dict[str, List[str]] = {}
        for child in metadata:
            value = "".join(child.itertext()).strip()
            if value:
                values.setdefault(child.tag.removeprefix("riss.").lower(), []).append(value)
        first = lambda key: values.get(key, [None])[0]
        image, charge = (first("image") or "").upper(), first("charge")
        available = True if image == "Y" else False if image == "N" else None
        access = "free" if available and charge == "1" else "paid_or_restricted" if available and charge == "0" else "available" if available else "none" if available is False else "unknown"
        author = first("author") or ""
        authors = [part.strip() for part in author.replace(";", ",").split(",") if part.strip()] or ([author] if author else [])
        items.append({"resource_type": first("type"), "title": first("title"), "authors": authors, "publisher": first("publisher"), "year": first("pubdate"), "publication": first("stitle"), "material_type": first("mtype"), "link": first("url"), "full_text_available": available, "full_text_access": access, "holdings": values.get("holdings", [])})
    total_text = root.findtext("./head/totalcount")
    try:
        total_count = int(total_text) if total_text is not None else len(items)
    except ValueError as error:
        raise HelperError("RISS API 응답 totalcount가 올바른 정수가 아닙니다.") from error
    if total_count < 0:
        raise HelperError("RISS API 응답 totalcount가 음수입니다.")
    return {"total_count": total_count, "items": items}


def http_get_riss_xml(urls: List[str], timeout: int, page: int, page_size: int) -> Dict[str, Any]:
    results = []
    for url in urls:
        request = urllib.request.Request(url, headers={"accept": "application/xml", "user-agent": "k-skill/keris-academic-search"})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                results.append(parse_riss_xml(response.read()))
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise HelperError("RISS API가 키를 거부했습니다(HTTP 403). 발급받은 RISS 검색 API 키와 기관 권한을 확인하세요.") from error
            if error.code == 429:
                raise HelperError("RISS API 호출량/쿼터를 초과했습니다(HTTP 429).") from error
            raise HelperError(f"RISS API 요청 실패: HTTP {error.code} {error.reason}") from error
        except urllib.error.URLError as error:
            raise HelperError(f"RISS API 네트워크 오류: {error.reason}") from error
        except TimeoutError as error:
            raise HelperError("RISS API 요청 시간이 초과되었습니다.") from error
    queues = [list(result["items"]) for result in results]
    items = []
    while len(items) < page_size and any(queues):
        for queue in queues:
            if queue:
                items.append(queue.pop(0))
            if len(items) >= page_size:
                break
    return {"page": page, "page_size": page_size, "total_count": sum(result["total_count"] for result in results), "items": items}


def format_text(payload: Dict[str, Any]) -> str:
    items = payload.get("items") or []
    lines = [f"RISS 학술자료 검색 결과: {payload.get('total_count', len(items))}건"]
    labels = {"free": "원문 있음(무료 표시)", "paid_or_restricted": "원문 있음(유료/기관권한 가능)", "available": "원문 있음(접근조건 확인 필요)", "none": "원문 없음", "unknown": "원문 여부 미상"}
    for item in items:
        lines.append(f"- {item.get('title') or '제목 없음'} / {', '.join(item.get('authors') or []) or '저자 미상'} / {item.get('publisher') or item.get('publication') or '발행처 미상'} / {item.get('year') or '연도 미상'} / {labels.get(item.get('full_text_access'), '원문 여부 미상')}")
        if item.get("link"):
            lines.append(f"  {item['link']}")
    if not items:
        lines.append("조건에 맞는 학술자료가 없습니다.")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="KERIS/RISS 학술자료 메타데이터 검색")
    search = parser.add_subparsers(dest="command", required=True).add_parser("search")
    for field in ("keyword", "title", "author", "subject", "publisher"):
        search.add_argument(f"--{field}")
    search.add_argument("--resource-type", choices=RESOURCE_TYPE_MAP, default="ALL")
    search.add_argument("--page", type=int, default=1)
    search.add_argument("--page-size", type=int, default=10)
    search.add_argument("--secrets-path", default=str(DEFAULT_SECRETS_PATH))
    search.add_argument("--timeout", type=int, default=20)
    search.add_argument("--dry-run", action="store_true")
    search.add_argument("--json", action="store_true")
    return parser


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def run(argv: Optional[List[str]] = None) -> int:
    try:
        args = parse_args(argv)
        query = build_query(args)
        if args.dry_run:
            urls = build_riss_urls(query, "REDACTED")
            print(json.dumps({"operation": "search", "urls": urls, "query": query}, ensure_ascii=False, indent=2))
            return 0
        api_key = resolve_api_key(args)
        if not api_key:
            raise HelperError(MISSING_KEY_MSG)
        urls = build_riss_urls(query, api_key)
        payload = http_get_riss_xml(urls, args.timeout, query["page"], query["pageSize"])
        print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else format_text(payload))
        return 0
    except HelperError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
