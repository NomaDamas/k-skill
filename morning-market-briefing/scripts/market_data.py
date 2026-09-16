#!/usr/bin/env python3
"""모닝 마켓 브리핑용 공개 시장 데이터 helper.

미국 재무부 공식 일별 par yield curve CSV와 FRED 공개 CSV만 사용한다.
API 키·프록시·로그인이 필요 없으므로 사용자 머신에서 직접 호출한다.

핵심 원칙:
- 관측일(observation date)을 항상 함께 보고한다. 목표 세션보다 오래된 값은 stale로 표시한다.
- 결측은 보간하지 않는다. 없는 값은 None으로 남긴다.
- bp 변화는 원자료로 계산한다. 반올림된 표시값으로 다시 계산하지 않는다.
"""

import argparse
import csv
import io
import json
import re
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import date, datetime, timezone

DEFAULT_TIMEOUT = 30
FETCH_ATTEMPTS = 2
TIMEOUT_HINT = (
    "네트워크가 느리거나 차단된 환경일 수 있습니다. --timeout을 늘리거나, "
    "확보 실패로 처리하고 해당 자산군을 본문에서 빼세요."
)
USER_AGENT = "morning-market-briefing/1.0 (+https://github.com/NomaDamas/k-skill)"

TREASURY_URL = (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    "daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve"
    "&field_tdr_date_value={year}&page&_format=csv"
)
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={ids}"

TREASURY_COLUMNS = (("2 Yr", "y2"), ("10 Yr", "y10"), ("30 Yr", "y30"))
CURVE_EPSILON_BP = 0.05


class DataError(Exception):
    """수집·파싱 실패. code/message/source를 오류 봉투에 담는다."""

    def __init__(self, code, message, source):
        super().__init__(message)
        self.code = code
        self.message = message
        self.source = source


# --------------------------------------------------------------------------
# 네트워크
# --------------------------------------------------------------------------


