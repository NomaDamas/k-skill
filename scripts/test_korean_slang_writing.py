"""Tests for korean-slang-writing skill (slang_search + slang_lookup)."""
from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import sys
import unittest
import urllib.parse
from unittest import mock


SKILL_ROOT = pathlib.Path(__file__).resolve().parents[1] / "korean-slang-writing"
SCRIPTS_DIR = SKILL_ROOT / "scripts"
DATA_DIR = SKILL_ROOT / "data"


def _load(module_name: str, script_name: str):
    path = SCRIPTS_DIR / script_name
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load spec for {path}")
    module = importlib.util.module_from_spec(spec)
    # The skill's scripts/ must be on sys.path so sibling modules like
    # _slang_http can be imported when tests exec each module in isolation.
    script_parent = str(SCRIPTS_DIR)
    if script_parent not in sys.path:
        sys.path.insert(0, script_parent)
    # Register under file-stem name too so intra-skill imports
    # (e.g. slang_lookup -> _slang_http) share the same module object
    # and exception classes compare identical across test boundaries.
    sys.modules[path.stem] = module
    spec.loader.exec_module(module)
    return module


slang_http = _load("korean_slang_writing_http", "_slang_http.py")
slang_search = _load("korean_slang_writing_search", "slang_search.py")
slang_lookup = _load("korean_slang_writing_lookup", "slang_lookup.py")


def make_entry(
    *,
    term: str,
    aliases=None,
    meaning_short: str = "meaning",
    usage_context=None,
    mood_tags=None,
    intensity: str = "medium",
    safety: str = "safe",
    example_usage=None,
    namuwiki_url: str = "https://namu.wiki/w/test",
    era: str = "2020",
    still_usable: bool = True,
) -> dict:
    return {
        "term": term,
        "aliases": list(aliases or []),
        "meaning_short": meaning_short,
        "usage_context": list(usage_context or []),
        "mood_tags": list(mood_tags or []),
        "intensity": intensity,
        "safety": safety,
        "example_usage": list(example_usage or []),
        "namuwiki_url": namuwiki_url,
        "era": era,
        "still_usable": still_usable,
    }


def make_index(entries: list[dict]) -> dict:
    return {
        "schema_version": "1.0",
        "source": "test-fixture",
        "last_reviewed": "2026-04-22",
        "notes": "fixture for tests",
        "entries": entries,
    }


class SeedIndexShapeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.seed_path = DATA_DIR / "seed-slang.json"
        with self.seed_path.open(encoding="utf-8") as fh:
            self.seed = json.load(fh)

    def test_seed_is_a_dict_with_entries_array(self) -> None:
        self.assertIsInstance(self.seed, dict)
        self.assertIn("entries", self.seed)
        self.assertIsInstance(self.seed["entries"], list)
        self.assertGreaterEqual(len(self.seed["entries"]), 20)

    def test_each_entry_has_required_fields(self) -> None:
        required = {
            "term",
            "aliases",
            "meaning_short",
            "usage_context",
            "mood_tags",
            "intensity",
            "safety",
            "example_usage",
            "namuwiki_url",
            "era",
            "still_usable",
        }
        for entry in self.seed["entries"]:
            missing = required - set(entry.keys())
            self.assertFalse(missing, f"{entry.get('term')} missing {missing}")
            self.assertIsInstance(entry["aliases"], list)
            self.assertIsInstance(entry["usage_context"], list)
            self.assertIsInstance(entry["mood_tags"], list)
            self.assertIsInstance(entry["example_usage"], list)
            self.assertIn(entry["intensity"], {"subtle", "medium", "strong"})
            self.assertIn(entry["safety"], {"safe", "spicy", "risky"})
            self.assertTrue(entry["namuwiki_url"].startswith("https://namu.wiki/"))

    def test_no_risky_safety_in_v1_seed(self) -> None:
        risky = [e["term"] for e in self.seed["entries"] if e["safety"] == "risky"]
        self.assertEqual(risky, [], "v1 seed must exclude risky-safety entries")

    def test_each_seed_url_decodes_to_term_or_alias(self) -> None:
        """Regression guard: every seed namuwiki_url must decode to either the
        entry's term or one of its aliases.

        This catches URL-encoding bugs (wrong Hangul codepoint, missing receiving
        consonant, shortened vowel, etc.) that the mocked lookup tests would never
        notice because they replace fetch_page. It does NOT hit the network.
        """
        prefix = "https://namu.wiki/w/"
        for entry in self.seed["entries"]:
            url = entry["namuwiki_url"]
            self.assertTrue(
                url.startswith(prefix),
                f"{entry['term']!r} namuwiki_url must start with {prefix}: got {url!r}",
            )
            path_segment = url[len(prefix):]
            decoded = urllib.parse.unquote(path_segment)
            candidates = {entry["term"], *entry.get("aliases", [])}
            self.assertIn(
                decoded,
                candidates,
                (
                    f"{entry['term']!r} namuwiki_url decodes to {decoded!r}, "
                    f"which is neither the term nor one of its aliases "
                    f"{sorted(candidates)!r}. Check URL encoding."
                ),
            )

    def test_no_seed_entry_points_at_known_missing_namuwiki_page(self) -> None:
        """Regression guard: we dropped entries that had no canonical Namu Wiki page.

        Keep them dropped so nobody re-adds a 404-returning URL. Extend this list
        only after live-verifying the new URL returns 200.
        """
        terms = [e["term"] for e in self.seed["entries"]]
        self.assertNotIn(
            "당모치",
            terms,
            "'당모치' has no live Namu Wiki article; do not re-add without a valid URL.",
        )


class SearchQueryMatchingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.index = make_index([
            make_entry(term="중꺾마", aliases=["중요한 건 꺾이지 않는 마음"], era="2022"),
            make_entry(term="갓생", aliases=["갓생러"], era="2021"),
            make_entry(term="럭키비키", aliases=["Lucky Vicky"], era="2024"),
            make_entry(term="중꺾그마", aliases=[], era="2023"),
        ])

    def test_exact_term_match_wins_over_substring(self) -> None:
        result = slang_search.search(query="중꺾마", index=self.index)
        self.assertGreaterEqual(result["total_candidates"], 1)
        self.assertEqual(result["candidates"][0]["term"], "중꺾마")
        self.assertEqual(result["candidates"][0]["match_reason"], "exact")

    def test_alias_match_is_reported_as_alias(self) -> None:
        result = slang_search.search(
            query="중요한 건 꺾이지 않는 마음", index=self.index
        )
        self.assertEqual(result["candidates"][0]["term"], "중꺾마")
        self.assertEqual(result["candidates"][0]["match_reason"], "alias")

    def test_substring_match_finds_partials(self) -> None:
        result = slang_search.search(query="꺾", index=self.index)
        matched_terms = [c["term"] for c in result["candidates"]]
        self.assertIn("중꺾마", matched_terms)
        self.assertIn("중꺾그마", matched_terms)
        for candidate in result["candidates"]:
            if candidate["term"] in {"중꺾마", "중꺾그마"}:
                self.assertIn(candidate["match_reason"], {"exact", "substring"})

    def test_substring_match_is_case_insensitive_for_english(self) -> None:
        result = slang_search.search(query="vicky", index=self.index)
        self.assertEqual(result["candidates"][0]["term"], "럭키비키")

    def test_exact_match_outranks_substring_match(self) -> None:
        index = make_index([
            make_entry(term="중꺾그마", era="2023"),
            make_entry(term="중꺾마", era="2022"),
        ])
        result = slang_search.search(query="중꺾마", index=index)
        reasons = [c["match_reason"] for c in result["candidates"]]
        self.assertEqual(result["candidates"][0]["term"], "중꺾마")
        self.assertEqual(reasons[0], "exact")

    def test_no_query_returns_all_entries_bounded_by_limit(self) -> None:
        result = slang_search.search(index=self.index, limit=2)
        self.assertEqual(result["total_candidates"], 2)
        for candidate in result["candidates"]:
            self.assertEqual(candidate["match_reason"], "no-query")

    def test_unmatched_query_returns_empty_candidates(self) -> None:
        result = slang_search.search(query="없는단어xyz", index=self.index)
        self.assertEqual(result["total_candidates"], 0)
        self.assertEqual(result["candidates"], [])


class SearchFilterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.index = make_index([
            make_entry(
                term="A긍정",
                mood_tags=["긍정", "유머"],
                usage_context=["SNS", "마케팅"],
                safety="safe",
                intensity="medium",
                era="2022",
            ),
            make_entry(
                term="B부정",
                mood_tags=["부정"],
                usage_context=["일상"],
                safety="safe",
                intensity="subtle",
                era="2021",
            ),
            make_entry(
                term="C강한",
                mood_tags=["긍정"],
                usage_context=["SNS"],
                safety="spicy",
                intensity="strong",
                era="2020",
            ),
            make_entry(
                term="D옛것",
                mood_tags=["긍정"],
                usage_context=["SNS"],
                safety="safe",
                intensity="medium",
                era="2015",
                still_usable=False,
            ),
        ])

    def test_mood_filter_matches_any_of_requested_tags(self) -> None:
        result = slang_search.search(mood=["긍정"], index=self.index)
        terms = {c["term"] for c in result["candidates"]}
        # D옛것 has matching mood but still_usable=false so is excluded by default.
        self.assertEqual(terms, {"A긍정", "C강한"})

    def test_context_filter_requires_overlap(self) -> None:
        result = slang_search.search(context=["마케팅"], index=self.index)
        terms = {c["term"] for c in result["candidates"]}
        self.assertEqual(terms, {"A긍정"})

    def test_safety_single_value_filter(self) -> None:
        result = slang_search.search(safety="spicy", index=self.index)
        terms = {c["term"] for c in result["candidates"]}
        self.assertEqual(terms, {"C강한"})

    def test_safety_list_filter_allows_multiple_levels(self) -> None:
        result = slang_search.search(safety=["safe", "spicy"], index=self.index)
        terms = {c["term"] for c in result["candidates"]}
        self.assertEqual(terms, {"A긍정", "B부정", "C강한"})

    def test_intensity_filter(self) -> None:
        result = slang_search.search(intensity="subtle", index=self.index)
        terms = {c["term"] for c in result["candidates"]}
        self.assertEqual(terms, {"B부정"})

    def test_include_deprecated_flag_brings_back_legacy_entries(self) -> None:
        result = slang_search.search(
            mood=["긍정"], index=self.index, include_deprecated=True
        )
        terms = {c["term"] for c in result["candidates"]}
        self.assertIn("D옛것", terms)

    def test_limit_clamps_results(self) -> None:
        result = slang_search.search(mood=["긍정"], index=self.index, limit=1)
        self.assertEqual(len(result["candidates"]), 1)
        self.assertEqual(result["total_candidates"], 1)
        self.assertGreaterEqual(result["matched_before_limit"], 2)

    def test_combined_filters_are_anded_together(self) -> None:
        result = slang_search.search(
            mood=["긍정"],
            context=["SNS"],
            safety="safe",
            index=self.index,
        )
        terms = {c["term"] for c in result["candidates"]}
        self.assertEqual(terms, {"A긍정"})

    def test_filters_applied_summary_is_reported(self) -> None:
        result = slang_search.search(
            mood=["긍정"], safety="safe", limit=5, index=self.index
        )
        self.assertEqual(result["filters_applied"]["mood"], ["긍정"])
        self.assertEqual(result["filters_applied"]["safety"], ["safe"])
        self.assertEqual(result["filters_applied"]["limit"], 5)
        self.assertFalse(result["filters_applied"]["include_deprecated"])


class SearchCliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture_path = pathlib.Path(__file__).resolve().parent / "fixtures" / "slang-fixture.json"
        self.fixture_path.parent.mkdir(parents=True, exist_ok=True)
        fixture = make_index([
            make_entry(term="갓생", aliases=["갓생러"], mood_tags=["긍정"], era="2021"),
            make_entry(term="현타", mood_tags=["부정"], era="2015"),
        ])
        self.fixture_path.write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")

    def tearDown(self) -> None:
        if self.fixture_path.exists():
            self.fixture_path.unlink()

    def test_cli_json_output_contains_candidates(self) -> None:
        argv = [
            "--query",
            "갓생",
            "--index-path",
            str(self.fixture_path),
            "--format",
            "json",
        ]
        buf = io.StringIO()
        with mock.patch.object(sys, "stdout", buf):
            exit_code = slang_search.main(argv)
        self.assertEqual(exit_code, 0)
        output = json.loads(buf.getvalue())
        self.assertEqual(output["candidates"][0]["term"], "갓생")

    def test_cli_text_output_is_human_readable(self) -> None:
        argv = [
            "--query",
            "갓생",
            "--index-path",
            str(self.fixture_path),
            "--format",
            "text",
        ]
        buf = io.StringIO()
        with mock.patch.object(sys, "stdout", buf):
            exit_code = slang_search.main(argv)
        self.assertEqual(exit_code, 0)
        output = buf.getvalue()
        self.assertIn("갓생", output)
        self.assertIn("긍정", output)

    def test_cli_reports_error_when_index_path_invalid(self) -> None:
        argv = [
            "--query",
            "갓생",
            "--index-path",
            "/nonexistent/does-not-exist.json",
        ]
        err_buf = io.StringIO()
        out_buf = io.StringIO()
        with mock.patch.object(sys, "stderr", err_buf), mock.patch.object(sys, "stdout", out_buf):
            exit_code = slang_search.main(argv)
        self.assertNotEqual(exit_code, 0)
        self.assertIn("error", err_buf.getvalue().lower())


class LoadIndexTest(unittest.TestCase):
    def test_load_index_reads_bundled_seed_by_default(self) -> None:
        index = slang_search.load_index()
        self.assertIn("entries", index)
        self.assertGreaterEqual(len(index["entries"]), 20)

    def test_load_index_reads_explicit_path(self) -> None:
        path = DATA_DIR / "seed-slang.json"
        index = slang_search.load_index(str(path))
        self.assertIn("entries", index)

    def test_load_index_raises_on_missing_path(self) -> None:
        with self.assertRaises(FileNotFoundError):
            slang_search.load_index("/nonexistent/seed.json")


