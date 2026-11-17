import importlib.util
import io
import json
import pathlib
import unittest
import urllib.error
import urllib.parse
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "daangn-realty-search" / "scripts" / "daangn_realty.py"
MODULE_SPEC = importlib.util.spec_from_file_location("daangn_realty", MODULE_PATH)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError(f"Unable to load daangn_realty module from {MODULE_PATH}")
daangn_realty = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(daangn_realty)
# daangn_realty 가 자기 scripts/ 디렉터리를 sys.path 에 넣으므로 형제 helper 도 import 된다.
from daangn_detail_ld import floor_label  # noqa: E402


FIXTURE_PATH = pathlib.Path(__file__).resolve().parent / "fixtures" / "daangn-realty-map-yeomchang.html"
YEOMCHANG = {"name1": "서울특별시", "name2": "강서구", "name3": "염창동"}


def fixture_html() -> str:
    return FIXTURE_PATH.read_text(encoding="utf-8")


def stream_html(body: str) -> str:
    return (
        '<html><body><script class="$tsr" id="$tsr-stream-barrier">'
        f'$_TSR.router=($R=>$R[0]={{matches:$R[1]=[$R[2]={{l:{body}}}]}})($R["tsr"]);$_TSR.e();'
        "</script></body></html>"
    )


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
            result = daangn_realty.collect_for_region(
                {"name1": "경기도", "name2": "수원시", "name3": "매교동"},
                sales_type_filter=None,
                trade_type_filter=None,
                limit=10,
                keyword="456",
            )

        self.assertIsNone(result["note"])
        self.assertEqual([item["article_id"] for item in result["items"]], ["456"])


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


class TanStackStreamFixtureTest(unittest.TestCase):
    """2026-11-17 realty.daangn.com/map/서울특별시/강서구/염창동 저장본(렌더 DOM·이미지 레코드만 덜어냄)."""

    def test_extract_feeds_reads_dong_loader_data(self):
        html = fixture_html()
        self.assertNotIn("RELAY_STORE", html)

        feeds = daangn_realty.extract_feeds(html)

        self.assertEqual(len(feeds), 1)
        feed = feeds[0]
        self.assertEqual((feed["mode"], feed["city"], feed["district"], feed["dong"]),
                         ("dong", "서울특별시", "강서구", "염창동"))
        self.assertEqual(feed["regionId"], 258)
        self.assertEqual(feed["propertyFilter"], {"salesTypes": []})
        self.assertEqual(feed["articleCount"], 1000)
        self.assertEqual(len(feed["articles"]), 20)
        self.assertEqual(feed["dongRegion"]["name3"], "염창동")
        self.assertIn({"name3": "가양동"}, feed["siblings"])

    def test_parse_listing_page_maps_trade_price_by_trade_type(self):
        items, meta, note = daangn_realty.parse_listing_page(fixture_html())

        self.assertIsNone(note)
        self.assertEqual(len(items), 20)
        self.assertEqual(meta["total_available"], 1000)
        self.assertEqual(meta["siblings"][:3], ["공항동", "가양동", "개화동"])
        by_id = {item["article_id"]: item for item in items}

        month = by_id["5060253"]
        self.assertEqual(month["salesType"], "OPEN_ONE_ROOM")
        self.assertEqual(month["region_name3"], "염창동")
        self.assertEqual(month["area_sqm"], 20.0)
        self.assertEqual(month["url"], "https://realty.daangn.com/articles/5060253")
        self.assertEqual(
            [(t["type"], t["deposit_manwon"], t["monthly_manwon"], t["price_manwon"]) for t in month["trades"]],
            [("MONTH", 300, 61, None)],
        )
        self.assertEqual(month["floor_label"], "5층/7층")

        buy = by_id["4997721"]
        self.assertEqual(buy["region_name3"], "등촌동")
        self.assertEqual(
            [(t["type"], t["deposit_manwon"], t["price_manwon"]) for t in buy["trades"]],
            [("BUY", None, 17500)],
        )
        self.assertEqual(buy["building_name"], "등촌동두산위브센티움")

        borrow = by_id["5059296"]
        self.assertEqual([(t["type"], t["deposit_manwon"]) for t in borrow["trades"]], [("BORROW", 9000)])

        short = by_id["5058561"]
        self.assertEqual(
            [(t["type"], t["label"], t["deposit_manwon"], t["monthly_manwon"]) for t in short["trades"]],
            [("SHORT", "단기", 30, 140)],
        )

    def test_neighbouring_dongs_are_tagged_with_region_name3(self):
        items, _, _ = daangn_realty.parse_listing_page(fixture_html())

        self.assertEqual(
            {item["region_name3"] for item in items},
            {"염창동", "등촌동", "목동", "양평동6가"},
        )


