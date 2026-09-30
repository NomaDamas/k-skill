#!/usr/bin/env python3
"""Normalize and search user-exported SEIBro bond data using stdlib only."""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import re
import sys
from decimal import Decimal, InvalidOperation
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit

SEIBRO_URL = "https://seibro.or.kr/websquare/control.jsp?w2xPath=/IPORTAL/user/bond/BIP_CNTS02001V.xml&menuNo=285"
OUTPUT_FORMAT = "chat"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


class InputError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        payload = {"schema_version": "1.0", "result": "input_failure", "message": message}
        if "--format" in sys.argv and "json" in sys.argv:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"조회 조건을 확인해 주세요.\n\n- {message}")
        raise SystemExit(2)


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "table":
            self._table = []
        elif tag.lower() == "tr" and self._table is not None:
            self._row = []
        elif tag.lower() in {"th", "td"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"th", "td"} and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag.lower() == "tr" and self._row is not None and self._table is not None:
            if any(self._row):
                self._table.append(self._row)
            self._row = None
        elif tag.lower() == "table" and self._table is not None:
            if self._table:
                self.tables.append(self._table)
            self._table = None


ALIASES: dict[str, tuple[str, ...]] = {
    "isin": ("isin", "종목코드", "표준코드"),
    "name": ("종목명", "채권명", "name"),
    "issuer": ("발행자", "발행사", "발행기관", "issuer"),
    "bond_type": ("채권분류", "채권유형", "bondtype"),
    "currency": ("발행통화", "통화", "currency"),
    "issue_date": ("발행일", "issuedate"),
    "maturity_date": ("만기일", "상환일", "maturitydate"),
    "coupon_rate_pct": ("표면금리", "이율", "쿠폰금리", "couponrate"),
    "coupon_type": ("이자지급방식", "금리유형", "coupon_type"),
    "issue_amount_krw": ("발행금액", "발행액", "issueamount"),
    "outstanding_amount_krw": ("발행잔액", "잔액", "outstandingamount"),
    "offering_type": ("공모/사모", "공모사모", "모집방법", "offeringtype"),
    "seniority": ("선후순위", "변제순위", "seniority"),
    "guarantee": ("보증/무보증", "보증무보증", "보증구분", "guarantee"),
    "listed": ("상장여부", "상장일", "listed"),
    "option_schedule": ("옵션일정", "call/put일정", "callput일정", "optionschedule"),
    "option": ("옵션", "option"),
    "equity_linked": ("주식관련여부", "주식관련", "equitylinked"),
}


def key_text(value: Any) -> str:
    return re.sub(r"[\s_()\[\]{}·:/%-]+", "", str(value or "")).casefold()


def entry_for(row: dict[str, Any], canonical: str) -> tuple[str | None, Any]:
    aliases = tuple(key_text(alias) for alias in ALIASES[canonical])
    matches = [
        (key, value) for key, value in row.items()
        if value not in ("", None)
        and (key_text(key) in aliases or (
            canonical in {"issue_amount_krw", "outstanding_amount_krw"}
            and any(key_text(key).startswith(alias) for alias in aliases)
        ))
    ]
    if not matches:
        return None, None

    def comparable(key: str, value: Any) -> Any:
        if canonical in {"issue_amount_krw", "outstanding_amount_krw"}:
            parsed = parse_money(value, key)
        elif canonical == "coupon_rate_pct":
            parsed = parse_rate(value)
        elif canonical in {"issue_date", "maturity_date"}:
            parsed = parse_date(value)
        elif canonical == "currency":
            parsed = parse_currency(value)
        elif canonical == "listed":
            parsed = parse_bool(value)
            if parsed is None and parse_date(value) is not None:
                parsed = True
        else:
            parsed = key_text(value)
        return ("parsed", parsed) if parsed is not None else ("raw", key_text(value))

    if len({comparable(key, value) for key, value in matches}) > 1:
        field_names = {
            "isin": "ISIN", "name": "종목명", "issuer": "발행사",
            "coupon_rate_pct": "표면금리", "issue_date": "발행일", "maturity_date": "만기일",
            "issue_amount_krw": "발행금액", "outstanding_amount_krw": "발행잔액",
        }
        raise InputError("parse_failure", f"원천의 {field_names.get(canonical, canonical)} 별칭 필드에 서로 다른 값이 있습니다")

    for alias in aliases:
        match = next(((key, value) for key, value in matches if key_text(key) == alias), None)
        if match:
            return match
    return matches[0]


def value_for(row: dict[str, Any], canonical: str) -> Any:
    return entry_for(row, canonical)[1]


