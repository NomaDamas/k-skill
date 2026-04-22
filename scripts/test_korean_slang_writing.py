"""Tests for korean-slang-writing skill (slang_search + slang_lookup)."""
from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import sys
import unittest
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
    spec.loader.exec_module(module)
    return module


slang_search = _load("korean_slang_writing_search", "slang_search.py")
slang_lookup = _load("korean_slang_writing_lookup", "slang_lookup.py")
slang_http = _load("korean_slang_writing_http", "_slang_http.py")


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


class LookupNetworkTest(unittest.TestCase):
    def test_lookup_returns_structured_result_on_success(self) -> None:
        html = LookupParsingTest.HTML_SAMPLE

        def fake_fetch(url: str, timeout: int):
            self.assertEqual(url, "https://namu.wiki/w/%EC%A4%91%EA%BF%BA%EB%A7%88")
            return html

        with mock.patch.object(slang_lookup, "fetch_page", side_effect=fake_fetch):
            result = slang_lookup.lookup(
                term_or_url="https://namu.wiki/w/%EC%A4%91%EA%BF%BA%EB%A7%88",
                timeout=15,
                max_length=1500,
            )

        self.assertTrue(result["fetched"])
        self.assertEqual(result["title"], "중꺾마")
        self.assertIn("꺾이지 않는 마음", result["summary"])
        self.assertEqual(result["url"], "https://namu.wiki/w/%EC%A4%91%EA%BF%BA%EB%A7%88")

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
        self.assertIn("%EC%A4%91%EA%BF%BA%EB%A7%88", url)

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
