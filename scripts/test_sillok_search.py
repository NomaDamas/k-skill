import contextlib
import io
import ssl
import types
import unittest
from unittest import mock

from scripts.sillok_search import (
    ArticleDetail,
    SearchReport,
    SearchResult,
    build_http_client,
    build_opener,
    filter_results,
    fetch_text,
    parse_args,
    parse_detail_page,
    parse_result_title_metadata,
    parse_search_results,
    search_sillok,
)

SAMPLE_SEARCH_HTML = """<!DOCTYPE html>
<html lang=\"ko\">
<body>
  <input type=\"hidden\" id=\"totalCount\" name=\"totalCount\" value=\"21\"/>
  <input type=\"hidden\" id=\"countK\" name=\"countK\" value=\"11\"/>
  <p class=\"result-text\">검색어 ‘<strong>훈민정음</strong>’ / 검색결과 <strong>21</strong>개</p>
  <div class=\"result-cate02\">
    <div class=\"cate-area\">
      <div class=\"item-wrap\">
        <a href=\"javascript:searchCategory('');\" class=\"cate-item active\">전체 (11)</a>
        <a href=\"javascript:searchCategory('세종실록');\" class=\"cate-item\">세종 (5)</a>
        <a href=\"javascript:searchCategory('정조실록');\" class=\"cate-item\">정조 (1)</a>
      </div>
    </div>
  </div>
  <div class=\"result-list\">
    <div class=\"result-box\">
      <a href=\"javascript:goView('kda_12512030_002', 0);\" class=\"subject\">1. 세종실록 102권, 세종 25년 12월 30일 경술 2번째기사 / <span class='s_keyword'>훈민정음</span>을 창제하다</a>
      <p class=\"text\">이달에 임금이 친히 언문 28자를 지었다.</p>
    </div>
    <div class=\"result-box\">
      <a href=\"javascript:goView('kva_10707018_002', 10);\" class=\"subject\">2. 정조실록 16권, 정조 7년 7월 18일 정미 2번째기사 / 수레·벽돌의 사용 등 중국의 문물에 대한 홍양호의 상소문</a>
      <p class=\"text\">수레·벽돌의 사용, 당나귀·양의 목축 등 중국의 문물에 대한 상소문이다.</p>
    </div>
  </div>
</body>
</html>
"""

SAMPLE_DETAIL_HTML = """<!DOCTYPE html>
<html lang=\"ko\">
<body>
  <div class=\"detail-view\">
    <div class=\"title-head\">
      <div class=\"title\">
        <p class=\"date\">세종실록102권, 세종 25년 12월 30일 경술 2/2 기사 <span>/ 1443년 명 정통(正統) 8년</span></p>
        <h3>훈민정음을 창제하다</h3>
      </div>
    </div>
    <div class=\"view-area\">
      <div class=\"view-item left\">
        <h4 class=\"view-title\">국역</h4>
        <div class=\"view-text\">이달에 임금이 친히 언문(諺文) 28자를 지었다.</div>
        <ul>
          <li class=\"view_font01\">【태백산사고본】 33책 102권 42장 A면 【국편영인본】 4책 533면</li>
          <li class=\"view_font02\">〖분류〗 어문학-어학(語學)</li>
        </ul>
      </div>
      <div class=\"view-item right\">
        <h4 class=\"view-title\">원문</h4>
        <div class=\"view-text\">○是月, 上親制諺文二十八字。</div>
      </div>
    </div>
  </div>
</body>
</html>
"""

SAMPLE_DETAIL_WITH_FOOTER_HTML = """<!DOCTYPE html>
<html lang=\"ko\">
<body>
  <div class=\"detail-view\">
    <div class=\"title-head\">
      <div class=\"title\">
        <p class=\"date\">세종실록102권, 세종 25년 12월 30일 경술 2/2 기사 <span>/ 1443년 명 정통(正統) 8년</span></p>
        <h3>훈민정음을 창제하다</h3>
      </div>
    </div>
    <div class=\"view-area\">
      <div class=\"view-item left\">
        <h4 class=\"view-title\">국역</h4>
        <div class=\"view-text\">
          이달에 임금이 친히 언문(諺文) 28자를 지었다.<br/>
          〖태백산사고본〗 33책 102권 42장 A면〖국편영인본〗 4책 533면<br/>
          〖분류〗어문학-어학(語學)<br/>
          ⓒ 세종대왕기념사업회
        </div>
        <ul>
          <li class=\"view_font02\">〖분류〗 어문학-어학(語學)</li>
        </ul>
      </div>
      <div class=\"view-item right\">
        <h4 class=\"view-title\">원문</h4>
        <div class=\"view-text\">
          ○是月, 上親制諺文二十八字。<br/>
          世宗莊憲大王實錄卷第一百二終<br/>
          〖태백산사고본〗 33책 102권 42장 A면〖국편영인본〗 4책 533면<br/>
          〖분류〗어문학-어학(語學)
        </div>
      </div>
    </div>
  </div>
</body>
</html>
"""


