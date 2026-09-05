#!/usr/bin/env python3
"""Deterministic nationwide RTMS CSV report for the real-estate-search skill."""

from __future__ import annotations

import argparse
import csv
import http.cookiejar
import io
import json
import statistics
import sys
import time
import urllib.parse
import urllib.request
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo


BASE_URL = "https://rt.molit.go.kr"
LANDING_URL = f"{BASE_URL}/pt/xls/xls.do"
SIDO_URL = f"{BASE_URL}/data/sido.do"
SGG_URL = f"{BASE_URL}/data/sgg.do"
COUNT_URL = f"{BASE_URL}/pt/xls/ptXlsDownDataCheck.do"
CSV_URL = f"{BASE_URL}/pt/xls/ptXlsCSVDown.do"
USER_AGENT = "k-skill-real-estate-search/1"
JSON_LIMIT = 2 * 1024 * 1024
CSV_LIMIT = 64 * 1024 * 1024


class ReportError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Region:
    province: str
    name: str
    lawd_cd: str

    @property
    def full_name(self) -> str:
        return self.province if self.province == self.name else f"{self.province} {self.name}"


@dataclass(frozen=True)
class Combo:
    asset_code: str
    deal_code: str
    asset: str
    deal: str
    short: str

    @property
    def key(self) -> str:
        return f"{self.asset_code}{self.deal_code}"


COMBINATIONS: Tuple[Combo, ...] = (
    Combo("A", "1", "아파트", "매매", "아매"),
    Combo("A", "2", "아파트", "전월세", "아임"),
    Combo("D", "1", "오피스텔", "매매", "오매"),
    Combo("D", "2", "오피스텔", "전월세", "오임"),
    Combo("B", "1", "연립다세대", "매매", "연매"),
    Combo("B", "2", "연립다세대", "전월세", "연임"),
    Combo("C", "1", "단독·다가구", "매매", "단매"),
    Combo("C", "2", "단독·다가구", "전월세", "단임"),
)


@dataclass
class ParsedData:
    region_counts: Dict[str, int] = field(default_factory=dict)
    prices: List[int] = field(default_factory=list)
    deposits: List[int] = field(default_factory=list)
    monthly_rents: List[int] = field(default_factory=list)
    cancelled: int = 0
    latest_month: Optional[str] = None


@dataclass
class ComboResult:
    combo: Combo
    status: str
    from_date: date
    to_date: date
    announced: int
    error: Optional[str] = None
    region_counts: Dict[str, int] = field(default_factory=dict)
    prices: List[int] = field(default_factory=list)
    deposits: List[int] = field(default_factory=list)
    monthly_rents: List[int] = field(default_factory=list)
    cancelled: int = 0
    latest_month: Optional[str] = None
    seconds: float = 0.0


def month_windows(as_of: date) -> List[Tuple[date, date]]:
    current_start = as_of.replace(day=1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end.replace(day=1)
    return [(current_start, as_of), (previous_start, previous_end)]


def _read_limited(response: object, limit: int) -> bytes:
    headers = getattr(response, "headers", None)
    content_length = headers.get("Content-Length") if headers else None
    if content_length:
        try:
            if int(content_length) > limit:
                raise ReportError("response_too_large", f"응답이 {limit:,}바이트 제한을 초과했습니다.")
        except ValueError as exc:
            raise ReportError("malformed_response", "Content-Length가 숫자가 아닙니다.") from exc
    body = response.read(limit + 1)  # type: ignore[attr-defined]
    if len(body) > limit:
        raise ReportError("response_too_large", f"응답이 {limit:,}바이트 제한을 초과했습니다.")
    return body


def _request_bytes(
    opener: urllib.request.OpenerDirector,
    url: str,
    payload: Optional[Dict[str, str]] = None,
    timeout: int = 30,
    limit: int = JSON_LIMIT,
) -> bytes:
    data = urllib.parse.urlencode(payload).encode("ascii") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": USER_AGENT, "Referer": LANDING_URL},
        method="POST" if data is not None else "GET",
    )
    try:
        with opener.open(request, timeout=timeout) as response:
            return _read_limited(response, limit)
    except HTTPError as exc:
        status = exc.code
        exc.close()
        raise ReportError("http_error", f"공식 RTMS가 HTTP {status}를 반환했습니다.") from exc
    except (URLError, TimeoutError) as exc:
        raise ReportError("network_error", "공식 RTMS에 연결하지 못했습니다.") from exc


