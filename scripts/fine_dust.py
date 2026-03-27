#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.parse
import urllib.request

STATION_SERVICE_URL = "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc"
MEASUREMENT_SERVICE_URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc"
SECRET_NAME = "AIR_KOREA_OPEN_API_KEY"
GRADE_LABELS = {
    "1": "좋음",
    "2": "보통",
    "3": "나쁨",
    "4": "매우나쁨",
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize Air Korea PM10/PM2.5 data from location or fallback hints.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    report = subparsers.add_parser("report", help="build a PM10/PM2.5 report")
    report.add_argument("--lat", type=float, help="WGS84 latitude")
    report.add_argument("--lon", type=float, help="WGS84 longitude")
    report.add_argument("--region-hint", help="fallback region/administrative-area hint")
    report.add_argument("--station-name", help="explicit station name fallback")
    report.add_argument("--station-file", help="offline station JSON fixture")
    report.add_argument("--measurement-file", help="offline measurement JSON fixture")
    report.add_argument("--json", action="store_true", help="print JSON instead of text")
    return parser.parse_args(argv)


def load_json_file(path: str | os.PathLike[str]) -> dict:
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def extract_items(payload: dict | list) -> list[dict]:
    if isinstance(payload, list):
        return payload

    response = payload.get("response", {})
    body = response.get("body", {})
    items = body.get("items", [])

    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return items
    return []


def to_float(raw: object) -> float | None:
    if raw in (None, "", "-"):
        return None
    try:
        return float(str(raw))
    except ValueError:
        return None


def squared_distance(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    return (lat_a - lat_b) ** 2 + (lon_a - lon_b) ** 2


def pick_station(
    station_items: list[dict],
    *,
    lat: float | None = None,
    lon: float | None = None,
    region_hint: str | None = None,
    station_name: str | None = None,
) -> dict:
    if not station_items:
        raise SystemExit("측정소 후보가 없습니다.")

    if station_name:
        exact_match = next((item for item in station_items if item.get("stationName") == station_name), None)
        if exact_match:
            return exact_match
        partial_match = next(
            (
                item
                for item in station_items
                if station_name in str(item.get("stationName", "")) or station_name in str(item.get("addr", ""))
            ),
            None,
        )
        if partial_match:
            return partial_match

    if lat is not None and lon is not None:
        candidates = []
        for item in station_items:
            item_lat = to_float(item.get("dmX"))
            item_lon = to_float(item.get("dmY"))
            if item_lat is None or item_lon is None:
                continue
            candidates.append((squared_distance(lat, lon, item_lat, item_lon), item))
        if candidates:
            candidates.sort(key=lambda pair: pair[0])
            return candidates[0][1]

    if region_hint:
        tokens = sorted({token for token in region_hint.split() if token}, key=len, reverse=True)
        for token in tokens:
            station_name_match = next(
                (item for item in station_items if token in str(item.get("stationName", ""))),
                None,
            )
            if station_name_match:
                return station_name_match

            address_match = next(
                (item for item in station_items if token in str(item.get("addr", ""))),
                None,
            )
            if address_match:
                return address_match

    return station_items[0]


def find_measurement(measurement_items: list[dict], station_name: str) -> dict:
    exact_match = next((item for item in measurement_items if item.get("stationName") == station_name), None)
    if exact_match:
        return exact_match

    partial_match = next(
        (item for item in measurement_items if station_name in str(item.get("stationName", ""))),
        None,
    )
    if partial_match:
        return partial_match

    raise SystemExit(f"측정값 응답에서 측정소 '{station_name}' 를 찾지 못했습니다.")


def grade_to_label(raw_grade: object, *, pollutant: str, value: object) -> str:
    raw_text = str(raw_grade) if raw_grade not in (None, "") else ""
    if raw_text in GRADE_LABELS:
        return GRADE_LABELS[raw_text]

    numeric_value = to_float(value)
    if numeric_value is None:
        return "정보없음"

    thresholds = {
        "pm10": [(30, "좋음"), (80, "보통"), (150, "나쁨")],
        "pm25": [(15, "좋음"), (35, "보통"), (75, "나쁨")],
    }[pollutant]

    for threshold, label in thresholds:
        if numeric_value <= threshold:
            return label
    return "매우나쁨"


def build_report(
    *,
    station_items: list[dict],
    measurement_items: list[dict],
    lat: float | None = None,
    lon: float | None = None,
    region_hint: str | None = None,
    station_name: str | None = None,
) -> dict:
    station = pick_station(
        station_items,
        lat=lat,
        lon=lon,
        region_hint=region_hint,
        station_name=station_name,
    )
    measurement = find_measurement(measurement_items, station["stationName"])

    lookup_mode = "coordinates" if lat is not None and lon is not None else "fallback"

    return {
        "station_name": station["stationName"],
        "station_address": station.get("addr"),
        "lookup_mode": lookup_mode,
        "measured_at": measurement.get("dataTime"),
        "pm10": {
            "value": str(measurement.get("pm10Value", "-")),
            "grade": grade_to_label(
                measurement.get("pm10Grade"),
                pollutant="pm10",
                value=measurement.get("pm10Value"),
            ),
        },
        "pm25": {
            "value": str(measurement.get("pm25Value", "-")),
            "grade": grade_to_label(
                measurement.get("pm25Grade"),
                pollutant="pm25",
                value=measurement.get("pm25Value"),
            ),
        },
        "khai_grade": grade_to_label(
            measurement.get("khaiGrade"),
            pollutant="pm10",
            value=measurement.get("pm10Value"),
        ),
    }


def build_missing_secret_message() -> str:
    return (
        f"이 작업에는 {SECRET_NAME} 가 필요합니다.\n"
        "값을 채팅창에 붙여 넣지 말고 ~/.config/k-skill/secrets.env.plain 에 직접 채운 뒤\n"
        "sops 로 ~/.config/k-skill/secrets.env 로 암호화해 주세요.\n"
        "암호화가 끝나면 plaintext 파일은 지우고 bash scripts/check-setup.sh 로 다시 확인해 주세요."
    )


def get_required_secret() -> str:
    value = os.environ.get(SECRET_NAME)
    if not value:
        raise SystemExit(build_missing_secret_message())
    return value


def fetch_json(url: str, params: dict[str, object]) -> dict:
    query = urllib.parse.urlencode({key: value for key, value in params.items() if value is not None})
    request_url = f"{url}?{query}"
    with urllib.request.urlopen(request_url, timeout=20) as response:
        return json.load(response)


def fetch_station_payload(args: argparse.Namespace) -> dict:
    if args.station_file:
        return load_json_file(args.station_file)

    service_key = get_required_secret()
    common = {
        "serviceKey": service_key,
        "returnType": "json",
        "numOfRows": 50,
        "pageNo": 1,
    }

    if args.lat is not None and args.lon is not None:
        nearby_payload = fetch_json(
            f"{STATION_SERVICE_URL}/getNearbyMsrstnList",
            {
                **common,
                "numOfRows": 10,
                "dmX": args.lat,
                "dmY": args.lon,
            },
        )
        if extract_items(nearby_payload):
            return nearby_payload

    if args.region_hint or args.station_name:
        return fetch_json(
            f"{STATION_SERVICE_URL}/getMsrstnList",
            {
                **common,
                "addr": args.region_hint,
                "stationName": args.station_name,
            },
        )

    raise SystemExit("위도/경도 또는 region fallback 이 필요합니다.")


def fetch_measurement_payload(args: argparse.Namespace, station_name: str) -> dict:
    if args.measurement_file:
        return load_json_file(args.measurement_file)

    service_key = get_required_secret()
    return fetch_json(
        f"{MEASUREMENT_SERVICE_URL}/getMsrstnAcctoRltmMesureDnsty",
        {
            "serviceKey": service_key,
            "returnType": "json",
            "numOfRows": 100,
            "pageNo": 1,
            "stationName": station_name,
            "dataTerm": "DAILY",
            "ver": "1.4",
        },
    )


def render_text(report: dict) -> str:
    return "\n".join(
        [
            f"측정소: {report['station_name']}",
            f"주소: {report['station_address']}",
            f"조회 시각: {report['measured_at']}",
            f"조회 방식: {report['lookup_mode']}",
            f"PM10: {report['pm10']['value']} ({report['pm10']['grade']})",
            f"PM2.5: {report['pm25']['value']} ({report['pm25']['grade']})",
            f"통합대기등급: {report['khai_grade']}",
        ],
    )


def command_report(args: argparse.Namespace) -> None:
    station_payload = fetch_station_payload(args)
    station_items = extract_items(station_payload)
    station = pick_station(
        station_items,
        lat=args.lat,
        lon=args.lon,
        region_hint=args.region_hint,
        station_name=args.station_name,
    )

    measurement_payload = fetch_measurement_payload(args, station["stationName"])
    report = build_report(
        station_items=station_items,
        measurement_items=extract_items(measurement_payload),
        lat=args.lat,
        lon=args.lon,
        region_hint=args.region_hint,
        station_name=station["stationName"],
    )

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    print(render_text(report))


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.command == "report":
        command_report(args)
        return 0
    raise SystemExit(f"unsupported command: {args.command}")


if __name__ == "__main__":
    sys.exit(main())