class TanStackStreamSyntheticTest(unittest.TestCase):
    def test_stream_without_relay_records_uses_loader_articles(self):
        html = stream_html(
            '$R[3]={mode:"dong",dong:"가양동",articleCount:2,siblings:$R[4]=[$R[5]={name3:"염창동"}],'
            'articles:$R[6]=['
            '$R[7]={originalId:"1",salesType:"APART",tradeType:"BORROW",tradePrice:45000,monthlyPay:0,area:"84.9",regionName3:"가양동"},'
            '$R[8]={originalId:"2",salesType:"HOUSE",tradeType:"YEAR",tradePrice:1000,monthlyPay:600,area:"66.11570",regionName3:"가양동"}'
            ']}'
        )

        items, meta, note = daangn_realty.parse_listing_page(html)

        self.assertIsNone(note)
        self.assertEqual(meta["siblings"], ["염창동"])
        self.assertEqual(
            [(t["type"], t["deposit_manwon"], t["monthly_manwon"], t["price_manwon"]) for t in items[0]["trades"]],
            [("BORROW", 45000, None, None)],
        )
        year = items[1]["trades"][0]
        self.assertEqual((year["type"], year["label"], year["deposit_manwon"], year["yearly_manwon"]),
                         ("YEAR", "연세", 1000, 600))
        self.assertEqual(year["per_pyeong_manwon"], 30.0)

    def test_parser_handles_escapes_back_references_and_literals(self):
        html = stream_html(
            '$R[3]={mode:"dong",note:"a\\"b\\x3Cc\\u{1F3E0}\\uD83C\\uDFE0",flag:!0,off:!1,missing:void 0,'
            '"quoted-key":null,region:$R[4]={name3:"염창동"},again:$R[4],articles:$R[5]=[]}'
        )

        feed = daangn_realty.extract_feeds(html)[0]

        self.assertEqual(feed["note"], "a\"b<c\U0001F3E0\U0001F3E0")
        self.assertIs(feed["flag"], True)
        self.assertIs(feed["off"], False)
        self.assertIsNone(feed["missing"])
        self.assertIn("quoted-key", feed)
        self.assertIs(feed["again"], feed["region"])
        self.assertEqual(feed["articles"], [])

    def test_stream_without_articles_reports_structure_note(self):
        items, _, note = daangn_realty.parse_listing_page(stream_html('$R[3]={mode:"dong"}'))

        self.assertEqual(items, [])
        self.assertIn("SSR 스트림에 articles 없음", note)

    def test_page_without_stream_or_relay_store_reports_note(self):
        items, _, note = daangn_realty.parse_listing_page("<html><body>blocked</body></html>")

        self.assertEqual(items, [])
        self.assertIn("RELAY_STORE 모두 없음", note)