def _json_object(raw: bytes) -> Dict[str, object]:
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReportError("malformed_response", "공식 RTMS JSON 응답을 해석할 수 없습니다.") from exc
    if not isinstance(value, dict):
        raise ReportError("malformed_response", "공식 RTMS JSON 응답이 객체가 아닙니다.")
    return value


def _json_list(raw: bytes) -> List[object]:
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReportError("malformed_response", "공식 RTMS JSON 응답을 해석할 수 없습니다.") from exc
    if not isinstance(value, list):
        raise ReportError("malformed_response", "공식 RTMS JSON 응답이 배열이 아닙니다.")
    return value


def _code_name(item: object, name_key: str, kind: str) -> Tuple[str, str]:
    if not isinstance(item, dict):
        raise ReportError("region_contract", f"{kind} 항목이 객체가 아닙니다.")
    code = str(item.get("signguCode", "")).strip()
    name = str(item.get(name_key, "")).strip()
    if len(code) != 5 or not code.isdigit() or not name:
        raise ReportError("region_contract", f"{kind} 코드 또는 이름이 올바르지 않습니다.")
    return code, name


def fetch_regions(opener: urllib.request.OpenerDirector) -> List[Region]:
    _request_bytes(opener, LANDING_URL, timeout=30, limit=JSON_LIMIT)
    sido_list = _json_list(_request_bytes(opener, SIDO_URL, {}, limit=JSON_LIMIT))
    if not 1 <= len(sido_list) <= 30:
        raise ReportError("region_contract", "시·도 목록 크기가 허용 범위를 벗어났습니다.")

    regions: List[Region] = []
    for raw_province in sido_list:
        province_code, province = _code_name(raw_province, "ctprvnNm", "시·도")
        sgg_list = _json_list(
            _request_bytes(opener, SGG_URL, {"signguCode": province_code[:2]}, limit=JSON_LIMIT)
        )
        if not 1 <= len(sgg_list) <= 100:
            raise ReportError("region_contract", f"{province} 시·군·구 목록 크기가 허용 범위를 벗어났습니다.")
        for raw_region in sgg_list:
            lawd_cd, name = _code_name(raw_region, "signguNm", "시·군·구")
            regions.append(Region(province, name, lawd_cd))

    if not 1 <= len(regions) <= 500:
        raise ReportError("region_contract", "전국 시·군·구 목록 크기가 허용 범위를 벗어났습니다.")
    if len({region.lawd_cd for region in regions}) != len(regions):
        raise ReportError("region_contract", "중복 법정동 코드가 있습니다.")
    if len({region.full_name for region in regions}) != len(regions):
        raise ReportError("region_contract", "중복 시·군·구 이름이 있습니다.")
    return regions


def _query_form(combo: Combo, from_date: date, to_date: date) -> Dict[str, str]:
    return {
        "srhThingNo": combo.asset_code,
        "srhDelngSecd": combo.deal_code,
        "srhAddrGbn": "1",
        "srhLfstsSecd": "1",
        "sidoNm": "전체",
        "sggNm": "전체",
        "emdNm": "전체",
        "loadNm": "전체",
        "areaNm": "전체",
        "hsmpNm": "전체",
        "mobileAt": "",
        "srhFromDt": from_date.isoformat(),
        "srhToDt": to_date.isoformat(),
        "srhNewRonSecd": "",
        "srhSidoCd": "",
        "srhSggCd": "",
        "srhEmdCd": "",
        "srhLoadCd": "",
        "srhHsmpCd": "",
        "srhRoadNm": "",
        "srhArea": "",
        "srhLrArea": "",
        "srhFromAmount": "",
        "srhToAmount": "",
    }


def fetch_count(opener: urllib.request.OpenerDirector, form: Dict[str, str]) -> int:
    payload = _json_object(_request_bytes(opener, COUNT_URL, form, timeout=60, limit=JSON_LIMIT))
    value = payload.get("cnt")
    try:
        count = int(str(value))
    except (TypeError, ValueError) as exc:
        raise ReportError("count_contract", "RTMS 건수가 정수가 아닙니다.") from exc
    if not 0 <= count <= 1_000_000:
        raise ReportError("count_contract", "RTMS 건수가 허용 범위를 벗어났습니다.")
    return count


