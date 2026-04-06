import contextlib
import io
import unittest
from unittest import mock

from scripts.patent_search import (
    PatentDetail,
    PatentSearchResponse,
    PatentSearchResult,
    build_detail_params,
    build_search_params,
    fetch_xml,
    get_patent_detail,
    main,
    parse_args,
    parse_patent_detail_response,
    parse_patent_search_response,
    resolve_service_key,
    search_patents,
)


SAMPLE_SEARCH_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <indexNo>1</indexNo>
        <registerStatus>공개</registerStatus>
        <inventionTitle>이차 전지 배터리 팩</inventionTitle>
        <ipcNumber>H01M 10/00</ipcNumber>
        <registerNumber>1023456789000</registerNumber>
        <registerDate>2024/01/15 00:00:00</registerDate>
        <applicationNumber>1020240001234</applicationNumber>
        <applicationDate>2024/01/02 00:00:00</applicationDate>
        <openNumber>1020250005678</openNumber>
        <openDate>2025/07/09 00:00:00</openDate>
        <publicationNumber>1020250005678</publicationNumber>
        <publicationDate>2025/07/09 00:00:00</publicationDate>
        <astrtCont>배터리 수명 향상을 위한 열 관리 구조.</astrtCont>
        <bigDrawing>http://example.com/big.png</bigDrawing>
        <drawing>http://example.com/thumb.png</drawing>
        <applicantName>주식회사 오픈에이아이코리아</applicantName>
      </item>
      <item>
        <indexNo>2</indexNo>
        <registerStatus>등록</registerStatus>
        <inventionTitle>배터리 모듈 고정장치</inventionTitle>
        <ipcNumber>H01M 50/20</ipcNumber>
        <applicationNumber>1020240009999</applicationNumber>
        <applicationDate>2024/02/18 00:00:00</applicationDate>
        <astrtCont>모듈 조립성을 높이는 고정장치.</astrtCont>
        <applicantName>주식회사 샘플</applicantName>
      </item>
    </items>
    <numOfRows>2</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>24</totalCount>
  </body>
</response>
"""

SAMPLE_DETAIL_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE</resultMsg>
  </header>
  <body>
    <item>
      <applicationNumber>1020240001234</applicationNumber>
      <inventionTitle>이차 전지 배터리 팩</inventionTitle>
      <registerStatus>공개</registerStatus>
      <applicationDate>2024/01/02 00:00:00</applicationDate>
      <openNumber>1020250005678</openNumber>
      <openDate>2025/07/09 00:00:00</openDate>
      <publicationNumber>1020250005678</publicationNumber>
      <publicationDate>2025/07/09 00:00:00</publicationDate>
      <registerNumber>1023456789000</registerNumber>
      <registerDate>2024/01/15 00:00:00</registerDate>
      <ipcNumber>H01M 10/00</ipcNumber>
      <applicantName>주식회사 오픈에이아이코리아</applicantName>
      <astrtCont>배터리 수명 향상을 위한 열 관리 구조.</astrtCont>
      <drawing>http://example.com/thumb.png</drawing>
      <bigDrawing>http://example.com/big.png</bigDrawing>
    </item>
  </body>
</response>
"""

SAMPLE_AUTH_ERROR_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>10</resultCode>
    <resultMsg>API KEY를 잘못 입력하셨습니다.(SERVICE KEY IS NOT REGISTERED ERROR.[30])</resultMsg>
  </header>
