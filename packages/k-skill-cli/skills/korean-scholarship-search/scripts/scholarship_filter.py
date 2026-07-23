#!/usr/bin/env python3
"""Filter normalized Korean scholarship records and estimate eligibility."""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


AMOUNT_KEYS = (
    "annual_krw",
    "per_semester_krw",
    "one_time_krw",
    "monthly_krw",
    "max_krw",
    "min_krw",
    "amount_krw",
)
CANONICAL_DEADLINE_STATUSES = {"open", "upcoming", "closed", "unknown"}
KST = timezone(timedelta(hours=9), name="Asia/Seoul")
KST_LABEL = "Asia/Seoul (KST)"


def read_payload(path: str | None) -> Any:
    if path:
        return json.loads(Path(path).read_text(encoding="utf8"))

    raw = sys.stdin.read().strip()
    if not raw:
        raise SystemExit("expected JSON input from --input or stdin")
    return json.loads(raw)


def ensure_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get("items"), list):
            return [item for item in payload["items"] if isinstance(item, dict)]
        return [payload]
    raise SystemExit("input JSON must be an object or an array of objects")


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def contains_text(values: list[Any], needle: str) -> bool:
    target = normalize_text(needle)
    return any(target in normalize_text(value) for value in values)


def parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    try:
        return int(str(value).replace(",", "").strip())
    except ValueError:
        return None


def parse_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def parse_date(value: Any) -> date | None:
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y%m%d"):
        try:
            if fmt == "%Y%m%d" and len(text) != 8:
                continue
            if fmt == "%Y-%m-%d":
                parts = text.split("-")
                if len(parts) == 3:
                    return date(int(parts[0]), int(parts[1]), int(parts[2]))
            if fmt == "%Y.%m.%d":
                parts = text.split(".")
                if len(parts) == 3:
                    return date(int(parts[0]), int(parts[1]), int(parts[2]))
            if fmt == "%Y/%m/%d":
                parts = text.split("/")
                if len(parts) == 3:
                    return date(int(parts[0]), int(parts[1]), int(parts[2]))
            if fmt == "%Y%m%d":
                return date(int(text[0:4]), int(text[4:6]), int(text[6:8]))
        except ValueError:
            continue
    return None


def current_kst_date(now: datetime | None = None) -> date:
    if now is None:
        return datetime.now(KST).date()
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(KST).date()


def resolve_today(value: str | None) -> date:
    parsed = parse_date(value)
    return parsed or current_kst_date()


def extract_org_type(record: dict[str, Any]) -> str:
    organization = record.get("organization") or {}
    return normalize_text(record.get("org_type") or organization.get("type") or "")


def extract_org_name(record: dict[str, Any]) -> str:
    organization = record.get("organization") or {}
    return str(record.get("organization_name") or organization.get("name") or "").strip()