def fetch_csv(opener: urllib.request.OpenerDirector, form: Dict[str, str]) -> bytes:
    return _request_bytes(opener, CSV_URL, form, timeout=180, limit=CSV_LIMIT)


def _amount(value: str, field_name: str) -> int:
    normalized = value.replace(",", "").replace(" ", "").strip()
    if not normalized or not normalized.isdigit():
        raise ReportError("csv_contract", f"{field_name} 값이 정수가 아닙니다.")
    return int(normalized)


def _region_code(location: str, lookup: Dict[str, str], max_words: int) -> str:
    words = location.split()
    for size in range(min(max_words, len(words)), 0, -1):
        code = lookup.get(" ".join(words[:size]))
        if code:
            return code
    raise ReportError("unmapped_region", "CSV 시군구를 공식 지역 목록에 매핑하지 못했습니다.")


def parse_csv(raw: bytes, announced: int, combo: Combo, regions: Sequence[Region]) -> ParsedData:
    try:
        text = raw.decode("cp949")
    except UnicodeDecodeError as exc:
        raise ReportError("csv_contract", "RTMS CSV가 CP949 형식이 아닙니다.") from exc

    reader = csv.reader(io.StringIO(text, newline=""))
    header: Optional[List[str]] = None
    data = ParsedData()
    lookup = {region.full_name: region.lawd_cd for region in regions}
    max_words = max(len(name.split()) for name in lookup)
    observed = 0

    for raw_row in reader:
        if header is None:
            if raw_row and raw_row[0].lstrip("\ufeff").strip() == "NO":
                header = [cell.strip() for cell in raw_row]
                header[0] = header[0].lstrip("\ufeff")
            continue
        if not raw_row or not any(cell.strip() for cell in raw_row):
            continue
        if len(raw_row) != len(header):
            raise ReportError("csv_contract", "RTMS CSV 행의 열 수가 헤더와 다릅니다.")
        row = dict(zip(header, (cell.strip() for cell in raw_row)))
        observed += 1
        if not row.get("NO", "").isdigit():
            raise ReportError("csv_contract", "RTMS CSV NO 값이 정수가 아닙니다.")
        for field_name in ("시군구", "계약년월", "계약일"):
            if field_name not in row or not row[field_name]:
                raise ReportError("csv_contract", f"RTMS CSV의 {field_name} 값이 없습니다.")
        month = row["계약년월"]
        if len(month) != 6 or not month.isdigit():
            raise ReportError("csv_contract", "계약년월 형식이 YYYYMM이 아닙니다.")
        code = _region_code(row["시군구"], lookup, max_words)
        data.region_counts[code] = data.region_counts.get(code, 0) + 1
        data.latest_month = max(data.latest_month or month, month)

        if combo.deal_code == "1":
            if "거래금액(만원)" not in row or "해제사유발생일" not in row:
                raise ReportError("csv_contract", "매매 CSV 가격 또는 해제 필드가 없습니다.")
            if row["해제사유발생일"] not in ("", "-"):
                data.cancelled += 1
            else:
                data.prices.append(_amount(row["거래금액(만원)"], "거래금액"))
        else:
            for field_name in ("보증금(만원)", "월세금(만원)"):
                if field_name not in row:
                    raise ReportError("csv_contract", f"전월세 CSV의 {field_name} 필드가 없습니다.")
            data.deposits.append(_amount(row["보증금(만원)"], "보증금"))
            data.monthly_rents.append(_amount(row["월세금(만원)"], "월세금"))

    if header is None:
        raise ReportError("csv_contract", "RTMS CSV 헤더를 찾지 못했습니다.")
    if observed != announced:
        raise ReportError("count_mismatch", f"사전 건수 {announced:,}건과 CSV {observed:,}건이 다릅니다.")
    return data


