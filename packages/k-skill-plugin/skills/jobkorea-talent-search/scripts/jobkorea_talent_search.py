#!/usr/bin/env python3
"""Search public JobKorea talent summaries.

This helper uses JobKorea's browser-visible corporate talent search page and its
same AJAX endpoint. It only reads public/obfuscated list summaries. Full resume
view, contact details, scraping at scale, scrap/bookmark, and position proposal
flows are intentionally out of scope because they require an employer account,
paid entitlements, or user confirmation.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
from dataclasses import asdict

from jobkorea_talent_models import Candidate
from jobkorea_talent_parse import clean_text, parse_candidates
from jobkorea_talent_search_condition import build_search_condition, post_search

__all__ = ["parse_candidates"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Search public JobKorea talent summaries")
    parser.add_argument("--keyword", "-k", action="append", default=[], help="통합검색 키워드. 여러 번 지정 가능")
    parser.add_argument("--and-keyword", action="append", default=[], help="AND 키워드")
    parser.add_argument("--or-keyword", action="append", default=[], help="OR 키워드")
    parser.add_argument("--exclude-keyword", action="append", default=[], help="제외 키워드")
    parser.add_argument("--job-category", action="append", default=[], help="직무 대분류명 예: AI·개발·데이터")
    parser.add_argument("--work-area", action="append", default=[], help="희망 근무지역 예: 서울, 강남구, 경기")
    parser.add_argument("--residential-area", action="append", default=[], help="거주지역 예: 서울, 성남시 분당구")
    parser.add_argument("--career-min", type=int, help="최소 경력 연수")
    parser.add_argument("--career-max", type=int, help="최대 경력 연수")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--limit", type=int, default=20, choices=[10, 20, 30, 50, 100])
    parser.add_argument("--sort", default="0", help="잡코리아 sf 정렬 코드. 기본 0")
    parser.add_argument("--json", action="store_true", help="JSON으로 출력")
    return parser


def print_markdown(candidates: list[Candidate], matched: dict[str, list[str]], args: argparse.Namespace) -> None:
    print("# 잡코리아 인재검색 결과\n")
    print(f"- 검색어: {', '.join(args.keyword + args.and_keyword + args.or_keyword) or '(없음)'}")
    print(f"- 제외어: {', '.join(args.exclude_keyword) or '(없음)'}")
    if any(matched.values()):
        print(f"- 매칭된 필터: {json.dumps(matched, ensure_ascii=False)}")
    print(f"- 결과 수: {len(candidates)}")
    print("- 주의: 이름/회사명은 잡코리아 공개 화면 기준으로 마스킹되어 있으며, 상세 이력서 확인·포지션 제안은 기업회원 로그인/권한/사용자 확인이 필요합니다.\n")
    for idx, candidate in enumerate(candidates, 1):
        c = candidate
        bits = [c.name, c.meta, c.career]
        title = " ".join(x for x in bits if x).strip() or f"rNo={c.rno}"
        print(f"## {idx}. {title}")
        print(f"- URL: {c.url}")
        if c.skills:
            print(f"- 키워드/스킬: {c.skills}")
        summary = c.raw_summary.replace("\n", " ")
        if summary:
            print(f"- 요약: {summary[:500]}")
        print()


def run(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not (args.keyword or args.and_keyword or args.or_keyword or args.job_category or args.work_area or args.residential_area):
        parser.error("최소 하나 이상의 --keyword, --job-category, --work-area 등을 지정하세요")

    sc, matched = build_search_condition(args)
    markup = post_search(sc)
    cleaned = clean_text(markup)
    if "로그인" in cleaned[:500] and "인재" not in cleaned[:2000]:
        raise RuntimeError("잡코리아가 로그인/차단 화면을 반환했습니다")
    candidates = parse_candidates(markup, args.limit)

    if args.json:
        print(json.dumps({"matched_filters": matched, "candidates": [asdict(c) for c in candidates]}, ensure_ascii=False, indent=2))
    else:
        print_markdown(candidates, matched, args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except urllib.error.HTTPError as exc:
        print(f"HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        raise SystemExit(2)
    except (RuntimeError, urllib.error.URLError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