def parse_amount_from_text(text: str) -> list[int]:
    candidates: list[int] = []
    for raw, unit in re.findall(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(만원|원)", text):
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        multiplier = 10000 if unit == "만원" else 1
        candidates.append(int(value * multiplier))
    return candidates


def normalize_deadline_status(value: Any) -> str | None:
    status = normalize_text(value)
    if status in CANONICAL_DEADLINE_STATUSES:
        return status
    return None


def extract_amount_value(record: dict[str, Any]) -> int | None:
    amount = record.get("amount")
    candidates: list[int] = []

    if isinstance(amount, dict):
        for key in AMOUNT_KEYS:
            parsed = parse_int(amount.get(key))
            if parsed is not None:
                candidates.append(parsed)
        text = str(amount.get("text") or "")
        candidates.extend(parse_amount_from_text(text))
    else:
        parsed = parse_int(record.get("amount_krw"))
        if parsed is not None:
            candidates.append(parsed)
        if isinstance(amount, str):
            candidates.extend(parse_amount_from_text(amount))
        text = str(record.get("amount_text") or "")
        candidates.extend(parse_amount_from_text(text))

    return max(candidates) if candidates else None


def infer_deadline_status(record: dict[str, Any], today: date | None = None) -> str:
    today = today or current_kst_date()
    deadline = record.get("deadline") or {}
    start_at = parse_date(deadline.get("start"))
    end_at = parse_date(deadline.get("end"))

    if end_at and end_at < today:
        return "closed"
    if start_at and start_at > today:
        return "upcoming"
    if end_at and end_at >= today:
        return "open"
    cached_status = normalize_deadline_status(deadline.get("status") or record.get("deadline_status"))
    return cached_status or "unknown"


def deadline_context(record: dict[str, Any], today: date | None = None) -> dict[str, Any]:
    today = today or current_kst_date()
    deadline = record.get("deadline") or {}
    start_at = parse_date(deadline.get("start"))
    end_at = parse_date(deadline.get("end"))
    status = infer_deadline_status(record, today)
    days_until_start = (start_at - today).days if start_at else None
    days_until_end = (end_at - today).days if end_at else None
    return {
        "today": today.isoformat(),
        "start": start_at.isoformat() if start_at else None,
        "end": end_at.isoformat() if end_at else None,
        "status": status,
        "days_until_start": days_until_start,
        "days_until_end": days_until_end,
    }


def get_eligibility(record: dict[str, Any]) -> dict[str, Any]:
    eligibility = record.get("eligibility")
    if isinstance(eligibility, dict):
        return eligibility
    return {}


def extract_department_names(record: dict[str, Any]) -> list[Any]:
    eligibility = get_eligibility(record)
    values = as_list(eligibility.get("department_names"))
    if values:
        return values
    return as_list(eligibility.get("majors"))


def school_match_values(record: dict[str, Any]) -> list[Any]:
    eligibility = get_eligibility(record)
    values: list[Any] = []
    values.extend(as_list(eligibility.get("school_names")))
    values.append(extract_org_name(record))
    return [value for value in values if value]


def department_match_values(record: dict[str, Any]) -> list[Any]:
    values: list[Any] = []
    values.extend(extract_department_names(record))
    values.append(extract_org_name(record))
    values.append(record.get("source_url"))
    values.append(record.get("summary"))
    return [value for value in values if value]


def match_query(record: dict[str, Any], query: str | None) -> bool:
    if not query:
        return True

    haystacks = [
        record.get("name"),
        extract_org_name(record),
        record.get("summary"),
        record.get("notes"),
        record.get("source_url"),
        record.get("apply_url"),
    ]
    eligibility = get_eligibility(record)
    haystacks.extend(as_list(eligibility.get("majors")))
    haystacks.extend(extract_department_names(record))
    haystacks.extend(as_list(eligibility.get("notes")))
    return contains_text(haystacks, query)


def match_filter(record: dict[str, Any], args: argparse.Namespace) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    eligibility = get_eligibility(record)
    today = resolve_today(getattr(args, "today", None))

    if not match_query(record, args.q):
        return False, reasons

    if args.org_type:
        org_type = extract_org_type(record)
        if org_type != normalize_text(args.org_type):
            return False, reasons
        reasons.append(f"org_type={org_type}")

    context = deadline_context(record, today)

    if args.deadline_status:
        deadline_status = context["status"]
        if deadline_status != normalize_text(args.deadline_status):
            return False, reasons
        reasons.append(f"deadline_status={deadline_status}")

    if getattr(args, "only_open_now", False):
        if context["status"] != "open":
            return False, reasons
        reasons.append("only_open_now")

    upcoming_within_days = getattr(args, "upcoming_within_days", None)
    if upcoming_within_days is not None:
        days_until_start = context["days_until_start"]
        if context["status"] != "upcoming" or days_until_start is None or days_until_start < 0 or days_until_start > upcoming_within_days:
            return False, reasons
        reasons.append(f"upcoming_within_days<={upcoming_within_days}")

    deadline_within_days = getattr(args, "deadline_within_days", None)
    if deadline_within_days is not None:
        days_until_end = context["days_until_end"]
        if days_until_end is None or days_until_end < 0 or days_until_end > deadline_within_days:
            return False, reasons
        reasons.append(f"deadline_within_days<={deadline_within_days}")

    if args.school_kind:
        school_kinds = [normalize_text(value) for value in as_list(eligibility.get("school_kinds"))]
        if school_kinds and normalize_text(args.school_kind) not in school_kinds:
            return False, reasons
        if school_kinds:
            reasons.append(f"school_kind={args.school_kind}")
        else:
            reasons.append("school_kind=?")

    if args.school_name:
        school_names = school_match_values(record)
        if school_names and not contains_text(school_names, args.school_name):
            return False, reasons
        if school_names:
            reasons.append(f"school_name~={args.school_name}")
        else:
            reasons.append("school_name=?")

    if args.student_level:
        student_levels = [normalize_text(value) for value in as_list(eligibility.get("student_levels"))]
        if student_levels and normalize_text(args.student_level) not in student_levels:
            return False, reasons
        if student_levels:
            reasons.append(f"student_level={args.student_level}")
        else:
            reasons.append("student_level=?")

    if args.major:
        majors = as_list(eligibility.get("majors"))
        if majors and not contains_text(majors, args.major):
            return False, reasons
        if majors:
            reasons.append(f"major~={args.major}")
        else:
            reasons.append("major=?")

    if getattr(args, "department_name", None):
        departments = department_match_values(record)
        if departments and not contains_text(departments, args.department_name):
            return False, reasons
        if departments:
            reasons.append(f"department_name~={args.department_name}")
        else:
            reasons.append("department_name=?")

    if args.grade_year is not None:
        grade_years = {parse_int(value) for value in as_list(eligibility.get("grade_years"))}
        grade_years.discard(None)
        if grade_years and args.grade_year not in grade_years:
            return False, reasons
        if grade_years:
            reasons.append(f"grade_year={args.grade_year}")
        else:
            reasons.append("grade_year=?")

    if args.gpa is not None:
        gpa_min = parse_float(eligibility.get("gpa_min"))
        if gpa_min is not None and args.gpa < gpa_min:
            return False, reasons
        if gpa_min is not None:
            reasons.append(f"gpa>={gpa_min}")
        else:
            reasons.append("gpa=?")

    if args.income_band is not None:
        income_band_min = parse_int(eligibility.get("income_band_min"))
        income_band_max = parse_int(eligibility.get("income_band_max"))
        income_bands = {parse_int(value) for value in as_list(eligibility.get("income_bands"))}
        income_bands.discard(None)

        if income_bands and args.income_band not in income_bands:
            return False, reasons
        if income_band_min is not None and args.income_band < income_band_min:
            return False, reasons
        if income_band_max is not None and args.income_band > income_band_max:
            return False, reasons
        if income_bands or income_band_min is not None or income_band_max is not None:
            reasons.append(f"income_band={args.income_band}")
        else:
            reasons.append("income_band=?")

    amount_value = extract_amount_value(record)
    if args.min_amount is not None:
        if amount_value is not None and amount_value < args.min_amount:
            return False, reasons
        if amount_value is None:
            if getattr(args, "strict_amount", False):
                return False, reasons
            reasons.append(f"amount>={args.min_amount}?")
        else:
            reasons.append(f"amount>={args.min_amount}")
    if args.max_amount is not None:
        if amount_value is not None and amount_value > args.max_amount:
            return False, reasons
        if amount_value is None:
            if getattr(args, "strict_amount", False):
                return False, reasons
            reasons.append(f"amount<={args.max_amount}?")
        else:
            reasons.append(f"amount<={args.max_amount}")

    return True, reasons


def command_filter(args: argparse.Namespace) -> int:
    records = ensure_records(read_payload(args.input))
    items: list[dict[str, Any]] = []
    today = resolve_today(getattr(args, "today", None))

    for record in records:
        matched, reasons = match_filter(record, args)
        if not matched:
            continue
        entry = deepcopy(record)
        entry["_match"] = {
            "amount_krw": extract_amount_value(record),
            "deadline": deadline_context(record, today),
            "deadline_status": infer_deadline_status(record, today),
            "reasons": reasons,
        }
        items.append(entry)

    payload = {
        "filters": {
            "q": args.q,
            "org_type": args.org_type,
            "school_kind": args.school_kind,
            "school_name": args.school_name,
            "student_level": args.student_level,
            "major": args.major,
            "department_name": args.department_name,
            "grade_year": args.grade_year,
            "gpa": args.gpa,
            "income_band": args.income_band,
            "min_amount": args.min_amount,
            "max_amount": args.max_amount,
            "deadline_status": args.deadline_status,
            "today": args.today,
            "only_open_now": args.only_open_now,
            "upcoming_within_days": args.upcoming_within_days,
            "deadline_within_days": args.deadline_within_days,
        },
        "total": len(items),
        "items": items,
    }
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def eligibility_result(record: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    failed: list[str] = []
    passed: list[str] = []
    unknown: list[str] = []
    eligibility = get_eligibility(record)

    if args.org_type:
        org_type = extract_org_type(record)
        if not org_type:
            unknown.append("org_type=?")
        elif org_type == normalize_text(args.org_type):
            passed.append(f"org_type={org_type}")
        else:
            failed.append(f"org_type mismatch: {org_type or 'unknown'}")

    if args.school_kind:
        school_kinds = [normalize_text(value) for value in as_list(eligibility.get("school_kinds"))]
        if school_kinds and normalize_text(args.school_kind) not in school_kinds:
            failed.append(f"school_kind mismatch: {school_kinds}")
        elif school_kinds:
            passed.append(f"school_kind={args.school_kind}")
        else:
            unknown.append("school_kind=?")

    if args.school_name:
        school_names = school_match_values(record)
        if school_names and not contains_text(school_names, args.school_name):
            failed.append(f"school_name mismatch: {school_names}")
        elif school_names:
            passed.append(f"school_name~={args.school_name}")
        else:
            unknown.append("school_name=?")

    if args.student_level:
        student_levels = [normalize_text(value) for value in as_list(eligibility.get("student_levels"))]
        if student_levels and normalize_text(args.student_level) not in student_levels:
            failed.append(f"student_level mismatch: {student_levels}")
        elif student_levels:
            passed.append(f"student_level={args.student_level}")
        else:
            unknown.append("student_level=?")

    if args.major:
        majors = as_list(eligibility.get("majors"))
        if majors and not contains_text(majors, args.major):
            failed.append(f"major mismatch: {majors}")
        elif majors:
            passed.append(f"major~={args.major}")
        else:
            unknown.append("major=?")

    if getattr(args, "department_name", None):
        departments = department_match_values(record)
        if departments and not contains_text(departments, args.department_name):
            failed.append(f"department_name mismatch: {departments}")
        elif departments:
            passed.append(f"department_name~={args.department_name}")
        else:
            unknown.append("department_name=?")

    if args.grade_year is not None:
        grade_years = {parse_int(value) for value in as_list(eligibility.get("grade_years"))}
        grade_years.discard(None)
        if grade_years and args.grade_year not in grade_years:
            failed.append(f"grade_year mismatch: {sorted(grade_years)}")
        elif grade_years:
            passed.append(f"grade_year={args.grade_year}")
        else:
            unknown.append("grade_year=?")

    if args.gpa is not None:
        gpa_min = parse_float(eligibility.get("gpa_min"))
        if gpa_min is not None and args.gpa < gpa_min:
            failed.append(f"gpa below minimum: {gpa_min}")
        elif gpa_min is not None:
            passed.append(f"gpa>={gpa_min}")
        else:
            unknown.append("gpa=?")

    if args.income_band is not None:
        income_band_min = parse_int(eligibility.get("income_band_min"))
        income_band_max = parse_int(eligibility.get("income_band_max"))
        income_bands = {parse_int(value) for value in as_list(eligibility.get("income_bands"))}
        income_bands.discard(None)

        if income_bands and args.income_band not in income_bands:
            failed.append(f"income_band mismatch: {sorted(income_bands)}")
        elif income_band_min is not None and args.income_band < income_band_min:
            failed.append(f"income_band below minimum: {income_band_min}")
        elif income_band_max is not None and args.income_band > income_band_max:
            failed.append(f"income_band above maximum: {income_band_max}")
        elif income_bands or income_band_min is not None or income_band_max is not None:
            passed.append(f"income_band={args.income_band}")
        else:
            unknown.append("income_band=?")

    if failed:
        status = "not_eligible"
    elif unknown:
        status = "indeterminate"
    elif passed:
        status = "eligible"
    else:
        status = "indeterminate"
    return {
        "name": record.get("name"),
        "organization_name": extract_org_name(record),
        "organization_type": extract_org_type(record),
        "source_url": record.get("source_url"),
        "apply_url": record.get("apply_url"),
        "status": status,
        "passed": passed,
        "failed": failed,
        "unknown": unknown,
    }


def command_eligibility(args: argparse.Namespace) -> int:
    records = ensure_records(read_payload(args.input))
    results = [eligibility_result(record, args) for record in records]
    payload = {
        "profile": {
            "org_type": args.org_type,
            "school_kind": args.school_kind,
            "school_name": args.school_name,
            "student_level": args.student_level,
            "major": args.major,
            "department_name": args.department_name,
            "grade_year": args.grade_year,
            "gpa": args.gpa,
            "income_band": args.income_band,
        },
        "total": len(results),
        "results": results,
    }
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def add_common_filters(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--input", help="JSON file path. If omitted, reads from stdin.")
    parser.add_argument("--q", help="Keyword filter across name, organization, notes, and majors.")
    parser.add_argument("--org-type", help="school|foundation|government|company|local-government|other")
    parser.add_argument("--school-kind", help="highschool|college|university|graduate-school")
    parser.add_argument("--school-name", help="Partial match against supported school names.")
    parser.add_argument("--student-level", help="highschool|undergraduate|graduate|all")
    parser.add_argument("--major", help="Partial match against target major names.")
    parser.add_argument("--department-name", help="Partial match against department/program names.")
    parser.add_argument("--grade-year", type=int, help="Student year, e.g. 1, 2, 3, 4.")
    parser.add_argument("--gpa", type=float, help="Current GPA for eligibility check.")
    parser.add_argument("--income-band", type=int, help="학자금 지원구간 integer, usually 0~10.")
    parser.add_argument(
        "--today",
        help=f"Override current date for deadline filtering/reporting. When omitted or unparsable, defaults to current KST date ({KST_LABEL}), e.g. 2026-04-14.",
    )


def format_krw(value: int | None) -> str:
    if value is None:
        return "미공개"
    if value >= 100000000:
        return f"{value / 100000000:.1f}억 원"
    if value >= 10000:
        return f"{value / 10000:.0f}만 원"
    return f"{value:,}원"


def compact_eligibility_text(record: dict[str, Any]) -> str:
    eligibility = get_eligibility(record)
    chunks: list[str] = []

    school_names = as_list(eligibility.get("school_names"))
    if school_names:
        chunks.append("학교 " + ", ".join(map(str, school_names[:3])))

    departments = extract_department_names(record)
    if departments:
        chunks.append("학과/전공 " + ", ".join(map(str, departments[:3])))

    student_levels = as_list(eligibility.get("student_levels"))
    if student_levels:
        chunks.append("학생구분 " + ", ".join(map(str, student_levels)))

    grade_years = [str(value) for value in as_list(eligibility.get("grade_years")) if value is not None]
    if grade_years:
        chunks.append("학년 " + ", ".join(grade_years))

    gpa_min = eligibility.get("gpa_min")
    if gpa_min not in (None, ""):
        chunks.append(f"GPA {gpa_min} 이상")

    income_band_min = eligibility.get("income_band_min")
    income_band_max = eligibility.get("income_band_max")
    if income_band_min not in (None, "") or income_band_max not in (None, ""):
        if income_band_min not in (None, "") and income_band_max not in (None, ""):
            chunks.append(f"지원구간 {income_band_min}~{income_band_max}")
        elif income_band_max not in (None, ""):
            chunks.append(f"지원구간 {income_band_max} 이하")
        else:
            chunks.append(f"지원구간 {income_band_min} 이상")

    notes = as_list(eligibility.get("notes"))
    if notes:
        chunks.append(str(notes[0]))

    return " / ".join(chunks) if chunks else "세부 자격은 공고 원문 확인"


def report_entry(record: dict[str, Any], today: date) -> str:
    match_meta = record.get("_match") if isinstance(record.get("_match"), dict) else {}
    context = match_meta.get("deadline") if isinstance(match_meta.get("deadline"), dict) else deadline_context(record, today)
    amount_text = None
    if isinstance(record.get("amount"), dict):
        amount_text = record["amount"].get("text")
    if not amount_text:
        amount_text = format_krw(extract_amount_value(record))

    status_label = context["status"]
    if context["days_until_end"] is not None and context["days_until_end"] >= 0:
        status_label = f"{status_label} / D-{context['days_until_end']}"
    elif context["days_until_start"] is not None and context["days_until_start"] >= 0 and context["status"] == "upcoming":
        status_label = f"{status_label} / starts in {context['days_until_start']}d"

    organization_name = extract_org_name(record) or "기관명 미상"
    organization_type = extract_org_type(record) or "unknown"
    period = f"{context['start'] or '?'} ~ {context['end'] or '?'}"
    source_url = record.get("source_url") or "-"
    apply_url = record.get("apply_url") or "-"
    reasons = match_meta.get("reasons") if isinstance(match_meta.get("reasons"), list) else []

    lines = [
        f"### {record.get('name') or '장학금명 미상'}",
        f"- 기관: {organization_name} ({organization_type})",
        f"- 금액: {amount_text}",
        f"- 기간: {period}",
        f"- 상태: {status_label}",
        f"- 핵심 조건: {compact_eligibility_text(record)}",
    ]
    if reasons:
        lines.append(f"- 필터 판정: {', '.join(reasons)}")
    lines.extend(
        [
            f"- 공식 공고: {source_url}",
            f"- 신청 링크: {apply_url}",
        ]
    )
    return "\n".join(lines)


def command_report(args: argparse.Namespace) -> int:
    today = resolve_today(args.today)
    records = ensure_records(read_payload(args.input))
    matched: list[dict[str, Any]] = []

    for record in records:
        ok, reasons = match_filter(record, args)
        if ok:
            entry = deepcopy(record)
            entry["_match"] = {
                "amount_krw": extract_amount_value(record),
                "deadline": deadline_context(record, today),
                "deadline_status": infer_deadline_status(record, today),
                "reasons": reasons,
            }
            matched.append(entry)

    groups = {"open": [], "upcoming": [], "closed": [], "unknown": []}
    for record in matched:
        status = normalize_deadline_status((record.get("_match") or {}).get("deadline_status")) or "unknown"
        groups[status].append(record)

    lines = [
        "# 장학금 검색 및 조회 리포트",
        f"- 기준일: {today.isoformat()} ({KST_LABEL})",
        f"- 총 후보 수: {len(matched)}",
        f"- 지금 지원 가능: {len(groups['open'])}",
        f"- 곧 열림: {len(groups['upcoming'])}",
        f"- 마감됨: {len(groups['closed'])}",
        f"- 상태 미확인: {len(groups['unknown'])}",
        "",
    ]

    sections = [
        ("지금 지원 가능", "open"),
        ("곧 열림", "upcoming"),
        ("마감됨", "closed"),
        ("상태 미확인", "unknown"),
    ]
    for title, key in sections:
        if not groups[key]:
            continue
        lines.append(f"## {title}")
        lines.append("")
        for record in groups[key]:
            lines.append(report_entry(record, today))
            lines.append("")

    sys.stdout.write("\n".join(lines).rstrip() + "\n")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Filter normalized Korean scholarship records and estimate eligibility from structured JSON.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    filter_parser = subparsers.add_parser("filter", help="Filter scholarship records by profile and preference.")
    add_common_filters(filter_parser)
    filter_parser.add_argument("--min-amount", type=int, help="Minimum scholarship amount in KRW.")
    filter_parser.add_argument("--max-amount", type=int, help="Maximum scholarship amount in KRW.")
    filter_parser.add_argument("--strict-amount", action="store_true", help="Drop records whose amount cannot be normalized to KRW.")
    filter_parser.add_argument("--deadline-status", help="open|upcoming|closed")
    filter_parser.add_argument("--only-open-now", action="store_true", help="Keep only scholarships open on --today.")
    filter_parser.add_argument("--upcoming-within-days", type=int, help="Keep scholarships opening within N days.")
    filter_parser.add_argument("--deadline-within-days", type=int, help="Keep scholarships closing within N days.")
    filter_parser.set_defaults(func=command_filter)

    eligibility_parser = subparsers.add_parser(
        "eligibility",
        help="Return eligible/not_eligible verdicts for each scholarship record.",
    )
    add_common_filters(eligibility_parser)
    eligibility_parser.set_defaults(func=command_eligibility)

    report_parser = subparsers.add_parser(
        "report",
        help="Render a readable markdown report grouped by open/upcoming/closed based on the current date.",
    )
    add_common_filters(report_parser)
    report_parser.add_argument("--min-amount", type=int, help="Minimum scholarship amount in KRW.")
    report_parser.add_argument("--max-amount", type=int, help="Maximum scholarship amount in KRW.")
    report_parser.add_argument("--strict-amount", action="store_true", help="Drop records whose amount cannot be normalized to KRW.")
    report_parser.add_argument("--deadline-status", help="open|upcoming|closed")
    report_parser.add_argument("--only-open-now", action="store_true", help="Keep only scholarships open on --today.")
    report_parser.add_argument("--upcoming-within-days", type=int, help="Keep scholarships opening within N days.")
    report_parser.add_argument("--deadline-within-days", type=int, help="Keep scholarships closing within N days.")
    report_parser.set_defaults(func=command_report)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