def fetch_combo(
    opener: urllib.request.OpenerDirector,
    combo: Combo,
    as_of: date,
    regions: Sequence[Region],
) -> ComboResult:
    started = time.monotonic()
    last_from, last_to = month_windows(as_of)[-1]
    for from_date, to_date in month_windows(as_of):
        last_from, last_to = from_date, to_date
        try:
            form = _query_form(combo, from_date, to_date)
            announced = fetch_count(opener, form)
            if announced == 0:
                continue
            parsed = parse_csv(fetch_csv(opener, form), announced, combo, regions)
            return ComboResult(
                combo,
                "success",
                from_date,
                to_date,
                announced,
                region_counts=parsed.region_counts,
                prices=parsed.prices,
                deposits=parsed.deposits,
                monthly_rents=parsed.monthly_rents,
                cancelled=parsed.cancelled,
                latest_month=parsed.latest_month,
                seconds=time.monotonic() - started,
            )
        except ReportError as exc:
            return ComboResult(
                combo,
                "failure",
                from_date,
                to_date,
                0,
                error=f"{exc.code}: {exc.message}",
                seconds=time.monotonic() - started,
            )
    return ComboResult(
        combo,
        "empty",
        last_from,
        last_to,
        0,
        seconds=time.monotonic() - started,
    )


def summarize_cells(regions: Sequence[Region], results: Sequence[ComboResult]) -> Dict[str, int]:
    by_key = {result.combo.key: result for result in results}
    summary = {"total": len(regions) * len(COMBINATIONS), "success": 0, "empty": 0, "failure": 0, "unexecuted": 0}
    for combo in COMBINATIONS:
        result = by_key.get(combo.key)
        if result is None:
            summary["unexecuted"] += len(regions)
        elif result.status == "failure":
            summary["failure"] += len(regions)
        elif result.status == "empty":
            summary["empty"] += len(regions)
        else:
            populated = sum(result.region_counts.get(region.lawd_cd, 0) > 0 for region in regions)
            summary["success"] += populated
            summary["empty"] += len(regions) - populated
    return summary


def _number(value: float) -> str:
    return f"{int(value):,}" if float(value).is_integer() else f"{value:,.1f}"