class FilterSlugTest(unittest.TestCase):
    def fetch_urls(self, **kwargs):
        urls = []

        def fake_fetch_text(url):
            urls.append(urllib.parse.unquote(url))
            return fixture_html()

        with mock.patch.object(daangn_realty, "fetch_text", side_effect=fake_fetch_text):
            result = daangn_realty.collect_for_region(YEOMCHANG, **kwargs)
        return urls, result

    def test_sales_trade_and_deal_filters_become_path_slugs(self):
        urls, _ = self.fetch_urls(sales_type_filter="OPEN_ONE_ROOM", trade_type_filter="MONTH", deal_type="DIRECT")

        self.assertEqual(urls, ["https://realty.daangn.com/map/서울특별시/강서구/염창동/원룸/월세/직거래"])

    def test_korean_slugs_and_multiple_values_fetch_each_combination(self):
        urls, result = self.fetch_urls(sales_type_filter="원룸,오피스텔", trade_type_filter="월세")

        self.assertEqual(
            urls,
            [
                "https://realty.daangn.com/map/서울특별시/강서구/염창동/원룸/월세",
                "https://realty.daangn.com/map/서울특별시/강서구/염창동/오피스텔/월세",
            ],
        )
        self.assertEqual(
            {(item["salesType"], item["trades"][0]["type"]) for item in result["items"]},
            {("OPEN_ONE_ROOM", "MONTH"), ("OFFICETEL", "MONTH")},
        )

    def test_unknown_sales_type_falls_back_to_unfiltered_page(self):
        urls, result = self.fetch_urls(sales_type_filter="SOMETHING_NEW")

        self.assertEqual(urls, ["https://realty.daangn.com/map/서울특별시/강서구/염창동"])
        self.assertEqual(result["items"], [])

    def test_exact_dong_drops_neighbouring_listings(self):
        _, result = self.fetch_urls(exact_dong=True)

        self.assertTrue(result["items"])
        self.assertEqual({item["region_name3"] for item in result["items"]}, {"염창동"})

    def test_invalid_deal_type_exits(self):
        with self.assertRaises(SystemExit):
            daangn_realty.collect_for_region(YEOMCHANG, deal_type="FOO")

    def test_map_404_reports_legal_dong_hint(self):
        error = urllib.error.HTTPError("https://realty.daangn.com/map/x", 404, "Not Found", {}, io.BytesIO())
        with mock.patch.object(daangn_realty, "fetch_text", side_effect=error):
            result = daangn_realty.collect_for_region({**YEOMCHANG, "name3": "가양1동"})

        self.assertEqual(result["items"], [])
        self.assertIn("법정동", result["note"])


def region_api(responses):
    def fake_fetch_json(url):
        keyword = urllib.parse.unquote(url.split("keyword=", 1)[1])
        return {"locations": responses.get(keyword, [])}

    return fake_fetch_json


def loc(name1, name2, name3, depth=3):
    return {"name": name3, "name1": name1, "name2": name2, "name3": name3, "depth": depth}


