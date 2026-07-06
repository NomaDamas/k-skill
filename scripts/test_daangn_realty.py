import importlib.util
import json
import pathlib
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "daangn-realty-search" / "scripts" / "daangn_realty.py"
MODULE_SPEC = importlib.util.spec_from_file_location("daangn_realty", MODULE_PATH)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError(f"Unable to load daangn_realty module from {MODULE_PATH}")
daangn_realty = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(daangn_realty)


def relay_html(store: dict) -> str:
    encoded = json.dumps(json.dumps(store, ensure_ascii=False), ensure_ascii=False)
    return f"<html><script>window.RELAY_STORE = {encoded};</script></html>"


class RelayStoreParsingTest(unittest.TestCase):
    def test_extract_relay_store_returns_none_for_malformed_payload(self):
        parsed = daangn_realty.extract_relay_store(
            '<html><script>window.RELAY_STORE = "{bad json";</script></html>'
        )

        self.assertIsNone(parsed)

    def test_extract_articles_parses_trade_prices_and_numeric_area(self):
        store = {
            "card:1": {
                "__typename": "ArticleFeedCard",
                "article": {"__ref": "article:1"},
            },
            "article:1": {
                "__typename": "Article",
                "originalId": "123",
                "area": "33.05785",
                "salesTypeV3": {"__ref": "sales:1"},
                "trades": {"__refs": ["trade:month", "trade:buy", "trade:borrow"]},
            },
            "sales:1": {"__typename": "ArticleSalesTypeV2", "type": "OFFICETEL"},
            "trade:month": {
                "__typename": "MonthTrade",
                "deposit": "1000",
                "monthlyPay": "50",
            },
            "trade:buy": {"__typename": "BuyTrade", "price": "20000"},
            "trade:borrow": {"__typename": "BorrowTrade", "deposit": "15000"},
        }

        parsed = daangn_realty.extract_relay_store(relay_html(store))
        items = daangn_realty.extract_articles(parsed, max_items=5)

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["article_id"], "123")
        self.assertEqual(items[0]["salesType"], "OFFICETEL")
        self.assertEqual(items[0]["area_pyeong"], 10.0)
        self.assertEqual(
            [(trade["type"], trade["per_pyeong_manwon"]) for trade in items[0]["trades"]],
            [("MONTH", 5.0), ("BUY", 2000.0), ("BORROW", 1500.0)],
        )


class SearchFilteringTest(unittest.TestCase):
    def test_collect_for_region_filters_keyword_against_enriched_item_text(self):
        store = {
            "card:1": {"__typename": "ArticleFeedCard", "article": {"__ref": "article:1"}},
            "article:1": {
                "__typename": "Article",
                "originalId": "123",
                "area": "33.05785",
                "salesTypeV3": {"__ref": "sales:1"},
                "trades": {"__refs": ["trade:month"]},
            },
            "card:2": {"__typename": "ArticleFeedCard", "article": {"__ref": "article:2"}},
            "article:2": {
                "__typename": "Article",
                "originalId": "456",
                "area": "20",
                "salesTypeV3": {"__ref": "sales:1"},
                "trades": {"__refs": ["trade:month"]},
            },
            "sales:1": {"__typename": "ArticleSalesTypeV2", "type": "STORE"},
            "trade:month": {"__typename": "MonthTrade", "deposit": "1000", "monthlyPay": "50"},
        }

        with mock.patch.object(daangn_realty, "fetch_text", return_value=relay_html(store)):
            _, items, error = daangn_realty.collect_for_region(
                {"name1": "경기도", "name2": "수원시", "name3": "매교동"},
                sales_type_filter=None,
                trade_type_filter=None,
                limit=10,
                keyword="456",
            )

        self.assertIsNone(error)
        self.assertEqual([item["article_id"] for item in items], ["456"])