class ParseResultTitleMetadataTest(unittest.TestCase):
    def test_parses_regnal_and_gregorian_year_from_standard_title(self):
        metadata = parse_result_title_metadata(
            "세종실록 102권, 세종 25년 12월 30일 경술 2번째기사 / 훈민정음을 창제하다"
        )

        self.assertEqual(metadata.king, "세종")
        self.assertEqual(metadata.regnal_year, 25)
        self.assertEqual(metadata.gregorian_year, 1443)
        self.assertEqual(metadata.article_title, "훈민정음을 창제하다")

    def test_treats_accession_year_as_regnal_year_one(self):
        metadata = parse_result_title_metadata(
            "문종실록 5권, 문종 즉위년 12월 17일 정해 7번째기사 / 정음청에 보관하던 주자를 주자소에 돌려 주게 하다"
        )

        self.assertEqual(metadata.king, "문종")
        self.assertEqual(metadata.regnal_year, 1)
        self.assertEqual(metadata.gregorian_year, 1450)


class ParseSearchResultsTest(unittest.TestCase):
    def test_extracts_categories_and_result_items(self):
        report = parse_search_results(SAMPLE_SEARCH_HTML, query="훈민정음", search_type="k")

        self.assertEqual(report.total_results, 21)
        self.assertEqual(report.type_count, 11)
        self.assertEqual([item.label for item in report.categories], ["전체", "세종", "정조"])
        self.assertEqual(report.categories[1].count, 5)
        self.assertEqual(len(report.items), 2)
        self.assertEqual(report.items[0].article_id, "kda_12512030_002")
        self.assertEqual(report.items[0].url, "https://sillok.history.go.kr/id/kda_12512030_002")
        self.assertEqual(report.items[0].king, "세종")
        self.assertEqual(report.items[0].gregorian_year, 1443)
        self.assertIn("언문", report.items[0].summary)

    def test_filters_by_king_and_year(self):
        report = parse_search_results(SAMPLE_SEARCH_HTML, query="훈민정음", search_type="k")

        filtered = filter_results(report.items, king="세종", year=1443)

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0].article_id, "kda_12512030_002")


class ParseDetailPageTest(unittest.TestCase):
    def test_extracts_translated_original_and_classification(self):
        detail = parse_detail_page(SAMPLE_DETAIL_HTML, article_id="kda_12512030_002")

        self.assertEqual(detail.title, "훈민정음을 창제하다")
        self.assertEqual(detail.header, "세종실록102권, 세종 25년 12월 30일 경술 2/2 기사 / 1443년 명 정통(正統) 8년")
        self.assertEqual(detail.translated_text, "이달에 임금이 친히 언문(諺文) 28자를 지었다.")
        self.assertEqual(detail.original_text, "○是月, 上親制諺文二十八字。")
        self.assertEqual(detail.classification, "어문학-어학(語學)")

    def test_strips_bibliographic_and_copyright_footer_from_article_text(self):
        detail = parse_detail_page(SAMPLE_DETAIL_WITH_FOOTER_HTML, article_id="kda_12512030_002")

        self.assertEqual(detail.translated_text, "이달에 임금이 친히 언문(諺文) 28자를 지었다.")
        self.assertEqual(detail.original_text, "○是月, 上親制諺文二十八字。 世宗莊憲大王實錄卷第一百二終")
        self.assertEqual(detail.classification, "어문학-어학(語學)")