def fetch_bytes(url, timeout=DEFAULT_TIMEOUT):
    """URL 바이트를 가져온다. 테스트는 이 함수를 대체한다."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_with_retry(url, source, timeout=DEFAULT_TIMEOUT, attempts=FETCH_ATTEMPTS):
    last_error = None
    for _ in range(max(1, attempts)):
        try:
            return fetch_bytes(url, timeout)
        except urllib.error.HTTPError as error:
            last_error = DataError(
                "HTTP", "HTTP {} 응답을 받았습니다: {}".format(error.code, url), source
            )
        except urllib.error.URLError as error:
            if "timed out" in str(error.reason).lower():
                last_error = DataError("TIMEOUT", _timeout_message(url, error.reason), source)
            else:
                last_error = DataError("HTTP", "{}: {}".format(url, error.reason), source)
        except TimeoutError as error:
            last_error = DataError("TIMEOUT", _timeout_message(url, error), source)
        except OSError as error:
            last_error = DataError("HTTP", "{}: {}".format(url, error), source)
    raise last_error


def _timeout_message(url, detail):
    return "{}: {} {}".format(url, detail, TIMEOUT_HINT)


# --------------------------------------------------------------------------
# 파싱
# --------------------------------------------------------------------------


def _parse_us_date(raw):
    """MM/DD/YYYY -> YYYY-MM-DD."""
    return datetime.strptime(raw.strip(), "%m/%d/%Y").date().isoformat()


def _parse_iso(raw):
    return date.fromisoformat(raw.strip())


def _to_float(raw):
    cell = raw.strip()
    if not cell or cell in {".", "N/A", "NA", "null"}:
        return None
    try:
        return float(cell.replace(",", ""))
    except ValueError:
        return None


def parse_treasury_csv(text):
    """재무부 CSV 텍스트 -> 날짜 오름차순 레코드 목록."""
    reader = csv.reader(io.StringIO(text))
    try:
        header = [column.strip() for column in next(reader)]
    except StopIteration:
        raise DataError("PARSE", "재무부 CSV가 비어 있습니다", "us-treasury")

    index = {name: position for position, name in enumerate(header)}
    if "Date" not in index:
        raise DataError("PARSE", "재무부 CSV에 Date 컬럼이 없습니다", "us-treasury")
    for column, _key in TREASURY_COLUMNS:
        if column not in index:
            raise DataError(
                "PARSE", "재무부 CSV에 '{}' 컬럼이 없습니다".format(column), "us-treasury"
            )

    records = []
    for row in reader:
        if not row:
            continue
        raw_date = row[index["Date"]] if index["Date"] < len(row) else ""
        if not raw_date.strip():
            continue
        try:
            iso_date = _parse_us_date(raw_date)
        except ValueError:
            continue
        record = {"date": iso_date}
        for column, key in TREASURY_COLUMNS:
            position = index[column]
            record[key] = _to_float(row[position]) if position < len(row) else None
        records.append(record)

    if not records:
        raise DataError("EMPTY", "재무부 CSV에서 유효한 행을 찾지 못했습니다", "us-treasury")
    records.sort(key=lambda item: item["date"])
    return records


def extract_fred_payloads(raw):
    """FRED 응답에서 CSV 텍스트 목록을 꺼낸다.

    FRED가 ZIP으로 응답하면 시리즈가 여러 CSV로 쪼개져 있으므로 전부 돌려준다.
    하나만 고르면 나머지 시리즈가 조용히 사라진다.
    """
    if not raw.startswith(b"PK\x03\x04"):
        return [("<plain>", raw.decode("utf-8", errors="replace"))], False
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            payloads = []
            for name in sorted(archive.namelist()):
                if not name.lower().endswith(".csv"):
                    continue
                payloads.append((name, archive.read(name).decode("utf-8", errors="replace")))
    except zipfile.BadZipFile:
        raise DataError("PARSE", "FRED ZIP 응답을 해석하지 못했습니다", "fred")
    if not payloads:
        raise DataError("PARSE", "FRED ZIP 응답에 CSV가 없습니다", "fred")
    return payloads, True


def merge_fred_tables(tables):
    """FRED가 시리즈별 CSV로 쪼개 응답한 경우 날짜 기준으로 병합한다."""
    ordered_ids = []
    buckets = {}
    for ids, rows in tables:
        for series_id in ids:
            if series_id not in ordered_ids:
                ordered_ids.append(series_id)
        for row in rows:
            bucket = buckets.setdefault(row["date"], {})
            for series_id, value in row["values"].items():
                if value is not None or series_id not in bucket:
                    bucket[series_id] = value
    merged = [
        {
            "date": day,
            "values": {series_id: buckets[day].get(series_id) for series_id in ordered_ids},
        }
        for day in sorted(buckets)
    ]
    return ordered_ids, merged


def parse_fred_csv(text):
    """FRED CSV 텍스트 -> (series ids, 날짜 오름차순 rows)."""
    reader = csv.reader(io.StringIO(text))
    try:
        header = [column.strip() for column in next(reader)]
    except StopIteration:
        raise DataError("PARSE", "FRED CSV가 비어 있습니다", "fred")

    if not header or header[0] != "observation_date" or len(header) < 2:
        raise DataError(
            "PARSE", "FRED CSV 헤더가 observation_date로 시작하지 않습니다", "fred"
        )

    ids = header[1:]
    rows = []
    for row in reader:
        if not row or not row[0].strip():
            continue
        raw_date = row[0].strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", raw_date):
            continue
        values = {}
        for position, series_id in enumerate(ids):
            cell = row[position + 1] if position + 1 < len(row) else ""
            values[series_id] = _to_float(cell)
        rows.append({"date": raw_date, "values": values})

    if not rows:
        raise DataError("EMPTY", "FRED CSV에서 유효한 행을 찾지 못했습니다", "fred")
    rows.sort(key=lambda item: item["date"])
    return ids, rows


# --------------------------------------------------------------------------
# 계산
# --------------------------------------------------------------------------


def classify_curve(delta_2y_bp, delta_10y_bp):
    """2Y·10Y bp 변화로 curve를 판정한다."""
    if delta_2y_bp is None or delta_10y_bp is None:
        return None, None

    if abs(delta_2y_bp) < CURVE_EPSILON_BP and abs(delta_10y_bp) < CURVE_EPSILON_BP:
        return "flat", "Flat"
    if abs(delta_2y_bp - delta_10y_bp) < CURVE_EPSILON_BP:
        return "flat", "Flat"
    if delta_2y_bp > 0 and delta_10y_bp > 0:
        if delta_2y_bp > delta_10y_bp:
            return "bear_flattening", "Bear Flattening"
        return "bear_steepening", "Bear Steepening"
    if delta_2y_bp < 0 and delta_10y_bp < 0:
        if abs(delta_2y_bp) > abs(delta_10y_bp):
            return "bull_steepening", "Bull Steepening"
        return "bull_flattening", "Bull Flattening"
    return "mixed", "Mixed"


def compute_yield_rows(records):
    """원자료 레코드에 spread·bp 변화·curve 판정을 붙인다."""
    rows = []
    previous = None
    for record in records:
        y2 = record.get("y2")
        y10 = record.get("y10")
        row = {
            "date": record["date"],
            "y2": _round(y2, 3),
            "y10": _round(y10, 3),
            "y30": _round(record.get("y30"), 3),
        }

        if y2 is not None and y10 is not None:
            row["spread_2s10s_bp"] = _round((y10 - y2) * 100, 1)
        else:
            row["spread_2s10s_bp"] = None

        previous_y2 = previous.get("y2") if previous else None
        previous_y10 = previous.get("y10") if previous else None
        if None not in (y2, y10, previous_y2, previous_y10):
            delta_2y = (y2 - previous_y2) * 100
            delta_10y = (y10 - previous_y10) * 100
            curve, label = classify_curve(delta_2y, delta_10y)
            row["d_y2_bp"] = _round(delta_2y, 1)
            row["d_y10_bp"] = _round(delta_10y, 1)
            row["d_spread_2s10s_bp"] = _round(delta_10y - delta_2y, 1)
            row["curve"] = curve
            row["curve_label"] = label
        else:
            row["d_y2_bp"] = None
            row["d_y10_bp"] = None
            row["d_spread_2s10s_bp"] = None
            row["curve"] = None
            row["curve_label"] = None

        rows.append(row)
        previous = record
    return rows


def assess_staleness(latest_date, session):
    """관측일이 목표 세션보다 이전이면 (True, 지연일수)."""
    if not latest_date or not session:
        return False, 0
    try:
        lag = (_parse_iso(session) - _parse_iso(latest_date)).days
    except ValueError:
        return False, 0
    if lag > 0:
        return True, lag
    return False, 0


def trim_rows(rows, start=None, end=None, last=None):
    selected = rows
    if start:
        selected = [row for row in selected if row["date"] >= start]
    if end:
        selected = [row for row in selected if row["date"] <= end]
    if last is not None and last > 0:
        selected = selected[-last:]
    return selected


def summarize_series(rows, series_id, session):
    latest_date = None
    latest_value = None
    for row in rows:
        value = row["values"].get(series_id)
        if value is not None:
            latest_date = row["date"]
            latest_value = value
    stale, lag_days = assess_staleness(latest_date, session)
    return {
        "id": series_id,
        "latest_date": latest_date,
        "latest_value": _round(latest_value, 4),
        "stale": stale,
        "lag_days": lag_days,
    }


def _round(value, digits):
    return None if value is None else round(value, digits)


def _now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------
# 출력
# --------------------------------------------------------------------------


def render_yields_text(envelope):
    lines = ["미 국채 par yield curve (출처: U.S. Department of the Treasury)", ""]
    if envelope["session"]:
        lines.append("목표 세션: {}".format(envelope["session"]))
        lines.append("")
    lines.append("날짜         2Y      10Y     30Y     2s10s(bp)  Δ2Y    Δ10Y   Δ2s10s  curve")
    for row in envelope["rows"]:
        lines.append(
            "{date}  {y2:>6}  {y10:>6}  {y30:>6}  {spread:>9}  {d2:>6}  {d10:>6}  {ds:>7}  {curve}".format(
                date=row["date"],
                y2=_fmt(row["y2"], 3),
                y10=_fmt(row["y10"], 3),
                y30=_fmt(row["y30"], 3),
                spread=_fmt(row["spread_2s10s_bp"], 1),
                d2=_fmt(row["d_y2_bp"], 1),
                d10=_fmt(row["d_y10_bp"], 1),
                ds=_fmt(row["d_spread_2s10s_bp"], 1),
                curve=row["curve_label"] or "-",
            )
        )
    _append_warnings(lines, envelope["warnings"])
    return "\n".join(lines)


def render_series_text(envelope):
    lines = ["FRED 공개 시계열 (출처: Federal Reserve Bank of St. Louis)", ""]
    if envelope["session"]:
        lines.append("목표 세션: {}".format(envelope["session"]))
        lines.append("")
    lines.append("시리즈        최신 관측일    최신값        신선도")
    for item in envelope["series"]:
        freshness = "OK" if not item["stale"] else "STALE ({}일 지연)".format(item["lag_days"])
        lines.append(
            "{id:<12}  {date:<12}  {value:>12}  {freshness}".format(
                id=item["id"],
                date=item["latest_date"] or "-",
                value=_fmt(item["latest_value"], 4),
                freshness=freshness,
            )
        )
    lines.append("")
    lines.append("날짜        " + "  ".join("{:>12}".format(item["id"]) for item in envelope["series"]))
    for row in envelope["rows"]:
        cells = "  ".join(
            "{:>12}".format(_fmt(row["values"].get(item["id"]), 4)) for item in envelope["series"]
        )
        lines.append("{}  {}".format(row["date"], cells))
    _append_warnings(lines, envelope["warnings"])
    return "\n".join(lines)


def _fmt(value, digits):
    return "-" if value is None else ("{:." + str(digits) + "f}").format(value)


def _append_warnings(lines, warnings):
    if warnings:
        lines.append("")
        lines.append("경고:")
        for warning in warnings:
            lines.append("- {}".format(warning))


def emit(envelope, as_text, text_renderer):
    if as_text:
        print(text_renderer(envelope))
    else:
        print(json.dumps(envelope, ensure_ascii=False, indent=2))


# --------------------------------------------------------------------------
# 커맨드
# --------------------------------------------------------------------------


def build_yields_envelope(args):
    year = args.year or date.today().year
    url = TREASURY_URL.format(year=year)
    raw = fetch_with_retry(url, "us-treasury", timeout=args.timeout)
    records = parse_treasury_csv(raw.decode("utf-8", errors="replace"))
    rows = compute_yield_rows(records)
    warnings = []
    if args.session:
        latest = rows[-1]["date"]
        stale, lag_days = assess_staleness(latest, args.session)
        if stale:
            warnings.append(
                "최신 관측일 {}이(가) 목표 세션 {}보다 {}일 이전입니다. 이 값을 해당 세션 값으로 쓰지 마세요.".format(
                    latest, args.session, lag_days
                )
            )
    trimmed = trim_rows(rows, start=args.start, end=args.end, last=args.last)
    if not trimmed:
        raise DataError("EMPTY", "지정한 기간에 해당하는 금리 관측치가 없습니다", "us-treasury")
    return {
        "ok": True,
        "command": "yields",
        "session": args.session,
        "source": {"name": "us-treasury", "url": url, "fetched_at": _now_utc()},
        "rows": trimmed,
        "series": [],
        "warnings": warnings,
    }


def build_series_envelope(args):
    ids = [item.strip() for item in args.ids.split(",") if item.strip()]
    if not ids:
        raise DataError("USAGE", "--ids에 시리즈 ID를 하나 이상 지정해야 합니다", "fred")

    url = FRED_URL.format(ids=",".join(ids))
    raw = fetch_with_retry(url, "fred", timeout=args.timeout)
    payloads, was_zipped = extract_fred_payloads(raw)
    parsed_ids, rows = merge_fred_tables([parse_fred_csv(text) for _name, text in payloads])

    warnings = []
    if was_zipped:
        warnings.append(
            "FRED 응답이 ZIP이어서 내부 CSV {}개를 병합했습니다.".format(len(payloads))
        )
    missing = [series_id for series_id in ids if series_id not in parsed_ids]
    if missing:
        warnings.append(
            "요청한 시리즈 {}가 응답에 없습니다. 해당 시리즈는 본문에 쓰지 마세요.".format(
                ", ".join(missing)
            )
        )
    if len(rows) > 200:
        warnings.append(
            "FRED CSV endpoint는 기간 파라미터를 무시하고 전체 이력을 반환합니다. helper가 {}개 행에서 클라이언트 절단을 수행했습니다.".format(
                len(rows)
            )
        )

    series = [summarize_series(rows, series_id, args.session) for series_id in parsed_ids]
    for item in series:
        if item["stale"]:
            warnings.append(
                "{} 최신 관측일 {}이(가) 목표 세션 {}보다 {}일 이전입니다. 이 값을 해당 세션 값으로 쓰지 마세요.".format(
                    item["id"], item["latest_date"], args.session, item["lag_days"]
                )
            )

    trimmed = trim_rows(rows, start=args.start, end=args.end, last=args.last)
    if not trimmed:
        raise DataError("EMPTY", "지정한 기간에 해당하는 FRED 관측치가 없습니다", "fred")
    return {
        "ok": True,
        "command": "series",
        "session": args.session,
        "source": {"name": "fred", "url": url, "fetched_at": _now_utc()},
        "rows": trimmed,
        "series": series,
        "warnings": warnings,
    }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def build_parser():
    parser = argparse.ArgumentParser(
        prog="market_data.py",
        description="모닝 마켓 브리핑용 공개 시장 데이터 helper (미국 재무부·FRED)",
    )
    subparsers = parser.add_subparsers(dest="command")

    yields_parser = subparsers.add_parser("yields", help="미국 재무부 일별 par yield curve")
    yields_parser.add_argument("--year", type=int, default=None, help="조회 연도 (기본: 올해)")
    _add_common_arguments(yields_parser)

    series_parser = subparsers.add_parser("series", help="FRED 공개 시계열")
    series_parser.add_argument("--ids", required=True, help="쉼표로 구분한 FRED 시리즈 ID")
    _add_common_arguments(series_parser)

    return parser


def _add_common_arguments(parser):
    parser.add_argument("--last", type=int, default=None, help="마지막 N개 관측치만")
    parser.add_argument("--start", default=None, help="시작일 YYYY-MM-DD")
    parser.add_argument("--end", default=None, help="종료일 YYYY-MM-DD")
    parser.add_argument("--session", default=None, help="목표 세션 날짜 YYYY-MM-DD")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT, help="HTTP 타임아웃(초)")
    parser.add_argument("--text", action="store_true", help="JSON 대신 사람이 읽는 표")


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 2

    try:
        if args.command == "yields":
            envelope = build_yields_envelope(args)
            emit(envelope, args.text, render_yields_text)
        else:
            envelope = build_series_envelope(args)
            emit(envelope, args.text, render_series_text)
    except DataError as error:
        if getattr(args, "text", False):
            print("오류[{}] {}: {}".format(error.source, error.code, error.message), file=sys.stderr)
        else:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": {
                            "code": error.code,
                            "message": error.message,
                            "source": error.source,
                        },
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                file=sys.stderr,
            )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
