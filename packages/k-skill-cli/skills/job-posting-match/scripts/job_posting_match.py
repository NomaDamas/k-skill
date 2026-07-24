#!/usr/bin/env python3
"""Match Korean job postings against a job seeker's resume/profile.

Reads public JobKorea and Saramin search result pages only. It does not log in,
submit applications, save postings, or mutate any account state.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

USER_AGENT = "Mozilla/5.0 (compatible; k-skill job-posting-match/1.0; +https://github.com/NomaDamas/k-skill)"

ROLE_TERMS = [
    "퍼포먼스 마케터", "그로스 마케터", "CRM 마케터", "콘텐츠 마케터", "브랜드 마케터", "마케팅 매니저",
    "백엔드 개발자", "프론트엔드 개발자", "풀스택 개발자", "데이터 분석가", "데이터 엔지니어", "프로덕트 매니저",
    "서비스 기획자", "프로덕트 디자이너", "UI/UX 디자이너", "영업", "회계", "인사", "채용", "운영", "MD",
]
TOOL_TERMS = [
    "GA4", "Google Ads", "Meta Ads", "Facebook Ads", "SQL", "Python", "Java", "Spring", "React", "Vue",
    "Node.js", "TypeScript", "JavaScript", "AWS", "GCP", "Kubernetes", "Docker", "Looker Studio", "Tableau",
    "Amplitude", "Braze", "CRM", "SEO", "ASO", "Figma", "Notion", "Excel", "PowerPoint",
]
INDUSTRY_TERMS = ["커머스", "이커머스", "B2C", "B2B", "SaaS", "핀테크", "에듀테크", "헬스케어", "게임", "콘텐츠", "플랫폼", "스타트업"]
NEGATIVE_DEFAULTS = ["보험영업", "대출영업", "텔레마케팅", "TM", "방문판매", "다단계"]
ACTION_LABELS = {"스크랩", "관심공고", "즉시지원", "입사지원", "홈페이지 지원", "저장", "공유", "닫기", "더보기"}


@dataclass
class Posting:
    source: str
    title: str
    company: str = ""
    url: str = ""
    location: str = ""
    career: str = ""
    deadline: str = ""
    summary: str = ""
    score: int = 0
    reasons: list[str] = field(default_factory=list)
    cautions: list[str] = field(default_factory=list)
    matched_terms: list[str] = field(default_factory=list)


def clean_text(value: str) -> str:
    value = re.sub(r"<script\b.*?</script>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<style\b.*?</style>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    for label in ACTION_LABELS:
        value = re.sub(rf"\b{re.escape(label)}\b", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko;q=0.9"})
    with urllib.request.urlopen(req, timeout=25) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, "replace")


def absolute_url(source: str, href: str) -> str:
    href = html.unescape(href)
    base = "https://www.jobkorea.co.kr" if source == "jobkorea" else "https://www.saramin.co.kr"
    return urllib.parse.urljoin(base, href)


def attribute_text(value: object) -> str:
    return value if isinstance(value, str) else ""


def split_keywords(text: str) -> list[str]:
    found: list[str] = []
    lower = text.lower()
    for term in ROLE_TERMS + TOOL_TERMS + INDUSTRY_TERMS:
        if term.lower() in lower and term not in found:
            found.append(term)
    # Add a few meaningful free tokens, but avoid single Korean syllables and common words.
    stop = {"경력", "경험", "담당", "업무", "지원", "희망", "사용", "가능", "이력서", "자기소개서", "서울", "경기"}
    for token in re.findall(r"[A-Za-z][A-Za-z0-9.+#-]{1,}|[가-힣]{2,}", text):
        if token in stop or token in found:
            continue
        if len(found) >= 16:
            break
        found.append(token)
    return found


def build_queries(resume_text: str, explicit: list[str]) -> list[str]:
    if explicit:
        return [q.strip() for q in explicit if q.strip()]
    terms = split_keywords(resume_text)
    roles = [t for t in terms if t in ROLE_TERMS]
    tools = [t for t in terms if t in TOOL_TERMS]
    industries = [t for t in terms if t in INDUSTRY_TERMS]
    queries: list[str] = []
    if roles:
        queries.append(" ".join((roles[:1] + tools[:2])[:3]))
        if len(roles) > 1:
            queries.append(" ".join((roles[1:2] + tools[:1])[:2]))
    if industries and roles:
        queries.append(f"{industries[0]} {roles[0]}")
    if not queries and terms:
        queries.append(" ".join(terms[:3]))
    return list(dict.fromkeys(q for q in queries if q))[:3]


def parse_jobkorea(markup: str, limit: int) -> list[Posting]:
    postings: list[Posting] = []
    seen: set[str] = set()
    try:
        from bs4 import BeautifulSoup  # type: ignore
        soup = BeautifulSoup(markup, "html.parser")
        anchors = soup.find_all("a", href=re.compile(r"/Recruit/GI_Read/", re.I))
        for a in anchors:
            url = absolute_url("jobkorea", attribute_text(a.get("href")))
            job_id = re.search(r"/Recruit/GI_Read/(\d+)", url)
            key = job_id.group(1) if job_id else url
            text = clean_text(a.get_text(" "))
            if not text or key in seen or len(text) < 4:
                continue
            container = a.find_parent(attrs={"data-sentry-component": "CardJob"}) or a.find_parent("div")
            blob = clean_text(container.get_text(" ") if container else text)
            company = ""
            same_links = container.find_all("a", href=True) if container else []
            for link in same_links:
                lt = clean_text(link.get_text(" "))
                if lt and lt != text and len(lt) <= 40 and not re.search(r"채용|모집|마케터|개발자|담당|매니저", lt):
                    company = lt
                    break
            postings.append(Posting(source="jobkorea", title=text, company=company, url=url, summary=blob[:700]))
            seen.add(key)
            if len(postings) >= limit:
                break
    except Exception:
        pass
    if postings:
        return postings

    for m in re.finditer(r'<a\b[^>]*href=["\']([^"\']*/Recruit/GI_Read/\d+[^"\']*)["\'][^>]*>(.*?)</a>', markup, re.I | re.S):
        url = absolute_url("jobkorea", m.group(1))
        key = re.search(r"/Recruit/GI_Read/(\d+)", url)
        key_s = key.group(1) if key else url
        title = clean_text(m.group(2))
        if not title or key_s in seen:
            continue
        postings.append(Posting(source="jobkorea", title=title, url=url, summary=title))
        seen.add(key_s)
        if len(postings) >= limit:
            break
    return postings


def parse_saramin(markup: str, limit: int) -> list[Posting]:
    postings: list[Posting] = []
    seen: set[str] = set()
    try:
        from bs4 import BeautifulSoup  # type: ignore
        soup = BeautifulSoup(markup, "html.parser")
        for item in soup.select("div.item_recruit, div.list_item, div.item_recruit_sri"):
            a = item.select_one('h2.job_tit a[href*="/zf_user/jobs/relay/view"], a[href*="rec_idx="]')
            if not a:
                continue
            url = absolute_url("saramin", attribute_text(a.get("href")))
            rec = re.search(r"rec_idx=(\d+)", url)
            key = rec.group(1) if rec else url
            if key in seen:
                continue
            title = clean_text(attribute_text(a.get("title")) or a.get_text(" "))
            company_el = item.select_one(".corp_name a, .corp_name, .company_nm a, .company_nm")
            condition = clean_text(" ".join(x.get_text(" ") for x in item.select(".job_condition span, .job_sector, .area, .career, .education")))
            deadline_el = item.select_one(".date, .deadlines, .support_detail .date")
            company = clean_text(company_el.get_text(" ")) if company_el else ""
            deadline = clean_text(deadline_el.get_text(" ")) if deadline_el else ""
            blob = clean_text(item.get_text(" "))
            postings.append(Posting(source="saramin", title=title, company=company, url=url, career=condition, deadline=deadline, summary=blob[:700]))
            seen.add(key)
            if len(postings) >= limit:
                break
    except Exception:
        pass
    if postings:
        return postings

    blocks = re.split(r'<div[^>]+class=["\'][^"\']*item_recruit', markup, flags=re.I)
    for block in blocks[1:]:
        m = re.search(r'<a\b[^>]*href=["\']([^"\']*rec_idx=\d+[^"\']*)["\'][^>]*(?:title=["\']([^"\']+)["\'])?[^>]*>(.*?)</a>', block, re.I | re.S)
        if not m:
            continue
        url = absolute_url("saramin", m.group(1))
        key = re.search(r"rec_idx=(\d+)", url)
        key_s = key.group(1) if key else url
        if key_s in seen:
            continue
        title = clean_text(m.group(2) or m.group(3))
        company_match = re.search(r'class=["\'][^"\']*corp_name[^"\']*["\'][^>]*>\s*(?:<a[^>]*>)?(.*?)(?:</a>)?\s*</', block, re.I | re.S)
        company = clean_text(company_match.group(1)) if company_match else ""
        postings.append(Posting(source="saramin", title=title, company=company, url=url, summary=clean_text(block)[:700]))
        seen.add(key_s)
        if len(postings) >= limit:
            break
    return postings


def search_jobkorea(query: str, limit: int) -> list[Posting]:
    url = "https://www.jobkorea.co.kr/Search/?" + urllib.parse.urlencode({"stext": query})
    markup = fetch(url)
    if "잡코리아" not in markup and "JobKorea" not in markup:
        raise RuntimeError("잡코리아가 예상과 다른 응답을 반환했습니다")
    return parse_jobkorea(markup, limit)


def search_saramin(query: str, limit: int) -> list[Posting]:
    url = "https://www.saramin.co.kr/zf_user/search/recruit?" + urllib.parse.urlencode({"searchword": query})
    markup = fetch(url)
    if "사람인" not in markup and "Saramin" not in markup:
        raise RuntimeError("사람인이 예상과 다른 응답을 반환했습니다")
    return parse_saramin(markup, limit)


def detect_career_years(text: str) -> int | None:
    years = [int(x) for x in re.findall(r"(\d{1,2})\s*년", text)]
    return max(years) if years else None


def negative_term_matches(term: str, haystack: str) -> bool:
    normalized = term.strip().lower()
    if not normalized:
        return False
    if re.fullmatch(r"[a-z0-9]{1,3}", normalized):
        return re.search(rf"(?<![a-z0-9]){re.escape(normalized)}(?![a-z0-9])", haystack) is not None
    return normalized in haystack


def score_posting(posting: Posting, resume_text: str, desired_locations: list[str], negative_terms: list[str], career_years: int | None) -> Posting:
    haystack = " ".join([posting.title, posting.company, posting.location, posting.career, posting.summary]).lower()
    resume_terms = split_keywords(resume_text)
    matched = [term for term in resume_terms if term.lower() in haystack]
    role_matches = [t for t in matched if t in ROLE_TERMS]
    tool_matches = [t for t in matched if t in TOOL_TERMS]
    industry_matches = [t for t in matched if t in INDUSTRY_TERMS]

    score = 35
    score += min(25, len(role_matches) * 12 + max(0, len(matched) - len(role_matches)) * 2)
    score += min(20, len(tool_matches) * 5)
    score += min(10, len(industry_matches) * 5)

    reasons: list[str] = []
    cautions: list[str] = []
    if role_matches:
        reasons.append("직무 키워드 일치: " + ", ".join(role_matches[:3]))
    if tool_matches:
        reasons.append("도구/스킬 일치: " + ", ".join(tool_matches[:5]))
    if industry_matches:
        reasons.append("산업/도메인 힌트 일치: " + ", ".join(industry_matches[:3]))
    if desired_locations:
        loc_hits = [loc for loc in desired_locations if loc.lower() in haystack]
        if loc_hits:
            score += 10
            reasons.append("희망 지역 일치: " + ", ".join(loc_hits))
        else:
            cautions.append("희망 지역은 목록 요약에서 확인되지 않음")
    if career_years is not None:
        if "신입" in haystack and career_years >= 3:
            score -= 15
            cautions.append("신입 공고일 가능성이 있어 경력과 맞지 않을 수 있음")
        elif "경력" in haystack or re.search(r"\d+\s*년", haystack):
            score += 5
            reasons.append("경력 조건이 있는 공고로 보임")
    bad_hits = [term for term in negative_terms if negative_term_matches(term, haystack)]
    if bad_hits:
        score -= 30
        cautions.append("제외 조건 감지: " + ", ".join(bad_hits[:5]))
    if not reasons:
        cautions.append("이력서 키워드와 직접 일치하는 근거가 적어 낮은 신뢰도의 후보")

    posting.score = max(0, min(100, score))
    posting.reasons = reasons
    posting.cautions = cautions
    posting.matched_terms = matched[:12]
    return posting


def dedupe(postings: Iterable[Posting]) -> list[Posting]:
    out: list[Posting] = []
    seen: set[str] = set()
    for p in postings:
        key = re.sub(r"[?#].*$", "", p.url) or (p.source + p.title + p.company)
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def print_markdown(postings: list[Posting], queries: list[str], args: argparse.Namespace) -> None:
    print("# 이력서 기반 채용공고 매칭 결과\n")
    print(f"- 검색어: {', '.join(queries)}")
    print(f"- 조회 소스: {', '.join(args.source)}")
    print(f"- 결과 수: {len(postings)}")
    print("- 주의: 공개 검색 결과 요약 기반 추천입니다. 지원 전 원문 공고에서 마감일·연봉·근무지·자격요건을 직접 확인하세요.")
    print("- 안전 경계: 로그인, 스크랩, 입사지원, 개인정보 입력, 메시지 발송은 자동 수행하지 않았습니다.\n")
    for idx, p in enumerate(postings, 1):
        print(f"## {idx}. [{p.source}] {p.title}")
        if p.company:
            print(f"- 회사: {p.company}")
        print(f"- 점수: {p.score}/100")
        print(f"- URL: {p.url}")
        if p.reasons:
            print("- 추천 이유: " + "; ".join(p.reasons))
        if p.cautions:
            print("- 주의점: " + "; ".join(p.cautions))
        if p.matched_terms:
            print("- 매칭 키워드: " + ", ".join(p.matched_terms))
        print("- 지원 전략: 공고 제목/요약과 일치하는 경험을 이력서 상단 요약과 최근 경력 bullet에 먼저 배치하세요.")
        print()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Match JobKorea/Saramin public job postings against a resume")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--resume-text", help="이력서/경력요약 텍스트")
    src.add_argument("--resume-file", help="이력서/경력요약 텍스트 파일")
    parser.add_argument("--keyword", "-k", action="append", default=[], help="검색어. 없으면 이력서에서 자동 생성")
    parser.add_argument("--location", action="append", default=[], help="희망 지역. 여러 번 지정 가능")
    parser.add_argument("--negative", action="append", default=[], help="제외 키워드. 여러 번 지정 가능")
    parser.add_argument("--career-years", type=int, help="경력 연차. 없으면 이력서 텍스트에서 추정")
    parser.add_argument("--source", action="append", choices=["jobkorea", "saramin"], help="조회 소스. 기본: 둘 다")
    parser.add_argument("--per-source", type=int, default=10, help="검색어별/소스별 가져올 공고 수")
    parser.add_argument("--limit", type=int, default=10, help="최종 출력 공고 수")
    parser.add_argument("--json", action="store_true", help="JSON 출력")
    return parser


def run(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.resume_file:
        resume_text = Path(args.resume_file).read_text(encoding="utf-8")
    else:
        resume_text = args.resume_text or ""
    if not resume_text and not args.keyword:
        parser.error("--resume-text/--resume-file 또는 --keyword 중 하나는 필요합니다")
    args.source = args.source or ["jobkorea", "saramin"]
    career_years = args.career_years if args.career_years is not None else detect_career_years(resume_text)
    queries = build_queries(resume_text, args.keyword)
    negative_terms = list(dict.fromkeys(args.negative + NEGATIVE_DEFAULTS))

    collected: list[Posting] = []
    errors: list[str] = []
    for query in queries:
        if "jobkorea" in args.source:
            try:
                collected.extend(search_jobkorea(query, args.per_source))
            except Exception as exc:  # noqa: BLE001 - CLI should continue with other source
                errors.append(f"jobkorea:{query}: {exc}")
        if "saramin" in args.source:
            try:
                collected.extend(search_saramin(query, args.per_source))
            except Exception as exc:  # noqa: BLE001
                errors.append(f"saramin:{query}: {exc}")

    scored = [score_posting(p, resume_text or " ".join(queries), args.location, negative_terms, career_years) for p in dedupe(collected)]
    scored.sort(key=lambda p: p.score, reverse=True)
    result = scored[: args.limit]
    if args.json:
        print(json.dumps({"queries": queries, "errors": errors, "postings": [asdict(p) for p in result]}, ensure_ascii=False, indent=2))
    else:
        print_markdown(result, queries, args)
        if errors:
            print("## 조회 경고")
            for error in errors:
                print(f"- {error}")
    return 0 if result else 1


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except urllib.error.HTTPError as exc:
        print(f"HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        raise SystemExit(2)
    except (urllib.error.URLError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
