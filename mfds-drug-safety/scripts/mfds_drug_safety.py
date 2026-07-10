from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from html import unescape
from typing import Any

PROXY_BASE_URL_ENV_VAR = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
PROXY_DOWN_MSG = "k-skill-proxy 서버(k-skill-proxy.nomadamas.org)가 응답하지 않습니다. 잠시 후 재시도하거나 운영자에게 문의하세요."
PROXY_KEY_NOT_CONFIGURED_MSG = "k-skill-proxy에 필요한 API 키가 설정되어 있지 않습니다. 운영자에게 문의하세요."


class ApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, url: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.url = url


def summarize_text(value: Any) -> str:
    if value is None:
        return ""
    text = unescape(str(value))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def resolve_proxy_base_url(explicit_base_url: str | None = None, env: dict[str, str] | None = None) -> str:
    env = env or os.environ
    candidate = summarize_text(explicit_base_url or env.get(PROXY_BASE_URL_ENV_VAR))
    if candidate.casefold() in {"off", "false", "0", "disable", "disabled", "none"}:
        raise ValueError("KSKILL_PROXY_BASE_URL 가 비활성화되어 있습니다.")
    if candidate and candidate != "replace-me":
        return candidate.rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def build_drug_interview(question: str | None = None, symptoms: str | None = None) -> dict[str, Any]:
    return {
        "domain": "drug",
        "question": summarize_text(question),
        "symptoms": summarize_text(symptoms),
        "must_ask": [
            "누가 복용하려는지 알려주세요. (본인/아이/임산부/고령자)",
            "무슨 약을 이미 먹었거나 지금 먹으려는지, 제품명/성분명을 각각 알려주세요.",
            "언제부터, 얼마나 자주, 한 번에 얼마나 복용했는지 알려주세요.",
            "지금 있는 증상과 언제 시작됐는지 알려주세요.",
            "복용 중인 약, 기저질환, 알레르기 여부를 알려주세요.",
        ],
        "red_flags": [
            "호흡곤란 또는 숨쉬기 힘듦",
            "의식저하, 실신, 혼동",
            "입술·혀 붓기 또는 심한 전신 발진",
            "지속되는 구토, 경련, 심한 흉통",
        ],
        "urgent_action": "red flag 가 하나라도 있으면 약 정보 조회보다 즉시 119·응급실·의료진 연결을 우선하세요.",
        "policy": "이 helper 는 진단이나 복용 지시를 하지 않고, 공식 식약처 안전정보 확인 전에 반드시 되묻기 흐름을 제공합니다.",
    }


EASY_FIELD_MAP = {
    "item_name": "item_name",
    "company_name": "company_name",
    "efficacy": "efficacy",
    "how_to_use": "how_to_use",
    "warnings": "warnings",
    "cautions": "cautions",
    "interactions": "interactions",
    "side_effects": "side_effects",
    "storage": "storage",
    "item_seq": "item_seq",
}

SAFE_STAD_FIELD_MAP = {
    "item_name": "item_name",
    "company_name": "company_name",
    "efficacy": "efficacy",
    "how_to_use": "how_to_use",
    "warnings": "warnings",
    "cautions": "cautions",
    "interactions": "interactions",
    "side_effects": "side_effects",
}


def normalize_easy_drug_item(item: dict[str, Any]) -> dict[str, Any]:
    normalized = {key: summarize_text(item.get(source_key)) for key, source_key in EASY_FIELD_MAP.items()}
    normalized["source"] = "drug_easy_info"
    return normalized


def normalize_safe_stad_item(item: dict[str, Any]) -> dict[str, Any]:
    normalized = {key: summarize_text(item.get(source_key)) for key, source_key in SAFE_STAD_FIELD_MAP.items()}
    normalized["source"] = "safe_standby_medicine"
    return normalized


def read_json_response(request: urllib.request.Request | str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 503:
            raise ApiError(PROXY_KEY_NOT_CONFIGURED_MSG, status_code=error.code, url=getattr(error, "url", None)) from error
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None

        if isinstance(payload, dict) and payload.get("message"):
            raise ApiError(str(payload["message"]), status_code=error.code, url=getattr(error, "url", None)) from error
        raise ApiError(
            f"MFDS drug proxy request failed with HTTP {error.code}",
            status_code=error.code,
            url=getattr(error, "url", None),
        ) from error
    except urllib.error.URLError as error:
        raise ApiError(f"{PROXY_DOWN_MSG} (상세: {error.reason})") from error


def lookup_drugs(
    item_names: list[str],
    *,
    limit: int = 5,
    base_url: str | None = None,
    request_json: Any = read_json_response,
) -> dict[str, Any]:
    resolved_base_url = resolve_proxy_base_url(base_url)
    url = f"{resolved_base_url}/v1/mfds/drug-safety/lookup"
    params: list[tuple[str, str]] = [("itemName", item_name) for item_name in item_names]
    params.append(("limit", str(limit)))
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"Accept": "application/json", "User-Agent": "k-skill-mfds/1.0"},
    )
    return request_json(request)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MFDS drug-safety helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    interview = subparsers.add_parser("interview", help="print the mandatory symptom follow-up interview")
    interview.add_argument("--question", default="")
    interview.add_argument("--symptoms", default="")

    lookup = subparsers.add_parser("lookup", help="look up official MFDS drug safety records through k-skill-proxy")
    lookup.add_argument("--item-name", action="append", required=True)
    lookup.add_argument("--limit", type=int, default=5)
    lookup.add_argument("--proxy-base-url")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "interview":
        print(json.dumps(build_drug_interview(question=args.question, symptoms=args.symptoms), ensure_ascii=False, indent=2))
        return 0

    if args.command == "lookup":
        try:
            payload = lookup_drugs(args.item_name, limit=args.limit, base_url=args.proxy_base_url)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0
        except (ValueError, ApiError) as error:
            print(json.dumps({"error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
            return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