class NetworkingRegressionTest(unittest.TestCase):
    def test_build_http_client_keeps_urllib_opener_available_when_requests_is_installed(self):
        fake_requests = mock.Mock()

        with (
            mock.patch("scripts.sillok_search.requests", fake_requests),
            mock.patch("scripts.sillok_search.build_opener", return_value="opener") as build_opener_mock,
        ):
            opener = build_http_client()

        self.assertEqual(opener, "opener")
        build_opener_mock.assert_called_once_with()

    def test_build_opener_keeps_default_tls_verification(self):
        fake_context = mock.Mock()
        fake_context.check_hostname = True
        fake_context.verify_mode = ssl.CERT_REQUIRED

        with (
            mock.patch("scripts.sillok_search.ssl.create_default_context", return_value=fake_context),
            mock.patch("scripts.sillok_search.urllib.request.HTTPCookieProcessor", return_value="cookie-processor"),
            mock.patch(
                "scripts.sillok_search.urllib.request.HTTPSHandler",
                side_effect=lambda *, context: ("https-handler", context),
            ),
            mock.patch("scripts.sillok_search.urllib.request.build_opener", return_value="opener") as build_opener_mock,
        ):
            opener = build_opener()

        self.assertEqual(opener, "opener")
        self.assertTrue(fake_context.check_hostname)
        self.assertEqual(fake_context.verify_mode, ssl.CERT_REQUIRED)
        build_opener_mock.assert_called_once_with("cookie-processor", ("https-handler", fake_context))

    def test_fetch_text_keeps_requests_tls_verification_enabled(self):
        response = mock.Mock()
        response.text = "<html></html>"
        response.raise_for_status.return_value = None
        fake_requests = mock.Mock()
        fake_requests.post.return_value = response

        with mock.patch("scripts.sillok_search.requests", fake_requests):
            html_text = fetch_text(
                None,
                "https://sillok.history.go.kr/search/searchResultList.do",
                data={"topSearchWord": "훈민정음"},
            )

        self.assertEqual(html_text, "<html></html>")
        self.assertNotIn("verify", fake_requests.post.call_args.kwargs)

    def test_fetch_text_falls_back_to_urllib_when_requests_transport_fails(self):
        class TransportError(Exception):
            pass

        class HttpError(TransportError):
            pass

        response = mock.MagicMock()
        response.read.return_value = "<html>fallback</html>".encode("utf-8")
        response.__enter__.return_value = response
        opener = mock.Mock()
        opener.open.return_value = response

        fake_requests = mock.Mock()
        fake_requests.post.side_effect = TransportError("Connection aborted")
        fake_requests.exceptions = types.SimpleNamespace(RequestException=TransportError, HTTPError=HttpError)

        with mock.patch("scripts.sillok_search.requests", fake_requests):
            html_text = fetch_text(
                opener,
                "https://sillok.history.go.kr/search/searchResultList.do",
                data={"topSearchWord": "훈민정음"},
                timeout=20,
            )

        self.assertEqual(html_text, "<html>fallback</html>")
        opener.open.assert_called_once()


class SearchSillokRegressionTest(unittest.TestCase):
    def test_search_continues_to_later_pages_for_filtered_matches(self):
        non_matching_items = [
            SearchResult(
                article_id=f"page1_{index}",
                url=f"https://sillok.history.go.kr/id/page1_{index}",
                title=f"정조실록 {index} / 다른 기사",
                article_title="다른 기사",
                summary="page 1",
                king="정조",
                regnal_year=7,
                gregorian_year=1783,
            )
            for index in range(10)
        ]
        matching_item = SearchResult(
            article_id="kda_12512030_002",
            url="https://sillok.history.go.kr/id/kda_12512030_002",
            title="세종실록 102권, 세종 25년 12월 30일 / 훈민정음을 창제하다",
            article_title="훈민정음을 창제하다",
            summary="세종 page 2",
            king="세종",
            regnal_year=25,
            gregorian_year=1443,
        )
        reports_by_page = {
            1: SearchReport(query="훈민정음", search_type="k", total_results=21, type_count=11, categories=[], items=non_matching_items),
            2: SearchReport(query="훈민정음", search_type="k", total_results=21, type_count=11, categories=[], items=[matching_item]),
        }
        detail = ArticleDetail(
            article_id="kda_12512030_002",
            url="https://sillok.history.go.kr/id/kda_12512030_002",
            header="세종실록102권, 세종 25년 12월 30일 경술 2/2 기사 / 1443년 명 정통(正統) 8년",
            title="훈민정음을 창제하다",
            translated_text="이달에 임금이 친히 언문(諺文) 28자를 지었다.",
            original_text="○是月, 上親制諺文二十八字。",
            classification="어문학-어학(語學)",
        )
        page_calls: list[int] = []

        def fake_fetch_search_page(_opener, *, query, search_type, page_index, timeout):
            self.assertEqual(query, "훈민정음")
            self.assertEqual(search_type, "k")
            self.assertEqual(timeout, 7)
            page_calls.append(page_index)
            return reports_by_page[page_index]

        with (
            mock.patch("scripts.sillok_search.build_http_client", return_value=object()),
            mock.patch("scripts.sillok_search.fetch_search_page", side_effect=fake_fetch_search_page),
            mock.patch("scripts.sillok_search.fetch_detail_page", return_value=detail) as fetch_detail_page_mock,
        ):
            report = search_sillok("훈민정음", king="세종", year=1443, limit=1, timeout=7)

        self.assertEqual(page_calls, [1, 2])
        self.assertEqual(report["returned_count"], 1)
        self.assertEqual(report["items"][0]["article_id"], "kda_12512030_002")
        self.assertEqual(report["items"][0]["detail"]["classification"], "어문학-어학(語學)")
        fetch_detail_page_mock.assert_called_once()


class ParseArgsTest(unittest.TestCase):
    def test_accepts_keyword_and_optional_filters(self):
        args = parse_args(["--query", "훈민정음", "--king", "세종", "--year", "1443", "--limit", "3"])

        self.assertEqual(args.query, "훈민정음")
        self.assertEqual(args.king, "세종")
        self.assertEqual(args.year, 1443)
        self.assertEqual(args.limit, 3)

    def test_rejects_non_positive_year(self):
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
            parse_args(["--query", "훈민정음", "--year", "0"])


if __name__ == "__main__":
    unittest.main()