def _money(value: float) -> str:
    raw = f"{_number(value)}만원"
    if value < 10_000:
        return raw
    eok = int(value // 10_000)
    remainder = value - eok * 10_000
    human = f"{eok}억" + (f" {_number(remainder)}만원" if remainder else "원")
    return f"{raw}({human})"


def _range(values: Sequence[int]) -> str:
    if not values:
        return "유효 가격 없음"
    return f"중위 {_money(statistics.median(values))} · 최저 {_money(min(values))} · 최고 {_money(max(values))}"


def _month(value: Optional[str]) -> str:
    return f"{value[:4]}-{value[4:]}" if value else "응답 거래월 없음"


def render_report(as_of: date, regions: Sequence[Region], results: Sequence[ComboResult], seconds: float) -> str:
    summary = summarize_cells(regions, results)
    by_key = {result.combo.key: result for result in results}
    raw_rows = sum(result.announced for result in results if result.status == "success")
    cancelled = sum(result.cancelled for result in results if result.status == "success")
    lines = [
        "*전국 실거래가·전월세 일일 보고*",
        "",
        "*핵심 결과*",
        f"• 조회 기준(KST): {as_of.isoformat()}",
        f"• 대상 시·군·구: {len(regions):,}개 (공식 지역목록 응답)",
        f"• 대상: 4개 자산 × 매매·전월세 = 8개 전국 일괄 조회 / {summary['total']:,}개 지역 조합",
        f"• 성공 조합: {summary['success']:,} · 빈 결과: {summary['empty']:,} · 실패: {summary['failure']:,} · 미실행: {summary['unexecuted']:,}",
        f"• 원문 행: {raw_rows:,}건 · 해제 표시: {cancelled:,}건 · 실행: {seconds:.1f}초",
        "",
        "*상세 결과*",
    ]

    for combo in COMBINATIONS:
        result = by_key.get(combo.key)
        label = f"{combo.asset}/{combo.deal}"
        if result is None:
            lines.append(f"• {label}: 미실행")
        elif result.status == "failure":
            lines.append(f"• {label}: 실패 · {result.error}")
        elif result.status == "empty":
            lines.append(f"• {label}: 빈 결과 · {result.from_date.isoformat()}~{result.to_date.isoformat()}")
        else:
            populated = sum(result.region_counts.get(region.lawd_cd, 0) > 0 for region in regions)
            basis = f"{result.from_date.isoformat()}~{result.to_date.isoformat()} · 최신 거래월 {_month(result.latest_month)}"
            if combo.deal_code == "1":
                prices = _range(result.prices)
                extra = f" · 해제 {result.cancelled:,}건" if result.cancelled else ""
            else:
                prices = f"보증금 {_range(result.deposits)} / 월세 {_range(result.monthly_rents)}"
                extra = ""
            lines.append(
                f"• {label}: {result.announced:,}건 · 거래 있음 {populated:,}/{len(regions):,}개 지역 · {basis} · {prices}{extra}"
            )

    lines.extend(["", "*지역별 건수*", "• 범례(순서): " + "/".join(combo.short for combo in COMBINATIONS) + " · 단위 건"])
    current_province: Optional[str] = None
    for region in regions:
        if region.province != current_province:
            current_province = region.province
            lines.append(f"• *{current_province}*")
        values: List[str] = []
        for combo in COMBINATIONS:
            result = by_key.get(combo.key)
            if result is None:
                values.append("미실행")
            elif result.status == "failure":
                values.append("실패")
            else:
                values.append(str(result.region_counts.get(region.lawd_cd, 0)))
        lines.append(f"  ◦ {region.lawd_cd} {region.name}: {'/'.join(values)}")

    failures = [result for result in results if result.status == "failure"]
    if failures:
        lines.extend(["", "*실패 범위*"])
        for result in failures:
            lines.append(f"• {result.combo.asset}/{result.combo.deal}: 전국 {len(regions):,}개 지역 · {result.error}")

    lines.extend(
        [
            "",
            "*Source 근거*",
            f"• <{LANDING_URL}|국토교통부 실거래가 자료제공>",
            "• 공식 화면이 반환한 시·도/시·군·구 목록과 전국 CSV 응답만 집계했습니다.",
            "",
            "*GPT 해석*",
            "• 없음 — 원문 응답을 결정적으로 집계했습니다.",
            "",
            "*한계*",
            "• 계약일 기준 신고 자료이며 당일에도 추가·정정·해제될 수 있습니다. 공식 통계와는 집계 기준이 다릅니다.",
            "• 지역 건수는 원문 행 기준이고, 매매 가격 통계에서는 해제 표시 행을 제외했습니다.",
            "• 직전 성공 결과를 저장하지 않으므로 전일 비교는 `비교 기준 없음`입니다.",
        ]
    )
    return "\n".join(lines)


def _fatal_report(as_of: date, error: ReportError) -> str:
    return "\n".join(
        [
            "*전국 실거래가·전월세 일일 보고*",
            "",
            "*핵심 결과*",
            f"• 조회 기준(KST): {as_of.isoformat()}",
            "• 상태: 실패",
            "• 대상 시·군·구/성공/빈 결과/실패/미실행: 공식 지역목록을 확보하지 못해 산정하지 않음",
            f"• 오류: {error.code} · {error.message}",
            "",
            "*Source 근거*",
            f"• <{LANDING_URL}|국토교통부 실거래가 자료제공>",
            "",
            "*GPT 해석*",
            "• 없음 — 실패를 추정값으로 대체하지 않았습니다.",
        ]
    )


def run(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="공식 RTMS 전국 실거래가·전월세 일일 보고")
    parser.add_argument("--as-of", type=date.fromisoformat, help="조회 기준일 YYYY-MM-DD (기본: KST 오늘)")
    args = parser.parse_args(argv)
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    as_of = args.as_of or today
    if as_of > today:
        parser.error("--as-of는 KST 오늘 이후일 수 없습니다.")

    started = time.monotonic()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    try:
        regions = fetch_regions(opener)
    except ReportError as exc:
        print(_fatal_report(as_of, exc))
        return 1

    results = [fetch_combo(opener, combo, as_of, regions) for combo in COMBINATIONS]
    print(render_report(as_of, regions, results, time.monotonic() - started))
    return int(any(result.status == "failure" for result in results))


if __name__ == "__main__":
    sys.exit(run())
