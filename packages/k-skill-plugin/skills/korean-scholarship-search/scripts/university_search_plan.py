#!/usr/bin/env python3
"""Generate exhaustive scholarship search queries for any Korean university."""

from __future__ import annotations

import argparse
import json
from datetime import date


def build_school_queries(
    school_name: str,
    school_domain: str | None,
    departments: list[str],
    colleges: list[str],
    year: int,
) -> dict[str, object]:
    if school_domain:
        domain_targets = [f"site:{school_domain}"]
    else:
        domain_targets = [f"site:*.ac.kr \"{school_name}\""]

    base_suffixes = [
        f"{year} 장학 공고",
        f"{year} 교내 장학",
        f"{year} 외부 장학",
        f"{year} 학생지원처 장학",
        f"{year} 학사공지 장학",
        "장학 공고",
        "교내 장학",
        "외부 장학 추천",
        "학생지원처 장학",
        "학사공지 장학",
    ]

    queries: list[str] = []
    for target in domain_targets:
        for suffix in base_suffixes:
            queries.append(f"{target} {suffix}")

        for college in colleges:
            queries.append(f"{target} \"{college}\" 장학")
            queries.append(f"{target} \"{college}\" 외부 장학")
            queries.append(f"{target} \"{college}\" 장학생 모집")

        for department in departments:
            queries.append(f"{target} \"{department}\" 장학")
            queries.append(f"{target} \"{department}\" 외부 장학")
            queries.append(f"{target} \"{department}\" 공지 장학생")
            queries.append(f"{target} \"{department}\" 대학원 장학")

    url_hints = [
        "/scholarship",
        "/student/scholarship",
        "/notice",
        "/bbs",
        "/board",
        "/undergraduate/notice",
        "/graduate/notice",
        "/academics/undergraduate/scholarship",
        "/academics/graduate/scholarship",
    ]

    checklist = [
        "학교 대표 장학공지",
        "학생지원처 / 장학팀",
        "학사공지 / 일반공지",
        "단과대 공지",
        "학과 / 전공 공지",
        "대학원 공지",
        "첨부 PDF/HWP",
    ]

    return {
        "scope": "school",
        "school_name": school_name,
        "school_domain": school_domain,
        "year": year,
        "departments": departments,
        "colleges": colleges,
        "coverage_checklist": checklist,
        "search_queries": queries,
        "url_hints": url_hints,
    }


def build_nationwide_queries(year: int) -> dict[str, object]:
    queries = [
        f"site:*.ac.kr {year} 장학 공고",
        f"site:*.ac.kr {year} 교내 장학",
        f"site:*.ac.kr {year} 외부 장학 추천",
        f"site:*.ac.kr {year} 학과 장학",
        f"site:*.ac.kr {year} 대학원 장학",
        "site:*.ac.kr 장학 공고",
        "site:*.ac.kr 교내 장학",
        "site:*.ac.kr 외부 장학 추천",
        "site:*.ac.kr 학과 장학",
        "site:*.ac.kr 대학원 장학",
    ]
    return {
        "scope": "nationwide-universities",
        "year": year,
        "search_queries": queries,
        "coverage_notes": [
            "공개된 *.ac.kr 장학 공지 중심",
            "학교 본부 -> 단과대 -> 학과 순서로 수집",
            "검색엔진에 노출되지 않은 게시판은 누락 가능",
            "첨부 PDF/HWP 확인 필요",
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate exhaustive official scholarship search queries for a Korean university or for nationwide university coverage.",
    )
    parser.add_argument("--school-name", help="University name, e.g. 서울대학교.")
    parser.add_argument("--school-domain", help="Official university domain, e.g. snu.ac.kr.")
    parser.add_argument("--department", action="append", default=[], help="Department or program name. Repeatable.")
    parser.add_argument("--college", action="append", default=[], help="College/faculty name. Repeatable.")
    parser.add_argument("--nationwide", action="store_true", help="Generate search queries for all Korean universities.")
    parser.add_argument("--year", type=int, default=date.today().year, help="Target year for notice search.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.nationwide:
        payload = build_nationwide_queries(args.year)
    else:
        if not args.school_name:
            raise SystemExit("--school-name is required unless --nationwide is used")
        payload = build_school_queries(
            school_name=args.school_name,
            school_domain=args.school_domain,
            departments=args.department,
            colleges=args.college,
            year=args.year,
        )

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
