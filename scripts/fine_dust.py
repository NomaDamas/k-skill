#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from math import atan2, cos, radians, sin, sqrt, tan

STATION_SERVICE_URL = "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc"
MEASUREMENT_SERVICE_URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc"
SECRET_NAME = "AIR_KOREA_OPEN_API_KEY"
PROXY_BASE_URL_NAME = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
PROXY_DOWN_MSG = "설정된 k-skill-proxy 서버가 응답하지 않습니다. 잠시 후 재시도하거나 운영자에게 문의하세요."
PROXY_KEY_NOT_CONFIGURED_MSG = "k-skill-proxy에 필요한 API 키가 설정되어 있지 않습니다. 운영자에게 문의하세요."
WGS84_A = 6378137.0
WGS84_F = 1 / 298.257223563
BESSEL_A = 6377397.155
BESSEL_F = 1 / 299.1528128
AIR_KOREA_TM_LAT0 = radians(38.0)
AIR_KOREA_TM_LON0 = radians(127.0)
AIR_KOREA_TM_FALSE_EASTING = 200000.0
AIR_KOREA_TM_FALSE_NORTHING = 500000.0
AIR_KOREA_TM_SCALE = 1.0
AIR_KOREA_WGS84_TO_BESSEL = (146.43, -507.89, -681.46)
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


def meridional_arc(phi: float, *, semi_major_axis: float, eccentricity_squared: float) -> float:
    e2 = eccentricity_squared
    return semi_major_axis * (
        (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256) * phi
        - (3 * e2 / 8 + 3 * e2**2 / 32 + 45 * e2**3 / 1024) * sin(2 * phi)
        + (15 * e2**2 / 256 + 45 * e2**3 / 1024) * sin(4 * phi)
        - (35 * e2**3 / 3072) * sin(6 * phi)
    )


def wgs84_to_bessel(lat: float, lon: float) -> tuple[float, float]:
    dx, dy, dz = AIR_KOREA_WGS84_TO_BESSEL
    source_e2 = 2 * WGS84_F - WGS84_F**2
    target_e2 = 2 * BESSEL_F - BESSEL_F**2

    lat_rad = radians(lat)
    lon_rad = radians(lon)
    sin_lat = sin(lat_rad)
    cos_lat = cos(lat_rad)
    prime_vertical_radius = WGS84_A / sqrt(1 - source_e2 * sin_lat * sin_lat)

    x = prime_vertical_radius * cos_lat * cos(lon_rad) + dx
    y = prime_vertical_radius * cos_lat * sin(lon_rad) + dy
    z = prime_vertical_radius * (1 - source_e2) * sin_lat + dz

    lon_bessel = atan2(y, x)
    horizontal = sqrt(x * x + y * y)
    lat_bessel = atan2(z, horizontal * (1 - target_e2))

    for _ in range(8):
        sin_lat_bessel = sin(lat_bessel)
        bessel_radius = BESSEL_A / sqrt(1 - target_e2 * sin_lat_bessel * sin_lat_bessel)
        next_lat = atan2(z + target_e2 * bessel_radius * sin_lat_bessel, horizontal)
        if abs(next_lat - lat_bessel) < 1e-14:
            lat_bessel = next_lat
            break
        lat_bessel = next_lat

    return lat_bessel, lon_bessel


def wgs84_to_air_korea_tm(lat: float, lon: float) -> tuple[float, float]:
    lat_rad, lon_rad = wgs84_to_bessel(lat, lon)
    bessel_e2 = 2 * BESSEL_F - BESSEL_F**2
    second_eccentricity_squared = bessel_e2 / (1 - bessel_e2)

    sin_lat = sin(lat_rad)
    cos_lat = cos(lat_rad)
    tan_lat = tan(lat_rad)

    prime_vertical_radius = BESSEL_A / sqrt(1 - bessel_e2 * sin_lat * sin_lat)
    tan_squared = tan_lat * tan_lat
    curvature = second_eccentricity_squared * cos_lat * cos_lat
    A = (lon_rad - AIR_KOREA_TM_LON0) * cos_lat

    meridional = meridional_arc(lat_rad, semi_major_axis=BESSEL_A, eccentricity_squared=bessel_e2)
    meridional_origin = meridional_arc(
        AIR_KOREA_TM_LAT0,
        semi_major_axis=BESSEL_A,
        eccentricity_squared=bessel_e2,
    )

    tm_x = AIR_KOREA_TM_FALSE_EASTING + AIR_KOREA_TM_SCALE * prime_vertical_radius * (
        A
        + (1 - tan_squared + curvature) * A**3 / 6
        + (5 - 18 * tan_squared + tan_squared**2 + 72 * curvature - 58 * second_eccentricity_squared) * A**5 / 120
    )
    tm_y = AIR_KOREA_TM_FALSE_NORTHING + AIR_KOREA_TM_SCALE * (
        meridional
        - meridional_origin
        + prime_vertical_radius
        * tan_lat
        * (
            A**2 / 2
            + (5 - tan_squared + 9 * curvature + 4 * curvature**2) * A**4 / 24
            + (61 - 58 * tan_squared + tan_squared**2 + 600 * curvature - 330 * second_eccentricity_squared)
            * A**6
            / 720
        )
    )
    return tm_x, tm_y


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


