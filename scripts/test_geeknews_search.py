import contextlib
import io
import json
import os
from pathlib import Path
import unittest

from scripts.geeknews_search import (
    GeekNewsFeed,
    build_detail_payload,
    build_list_payload,
    build_search_payload,
    get_item_detail,
    list_items,
    load_feed,
    main,
    search_items,
)

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "geeknews-feed.xml"


class GeekNewsFeedParseTest(unittest.TestCase):
    def test_load_feed_parses_atom_entries_into_normalized_items(self):
        feed = load_feed(FIXTURE_PATH.read_text(encoding="utf-8"))

        self.assertIsInstance(feed, GeekNewsFeed)
        self.assertEqual(feed.title, "GeekNews - 개발/기술/스타트업 뉴스 서비스")
        self.assertEqual(feed.updated, "2026-04-12T22:53:56+09:00")
        self.assertEqual(feed.home_url, "https://news.hada.io")
        self.assertEqual(feed.feed_url, "https://news.hada.io/rss/news")
        self.assertEqual(len(feed.items), 3)

        first = feed.items[0]
        self.assertEqual(first.title, "Ask GN: 기억이 안나는 웹사이트를 찾고 있습니다.")
        self.assertEqual(first.link, "https://news.hada.io/topic?id=28441")
        self.assertEqual(first.id, "https://news.hada.io/topic?id=28441")
        self.assertEqual(first.author_name, "princox")
        self.assertEqual(first.author_url, "https://news.hada.io/user/princox")
        self.assertEqual(first.published, "2026-04-12T22:53:56+09:00")
        self.assertIn("시각화 사이트", first.summary)
        self.assertNotIn("<p>", first.summary)
        self.assertIn("<p>", first.content_html)

    def test_list_items_keeps_feed_order_and_applies_limit(self):
        feed = load_feed(FIXTURE_PATH.read_text(encoding="utf-8"))

        items = list_items(feed, limit=2)

        self.assertEqual([item.id for item in items], [
            "https://news.hada.io/topic?id=28441",
            "https://news.hada.io/topic?id=28440",
        ])

    def test_search_items_matches_title_summary_and_author_case_insensitively(self):
        feed = load_feed(FIXTURE_PATH.read_text(encoding="utf-8"))

        ai_matches = search_items(feed, query="agent", limit=5)
        author_matches = search_items(feed, query="WORKDRIVER", limit=5)

        self.assertEqual([item.id for item in ai_matches], ["https://news.hada.io/topic?id=28440"])
        self.assertEqual([item.id for item in author_matches], ["https://news.hada.io/topic?id=28439"])

    def test_get_item_detail_resolves_by_id_or_link_and_errors_cleanly(self):
        feed = load_feed(FIXTURE_PATH.read_text(encoding="utf-8"))

        item = get_item_detail(feed, "https://news.hada.io/topic?id=28439")
        same_item = get_item_detail(feed, "28439")

        self.assertEqual(item.title, "Show GN: [GN] 비개발자 + Claude로 프로덕션 운영 238일 — 무엇이 됐고 무엇이 안 됐나?")
        self.assertEqual(same_item.id, item.id)
        with self.assertRaisesRegex(LookupError, "No GeekNews entry matched"):
            get_item_detail(feed, "missing-topic")


class GeekNewsPayloadShapeTest(unittest.TestCase):
    def test_list_search_and_detail_payloads_have_stable_json_shape(self):
        feed = load_feed(FIXTURE_PATH.read_text(encoding="utf-8"))

        list_payload = build_list_payload(feed, limit=2)
        search_payload = build_search_payload(feed, query="claude", limit=5)
        detail_payload = build_detail_payload(feed, lookup="28439")

        self.assertEqual(list_payload["source"]["title"], feed.title)
        self.assertEqual(list_payload["count"], 2)
        self.assertEqual(search_payload["query"], "claude")
        self.assertEqual(search_payload["count"], 1)
        self.assertEqual(detail_payload["item"]["id"], "https://news.hada.io/topic?id=28439")
        self.assertIn("summary", detail_payload["item"])
        self.assertIn("content_html", detail_payload["item"])


class GeekNewsCliShapeTest(unittest.TestCase):
    def test_cli_prints_json_for_each_subcommand(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            main(["list", "--feed-file", str(FIXTURE_PATH), "--limit", "2"])
        listed = json.loads(stdout.getvalue())
        self.assertEqual(listed["count"], 2)

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            main(["search", "--feed-file", str(FIXTURE_PATH), "--query", "claude"])
        searched = json.loads(stdout.getvalue())
        self.assertEqual(searched["count"], 1)

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            main(["detail", "--feed-file", str(FIXTURE_PATH), "--id", "28439"])
        detail = json.loads(stdout.getvalue())
        self.assertEqual(detail["item"]["author_name"], "workdriver")

    def test_helper_scripts_are_executable_python_entrypoints(self):
        repo_root = Path(__file__).resolve().parent.parent
        for helper in (
            repo_root / "scripts" / "geeknews_search.py",
            repo_root / "geeknews-search" / "scripts" / "geeknews_search.py",
        ):
            with self.subTest(helper=helper):
                self.assertTrue(os.access(helper, os.X_OK), f"{helper} should be executable")
                self.assertTrue(
                    helper.read_text(encoding="utf-8").startswith("#!/usr/bin/env python3\n"),
                    f"{helper} should start with a Python shebang",
                )


if __name__ == "__main__":
    unittest.main()
