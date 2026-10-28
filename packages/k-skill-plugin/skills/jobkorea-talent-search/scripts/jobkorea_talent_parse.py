from __future__ import annotations

import html
import re
import urllib.parse

from jobkorea_talent_models import BASE_URL, Candidate

ACTION_CONTROL_RE = re.compile(
    r"^(?:스크랩\s*\d*|저장하기|닫기|포지션\s*제안|메모하기|프로필\s*확인|이력서\s*확인|펼쳐보기|접기|이전|다음)$"
)
ACTION_CONTROL_INLINE_RE = re.compile(
    r"(?:스크랩\s*\d+|저장하기|닫기|포지션\s*제안|메모하기|프로필\s*확인|이력서\s*확인|펼쳐보기|접기|이전|다음)"
)
RESUME_LINK_RE = re.compile(r'href="(?P<href>/corp/person/find/resume/view\?rNo=(?P<rno>\d+))"')


def clean_text(value: str) -> str:
    value = html.unescape(value)
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    value = re.sub(r"\n\s*\n+", "\n", value)
    return value.strip()


def is_action_control_label(value: str) -> bool:
    label = re.sub(r"\s+", " ", html.unescape(value)).strip()
    return bool(label and ACTION_CONTROL_RE.match(label))


def filter_action_control_text(value: str) -> str:
    lines = []
    for line in value.splitlines():
        label = line.strip()
        if not label or is_action_control_label(label):
            continue
        label = ACTION_CONTROL_INLINE_RE.sub(" ", label)
        label = re.sub(r"\s+", " ", label).strip()
        if label:
            lines.append(label)
    return "\n".join(lines).strip()


def row_contains_other_resume(candidate_markup: str, rno: str) -> bool:
    refs: list[str] = []
    for href_rno, data_rno in re.findall(r"rNo=(\d+)|data-rno=[\"'](\d+)[\"']", candidate_markup):
        refs.append(href_rno or data_rno)
    return any(ref != rno for ref in refs)


def extract_regex_candidate_markup(markup: str, match: re.Match[str], rno: str) -> str:
    row_start = markup.rfind("<tr", 0, match.start())
    if row_start >= 0:
        row_open_end = markup.find(">", row_start, match.start())
        row_end = markup.find("</tr>", match.end())
        row_open = markup[row_start : row_open_end + 1] if row_open_end >= 0 else ""
        if row_end >= 0 and f'data-rno="{rno}"' in row_open:
            return markup[row_start : row_end + len("</tr>")]

    booth_start = markup.rfind('<div class="booth"', 0, match.start())
    if booth_start >= 0:
        next_booth = markup.find('<div class="booth"', match.end())
        section_end = markup.find("</section>", match.end())
        end_candidates = [pos for pos in (next_booth, section_end) if pos >= 0]
        booth_end = min(end_candidates) if end_candidates else min(len(markup), match.end() + 2500)
        booth = markup[booth_start:booth_end]
        if not row_contains_other_resume(booth, rno):
            return booth

    start = max(0, match.start() - 300)
    end = min(len(markup), match.end() + 1200)
    return markup[start:end]


def parse_with_bs4(markup: str, limit: int) -> list[Candidate] | None:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return None

    soup = BeautifulSoup(markup, "html.parser")
    candidates: list[Candidate] = []
    seen: set[str] = set()

    for link in soup.select('a[href*="/corp/person/find/resume/view?rNo="]'):
        raw_href = link.get("href", "")
        href = raw_href if isinstance(raw_href, str) else ""
        matched_rno = re.search(r"rNo=(\d+)", href)
        if not matched_rno:
            continue
        rno = matched_rno.group(1)
        if rno in seen:
            continue
        seen.add(rno)

        container = (
            link.find_parent("tr", attrs={"data-rno": rno})
            or link.find_parent(class_=re.compile(r"(^|\s)booth(\s|$)", re.I))
            or link.parent
        )
        if container and row_contains_other_resume(str(container), rno):
            container = link.parent

        raw = clean_text(str(container)) if container else clean_text(str(link))
        texts = []
        for node in container.find_all(["dt", "dd", "p", "span", "li"]) if container else []:
            label = node.get_text(" ", strip=True)
            if label and not is_action_control_label(label):
                texts.append(label)
        for btn in container.select(".keywordSkill button, .keywordBox button") if container else []:
            label = btn.get_text(" ", strip=True)
            if label and not is_action_control_label(label):
                texts.append(label)
        text_join = " | ".join(dict.fromkeys(texts))

        name_scope = container.select_one(".nameAge") if container else None
        dt = (name_scope or container).find("dt") if container else None
        name = dt.get_text(" ", strip=True) if dt else ""
        dd = dt.find_next("dd") if dt else None
        meta = dd.get_text(" ", strip=True) if dd else ""
        if not name:
            m_name = re.search(r"([가-힣A-Za-z]OO)\s*\(([^)]*)\)", raw)
            if m_name:
                name = m_name.group(1)
                meta = "(" + m_name.group(2) + ")"

        skills = []
        for btn in container.select(".keywordSkill button, .keywordBox button") if container else []:
            label = btn.get_text(" ", strip=True)
            if label and not is_action_control_label(label):
                skills.append(label)

        career_node = container.select_one(".career") if container else None
        candidates.append(
            Candidate(
                rno=rno,
                url=urllib.parse.urljoin(BASE_URL, href),
                name=name,
                meta=meta,
                career=career_node.get_text(" ", strip=True) if career_node else "",
                skills=", ".join(skills[:25]),
                raw_summary=filter_action_control_text(text_join[:1000] or raw[:1000]),
            )
        )
        if len(candidates) >= limit:
            break
    return candidates


def parse_with_regex(markup: str, limit: int) -> list[Candidate]:
    candidates: list[Candidate] = []
    seen: set[str] = set()
    for match in RESUME_LINK_RE.finditer(markup):
        rno = match.group("rno")
        if rno in seen:
            continue
        seen.add(rno)
        raw_markup = extract_regex_candidate_markup(markup, match, rno)
        raw = clean_text(raw_markup)
        name = ""
        meta = ""
        name_match = re.search(r"([가-힣A-Za-z]OO)\s*\(([^)]*)\)", raw)
        if name_match:
            name = name_match.group(1)
            meta = "(" + name_match.group(2) + ")"
        candidates.append(
            Candidate(
                rno=rno,
                url=urllib.parse.urljoin(BASE_URL, match.group("href")),
                name=name,
                meta=meta,
                raw_summary=filter_action_control_text(raw[:1000]),
            )
        )
        if len(candidates) >= limit:
            break
    return candidates


def parse_candidates(markup: str, limit: int) -> list[Candidate]:
    parsed = parse_with_bs4(markup, limit)
    if parsed is not None:
        return parsed
    return parse_with_regex(markup, limit)