</response>
"""


class ParsePatentSearchResponseTest(unittest.TestCase):
    def test_parses_items_and_paging_metadata(self):
        report = parse_patent_search_response(SAMPLE_SEARCH_XML, query="배터리")

        self.assertIsInstance(report, PatentSearchResponse)
        self.assertEqual(report.query, "배터리")
        self.assertEqual(report.total_count, 24)
        self.assertEqual(report.page_no, 1)
        self.assertEqual(report.num_of_rows, 2)
        self.assertEqual(len(report.items), 2)
        self.assertIsInstance(report.items[0], PatentSearchResult)
        self.assertEqual(report.items[0].application_number, "1020240001234")
        self.assertEqual(report.items[0].invention_title, "이차 전지 배터리 팩")
        self.assertEqual(report.items[0].abstract_text, "배터리 수명 향상을 위한 열 관리 구조.")
        self.assertEqual(report.items[0].applicant_name, "주식회사 오픈에이아이코리아")


class ParsePatentDetailResponseTest(unittest.TestCase):
    def test_parses_detail_item(self):
        detail = parse_patent_detail_response(SAMPLE_DETAIL_XML)

        self.assertIsInstance(detail, PatentDetail)
        self.assertEqual(detail.application_number, "1020240001234")
        self.assertEqual(detail.invention_title, "이차 전지 배터리 팩")
        self.assertEqual(detail.register_status, "공개")
        self.assertEqual(detail.big_drawing, "http://example.com/big.png")


class RequestBuilderTest(unittest.TestCase):
    def test_build_search_params_include_service_key_and_paging(self):
        params = build_search_params(
            query="배터리",
            year=2024,
            page_no=2,
            num_of_rows=5,
            patent=True,
            utility=False,
            service_key="test-key",
        )

        self.assertEqual(params["word"], "배터리")
        self.assertEqual(params["year"], "2024")
        self.assertEqual(params["patent"], "true")
        self.assertEqual(params["utility"], "false")
        self.assertEqual(params["pageNo"], "2")
        self.assertEqual(params["numOfRows"], "5")
        self.assertEqual(params["ServiceKey"], "test-key")

    def test_build_detail_params_only_requires_application_number_and_service_key(self):
        params = build_detail_params(application_number="1020240001234", service_key="test-key")

        self.assertEqual(params, {"applicationNumber": "1020240001234", "ServiceKey": "test-key"})

    def test_build_search_params_requires_at_least_one_document_type(self):
        with self.assertRaisesRegex(ValueError, "At least one of patent or utility"):
            build_search_params(
                query="배터리",
                patent=False,
                utility=False,
                service_key="test-key",
            )


class ServiceKeyEncodingTest(unittest.TestCase):
    def test_resolve_service_key_accepts_percent_encoded_portal_value(self):
        self.assertEqual(resolve_service_key("abc%2Bdef%3D%3D"), "abc+def==")

    def test_resolve_service_key_decodes_percent_encoded_env_value(self):
        with mock.patch.dict(
            "scripts.patent_search.os.environ",
            {"KIPRIS_PLUS_API_KEY": "abc%2Bdef%3D%3D"},
            clear=True,
        ):
            self.assertEqual(resolve_service_key(), "abc+def==")

    def test_fetch_xml_does_not_double_encode_percent_encoded_service_key(self):
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return b"<response><header><resultCode>00</resultCode></header></response>"

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            return FakeResponse()

        with mock.patch("urllib.request.urlopen", side_effect=fake_urlopen):
            fetch_xml(
                "https://example.test/patent",
                build_search_params(query="배터리", service_key=resolve_service_key("abc%2Bdef%3D%3D")),
                timeout=7,
            )

        self.assertEqual(captured["timeout"], 7)
        self.assertIn("ServiceKey=abc%2Bdef%3D%3D", captured["url"])
        self.assertNotIn("%252B", captured["url"])
        self.assertNotIn("%253D", captured["url"])


    def test_build_search_params_decodes_percent_encoded_service_key(self):
        """Callers passing a raw percent-encoded key directly into build_search_params
        must not trigger double-encoding when urlencode serializes the dict."""
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return b"<response><header><resultCode>00</resultCode></header></response>"

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            return FakeResponse()

        with mock.patch("urllib.request.urlopen", side_effect=fake_urlopen):
            fetch_xml(
                "https://example.test/patent",
                build_search_params(query="배터리", service_key="abc%2Bdef%3D%3D"),
            )

        self.assertIn("ServiceKey=abc%2Bdef%3D%3D", captured["url"])
        self.assertNotIn("%252B", captured["url"])
        self.assertNotIn("%253D", captured["url"])

    def test_build_detail_params_decodes_percent_encoded_service_key(self):
        """Same guard for build_detail_params direct callers."""
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return b"<response><header><resultCode>00</resultCode></header></response>"

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            return FakeResponse()

        with mock.patch("urllib.request.urlopen", side_effect=fake_urlopen):
            fetch_xml(
                "https://example.test/patent",
                build_detail_params(application_number="1020240001234", service_key="abc%2Bdef%3D%3D"),
            )

        self.assertIn("ServiceKey=abc%2Bdef%3D%3D", captured["url"])
        self.assertNotIn("%252B", captured["url"])
        self.assertNotIn("%253D", captured["url"])


class PatentSearchWorkflowTest(unittest.TestCase):
    def test_search_patents_uses_fetcher_and_returns_parsed_report(self):
        calls = []

        def fake_fetcher(url, params, timeout):
            calls.append((url, params, timeout))
            return SAMPLE_SEARCH_XML

        report = search_patents("배터리", service_key="test-key", fetcher=fake_fetcher, page_no=3, num_of_rows=7)

        self.assertEqual(report.page_no, 1)
        self.assertEqual(report.items[0].application_number, "1020240001234")
        self.assertTrue(calls[0][0].endswith("/getWordSearch"))
        self.assertEqual(calls[0][1]["ServiceKey"], "test-key")
        self.assertEqual(calls[0][1]["pageNo"], "3")
        self.assertEqual(calls[0][1]["numOfRows"], "7")

    def test_get_patent_detail_uses_detail_endpoint(self):
        calls = []

        def fake_fetcher(url, params, timeout):
            calls.append((url, params, timeout))
            return SAMPLE_DETAIL_XML

        detail = get_patent_detail("1020240001234", service_key="test-key", fetcher=fake_fetcher)

        self.assertEqual(detail.application_number, "1020240001234")
        self.assertTrue(calls[0][0].endswith("/getBibliographyDetailInfoSearch"))
        self.assertEqual(calls[0][1]["applicationNumber"], "1020240001234")

    def test_search_patents_surfaces_api_auth_errors_cleanly(self):
        with self.assertRaisesRegex(RuntimeError, "SERVICE KEY IS NOT REGISTERED ERROR"):
            search_patents(
                "배터리",
                service_key="bad-key",
                fetcher=lambda url, params, timeout: SAMPLE_AUTH_ERROR_XML,
            )


class CliTest(unittest.TestCase):
    def test_parse_args_supports_query_and_application_number_modes(self):
        args = parse_args(["--query", "배터리", "--year", "2024", "--num-rows", "5"])
        self.assertEqual(args.query, "배터리")
        self.assertEqual(args.year, 2024)
        self.assertEqual(args.num_rows, 5)

        detail_args = parse_args(["--application-number", "1020240001234"])
        self.assertEqual(detail_args.application_number, "1020240001234")

    def test_main_prints_query_report_as_json(self):
        with mock.patch("scripts.patent_search.search_patents") as search_mock:
            search_mock.return_value = PatentSearchResponse(
                query="배터리",
                page_no=1,
                num_of_rows=1,
                total_count=1,
                items=[
                    PatentSearchResult(
                        index_no=1,
                        application_number="1020240001234",
                        invention_title="이차 전지 배터리 팩",
                        register_status="공개",
                        application_date="2024/01/02 00:00:00",
                        open_number="1020250005678",
                        open_date="2025/07/09 00:00:00",
                        publication_number="1020250005678",
                        publication_date="2025/07/09 00:00:00",
                        register_number=None,
                        register_date=None,
                        ipc_number="H01M 10/00",
                        abstract_text="배터리 수명 향상을 위한 열 관리 구조.",
                        applicant_name="주식회사 오픈에이아이코리아",
                        drawing="http://example.com/thumb.png",
                        big_drawing="http://example.com/big.png",
                    )
                ],
            )
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = main(["--query", "배터리", "--service-key", "test-key"])

        self.assertEqual(exit_code, 0)
        self.assertIn('"query": "배터리"', stdout.getvalue())

    def test_main_reports_missing_api_key(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            exit_code = main(["--query", "배터리"])

        self.assertEqual(exit_code, 2)
        self.assertIn("KIPRIS_PLUS_API_KEY", stderr.getvalue())