class LookupParsingTest(unittest.TestCase):
    HTML_SAMPLE = """
    <html>
    <head><title>중꺾마 - 나무위키</title></head>
    <body>
    <article>
      <div class="wiki-paragraph">
        <p>중꺾마는 <b>중요한 건 꺾이지 않는 마음</b>의 줄임말로, 2022년 FIFA 월드컵 당시 유행하기 시작한 표현이다.
        포기하지 않는 불굴의 의지를 의미한다.</p>
      </div>
    </article>
    </body>
    </html>
    """

    HTML_CURRENT_NAMUWIKI = """
    <!doctype html>
    <html>
    <head>
      <title>중요한 것은 꺾이지 않는 마음 - 나무위키</title>
      <meta property="og:description" content="RGE전 패배는 괜찮다. 중요한 것은 꺾이지 않는 마음">
    </head>
    <body>
    <div class="_36R8DWTn">
      <h1 class="_2HZC0kyI"><a href="/w/test" class="kPIqc4b-"><span>중요한 것은 꺾이지 않는 마음</span></a></h1>
      <div class="RW63SZFE">최근 수정 시각: 2026-03-29 13:14:18</div>
      <div class="W6XTddIf">
        <span><a href="/star">별표</a></span>
        <span><a href="/edit">편집 요청</a></span>
      </div>
      <h2 class="_sectionHeading"><span>1. 개요</span><a class="edit-link">[편집]</a></h2>
      <div class="_sectionBody">
        <p>'중요한 것은 꺾이지 않는 마음'은 리그 오브 레전드 2022 월드 챔피언십에 참가한 프로게임단
        DRX 소속 프로게이머 김혁규(Deft) 선수의 인터뷰를 담은 영상의 제목에서 유래된 유행어다.</p>
        <p>포기하지 않는 불굴의 의지를 의미한다.</p>
      </div>
      <h2 class="_sectionHeading"><span>2. 발생 양상</span><a class="edit-link">[편집]</a></h2>
      <div class="_sectionBody">
        <p>2022년 LoL 월드 챔피언십에서 DRX가 디펜딩 챔피언 T1을 꺾고 우승하며 회자되었다.</p>
      </div>
    </div>
    </body>
    </html>
    """

    def test_extract_title_strips_namuwiki_suffix(self) -> None:
        title = slang_lookup.extract_title(self.HTML_SAMPLE)
        self.assertEqual(title, "중꺾마")

    def test_extract_summary_returns_first_paragraph_text(self) -> None:
        summary = slang_lookup.extract_summary(self.HTML_SAMPLE, max_length=1500)
        self.assertIn("꺾이지 않는 마음", summary)
        self.assertNotIn("<p>", summary)
        self.assertNotIn("<b>", summary)

    def test_extract_summary_truncates_to_max_length(self) -> None:
        long_html = (
            "<html><body><article><p>"
            + ("가" * 5000)
            + "</p></article></body></html>"
        )
        summary = slang_lookup.extract_summary(long_html, max_length=100)
        # Summary is capped at max_length + 3 chars for the "..." suffix.
        self.assertLessEqual(len(summary), 103)

    def test_extract_summary_returns_empty_on_unknown_structure(self) -> None:
        summary = slang_lookup.extract_summary("<html><body></body></html>", max_length=1500)
        self.assertEqual(summary, "")

    def test_extract_summary_uses_h2_section_boundaries_on_current_namuwiki_layout(
        self,
    ) -> None:
        """Must use numbered-h2 anchors when Namu Wiki class names are obfuscated."""
        summary = slang_lookup.extract_summary(
            self.HTML_CURRENT_NAMUWIKI, max_length=2000
        )
        self.assertIn("중요한 것은 꺾이지 않는 마음", summary)
        self.assertIn("DRX", summary)
        self.assertIn("포기하지 않는 불굴의 의지", summary)
        self.assertNotIn("T1을 꺾고 우승", summary)
        self.assertNotIn("최근 수정 시각", summary)
        self.assertNotIn("편집 요청", summary)
        self.assertNotIn("별표", summary)

    def test_extract_summary_strips_section_heading_edit_affordances(self) -> None:
        """[편집] edit affordances and N. section numbering must not leak through."""
        summary = slang_lookup.extract_summary(
            self.HTML_CURRENT_NAMUWIKI, max_length=2000
        )
        self.assertNotIn("[편집]", summary)
        self.assertNotIn("1. 개요", summary)

    def test_extract_summary_falls_back_to_og_description_when_no_h2_or_classes(
        self,
    ) -> None:
        """og:description is the final structural fallback before giving up."""
        html = """
        <html>
        <head>
          <title>럭키비키 - 나무위키</title>
          <meta property="og:description" content="완전 럭키비키잖아~! 장원영 IVE 의 멤버 장원영 의 발언에서 유래한 초긍정적 마인드를 표현하는 인터넷 밈.">
        </head>
        <body>
          <div class="obfuscated-x1y2z3">navigation chrome only, no real body.</div>
        </body>
        </html>
        """
        summary = slang_lookup.extract_summary(html, max_length=500)
        self.assertIn("럭키비키", summary)
        self.assertIn("장원영", summary)
        self.assertNotIn("&amp;", summary)
        self.assertNotIn("<", summary)

    def test_extract_summary_handles_single_h2_page(self) -> None:
        """Single-section pages must still extract body text after the lone h2."""
        html = """
        <html><head><title>짧은유행어 - 나무위키</title></head>
        <body>
          <h1>짧은유행어</h1>
          <h2>1. 개요[편집]</h2>
          <p>이 유행어는 짧은 설명을 가진 유행어이다.</p>
          <p>두 번째 문단도 포함되어야 한다.</p>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertIn("짧은 설명", summary)
        self.assertIn("두 번째 문단", summary)

    def test_extract_summary_prefers_h2_strategy_over_class_strategy(self) -> None:
        """h2 boundaries must beat MAIN_CONTENT_CLASSES when both are present."""
        html = """
        <html><head><title>test - 나무위키</title></head>
        <body>
          <div class="wiki-paragraph">navigation sidebar noise goes here.</div>
          <h2>1. 개요[편집]</h2>
          <p>정확한 개요 본문입니다.</p>
          <h2>2. 상세[편집]</h2>
          <p>상세 섹션은 제외되어야 합니다.</p>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertIn("정확한 개요 본문", summary)
        self.assertNotIn("navigation sidebar noise", summary)
        self.assertNotIn("상세 섹션은 제외되어야 합니다", summary)

    def test_extract_summary_ignores_h2_without_numbered_section_prefix(
        self,
    ) -> None:
        """Sidebar/nav ``<h2>`` widgets without a numbered section prefix
        (``<h2>관련 문서</h2>``, ``<h2>외부 링크</h2>`` etc.) MUST NOT be treated
        as section boundaries. When no numbered h2 is present, the extractor
        falls through to the class-based tier.
        """
        html = """
        <html><head><title>test - 나무위키</title></head>
        <body>
          <h2>관련 문서</h2>
          <div class="navigation-sidebar-chrome">unrelated sidebar body</div>
          <h2>바로가기</h2>
          <div class="wiki-paragraph">
            <p>실제 본문은 여기에 있습니다.</p>
          </div>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertIn("실제 본문", summary)
        self.assertNotIn("unrelated sidebar body", summary)
        self.assertNotIn("관련 문서", summary)
        self.assertNotIn("바로가기", summary)

    def test_extract_summary_numbered_h2_gate_skips_sidebar_h2_before_section_one(
        self,
    ) -> None:
        """Regression for the reviewer-flagged edge case: a sidebar-style
        ``<h2>관련 문서</h2>`` placed BEFORE the section ``<h2>1. 개요</h2>``
        must not anchor the extractor. Only numbered section headers
        (``\\d+(?:\\.\\d+)*\\.\\s``) can act as section boundaries.
        """
        html = """
        <html><head><title>test - 나무위키</title></head>
        <body>
          <h2>관련 문서</h2>
          <ul><li>link1</li><li>link2</li></ul>
          <h2>1. 개요[편집]</h2>
          <p>진짜 개요 본문입니다.</p>
          <h2>2. 상세[편집]</h2>
          <p>상세 섹션은 제외됩니다.</p>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertIn("진짜 개요 본문", summary)
        self.assertNotIn("link1", summary)
        self.assertNotIn("link2", summary)
        self.assertNotIn("상세 섹션은 제외됩니다", summary)

    def test_extract_summary_strips_category_nav_template_markers(self) -> None:
        """Namu Wiki inline category nav templates render as
        ``[펼치기 · 접기] item · item · item`` inline on one line. The marker
        itself AND the trailing category items on the same line (its "aftermath")
        must both be stripped so the agent sees the real prose.
        """
        html = """
        <html><head><title>꿀잼 - 나무위키</title></head>
        <body>
          <h2>1. 개요[편집]</h2>
          <p>문화 및 유행어 [펼치기 · 접기] 밈 모음 (ㄱ항목 · ㄴ항목 · 꿀잼 · ㄹ항목)</p>
          <p>꿀잼은 '꿀'과 '재미'의 합성어로, 정말 재미있을 때 사용하는 유행어이다.</p>
          <h2>2. 상세[편집]</h2>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertNotIn("[펼치기 · 접기]", summary)
        self.assertNotIn("ㄱ항목", summary)
        self.assertNotIn("ㄹ항목", summary)
        self.assertNotIn("밈 모음", summary)
        self.assertIn("꿀잼은", summary)
        self.assertIn("재미있을 때", summary)

    def test_extract_summary_category_nav_strip_preserves_surrounding_content(
        self,
    ) -> None:
        """Category-nav stripping must only affect the marker-containing line.
        Content on *other* lines (both before and after) must be preserved.
        """
        html = """
        <html><head><title>test - 나무위키</title></head>
        <body>
          <h2>1. 개요[편집]</h2>
          <p>도입문입니다. 중요한 소개 문장.</p>
          <p>분류 [펼치기 · 접기] 카테고리A · 카테고리B · 카테고리C</p>
          <p>이 문단은 반드시 보존되어야 합니다.</p>
          <h2>2. 상세[편집]</h2>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertIn("도입문입니다", summary)
        self.assertIn("중요한 소개 문장", summary)
        self.assertIn("이 문단은 반드시 보존", summary)
        self.assertNotIn("[펼치기 · 접기]", summary)
        self.assertNotIn("카테고리A", summary)
        self.assertNotIn("카테고리C", summary)

    def test_extract_summary_strips_details_block_wrapping_pelchigi_summary(
        self,
    ) -> None:
        """Live Namu Wiki wraps category-nav templates in a ``<details>`` block
        whose ``<summary>`` label is ``[펼치기 · 접기]``. The entire ``<details>``
        block (summary + all its body rows/cells) must be stripped, not just
        the marker line, so multi-line category dumps don't survive into the
        agent-visible summary.
        """
        html = """
        <html><head><title>꿀잼 - 나무위키</title></head>
        <body>
          <h2>1. 개요[편집]</h2>
          <div class="nav-wrapper">
            <details class="cat-nav">
              <summary>[펼치기 · 접기]</summary>
              <div>문화 및 유행어</div>
              <div>기타</div>
              <div>item1 · item2 · item3</div>
              <div>ㄱ</div>
              <div>가놈 · 가성비 댓글</div>
            </details>
          </div>
          <p>무언가가 매우 재미있다는 의미의 인터넷 유행어이다.</p>
          <h2>2. 상세[편집]</h2>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertNotIn("[펼치기 · 접기]", summary)
        self.assertNotIn("문화 및 유행어", summary)
        self.assertNotIn("item1", summary)
        self.assertNotIn("가놈", summary)
        self.assertNotIn("가성비 댓글", summary)
        self.assertIn("매우 재미있다는 의미", summary)
        self.assertIn("인터넷 유행어", summary)

    def test_extract_summary_keeps_details_block_without_pelchigi_summary(
        self,
    ) -> None:
        """``<details>`` blocks whose ``<summary>`` does NOT contain ``펼치기``
        (e.g. spoilers, footnotes) must be preserved — only the specific
        category-nav pattern is stripped.
        """
        html = """
        <html><head><title>test - 나무위키</title></head>
        <body>
          <h2>1. 개요[편집]</h2>
          <details>
            <summary>스포일러 주의</summary>
            <p>이 내용은 스포일러 정보를 포함합니다.</p>
          </details>
          <p>일반 본문도 있습니다.</p>
          <h2>2. 상세[편집]</h2>
        </body></html>
        """
        summary = slang_lookup.extract_summary(html, max_length=2000)
        self.assertIn("스포일러", summary)
        self.assertIn("일반 본문", summary)


class LookupNetworkTest(unittest.TestCase):
    def test_lookup_returns_structured_result_on_success(self) -> None:
        html = LookupParsingTest.HTML_SAMPLE
        expected_url = slang_http.build_namuwiki_url("중꺾마")

        def fake_fetch(url: str, timeout: int):
            self.assertEqual(url, expected_url)
            return html

        with mock.patch.object(slang_lookup, "fetch_page", side_effect=fake_fetch):
            result = slang_lookup.lookup(
                term_or_url=expected_url,
                timeout=15,
                max_length=1500,
            )

        self.assertTrue(result["fetched"])
        self.assertEqual(result["title"], "중꺾마")
        self.assertIn("꺾이지 않는 마음", result["summary"])
        self.assertEqual(result["url"], expected_url)
        decoded_path = urllib.parse.unquote(expected_url.rsplit("/", 1)[-1])
        self.assertEqual(decoded_path, "중꺾마")

    def test_lookup_handles_http_403_as_blocked(self) -> None:
        def fake_fetch(url: str, timeout: int):
            raise slang_http.BlockedError("HTTP 403 (possibly Cloudflare)")

        with mock.patch.object(slang_lookup, "fetch_page", side_effect=fake_fetch):
            result = slang_lookup.lookup(
                term_or_url="https://namu.wiki/w/test", timeout=5, max_length=1500
            )

        self.assertFalse(result["fetched"])
        self.assertEqual(result["block_reason"], "blocked")
        self.assertIn("403", result["error"])
        self.assertEqual(result["summary"], "")

    def test_lookup_handles_http_404_gracefully(self) -> None:
        def fake_fetch(url: str, timeout: int):
            raise slang_http.NotFoundError("HTTP 404: page not found")

        with mock.patch.object(slang_lookup, "fetch_page", side_effect=fake_fetch):
            result = slang_lookup.lookup(
                term_or_url="https://namu.wiki/w/test", timeout=5, max_length=1500
            )

        self.assertFalse(result["fetched"])
        self.assertEqual(result["block_reason"], "not_found")

    def test_lookup_accepts_bare_term_and_builds_namuwiki_url(self) -> None:
        captured: dict[str, str] = {}

        def fake_fetch(url: str, timeout: int):
            captured["url"] = url
            return LookupParsingTest.HTML_SAMPLE

        with mock.patch.object(slang_lookup, "fetch_page", side_effect=fake_fetch):
            result = slang_lookup.lookup(
                term_or_url="중꺾마", timeout=10, max_length=500
            )

        self.assertTrue(captured["url"].startswith("https://namu.wiki/w/"))
        # Korean multi-byte title must be percent-encoded for namuwiki URL safety.
        self.assertIn("%", captured["url"])
        self.assertEqual(result["title"], "중꺾마")


class HttpUtilitiesTest(unittest.TestCase):
    def test_build_namuwiki_url_encodes_korean_title(self) -> None:
        url = slang_http.build_namuwiki_url("중꺾마")
        self.assertTrue(url.startswith("https://namu.wiki/w/"))
        expected_suffix = urllib.parse.quote("중꺾마", safe="/")
        self.assertEqual(url, f"https://namu.wiki/w/{expected_suffix}")
        self.assertIn("%", url)

    def test_build_namuwiki_url_leaves_existing_url_alone(self) -> None:
        existing = "https://namu.wiki/w/%ED%85%8C%EC%8A%A4%ED%8A%B8"
        self.assertEqual(slang_http.build_namuwiki_url(existing), existing)

    def test_is_namuwiki_url_detects_namuwiki(self) -> None:
        self.assertTrue(slang_http.is_namuwiki_url("https://namu.wiki/w/test"))
        self.assertTrue(slang_http.is_namuwiki_url("https://en.namu.wiki/w/test"))
        self.assertFalse(slang_http.is_namuwiki_url("https://example.com/test"))


class LookupCliTest(unittest.TestCase):
    def test_cli_json_output(self) -> None:
        with mock.patch.object(slang_lookup, "fetch_page", return_value=LookupParsingTest.HTML_SAMPLE):
            argv = [
                "중꺾마",
                "--format",
                "json",
                "--max-length",
                "500",
            ]
            buf = io.StringIO()
            with mock.patch.object(sys, "stdout", buf):
                exit_code = slang_lookup.main(argv)
        self.assertEqual(exit_code, 0)
        output = json.loads(buf.getvalue())
        self.assertEqual(output["title"], "중꺾마")
        self.assertTrue(output["fetched"])

    def test_cli_exits_non_zero_when_blocked(self) -> None:
        def raise_blocked(url: str, timeout: int):
            raise slang_http.BlockedError("HTTP 403")

        with mock.patch.object(slang_lookup, "fetch_page", side_effect=raise_blocked):
            argv = ["https://namu.wiki/w/test"]
            out_buf = io.StringIO()
            err_buf = io.StringIO()
            with mock.patch.object(sys, "stdout", out_buf), mock.patch.object(sys, "stderr", err_buf):
                exit_code = slang_lookup.main(argv)
        self.assertEqual(exit_code, 2)
        output = json.loads(out_buf.getvalue())
        self.assertFalse(output["fetched"])


if __name__ == "__main__":
    unittest.main()