def parse_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y%m%d"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return number if math.isfinite(number) else None
    text = str(value or "").strip()
    if not re.fullmatch(r"[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", text):
        return None
    try:
        number = float(text.replace(",", ""))
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def parse_rate(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return parse_number(value)
    text = str(value or "").strip()
    match = re.fullmatch(r"([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%|bps?)?", text, re.I)
    if not match:
        return None
    number = parse_number(match.group(1))
    if number is None:
        return None
    return number / 100.0 if match.group(2) and match.group(2).casefold().startswith("bp") else number


def parse_money(value: Any, header: str | None = None) -> int | None:
    units = (
        ("조원", 1_000_000_000_000), ("조", 1_000_000_000_000),
        ("천억원", 100_000_000_000), ("백억원", 10_000_000_000),
        ("십억원", 1_000_000_000), ("억원", 100_000_000), ("억", 100_000_000),
        ("천만원", 10_000_000), ("백만원", 1_000_000), ("십만원", 100_000),
        ("만원", 10_000), ("만", 10_000), ("천원", 1_000), ("천", 1_000),
        ("백원", 100), ("백", 100), ("십원", 10), ("십", 10), ("원", 1),
    )

    def decimal_value(text: str) -> Decimal | None:
        cleaned = text.strip().replace(",", "")
        if not re.fullmatch(r"[+-]?(?:\d+)(?:\.\d+)?", cleaned):
            return None
        try:
            result = Decimal(cleaned)
        except InvalidOperation:
            return None
        return result if result.is_finite() else None

    def exact_won(amount: Decimal) -> int | None:
        if amount < 0 or amount != amount.to_integral_value():
            return None
        return int(amount)

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            amount = Decimal(str(value))
        except InvalidOperation:
            return None
        if not amount.is_finite():
            return None
        normalized_header = key_text(header or "")
        multiplier = next((factor for unit, factor in units if key_text(unit) in normalized_header), 1)
        return exact_won(amount * multiplier)
    else:
        raw_text = str(value or "").strip()

    # Support compound Korean amounts such as "1억 5천만원" without
    # silently taking only the first number from arbitrary text.
    component = re.compile(
        r"\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*("
        + "|".join(re.escape(unit) for unit, _ in units)
        + r")"
    )
    position = 0
    total = Decimal(0)
    found_unit = False
    while position < len(raw_text):
        match = component.match(raw_text, position)
        if not match:
            break
        amount = decimal_value(match.group(1))
        multiplier = dict(units)[match.group(2)]
        if amount is None:
            return None
        total += amount * multiplier
        position = match.end()
        found_unit = True
    if found_unit:
        return exact_won(total) if not raw_text[position:].strip() else None

    amount = decimal_value(raw_text)
    if amount is None:
        return None
    normalized_header = key_text(header or "")
    multiplier = next((factor for unit, factor in units if key_text(unit) in normalized_header), 1)
    return exact_won(amount * multiplier)


def parse_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().casefold() in {"n/a", "na", "-"}:
        return None
    text = key_text(value)
    if not text:
        return None
    if text in {"y", "yes", "true", "1", "상장", "있음", "해당"}:
        return True
    if text in {"n", "no", "false", "0", "비상장", "없음", "미해당"}:
        return False
    return None


def parse_currency(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip().upper()
    return {"원": "KRW", "대한민국원": "KRW", "미국달러": "USD", "달러": "USD"}.get(text, text)


def classify_type(raw_type: Any, joined: str) -> str | None:
    text = key_text(raw_type)
    mapping = (("국채", "government"), ("지방채", "municipal"), ("특수채", "agency"),
               ("금융채", "financial"), ("회사채", "corporate"), ("abs", "abs"))
    for needle, result in mapping:
        if needle in text:
            return result
    if any(token in joined for token in ("전환사채", "교환사채", "신주인수권부사채")):
        return "corporate"
    return str(raw_type).strip() or None if raw_type is not None else None


def option_flag(option_text: str, kind: str) -> bool | None:
    if kind == "call":
        positive = r"(?<![A-Z])CALL(?![A-Z])|콜옵션|매도청구권"
        negative = r"(?:CALL|콜옵션|매도청구권)\s*(?:없음|해당\s*없음|미해당|미포함|없다|없습니다)"
    else:
        positive = r"(?<![A-Z])PUT(?![A-Z])|풋옵션|조기상환청구권|사채권자의\s*상환청구권"
        negative = r"(?:PUT|풋옵션|조기상환청구권)\s*(?:없음|해당\s*없음|미해당|미포함|없다|없습니다)"
    has_negative = re.search(negative, option_text, re.I) is not None
    positive_text = re.sub(negative, " ", option_text, flags=re.I)
    has_positive = re.search(positive, positive_text, re.I) is not None
    generic_none = re.search(
        r"^(?:없음|해당\s*없음|none|no|n/?a)$|옵션\s*(?:해당\s*)?없음",
        option_text.strip(),
        re.I,
    ) is not None
    if (has_positive and has_negative) or (has_positive and generic_none):
        return None
    if has_negative:
        return False
    if has_positive:
        return True
    if generic_none:
        return False
    return None


def equity_flag(joined: str, korean: str, acronym: str) -> bool | None:
    return True if korean in joined or re.search(rf"(?<![A-Z]){acronym}(?![A-Z])", joined, re.I) else None


def reconcile_flag(explicit: bool | None, inferred: bool | None) -> bool | None:
    if explicit is not None and inferred is not None and explicit != inferred:
        return None
    return explicit if explicit is not None else inferred


def normalize_schedule(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        return [value]
    if isinstance(value, list):
        return [
            item if isinstance(item, dict) else {"raw": " ".join(str(item).split())}
            for item in value
            if isinstance(item, dict) or (isinstance(item, (str, int, float)) and not isinstance(item, bool))
        ]
    if not value:
        return []
    return [{"raw": " ".join(str(value).split())}]


def normalize(
    row: dict[str, Any],
    observed_at: str,
    source_path: str,
    observed_at_basis: str = "provided",
    source_name: str = "입력 자료",
    source_url: str | None = None,
) -> dict[str, Any]:
    normalized_keys = [key_text(key) for key in row]
    if any(not key for key in normalized_keys) or len(set(normalized_keys)) != len(normalized_keys):
        raise InputError("parse_failure", "입력 레코드에 비어 있거나 정규화 후 중복되는 필드명이 있습니다")
    joined = " | ".join(str(v) for v in row.values() if v not in (None, ""))
    option_parts = [str(value_for(row, key) or "").strip() for key in ("option", "option_schedule", "equity_linked")]
    option_text = " | ".join(part for part in option_parts if part)
    combined = f"{joined} | {option_text}"
    listed_raw = value_for(row, "listed")
    listed_value = parse_bool(listed_raw)
    if listed_value is None and parse_date(listed_raw) is not None:
        listed_value = True
    isin_value = value_for(row, "isin")
    try:
        isin = parse_isin(str(isin_value)) if isin_value else None
    except argparse.ArgumentTypeError as exc:
        raise InputError("parse_failure", "입력 레코드에 형식 또는 체크디지트가 유효하지 않은 ISIN이 있습니다") from exc
    issue_date = parse_date(value_for(row, "issue_date"))
    maturity_date = parse_date(value_for(row, "maturity_date"))
    if issue_date and maturity_date and issue_date > maturity_date:
        raise InputError("parse_failure", "발행일이 만기일보다 늦은 레코드가 있습니다. 원천 날짜를 확인해 주세요")
    issue_header, issue_value = entry_for(row, "issue_amount_krw")
    outstanding_header, outstanding_value = entry_for(row, "outstanding_amount_krw")
    currency = parse_currency(value_for(row, "currency"))
    direct_flags = {name: parse_bool(row.get(name)) for name in ("callable", "putable", "convertible", "exchangeable", "warrant_attached")}
    return {
        "instrument_type": "bond",
        "isin": str(isin).strip().upper() if isin else None,
        "name": str(value_for(row, "name")).strip() if value_for(row, "name") else None,
        "issuer": str(value_for(row, "issuer")).strip() if value_for(row, "issuer") else None,
        "bond_type": classify_type(value_for(row, "bond_type"), key_text(combined)),
        "currency": currency,
        "issue_date": issue_date,
        "maturity_date": maturity_date,
        "coupon_rate_pct": parse_rate(value_for(row, "coupon_rate_pct")),
        "coupon_type": str(value_for(row, "coupon_type")).strip() if value_for(row, "coupon_type") else None,
        "coupon_frequency": None,
        # These canonical fields are explicitly KRW. Do not relabel foreign or
        # currency-unknown nominal amounts as won; the untouched values remain
        # available in `raw` for source-aware follow-up.
        "issue_amount_krw": parse_money(issue_value, issue_header) if currency == "KRW" else None,
        "outstanding_amount_krw": parse_money(outstanding_value, outstanding_header) if currency == "KRW" else None,
        "offering_type": str(value_for(row, "offering_type")).strip() if value_for(row, "offering_type") else None,
        "seniority": str(value_for(row, "seniority")).strip() if value_for(row, "seniority") else None,
        "guarantee": str(value_for(row, "guarantee")).strip() if value_for(row, "guarantee") else None,
        "listed": listed_value,
        "callable": reconcile_flag(direct_flags["callable"], option_flag(option_text, "call")),
        "putable": reconcile_flag(direct_flags["putable"], option_flag(option_text, "put")),
        "convertible": reconcile_flag(direct_flags["convertible"], equity_flag(combined, "전환사채", "CB")),
        "exchangeable": reconcile_flag(direct_flags["exchangeable"], equity_flag(combined, "교환사채", "EB")),
        "warrant_attached": reconcile_flag(direct_flags["warrant_attached"], equity_flag(combined, "신주인수권부사채", "BW")),
        "option_schedule": normalize_schedule(value_for(row, "option_schedule")),
        "source": {
            "name": source_name, "url": source_url, "observed_at": observed_at,
            "observed_at_basis": observed_at_basis, "input_file": Path(source_path).name,
        },
        "raw": row,
    }


def decode_bytes(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            pass
    raise InputError("parse_failure", "입력 인코딩을 UTF-8/CP949/EUC-KR로 해석할 수 없습니다")


def unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"JSON 객체에 중복 키가 있습니다: {key}")
        result[key] = value
    return result


def reject_json_constant(value: str) -> None:
    raise ValueError(f"JSON에서 허용되지 않는 숫자 상수입니다: {value}")


def finite_json_float(value: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("JSON 숫자가 표현 가능한 범위를 벗어났습니다")
    return number


def load_rows(path_text: str | None) -> tuple[list[dict[str, Any]], str]:
    selected = path_text or os.environ.get("KSKILL_SEIBRO_EXPORT")
    if not selected:
        raise InputError("source_failure", "SEIBro 내보내기 파일이 필요합니다 (--input 또는 KSKILL_SEIBRO_EXPORT)")
    path = Path(selected).expanduser()
    if not path.is_file():
        raise InputError("source_failure", "입력 파일을 찾을 수 없습니다. --input 경로 또는 KSKILL_SEIBRO_EXPORT 설정을 확인해 주세요")
    try:
        text = decode_bytes(path.read_bytes())
    except PermissionError as exc:
        raise InputError("source_failure", "입력 파일을 읽을 권한이 없습니다") from exc
    except OSError as exc:
        raise InputError("source_failure", "입력 파일을 읽지 못했습니다. 파일 경로와 접근 권한을 확인해 주세요") from exc
    suffix = path.suffix.casefold()
    try:
        if suffix == ".json":
            payload = json.loads(
                text,
                object_pairs_hook=unique_json_object,
                parse_constant=reject_json_constant,
                parse_float=finite_json_float,
            )
            rows = payload.get("items") if isinstance(payload, dict) else payload
            if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
                raise InputError("parse_failure", "JSON은 객체 배열 또는 items 객체 배열이어야 합니다")
            return rows, str(path)
        if suffix in {".csv", ".tsv"}:
            dialect = "excel-tab" if suffix == ".tsv" else "excel"
            reader = csv.DictReader(io.StringIO(text), dialect=dialect)
            if not reader.fieldnames or any(not str(name or "").strip() for name in reader.fieldnames):
                raise InputError("parse_failure", "CSV/TSV 헤더가 비어 있거나 없습니다")
            normalized_headers = [key_text(name) for name in reader.fieldnames]
            if len(set(normalized_headers)) != len(normalized_headers):
                raise InputError("parse_failure", "CSV/TSV에 정규화 후 중복되는 헤더가 있습니다")
            rows = list(reader)
            if any(None in row or any(value is None for value in row.values()) for row in rows):
                raise InputError("parse_failure", "CSV/TSV 행의 열 수가 헤더와 일치하지 않습니다")
            return rows, str(path)
        if suffix in {".html", ".htm"}:
            parser = TableParser()
            parser.feed(text)
            candidates = [table for table in parser.tables if len(table) >= 2]
            selected = next((table for table in candidates if any(key_text(cell) in {key_text(a) for a in ALIASES["isin"] + ALIASES["name"]} for cell in table[0])), None)
            if selected is None:
                raise InputError("parse_failure", "HTML에서 채권 식별 헤더와 데이터 행이 있는 표를 찾지 못했습니다")
            header = selected[0]
            normalized_headers = [key_text(cell) for cell in header]
            if any(not key for key in normalized_headers) or len(set(normalized_headers)) != len(normalized_headers):
                raise InputError("parse_failure", "HTML 표에 비어 있거나 정규화 후 중복되는 헤더가 있습니다")
            data_rows = selected[1:]
            if any(len(row) != len(header) for row in data_rows):
                raise InputError("parse_failure", "HTML 표의 열 수가 일치하지 않습니다")
            rows = [dict(zip(header, row)) for row in data_rows]
            if not rows:
                raise InputError("parse_failure", "HTML 표에 채권 데이터 행이 없습니다")
            return rows, str(path)
    except (csv.Error, ValueError) as exc:
        raise InputError("parse_failure", str(exc)) from exc
    raise InputError("parse_failure", "지원 형식은 .json, .csv, .tsv, .html입니다")


def matches(record: dict[str, Any], args: argparse.Namespace) -> bool:
    def contains(field: str, query: str | None) -> bool:
        return not query or key_text(query) in key_text(record.get(field))
    if not contains("issuer", args.issuer) or not contains("name", args.name):
        return False
    if args.isin and key_text(record.get("isin")) != key_text(args.isin):
        return False
    maturity = record.get("maturity_date")
    if args.maturity_from and (not maturity or maturity < args.maturity_from):
        return False
    if args.maturity_to and (not maturity or maturity > args.maturity_to):
        return False
    return True


def compact_record(record: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "instrument_type", "isin", "name", "issuer", "bond_type", "currency",
        "coupon_rate_pct", "maturity_date", "outstanding_amount_krw", "callable",
        "putable", "convertible", "exchangeable", "warrant_attached", "source",
    )
    return {key: record.get(key) for key in keys}


def dedupe_identical(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result = []
    for record in records:
        comparable = {key: value for key, value in record.items() if key not in {"raw", "source"}}
        marker = json.dumps(comparable, ensure_ascii=False, sort_keys=True)
        if marker not in seen:
            seen.add(marker)
            result.append(record)
    return result


def parse_iso_arg(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise argparse.ArgumentTypeError("날짜는 YYYY-MM-DD 형식이어야 합니다")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise argparse.ArgumentTypeError("날짜는 YYYY-MM-DD 형식이어야 합니다") from exc


def parse_isin(value: str) -> str:
    normalized = value.strip().upper()
    if not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}\d", normalized):
        raise argparse.ArgumentTypeError("ISIN은 국가코드 2자를 포함한 12자리 형식이어야 합니다")
    expanded = "".join(str(ord(char) - 55) if char.isalpha() else char for char in normalized)
    total = 0
    double = False
    for digit in reversed(expanded):
        number = int(digit)
        if double:
            number *= 2
            if number > 9:
                number -= 9
        total += number
        double = not double
    if total % 10:
        raise argparse.ArgumentTypeError("ISIN 체크디지트가 맞지 않습니다. 종목코드를 다시 확인해 주세요")
    return normalized


def parse_timestamp(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("observed-at은 ISO 8601 형식이어야 합니다") from exc
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("observed-at에는 시간대가 있어야 합니다")
    return parsed.isoformat()


def display(value: Any, suffix: str = "") -> str:
    return "미확인" if value is None or value == "" else f"{value}{suffix}"


def display_bool(value: Any) -> str:
    return "예" if value is True else "아니오" if value is False else "미확인"


def friendly_timestamp(value: Any) -> str:
    if not value:
        return "미확인"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d %H:%M:%S %z")
    except ValueError:
        return str(value)


def source_time_text(source: dict[str, Any]) -> str:
    timestamp = friendly_timestamp(source.get("observed_at"))
    if source.get("observed_at_basis") == "file_mtime_fallback":
        return f"입력 파일 수정 시각 {timestamp} (원천 확인시각 미제공)"
    if source.get("observed_at_basis") == "source_verified":
        return f"원천 확인 시각 {timestamp}"
    if source.get("observed_at_basis") == "provided":
        return f"입력된 기준 시각 {timestamp} (원천 확인 여부 미검증)"
    return "확인시각 미제공"


def source_line(source: Any) -> str:
    if not isinstance(source, dict):
        source = {}
    name = str(source.get("name") or "입력 자료")
    url = source.get("url")
    label = f"[{name}]({url})" if isinstance(url, str) and url.startswith("https://") else name
    return f"출처: {label} · {source_time_text(source)}"


def money_krw(value: Any) -> str:
    if value is None:
        return "미확인"
    amount = int(value)
    if amount < 0:
        return "미확인"
    parts = []
    for unit, scale in (("조", 1_000_000_000_000), ("억", 100_000_000), ("만", 10_000)):
        quotient, amount = divmod(amount, scale)
        if quotient:
            parts.append(f"{quotient:,}{unit}")
    if amount or not parts:
        parts.append(f"{amount:,}원")
    return " ".join(parts)


def option_summary(item: dict[str, Any]) -> str:
    labels = []
    for key, label in (("callable", "CALL"), ("putable", "PUT")):
        value = item.get(key)
        labels.append(label if value is True else f"{label} 없음" if value is False else f"{label} 미확인")

    structures = (("convertible", "CB"), ("exchangeable", "EB"), ("warrant_attached", "BW"))
    present = [label for key, label in structures if item.get(key) is True]
    absent = [label for key, label in structures if item.get(key) is False]
    unknown = [label for key, label in structures if item.get(key) is None]
    if present:
        labels.extend(present)
    if absent and not unknown and not present:
        labels.append("CB/EB/BW 없음")
    elif unknown and present:
        labels.append("그 외 주식연계 구조 미확인")
    elif unknown and absent:
        labels.append("일부 주식연계 구조 미확인")
        labels.extend(f"{label} 없음" for label in absent)
    elif unknown and not present and not absent:
        labels.append("CB/EB/BW 미확인")
    return " · ".join(labels)


def schedule_item_text(item: Any) -> str:
    if isinstance(item, dict):
        raw = item.get("raw")
        if isinstance(raw, str) and raw.strip():
            return " ".join(raw.split())
        labels = (
            ("date", "일자"), ("start_date", "시작"), ("end_date", "종료"),
            ("type", "종류"), ("option", "종류"), ("price", "가격"),
        )
        parts = [
            f"{label} {item[key]}" for key, label in labels
            if key in item and isinstance(item[key], (str, int, float)) and not isinstance(item[key], bool)
        ]
        return " · ".join(parts) if parts else "원문 일정 확인 필요"
    return " ".join(str(item).split()) if item is not None else "원문 일정 확인 필요"


def render_chat(payload: dict[str, Any]) -> str:
    result = payload.get("result")
    if result == "ambiguous":
        items = payload.get("items") or []
        isins = sorted({str(item.get("isin")) for item in items if isinstance(item, dict) and item.get("isin")})
        subject = f"ISIN `{isins[0]}`" if len(isins) == 1 else "아래 ISIN"
        lines = [
            "## 원천 자료의 발행조건 충돌", "",
            f"{subject}에 서로 다른 발행조건 레코드가 있어 해당 종목을 임의로 선택하지 않았습니다.",
            "내보내기 자료를 새로 확인한 뒤 다시 조회해 주세요.", "",
            "| ISIN | 종목 | 발행사 | 만기 | 표면금리 | 발행잔액 |",
            "| --- | --- | --- | --- | ---: | ---: |",
        ]
        for item in items[:5]:
            lines.append(
                f"| `{display(item.get('isin'))}` | {display(item.get('name'))} | {display(item.get('issuer'))} | "
                f"{display(item.get('maturity_date'))} | {display(item.get('coupon_rate_pct'), '%')} | "
                f"{money_krw(item.get('outstanding_amount_krw'))} |"
            )
        if len(items) > 5:
            lines.extend(["", f"충돌 레코드 {len(items)}건 중 5건만 표시했습니다."])
        source = items[0].get("source", {}) if items and isinstance(items[0], dict) else payload.get("source", {})
        lines.extend(["", source_line(source)])
        return "\n".join(lines)
    if result not in {"ok", "empty"}:
        lines = ["자료를 처리하지 못했습니다.", "", f"- 사유: {payload.get('message', '알 수 없는 오류')}"]
        source = payload.get("source", {})
        lines.extend(["", source_line(source)])
        if result == "source_failure" and not (isinstance(source, dict) and source.get("url")):
            lines.extend(["", f"자료는 [SEIBro 채권정보]({SEIBRO_URL})에서 확인한 뒤 다시 시도해 주세요."])
        return "\n".join(lines)
    if result == "empty":
        source = payload.get("source", {})
        return (
            "조회 원천에서 조건에 맞는 채권을 확인하지 못했습니다.\n\n"
            "이는 채권이 존재하지 않는다는 뜻은 아닙니다. 발행사명·종목명·ISIN 또는 만기 조건을 바꿔 다시 확인해 주세요.\n\n"
            f"{source_line(source)}"
        )
    if "items" in payload:
        items = payload["items"]
        lines = [
            "## 한국 채권 검색 결과",
            "",
            (
                f"조건에 맞는 **{payload.get('count', len(items))}개 종목** 중 만기순 상위 {len(items)}개를 표시합니다."
                if payload.get("truncated")
                else f"조회 원천에서 **{payload.get('count', len(items))}개 종목**을 확인했습니다."
            ),
            "",
            "| 종목 | ISIN | 발행사 | 유형 | 표면금리 | 만기 | 발행잔액 | 옵션·구조 |",
            "| --- | --- | --- | --- | ---: | --- | ---: | --- |",
        ]
        type_names = {"corporate": "회사채", "financial": "금융채", "government": "국채", "municipal": "지방채", "agency": "특수채", "abs": "ABS"}
        for item in items:
            rate = display(item.get("coupon_rate_pct"), "%")
            lines.append(
                f"| {display(item.get('name'))} | `{display(item.get('isin'))}` | {display(item.get('issuer'))} | "
                f"{type_names.get(item.get('bond_type'), display(item.get('bond_type')))} | {rate} | "
                f"{display(item.get('maturity_date'))} | {money_krw(item.get('outstanding_amount_krw'))} | {option_summary(item)} |"
            )
        if payload.get("truncated"):
            lines.extend(["", "후보가 더 있습니다. 만기·회차·ISIN을 알려주시면 범위를 좁히겠습니다."])
        elif len(items) > 1:
            lines.extend(["", "상세히 볼 종목의 **ISIN 또는 회차**를 알려주세요."])
        conflicts = payload.get("conflicts") or []
        if conflicts:
            conflict_isins = sorted({str(item.get("isin")) for item in conflicts if isinstance(item, dict) and item.get("isin")})
            shown = ", ".join(f"`{isin}`" for isin in conflict_isins[:3])
            more = f" 외 {len(conflict_isins) - 3}개" if len(conflict_isins) > 3 else ""
            lines.extend(["", f"주의: 발행조건이 충돌한 ISIN {shown}{more}은 표에서 제외했습니다. 원천 자료를 다시 확인해 주세요."])
        source = items[0].get("source", {}) if items else payload.get("source", {})
        lines.extend(["", source_line(source)])
        return "\n".join(lines)
    if "item" not in payload and "isin" in payload:
        lines = [
            f"## 옵션 정보 — `{display(payload.get('isin'))}`", "",
            f"- 옵션·구조: {option_summary(payload)}",
            "- 옵션 일정:",
        ]
        schedule = payload.get("option_schedule") or []
        lines.extend([f"  - {schedule_item_text(item)}" for item in schedule] if schedule else ["  - 확인되지 않음"])
        source = payload.get("source", {})
        lines.extend(["", source_line(source)])
        return "\n".join(lines)
    item = payload.get("item") or payload
    lines = [
        f"## {display(item.get('name'), '')}", "",
        f"`{display(item.get('isin'))}` · {display(item.get('issuer'))}", "",
        "| 항목 | 내용 |", "| --- | --- |",
        f"| 유형 | {display(item.get('bond_type'))} |",
        f"| 발행일 | {display(item.get('issue_date'))} |",
        f"| 만기 | {display(item.get('maturity_date'))} |",
        f"| 표면금리 | {display(item.get('coupon_rate_pct'), '%')} |",
        f"| 금리 유형 | {display(item.get('coupon_type'))} |",
        f"| 발행액 | {money_krw(item.get('issue_amount_krw'))} |",
        f"| 발행잔액 | {money_krw(item.get('outstanding_amount_krw'))} |",
        f"| 통화 | {display(item.get('currency'))} |",
        f"| 선후순위 | {display(item.get('seniority'))} |",
        f"| 보증 | {display(item.get('guarantee'))} |",
        f"| 공모/사모 | {display(item.get('offering_type'))} |",
        f"| 상장 여부 | {display_bool(item.get('listed'))} |",
        f"| 옵션·구조 | {option_summary(item)} |", "",
    ]
    schedule = item.get("option_schedule") or []
    if schedule:
        lines.extend(["옵션 일정:", *[f"- {schedule_item_text(entry)}" for entry in schedule], ""])
    source = item.get("source", {})
    lines.append(source_line(source))
    return "\n".join(lines)


def emit(payload: dict[str, Any], exit_code: int = 0) -> None:
    if OUTPUT_FORMAT == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False))
    else:
        print(render_chat(payload))
    raise SystemExit(exit_code)


def build_parser() -> argparse.ArgumentParser:
    parser = JsonArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    def add_source_arguments(command_parser: argparse.ArgumentParser) -> None:
        command_parser.add_argument("--observed-at", type=parse_timestamp)
        command_parser.add_argument(
            "--verified-source", action="store_true",
            help="입력 자료와 조회시각을 이번 SEIBro 원천 화면에서 직접 대조했을 때만 사용",
        )

    search = sub.add_parser("search")
    search.add_argument("--input")
    search.add_argument("--issuer")
    search.add_argument("--name")
    search.add_argument("--isin", type=parse_isin)
    search.add_argument("--maturity-from", type=parse_iso_arg)
    search.add_argument("--maturity-to", type=parse_iso_arg)
    search.add_argument("--limit", type=int, default=5, choices=range(1, 21), metavar="1..20")
    search.add_argument("--format", choices=("chat", "json"), default="chat")
    add_source_arguments(search)
    for command in ("detail", "options"):
        child = sub.add_parser(command)
        child.add_argument("--input")
        child.add_argument("--isin", required=True, type=parse_isin)
        child.add_argument("--format", choices=("chat", "json"), default="chat")
        add_source_arguments(child)
    return parser


def main(argv: Iterable[str] | None = None) -> None:
    global OUTPUT_FORMAT
    parser = build_parser()
    args = parser.parse_args(argv)
    OUTPUT_FORMAT = args.format
    if args.command == "search" and not any((args.issuer, args.name, args.isin, args.maturity_from, args.maturity_to)):
        parser.error("search에는 issuer/name/isin/만기 조건 중 하나가 필요합니다")
    if args.command == "search" and args.maturity_from and args.maturity_to and args.maturity_from > args.maturity_to:
        parser.error("maturity-from은 maturity-to보다 늦을 수 없습니다")
    if args.verified_source and not args.observed_at:
        parser.error("verified-source에는 이번 원천 확인시각을 --observed-at으로 함께 지정해야 합니다")
    source_name = "SEIBro" if args.verified_source else "입력 자료"
    source_url = SEIBRO_URL if args.verified_source else None
    try:
        rows, source_path = load_rows(args.input)
        if args.observed_at:
            observed_at = args.observed_at
            observed_at_basis = "source_verified" if args.verified_source else "provided"
        else:
            observed_at = datetime.fromtimestamp(Path(source_path).stat().st_mtime, timezone.utc).isoformat()
            observed_at_basis = "file_mtime_fallback"
        records = [normalize(row, observed_at, source_path, observed_at_basis, source_name, source_url) for row in rows]
        records = dedupe_identical(records)
    except InputError as exc:
        emit({
            "schema_version": "1.0", "result": exc.code, "message": str(exc),
            "source": {"name": "입력 자료", "url": None},
        }, 1)
    except OSError:
        emit({
            "schema_version": "1.0", "result": "source_failure",
            "message": "입력 파일을 읽는 중 오류가 발생했습니다. 경로와 접근 권한을 확인해 주세요",
            "source": {"name": "입력 자료", "url": None},
        }, 1)

    if args.command == "search":
        selected = [record for record in records if matches(record, args)]
        selected.sort(key=lambda item: (
            item.get("maturity_date") is None, item.get("maturity_date") or "9999",
            item.get("name") or "", item.get("issuer") or "", item.get("isin") or "",
        ))
        by_isin: dict[str, list[dict[str, Any]]] = {}
        for record in selected:
            isin = record.get("isin")
            if isin:
                by_isin.setdefault(isin, []).append(record)
        conflicts = [record for group in by_isin.values() if len(group) > 1 for record in group]
        conflicting_isins = {record["isin"] for record in conflicts}
        selected = [record for record in selected if record.get("isin") not in conflicting_isins]
        if not selected:
            if conflicts:
                emit({
                    "schema_version": "1.0", "result": "ambiguous",
                    "items": [compact_record(item) for item in conflicts],
                    "source": conflicts[0]["source"],
                }, 1)
            emit({"schema_version": "1.0", "result": "empty", "items": [], "message": "제공된 조회 원천에서 확인되지 않았습니다", "source": {"name": source_name, "url": source_url, "observed_at": observed_at, "observed_at_basis": observed_at_basis}})
        emit({
            "schema_version": "1.0", "result": "ok", "count": len(selected),
            "items": [compact_record(item) for item in selected[: args.limit]],
            "truncated": len(selected) > args.limit,
            "conflicts": [compact_record(item) for item in conflicts],
        })

    exact = [record for record in records if key_text(record.get("isin")) == key_text(args.isin)]
    if not exact:
        emit({
            "schema_version": "1.0", "result": "empty", "items": [],
            "message": "제공된 조회 원천에서 ISIN을 확인하지 못했습니다",
            "source": {"name": source_name, "url": source_url, "observed_at": observed_at, "observed_at_basis": observed_at_basis},
        })
    if len(exact) > 1:
        emit({"schema_version": "1.0", "result": "ambiguous", "items": [compact_record(item) for item in exact], "message": "동일 ISIN의 발행조건이 서로 충돌합니다"}, 1)
    if args.command == "detail":
        emit({"schema_version": "1.0", "result": "ok", "item": exact[0]})
    emit({"schema_version": "1.0", "result": "ok", "isin": exact[0]["isin"], "callable": exact[0]["callable"],
          "putable": exact[0]["putable"], "option_schedule": exact[0]["option_schedule"], "source": exact[0]["source"]})


if __name__ == "__main__":
    main()