def resolve_station(
    station_items: list[dict],
    *,
    lat: float | None = None,
    lon: float | None = None,
    region_hint: str | None = None,
    station_name: str | None = None,
) -> dict:
    if station_items:
        return pick_station(
            station_items,
            lat=lat,
            lon=lon,
            region_hint=region_hint,
            station_name=station_name,
        )

    if station_name:
        return {"stationName": station_name, "addr": None}

    raise SystemExit("측정소 후보가 없습니다.")


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
    lookup_mode: str | None = None,
    selected_station: dict | None = None,
) -> dict:
    station = selected_station or resolve_station(
        station_items,
        lat=lat,
        lon=lon,
        region_hint=region_hint,
        station_name=station_name,
    )
    measurement = find_measurement(measurement_items, station["stationName"])

    resolved_lookup_mode = lookup_mode or ("coordinates" if lat is not None and lon is not None else "fallback")

    return {
        "station_name": station["stationName"],
        "station_address": station.get("addr"),
        "lookup_mode": resolved_lookup_mode,
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
        "khai_grade": "정보없음"
        if measurement.get("khaiGrade") in (None, "")
        else grade_to_label(
            measurement.get("khaiGrade"),
            pollutant="pm10",
            value=measurement.get("pm10Value"),
        ),
    }


def build_missing_secret_message() -> str:
    return (
        f"이 작업에는 {SECRET_NAME} 환경변수가 필요합니다.\n"
        "환경변수가 설정되어 있지 않으면 ~/.config/k-skill/secrets.env 에 추가하거나\n"
        "에이전트의 secret vault에서 주입해 주세요."
    )


def get_required_secret() -> str:
    value = os.environ.get(SECRET_NAME)
    if not value or value == "replace-me":
        raise SystemExit(build_missing_secret_message())
    return value


def get_proxy_base_url() -> str | None:
    value = os.environ.get(PROXY_BASE_URL_NAME)
    if value and value.lower() in {"off", "false", "0", "disable", "disabled", "none"}:
        return None
    if value and value != "replace-me":
        return value.rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def read_json_response(request: urllib.request.Request | str) -> dict:
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None

        if exc.code == 503 and isinstance(payload, dict) and payload.get("error") == "upstream_not_configured":
            raise SystemExit(PROXY_KEY_NOT_CONFIGURED_MSG) from exc

        message = payload.get("message") if isinstance(payload, dict) else None
        if isinstance(payload, dict) and payload.get("error") == "ambiguous_location":
            candidates = payload.get("candidate_stations") or []
            sido_name = payload.get("sido_name")
            detail = [message or "단일 측정소를 확정하지 못했습니다."]
            if sido_name:
                detail.append(f"시도: {sido_name}")
            if candidates:
                detail.append(f"후보 측정소: {', '.join(candidates)}")
                detail.append("위 후보 중 정확한 측정소명으로 --station-name 재조회하세요.")
            raise SystemExit("\n".join(detail)) from exc

        raise SystemExit(message or f"요청이 실패했습니다: HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"{PROXY_DOWN_MSG} (상세: {exc.reason})") from exc


def fetch_json(url: str, params: dict[str, object]) -> dict:
    query = urllib.parse.urlencode({key: value for key, value in params.items() if value is not None})
    request_url = f"{url}?{query}"
    return read_json_response(request_url)


def fetch_proxy_report(args: argparse.Namespace) -> dict | None:
    base_url = get_proxy_base_url()
    if not base_url or args.station_file or args.measurement_file:
        return None

    params: dict[str, object] = {}
    if args.lat is not None:
        params["lat"] = args.lat
    if args.lon is not None:
        params["lon"] = args.lon
    if args.region_hint:
        params["regionHint"] = args.region_hint
    if args.station_name:
        params["stationName"] = args.station_name

    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(f"{base_url}/v1/fine-dust/report?{query}")
    return read_json_response(request)


def fetch_station_lookup(args: argparse.Namespace) -> tuple[dict, str]:
    if args.station_file:
        return load_json_file(args.station_file), "coordinates" if args.lat is not None and args.lon is not None else "fallback"

    service_key = get_required_secret()
    common = {
        "serviceKey": service_key,
        "returnType": "json",
        "numOfRows": 50,
        "pageNo": 1,
    }

    if args.lat is not None and args.lon is not None:
        tm_x, tm_y = wgs84_to_air_korea_tm(args.lat, args.lon)
        nearby_payload = fetch_json(
            f"{STATION_SERVICE_URL}/getNearbyMsrstnList",
            {
                **common,
                "numOfRows": 10,
                "tmX": tm_x,
                "tmY": tm_y,
            },
        )
        if extract_items(nearby_payload):
            return nearby_payload, "coordinates"

    if args.region_hint or args.station_name:
        return (
            fetch_json(
                f"{STATION_SERVICE_URL}/getMsrstnList",
                {
                    **common,
                    "addr": args.region_hint,
                    "stationName": args.station_name,
                },
            ),
            "fallback",
        )

    raise SystemExit("위도/경도 또는 region fallback 이 필요합니다.")


def fetch_station_payload(args: argparse.Namespace) -> dict:
    payload, _ = fetch_station_lookup(args)
    return payload


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
            f"주소: {report['station_address'] or '-'}",
            f"조회 시각: {report['measured_at']}",
            f"조회 방식: {report['lookup_mode']}",
            f"PM10: {report['pm10']['value']} ({report['pm10']['grade']})",
            f"PM2.5: {report['pm25']['value']} ({report['pm25']['grade']})",
            f"통합대기등급: {report['khai_grade']}",
        ],
    )


def command_report(args: argparse.Namespace) -> None:
    proxy_report = fetch_proxy_report(args)
    if proxy_report is not None:
        if args.json:
            print(json.dumps(proxy_report, ensure_ascii=False, indent=2))
            return

        print(render_text(proxy_report))
        return

    station_payload, lookup_mode = fetch_station_lookup(args)
    station_items = extract_items(station_payload)
    station = resolve_station(
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
        lookup_mode=lookup_mode,
        selected_station=station,
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
