#!/usr/bin/env python3
"""마이리얼트립 공개 Streamable HTTP MCP 서버를 호출한다.

엔드포인트는 https://docs.myrealtrip.com/#/api/mcp/overview 에 문서화되어
있으며 현재 별도 API 키가 필요하지 않다. 이 래퍼는 k-skill 사용자가
단순 조회와 도구 호출을 위해 MCP 클라이언트 코드를 직접 작성하지 않아도
되게 해준다.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Any, Sequence

DEFAULT_ENDPOINT = "https://mcp-servers.myrealtrip.com/mcp"
DEFAULT_TIMEOUT_SECONDS = 30.0


class MyRealTripMcpError(RuntimeError):
    """설정 또는 MCP 호출 실패 때 발생한다."""


def parse_json_object(raw: str, *, arg_name: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise argparse.ArgumentTypeError(f"{arg_name}은 올바른 JSON이어야 합니다: {exc}") from exc
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
            raise argparse.ArgumentTypeError(f"인자 '{pair}'는 key=value 형식이어야 합니다")
        key, raw_value = pair.split("=", 1)
        if not key:
            raise argparse.ArgumentTypeError(f"인자 '{pair}'의 key가 비어 있습니다")
        try:
            value = json.loads(raw_value)
        except json.JSONDecodeError:
            value = raw_value
        args[key] = value
    return args


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Streamable HTTP로 마이리얼트립 MCP 도구를 호출합니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "예시:\n"
            "  myrealtrip_mcp.py tools\n"
            "  myrealtrip_mcp.py call getCurrentTime\n"
            "  myrealtrip_mcp.py call searchTnas --arg query='오사카 유니버설 스튜디오' --arg perPage=5\n"
            "  myrealtrip_mcp.py call searchDomesticFlights --json '{\"origin\":\"GMP\",\"destination\":\"CJU\",\"departDate\":\"2026-05-20\"}'\n"
        ),
    )
    parser.add_argument(
        "--endpoint",
        default=os.getenv("MYREALTRIP_MCP_ENDPOINT", DEFAULT_ENDPOINT),
        help="마이리얼트립 MCP 엔드포인트(기본값: %(default)s).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=parse_positive_float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="MCP 연결/호출 전체 제한 시간(기본값: %(default)s초).",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("tools", help="사용 가능한 MCP 도구와 입력 스키마를 JSON으로 출력합니다.")

    call_parser = subparsers.add_parser("call", help="MCP 도구 하나를 호출하고 CallToolResult를 JSON으로 출력합니다.")
    call_parser.add_argument("tool", help="도구명. 예: searchStays, searchTnas, searchDomesticFlights.")
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
        help="도구 인자입니다. VALUE는 가능하면 JSON으로 파싱하고, 아니면 문자열로 처리합니다. 반복 지정할 수 있습니다.",
    )
    return parser.parse_args(argv)


async def _run_mcp_once(endpoint: str, command: str, tool: str | None, arguments: dict[str, Any] | None) -> Any:
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
    except Exception as exc:  # pragma: no cover - environment dependent
        raise MyRealTripMcpError(
            "Python 패키지 'mcp'가 필요합니다. 다음 명령으로 설치하세요: python3 -m pip install mcp"
        ) from exc

    try:
        async with streamablehttp_client(endpoint) as (read_stream, write_stream, _):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                if command == "tools":
                    result = await session.list_tools()
                    return [
                        {
                            "name": item.name,
                            "description": item.description,
                            "inputSchema": item.inputSchema,
                        }
                        for item in result.tools
                    ]
                if command == "call" and tool:
                    return await session.call_tool(tool, arguments or {})
    except Exception as exc:
        raise MyRealTripMcpError(f"마이리얼트립 MCP 엔드포인트 호출 실패 {endpoint}: {exc}") from exc

    raise MyRealTripMcpError(f"지원하지 않는 명령입니다: {command}")


async def run_mcp(
    endpoint: str,
    command: str,
    tool: str | None = None,
    arguments: dict[str, Any] | None = None,
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    try:
        return await asyncio.wait_for(
            _run_mcp_once(endpoint, command, tool, arguments),
            timeout=timeout_seconds,
        )
    except TimeoutError as exc:
        raise MyRealTripMcpError(
            f"마이리얼트립 MCP 엔드포인트 호출 시간이 {timeout_seconds:g}초를 초과했습니다: {endpoint}"
        ) from exc


def jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict"):
        return value.dict()
    return value


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    tool_args: dict[str, Any] | None = None
    if args.command == "call":
        tool_args = dict(args.json_args or {})
        tool_args.update(parse_kv_pairs(args.kv_args))

    try:
        result = asyncio.run(
            run_mcp(
                args.endpoint,
                args.command,
                getattr(args, "tool", None),
                tool_args,
                timeout_seconds=args.timeout_seconds,
            )
        )
    except MyRealTripMcpError as exc:
        print(f"myrealtrip_mcp.py: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(jsonable(result), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
