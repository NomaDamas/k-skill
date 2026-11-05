#!/usr/bin/env python3
"""홍익메디케어 공개 Streamable HTTP MCP 서버를 호출한다."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Sequence

DEFAULT_ENDPOINT = "https://hkmedi.co.kr/pharmacy-mcp"
DEFAULT_TIMEOUT_SECONDS = 30.0
PROTOCOL_VERSION = "2025-03-26"
USER_AGENT = "k-skill-animal-pharmacy/1.0"


class AnimalPharmacyMcpError(RuntimeError):
    """설정 또는 MCP 호출 실패 때 발생한다."""


def parse_json_object(raw: str, *, arg_name: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise argparse.ArgumentTypeError(
            f"{arg_name}은 올바른 JSON이어야 합니다: {exc}"
        ) from exc
    if not isinstance(value, dict):
        raise argparse.ArgumentTypeError(f"{arg_name}은 JSON 객체여야 합니다")
    return value


def parse_positive_float(raw: str) -> float:
    try:
        value = float(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("timeout은 숫자여야 합니다") from exc
    if value <= 0:
        raise argparse.ArgumentTypeError("timeout은 0보다 커야 합니다")
    return value


def parse_kv_pairs(pairs: Sequence[str]) -> dict[str, Any]:
    args: dict[str, Any] = {}
    for pair in pairs:
        if "=" not in pair:
            raise argparse.ArgumentTypeError(
                f"인자 '{pair}'는 key=value 형식이어야 합니다"
            )
        key, raw_value = pair.split("=", 1)
        if not key:
            raise argparse.ArgumentTypeError(
                f"인자 '{pair}'의 key가 비어 있습니다"
            )
        try:
            value = json.loads(raw_value)
        except json.JSONDecodeError:
            value = raw_value
        args[key] = value
    return args


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="홍익메디케어 동물약국 MCP 도구를 호출합니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "예시:\n"
            "  animal_pharmacy_mcp.py tools\n"
            "  animal_pharmacy_mcp.py call find_animal_pharmacies --arg city=서울 --arg gu=강남구\n"
            "  animal_pharmacy_mcp.py call search_product --arg keyword=항생제\n"
            "  animal_pharmacy_mcp.py call find_pharmacies_by_product --arg product_name=오리더밀 --arg city=서울\n"
        ),
    )
    parser.add_argument(
        "--endpoint",
        default=os.getenv("ANIMAL_PHARMACY_MCP_ENDPOINT", DEFAULT_ENDPOINT),
        help="동물약국 MCP 엔드포인트(기본값: %(default)s).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=parse_positive_float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="각 MCP HTTP 요청 제한 시간(기본값: %(default)s초).",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser(
        "tools", help="사용 가능한 MCP 도구와 입력 스키마를 JSON으로 출력합니다."
    )

    call_parser = subparsers.add_parser(
        "call", help="MCP 도구 하나를 호출하고 결과를 JSON으로 출력합니다."
    )
    call_parser.add_argument(
        "tool",
        choices=[
            "find_animal_pharmacies",
            "search_product",
            "find_pharmacies_by_product",
        ],
        help="호출할 동물약국 MCP 도구명.",
    )
    call_parser.add_argument(
        "--json",
        dest="json_args",
        type=lambda raw: parse_json_object(raw, arg_name="--json"),
        default=None,
        help="도구 인자를 JSON 객체로 전달합니다.",
    )
    call_parser.add_argument(
        "--arg",
        dest="kv_args",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="도구 인자입니다. 반복 지정할 수 있습니다.",
    )
    return parser.parse_args(argv)


def parse_mcp_response(raw: bytes, content_type: str) -> dict[str, Any]:
    text = raw.decode("utf-8")
    if "text/event-stream" in content_type:
        data_lines = [
            line[6:] for line in text.splitlines() if line.startswith("data: ")
        ]
        if not data_lines:
            raise AnimalPharmacyMcpError("MCP SSE 응답에 data 이벤트가 없습니다")
        text = data_lines[-1]

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AnimalPharmacyMcpError(
            f"MCP 응답이 올바른 JSON이 아닙니다: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise AnimalPharmacyMcpError("MCP 응답이 JSON 객체가 아닙니다")
    if "error" in payload:
        error = payload["error"]
        message = error.get("message", str(error)) if isinstance(error, dict) else str(error)
        raise AnimalPharmacyMcpError(message)
    return payload


def post_rpc(
    endpoint: str,
    payload: dict[str, Any],
    *,
    timeout_seconds: float,
    session_id: str | None = None,
) -> tuple[dict[str, Any], str | None]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "User-Agent": USER_AGENT,
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            parsed = parse_mcp_response(
                response.read(),
                response.headers.get("Content-Type", ""),
            )
            return parsed, response.headers.get("Mcp-Session-Id") or session_id
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AnimalPharmacyMcpError(
            f"동물약국 MCP HTTP {exc.code}: {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise AnimalPharmacyMcpError(
            f"동물약국 MCP 연결 실패 {endpoint}: {exc.reason}"
        ) from exc
    except TimeoutError as exc:
        raise AnimalPharmacyMcpError(
            f"동물약국 MCP 요청 시간이 {timeout_seconds:g}초를 초과했습니다"
        ) from exc


def initialize(endpoint: str, *, timeout_seconds: float) -> str:
    payload, session_id = post_rpc(
        endpoint,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": "k-skill-animal-pharmacy",
                    "version": "1.0.0",
                },
            },
        },
        timeout_seconds=timeout_seconds,
    )
    if "result" not in payload:
        raise AnimalPharmacyMcpError("MCP initialize 응답에 result가 없습니다")
    if not session_id:
        raise AnimalPharmacyMcpError("MCP initialize 응답에 세션 ID가 없습니다")
    return session_id


def run_mcp(
    endpoint: str,
    command: str,
    tool: str | None = None,
    arguments: dict[str, Any] | None = None,
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    session_id = initialize(endpoint, timeout_seconds=timeout_seconds)
    if command == "tools":
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {},
        }
    elif command == "call" and tool:
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments or {}},
        }
    else:
        raise AnimalPharmacyMcpError(f"지원하지 않는 명령입니다: {command}")

    response, _ = post_rpc(
        endpoint,
        payload,
        timeout_seconds=timeout_seconds,
        session_id=session_id,
    )
    return response.get("result")


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    tool_args: dict[str, Any] | None = None
    if args.command == "call":
        tool_args = dict(args.json_args or {})
        tool_args.update(parse_kv_pairs(args.kv_args))

    try:
        result = run_mcp(
            args.endpoint,
            args.command,
            getattr(args, "tool", None),
            tool_args,
            timeout_seconds=args.timeout_seconds,
        )
    except AnimalPharmacyMcpError as exc:
        print(f"animal_pharmacy_mcp.py: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