class RegionResolutionTest(unittest.TestCase):
    def test_legal_dong_name_strips_administrative_suffixes(self):
        cases = {
            "가양1동": "가양동",
            "가양제1동": "가양동",
            "등촌3동": "등촌동",
            "상계3.4동": "상계동",
            "화곡본동": "화곡동",
            "염창동": None,
            "본동": None,
            "제기동": None,
            "양평동6가": None,
        }
        for name, expected in cases.items():
            with self.subTest(name=name):
                self.assertEqual(daangn_realty.legal_dong_name(name), expected)

    def test_administrative_dong_prefers_seoul_legal_dong(self):
        responses = {
            "가양동": [loc("대전광역시", "동구", "가양동"), loc("서울특별시", "강서구", "가양동")],
            "가양1동": [loc("대전광역시", "동구", "가양1동")],
        }
        with mock.patch.object(daangn_realty, "fetch_json", side_effect=region_api(responses)):
            sel = daangn_realty.resolve_region("가양1동")

        self.assertEqual((sel["name1"], sel["name2"], sel["name3"]), ("서울특별시", "강서구", "가양동"))
        self.assertTrue(sel["resolution"]["admin_to_legal"])
        self.assertEqual(sel["resolution"]["candidates"][1], "대전광역시 동구 가양동")

    def test_administrative_dong_unknown_to_region_api_resolves_via_legal_dong(self):
        responses = {"등촌동": [loc("서울특별시", "강서구", "등촌동")]}
        with mock.patch.object(daangn_realty, "fetch_json", side_effect=region_api(responses)):
            sel = daangn_realty.resolve_region("등촌1동")

        self.assertEqual(sel["name3"], "등촌동")

    def test_leading_words_act_as_region_hints(self):
        responses = {"가양동": [loc("서울특별시", "강서구", "가양동"), loc("대전광역시", "동구", "가양동")]}
        with mock.patch.object(daangn_realty, "fetch_json", side_effect=region_api(responses)):
            sel = daangn_realty.resolve_region("대전 가양1동")

        self.assertEqual((sel["name1"], sel["name3"]), ("대전광역시", "가양동"))

    def test_plain_dong_prefers_seoul_when_ambiguous(self):
        responses = {"중동": [loc("경기도", "부천시 원미구", "중동"), loc("서울특별시", "마포구", "중동")]}
        with mock.patch.object(daangn_realty, "fetch_json", side_effect=region_api(responses)):
            sel = daangn_realty.resolve_region("중동")

        self.assertEqual(sel["name2"], "마포구")
        self.assertFalse(sel["resolution"]["admin_to_legal"])

    def test_exact_name_beats_partial_seoul_match(self):
        responses = {"매교동": [loc("서울특별시", "중구", "매교로동"), loc("경기도", "수원시 팔달구", "매교동")]}
        with mock.patch.object(daangn_realty, "fetch_json", side_effect=region_api(responses)):
            sel = daangn_realty.resolve_region("매교동")

        self.assertEqual(sel["name2"], "수원시 팔달구")

    def test_no_candidates_exits(self):
        with mock.patch.object(daangn_realty, "fetch_json", side_effect=region_api({})):
            with self.assertRaises(SystemExit):
                daangn_realty.resolve_region("없는1동")


class StreamSearchCommandTest(unittest.TestCase):
    def run_search(self, argv):
        urls = []

        def fake_fetch_text(url):
            urls.append(urllib.parse.unquote(url))
            return fixture_html()

        args = daangn_realty.build_parser().parse_args(["search", "--region", "염창동", "--titles", "0", *argv])
        with mock.patch.object(daangn_realty, "resolve_region", return_value=dict(YEOMCHANG)), \
                mock.patch.object(daangn_realty, "fetch_text", side_effect=fake_fetch_text), \
                mock.patch("builtins.print") as mock_print:
            daangn_realty.cmd_search(args)
        return urls, json.loads(mock_print.call_args[0][0])

    def test_search_region_returns_parsed_listings(self):
        _, printed = self.run_search([])

        self.assertEqual(printed["count"], 20)
        self.assertEqual(printed["sources"][0]["total_available"], 1000)
        self.assertIsNone(printed["sources"][0]["note"])
        month = printed["items"][1]
        self.assertEqual(month["article_id"], "5060253")
        self.assertEqual(month["region"], "염창동")
        self.assertEqual(month["searched_region"], "강서구 염창동")
        self.assertNotIn("region_name3", month)

    def test_expand_uses_ssr_siblings(self):
        urls, printed = self.run_search(["--expand", "--expand-max", "2"])

        self.assertEqual(
            urls,
            [
                "https://realty.daangn.com/map/서울특별시/강서구/염창동",
                "https://realty.daangn.com/map/서울특별시/강서구/공항동",
                "https://realty.daangn.com/map/서울특별시/강서구/가양동",
            ],
        )
        self.assertEqual(printed["regions_searched"], 3)
        self.assertEqual(printed["count"], 20)  # 같은 매물은 중복 제거


class FloorLabelTest(unittest.TestCase):
    def test_floor_label_normalizes_numeric_and_suffixed_values(self):
        self.assertEqual(floor_label("8.0", "10"), "8층/10층")
        self.assertEqual(floor_label("5층", "7층"), "5층/7층")
        self.assertEqual(floor_label("반지하", None), "반지하/?층")
        self.assertIsNone(floor_label(None, "10"))


if __name__ == "__main__":
    unittest.main()
