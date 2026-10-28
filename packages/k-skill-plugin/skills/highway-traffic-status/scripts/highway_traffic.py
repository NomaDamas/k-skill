#!/usr/bin/env python3
"""Read-only Korean highway traffic/CCTV helper using stdlib only.

Site-dependent access paths (discovered live 2026-07-21):

1. 한국도로공사 공공데이터포털 (data.ex.co.kr)
   GET https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime
       ?key=<key>&type=json[&numOfRows=N&pageNo=N]
   - The published demo key ``test`` works without registration and returns
     the full nationwide VDS snapshot (콘존별 speed/교통량/등급).
   - An arbitrary invalid key returns HTTP 200 with
     {"code": "ERROR", "message": "인증키가 유효하지 않습니다."} — treat as typed failure.

2. 국가교통정보센터 ITS (openapi.its.go.kr:9443)
   GET https://openapi.its.go.kr:9443/cctvInfo
       ?apiKey=<key>&type=ex&cctvType=1&minX=&maxX=&minY=&maxY=&getType=json
   - The published demo key ``test`` works; invalid keys return HTTP 401 JSON
     {"header": {"resultCode": 4005, ...}}.
   - Despite getType=json the success body is XML; parse XML first and fall
     back to the JSON error envelope.

Both surfaces work without user registration via the demo key, so per the
free API proxy policy this skill calls upstream directly (no k-skill-proxy
route). Users may override the key via env for higher quota.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

EXDATA_BASE_URL = "https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime"
ITS_CCTV_BASE_URL = "https://openapi.its.go.kr:9443/cctvInfo"
EXDATA_DEMO_KEY = "test"
ITS_DEMO_KEY = "test"
DEFAULT_SECRETS_PATH = pathlib.Path("~/.config/k-skill/secrets.env").expanduser()

# 대한민국 근해 좌표 범위 (경도/위도)
KOREA_LON_RANGE = (124.0, 132.0)
KOREA_LAT_RANGE = (33.0, 39.5)

GRADE_LABELS = {"1": "원활", "2": "서행", "3": "정체"}
DIRECTION_LABELS = {"S": "상행", "E": "하행", "N": "상행", "W": "하행"}

USER_AGENT = "k-skill-highway-traffic/0.1 (+https://github.com/NomaDamas/k-skill)"


class HelperError(RuntimeError):
    pass


def load_secrets(path: pathlib.Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return values
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_api_key(env_name: str, secrets_path: str) -> Optional[str]:
    env_value = os.environ.get(env_name)
    if env_value and env_value.strip():
        return env_value.strip()
    secrets = load_secrets(pathlib.Path(secrets_path).expanduser())
    value = secrets.get(env_name)
    return value.strip() if value and value.strip() else None


def build_traffic_url(args: argparse.Namespace, api_key: Optional[str]) -> str:
    query = {
        "key": api_key or EXDATA_DEMO_KEY,
        "type": "json",
    }
    return f"{EXDATA_BASE_URL}?{urllib.parse.urlencode(query)}"


def _validate_bbox(args: argparse.Namespace) -> None:
    for name in ("min_x", "max_x", "min_y", "max_y"):
        if getattr(args, name) is None:
            raise HelperError("cctv 조회에는 --min-x/--max-x/--min-y/--max-y 좌표 범위가 필요합니다.")
    if args.min_x >= args.max_x:
        raise HelperError("--min-x 는 --max-x 보다 작아야 합니다.")
    if args.min_y >= args.max_y:
        raise HelperError("--min-y 는 --max-y 보다 작아야 합니다.")
    if not (KOREA_LON_RANGE[0] <= args.min_x <= KOREA_LON_RANGE[1] and KOREA_LON_RANGE[0] <= args.max_x <= KOREA_LON_RANGE[1]):
        raise HelperError(f"경도는 한국 범위({KOREA_LON_RANGE[0]}~{KOREA_LON_RANGE[1]}) 안이어야 합니다.")
    if not (KOREA_LAT_RANGE[0] <= args.min_y <= KOREA_LAT_RANGE[1] and KOREA_LAT_RANGE[0] <= args.max_y <= KOREA_LAT_RANGE[1]):
        raise HelperError(f"위도는 한국 범위({KOREA_LAT_RANGE[0]}~{KOREA_LAT_RANGE[1]}) 안이어야 합니다.")


def build_cctv_url(args: argparse.Namespace, api_key: Optional[str]) -> str:
    _validate_bbox(args)
    query = {
        "apiKey": api_key or ITS_DEMO_KEY,
        "type": args.road_type,
        "cctvType": "1",
        "minX": args.min_x,
        "maxX": args.max_x,
        "minY": args.min_y,
        "maxY": args.max_y,
        "getType": "json",
    }
    return f"{ITS_CCTV_BASE_URL}?{urllib.parse.urlencode(query)}"


def http_get_text(url: str, timeout: int) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        body = ""
        with contextlib.suppress(Exception):
            body = exc.read().decode("utf-8", "replace")
        if exc.code == 401 or "인증키" in body:
            raise HelperError("upstream 인증키 오류입니다. 데모 키가 회수되었을 수 있으니 개인 키 발급 후 환경변수로 지정하세요.") from exc
        raise HelperError(f"upstream HTTP 오류: {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise HelperError(f"upstream 접속 실패: {exc.reason}") from exc


def http_get_json(url: str, timeout: int) -> Dict[str, Any]:
    text = http_get_text(url, timeout)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise HelperError("upstream 응답이 JSON이 아닙니다 (차단 또는 점검 가능성).") from exc


def normalize_traffic(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        raise HelperError("upstream 응답 형식이 올바르지 않습니다.")
    if payload.get("code") == "ERROR":
        message = str(payload.get("message") or "알 수 없는 upstream 오류")
        raise HelperError(f"upstream 오류: {message}")
    rows = payload.get("list")
    if not isinstance(rows, list):
        raise HelperError("upstream 응답에 교통량 목록이 없습니다.")

    def to_int(value: Any) -> Optional[int]:
        text = str(value or "").strip()
        return int(text) if text.lstrip("-").isdigit() else None

    normalized = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        grade = str(row.get("grade") or "")
        direction_code = str(row.get("updownTypeCode") or "")
        normalized.append({
            "route_name": str(row.get("routeName") or ""),
            "route_no": str(row.get("routeNo") or ""),
            "conzone_name": str(row.get("conzoneName") or ""),
            "conzone_id": str(row.get("conzoneId") or ""),
            "direction": DIRECTION_LABELS.get(direction_code, direction_code),
            "speed_kmh": to_int(row.get("speed")),
            "traffic_volume": to_int(row.get("trafficAmout")),
            "travel_time_sec": to_int(row.get("timeAvg")),
            "congestion": GRADE_LABELS.get(grade, grade),
            "observed_at": f"{row.get('stdDate', '')} {row.get('stdHour', '')}".strip(),
        })
    return normalized


def filter_traffic(
    rows: List[Dict[str, Any]],
    route: Optional[str] = None,
    keyword: Optional[str] = None,
) -> List[Dict[str, Any]]:
    result = rows
    if route:
        needle = route.strip()
        result = [
            row for row in result
            if needle in row["route_name"] or needle == row["route_no"]
        ]
    if keyword:
        needle = keyword.strip()
        result = [row for row in result if needle in row["conzone_name"]]
    return result


def normalize_cctv(body: str) -> List[Dict[str, Any]]:
    text = body.strip()
    if text.startswith("{"):
        with contextlib.suppress(json.JSONDecodeError):
            payload = json.loads(text)
            header = payload.get("header") if isinstance(payload, dict) else None
            message = str((header or {}).get("resultMsg") or "upstream 오류")
            raise HelperError(f"upstream 오류: {message} (인증키 확인 필요)")
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise HelperError("upstream CCTV 응답을 해석할 수 없습니다 (차단 또는 형식 변경 가능성).") from exc

    cameras = []
    for item in root.iter("data"):
        def field(tag: str) -> str:
            node = item.find(tag)
            return (node.text or "").strip() if node is not None and node.text else ""

        try:
            lat = float(field("coordy"))
            lon = float(field("coordx"))
        except ValueError:
            continue
        cameras.append({
            "name": field("cctvname"),
            "url": field("cctvurl"),
            "format": field("cctvformat"),
            "lat": lat,
            "lon": lon,
        })
    if not cameras and root.tag != "response":
        raise HelperError("upstream CCTV 응답에 데이터가 없습니다.")
    return cameras


def render_traffic_text(rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return "조건에 맞는 구간이 없습니다."
    lines = []
    for row in rows:
        speed = f"{row['speed_kmh']}km/h" if row["speed_kmh"] is not None else "속도 미상"
        lines.append(
            f"[{row['route_name']} {row['direction']}] {row['conzone_name']}: "
            f"{row['congestion']} · {speed} · 교통량 {row['traffic_volume']} (기준 {row['observed_at']})"
        )
    return "\n".join(lines)


def parse_args(argv: List[str]) -> argparse.Namespace:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--secrets-path", default=str(DEFAULT_SECRETS_PATH))
    common.add_argument("--timeout", type=int, default=30)
    common.add_argument("--text", action="store_true", help="사람용 요약 출력")

    parser = argparse.ArgumentParser(description="한국 고속도로 실시간 소통/교통량/CCTV 조회")
    subparsers = parser.add_subparsers(dest="command", required=True)

    traffic = subparsers.add_parser("traffic", parents=[common], help="콘존별 실시간 속도/교통량/소통등급")
    traffic.add_argument("--route", help="노선명 일부 또는 노선번호 (예: 경부, 0010)")
    traffic.add_argument("--keyword", help="구간(콘존) 이름 키워드 (예: 서울TG)")
    traffic.add_argument("--limit", type=int, default=30, help="출력 행 수 (기본 30)")

    cctv = subparsers.add_parser("cctv", parents=[common], help="좌표 범위 내 고속도로 CCTV 메타데이터")
    cctv.add_argument("--min-x", type=float, help="최소 경도")
    cctv.add_argument("--max-x", type=float, help="최대 경도")
    cctv.add_argument("--min-y", type=float, help="최소 위도")
    cctv.add_argument("--max-y", type=float, help="최대 위도")
    cctv.add_argument("--road-type", default="ex", choices=["ex", "its", "all"], help="도로 유형 (기본 ex=고속도로)")

    return parser.parse_args(argv)


def run(argv: List[str]) -> int:
    args = parse_args(argv)
    try:
        if args.command == "traffic":
            api_key = resolve_api_key("KSKILL_EXDATA_API_KEY", args.secrets_path)
            url = build_traffic_url(args, api_key)
            payload = http_get_json(url, args.timeout)
            rows = normalize_traffic(payload)
            matched = filter_traffic(rows, route=args.route, keyword=args.keyword)
            visible = matched[: max(args.limit, 0)]
            if args.text:
                print(render_traffic_text(visible))
            else:
                print(json.dumps({
                    "result": "ok" if visible else "empty",
                    "total_matched": len(matched),
                    "rows": visible,
                    "source": "data.ex.co.kr trafficAmountByRealtime",
                }, ensure_ascii=False, indent=2))
            return 0

        api_key = resolve_api_key("KSKILL_ITS_API_KEY", args.secrets_path)
        url = build_cctv_url(args, api_key)
        body = http_get_text(url, args.timeout)
        cameras = normalize_cctv(body)
        if args.text:
            if not cameras:
                print("좌표 범위 안에 CCTV가 없습니다.")
            for cam in cameras:
                print(f"{cam['name']} ({cam['format']}) — {cam['url']}")
        else:
            print(json.dumps({
                "result": "ok" if cameras else "empty",
                "cameras": cameras,
                "source": "openapi.its.go.kr cctvInfo",
            }, ensure_ascii=False, indent=2))
        return 0
    except HelperError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:]))