class DetailParsingTest(unittest.TestCase):
    def test_parse_detail_handles_missing_graph_and_extracts_floor(self):
        html = """
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":null}</script>
        <script type="application/ld+json">
        {"@graph":[
          {"@type":"Product","name":"상가 월세","releaseDate":"2026-07-02T11:34:38.149Z","additionalProperty":[
            {"name":"floor","value":"8.0"},
            {"name":"topFloor","value":"10"},
            {"name":"nearbySubwayStation","value":"매교역"}
          ]},
          {"@type":"Place","name":"경기도 수원시 팔달구 매교동"}
        ]}
        </script>
        """

        with mock.patch.object(daangn_realty, "fetch_text", return_value=html):
            detail = daangn_realty.parse_detail("https://realty.daangn.com/articles/123")

        self.assertEqual(detail["title"], "상가 월세")
        self.assertEqual(detail["address"], "경기도 수원시 팔달구 매교동")
        self.assertEqual(detail["floor_label"], "8층/10층")
        self.assertEqual(detail["nearby_subway"], "매교역")
        self.assertEqual(detail["release_date"], "2026-07-02T11:34:38.149Z")

    def test_parse_detail_defaults_release_date_to_none_when_absent(self):
        html = """
        <script type="application/ld+json">
        {"@graph":[{"@type":"Product","name":"매매"}]}
        </script>
        """

        with mock.patch.object(daangn_realty, "fetch_text", return_value=html):
            detail = daangn_realty.parse_detail("https://realty.daangn.com/articles/456")

        self.assertIsNone(detail["release_date"])

    def test_parse_detail_extracts_release_date_from_later_product_node(self):
        html = """
        <script type="application/ld+json">
        {"@graph":[
          {"@type":"Product","name":"상가 월세"},
          {"@type":"Product","name":"상가 월세","releaseDate":"2026-07-05T09:12:33.000Z"}
        ]}
        </script>
        """

        with mock.patch.object(daangn_realty, "fetch_text", return_value=html):
            detail = daangn_realty.parse_detail("https://realty.daangn.com/articles/789")

        self.assertEqual(detail["title"], "상가 월세")
        self.assertEqual(detail["release_date"], "2026-07-05T09:12:33.000Z")


class SearchEnrichmentTest(unittest.TestCase):
    def test_cmd_search_enriches_items_with_release_date(self):
        store = {
            "card:1": {"__typename": "ArticleFeedCard", "article": {"__ref": "article:1"}},
            "article:1": {
                "__typename": "Article",
                "originalId": "123",
                "area": "33.05785",
                "salesTypeV3": {"__ref": "sales:1"},
                "trades": {"__refs": ["trade:month"]},
            },
            "sales:1": {"__typename": "ArticleSalesTypeV2", "type": "STORE"},
            "trade:month": {"__typename": "MonthTrade", "deposit": "1000", "monthlyPay": "50"},
        }
        detail_html = """
        <script type="application/ld+json">
        {"@graph":[{"@type":"Product","name":"상가 월세","releaseDate":"2026-07-02T11:34:38.149Z"}]}
        </script>
        """

        def fake_fetch_text(url):
            if "articles" in url:
                return detail_html
            return relay_html(store)

        args = daangn_realty.build_parser().parse_args(
            ["search", "--region", "매교동", "--limit", "5", "--titles", "5"]
        )

        with mock.patch.object(
            daangn_realty, "resolve_region",
            return_value={"name1": "경기도", "name2": "수원시 팔달구", "name3": "매교동"},
        ), mock.patch.object(daangn_realty, "fetch_text", side_effect=fake_fetch_text), \
                mock.patch("builtins.print") as mock_print:
            daangn_realty.cmd_search(args)

        printed = json.loads(mock_print.call_args[0][0])
        self.assertEqual(printed["items"][0]["release_date"], "2026-07-02T11:34:38.149Z")

    def test_cmd_search_leaves_release_date_absent_when_titles_disabled(self):
        store = {
            "card:1": {"__typename": "ArticleFeedCard", "article": {"__ref": "article:1"}},
            "article:1": {
                "__typename": "Article",
                "originalId": "123",
                "area": "33.05785",
                "salesTypeV3": {"__ref": "sales:1"},
                "trades": {"__refs": ["trade:month"]},
            },
            "sales:1": {"__typename": "ArticleSalesTypeV2", "type": "STORE"},
            "trade:month": {"__typename": "MonthTrade", "deposit": "1000", "monthlyPay": "50"},
        }

        args = daangn_realty.build_parser().parse_args(
            ["search", "--region", "매교동", "--limit", "5", "--titles", "0"]
        )

        with mock.patch.object(
            daangn_realty, "resolve_region",
            return_value={"name1": "경기도", "name2": "수원시 팔달구", "name3": "매교동"},
        ), mock.patch.object(daangn_realty, "fetch_text", return_value=relay_html(store)), \
                mock.patch("builtins.print") as mock_print:
            daangn_realty.cmd_search(args)

        printed = json.loads(mock_print.call_args[0][0])
        self.assertNotIn("release_date", printed["items"][0])


class CliCompatibilityTest(unittest.TestCase):
    def test_search_parser_keeps_keyword_and_only_verified_flags(self):
        parser = daangn_realty.build_parser()

        args = parser.parse_args(
            [
                "search",
                "--region",
                "매교동",
                "--keyword",
                "상가",
                "--only-verified",
                "--limit",
                "1",
                "--titles",
                "0",
            ]
        )

        self.assertEqual(args.keyword, "상가")
        self.assertTrue(args.only_verified)


if __name__ == "__main__":
    unittest.main()
