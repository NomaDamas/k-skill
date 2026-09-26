"""Offline tests for the e뮤지엄 소장품 검색 helper.

These tests never touch the network. They use deterministic fixtures and fake
HTTP responses to pin request building, key resolution, response normalization,
and the typed failure modes documented in ``instruction.md``.
"""

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest
import urllib.error
import urllib.parse
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "emuseum-collection-search" / "scripts" / "emuseum_collection_search.py"
FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"

SPEC = importlib.util.spec_from_file_location("emuseum_collection_search", MODULE_PATH)
assert SPEC is not None
assert SPEC.loader is not None
emuseum = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(emuseum)


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def parse_args(argv):
    return emuseum.build_parser().parse_args(argv)


class BuildRequestTest(unittest.TestCase):
    def test_query_params_map_filters_and_paging(self):
        params = emuseum.build_query_params(
            api_key="secret-key",
            query="청자",
            era="고려",
            museum="국립중앙박물관",
            page=2,
            limit=5,
        )
        self.assertEqual(params["pageNo"], "2")
        self.assertEqual(params["numOfRows"], "5")
        self.assertEqual(params["relicName"], "청자")
        self.assertEqual(params["eraName"], "고려")
        self.assertEqual(params["museumName"], "국립중앙박물관")
        self.assertEqual(params["serviceKey"], "secret-key")

    def test_blank_filters_are_omitted(self):
        params = emuseum.build_query_params(
            api_key="", query="  ", era="", museum="", page=1, limit=10
        )
        self.assertNotIn("relicName", params)
        self.assertNotIn("eraName", params)
        self.assertNotIn("museumName", params)
        self.assertNotIn("serviceKey", params)

    def test_search_url_encodes_filters_and_redacts_key(self):
        params = emuseum.build_query_params(
            api_key="a b+c",
            query="청자",
            era="",
            museum="",
            page=1,
            limit=10,
        )
        url = emuseum.build_search_url("https://example.test/openApi", "/selectRelicList.do", params)
        parsed = urllib.parse.urlparse(url)
        self.assertEqual(parsed.path, "/openApi/selectRelicList.do")
        query = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(query["relicName"], ["청자"])
        self.assertEqual(query["serviceKey"], ["a b+c"])
        self.assertNotIn("a b+c", emuseum.redact_url(url))
        self.assertIn("serviceKey=REDACTED", emuseum.redact_url(url))


class KeyResolutionTest(unittest.TestCase):
    def test_env_priority_prefers_kskill_then_compat(self):
        args = parse_args(["search", "--secrets-path", "/tmp/missing-emuseum-secrets"])
        with mock.patch.dict(
            os.environ,
            {"KSKILL_EMUSEUM_API_KEY": "primary", "EMUSEUM_API_KEY": "compat"},
            clear=True,
        ):
            self.assertEqual(emuseum.resolve_api_key(args), "primary")
        with mock.patch.dict(os.environ, {"EMUSEUM_API_KEY": "compat"}, clear=True):
            self.assertEqual(emuseum.resolve_api_key(args), "compat")

    def test_secrets_file_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "secrets.env"
            path.write_text(
                "# comment\nEMUSEUM_API_KEY=file-key\nKSKILL_EMUSEUM_API_KEY = 'quoted-key'\n",
                encoding="utf-8",
            )
            args = parse_args(["search", "--secrets-path", str(path)])
            with mock.patch.dict(os.environ, {}, clear=True):
                self.assertEqual(emuseum.resolve_api_key(args), "quoted-key")

    def test_missing_key_returns_none(self):
        args = parse_args(["search", "--secrets-path", "/tmp/missing-emuseum-secrets"])
        with mock.patch.dict(os.environ, {"DATA_GO_KR_API_KEY": "unrelated"}, clear=True):
            self.assertIsNone(emuseum.resolve_api_key(args))

    def test_missing_key_run_reports_issuance_guidance(self):
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stderr(stderr):
            code = emuseum.run(
                [
                    "search",
                    "--query",
                    "청자",
                    "--secrets-path",
                    "/tmp/missing-emuseum-secrets",
                ]
            )
        self.assertEqual(code, 1)
        output = stderr.getvalue()
        self.assertIn("KSKILL_EMUSEUM_API_KEY", output)
        self.assertIn("EMUSEUM_API_KEY", output)
        self.assertIn("emuseum.go.kr", output)
        self.assertNotIn("Traceback", output)


class ParsingTest(unittest.TestCase):
    def test_parse_json_envelope_normalizes_items(self):
        payload = emuseum.parse_response(fixture("relic_search_list.json"))
        self.assertEqual(payload["total_count"], 2)
        self.assertEqual(payload["page"], 1)
        self.assertEqual(payload["page_size"], 10)
        self.assertEqual(len(payload["items"]), 2)

        first = payload["items"][0]
        self.assertEqual(first["id"], "1001")
        self.assertEqual(first["name"], "청자 상감운학문 매병")
        self.assertEqual(first["era"], "고려")
        self.assertEqual(first["museum"], "국립중앙박물관")
        self.assertEqual(first["management_number"], "덕수 1234")
        self.assertNotIn("<p>", first["description"])
        self.assertIn("상감 기법", first["description"])
        self.assertEqual(first["image_url"], "https://www.emuseum.go.kr/image/1001.jpg")
        self.assertEqual(first["detail_url"], "https://www.emuseum.go.kr/relic/1001")

    def test_parse_xml_envelope_normalizes_items(self):
        payload = emuseum.parse_response(fixture("relic_search_list.xml"))
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["name"], "금동 미륵보살 반가사유상")
        self.assertEqual(payload["items"][0]["era"], "삼국시대")
        self.assertEqual(payload["items"][0]["management_number"], "본관 2001")

    def test_nodata_result_code_is_empty_success(self):
        payload = emuseum.parse_response(fixture("relic_search_nodata.json"))
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["total_count"], 0)

    def test_error_result_code_raises_typed_error(self):
        with self.assertRaises(emuseum.EmuseumError) as ctx:
            emuseum.parse_response(fixture("relic_search_error.json"))
        message = str(ctx.exception)
        self.assertIn("resultCode=30", message)
        self.assertIn("SERVICE_KEY_IS_NOT_REGISTERED_ERROR", message)

    def test_empty_response_raises(self):
        with self.assertRaises(emuseum.EmuseumError):
            emuseum.parse_response(b"   \n")

    def test_malformed_json_raises(self):
        with self.assertRaises(emuseum.EmuseumError):
            emuseum.parse_response(b"{not valid json")

    def test_plain_item_list_is_supported(self):
        payload = emuseum.parse_response(
            json.dumps([{"relicName": "백자 달항아리", "eraName": "조선"}]).encode("utf-8")
        )
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["name"], "백자 달항아리")
        self.assertEqual(payload["items"][0]["management_number"], "", "id가 없으면 관리번호도 비어 있다")

    def test_item_id_is_not_reused_as_management_number(self):
        payload = emuseum.parse_response(
            json.dumps(
                {
                    "response": {
                        "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
                        "body": {
                            "items": {"item": [{"relicId": "1001", "relicName": "청자 매병"}]},
                            "numOfRows": 10,
                            "pageNo": 1,
                            "totalCount": 1,
                        },
                    }
                }
            ).encode("utf-8")
        )
        item = payload["items"][0]
        self.assertEqual(item["id"], "1001")
        self.assertEqual(
            item["management_number"], "", "관리번호가 응답에 없으면 id로 채우지 않고 비워 둔다"
        )

    def test_unrecognized_json_error_object_raises(self):
        with self.assertRaises(emuseum.EmuseumError) as ctx:
            emuseum.parse_response(
                json.dumps({"error": "invalid serviceKey"}).encode("utf-8")
            )
        self.assertIn("봉투", str(ctx.exception))

    def test_nested_json_response_error_object_raises(self):
        with self.assertRaises(emuseum.EmuseumError):
            emuseum.parse_response(
                json.dumps({"response": {"error": "invalid serviceKey"}}).encode("utf-8")
            )

    def test_unrecognized_xml_error_document_raises(self):
        with self.assertRaises(emuseum.EmuseumError):
            emuseum.parse_response(
                b'<?xml version="1.0"?><error><message>invalid key</message></error>'
            )

    def test_body_with_only_pagination_is_empty_success(self):
        payload = emuseum.parse_response(
            json.dumps(
                {"response": {"body": {"totalCount": 0, "pageNo": 1, "numOfRows": 10}}}
            ).encode("utf-8")
        )
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["total_count"], 0)


class SearchFlowTest(unittest.TestCase):
    def test_search_sends_expected_params_and_returns_payload(self):
        seen = {}

        def fake_http_get(url, timeout=20.0):
            seen["url"] = url
            return fixture("relic_search_list.json")

        stdout = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_EMUSEUM_API_KEY": "secret-key"}, clear=True), \
                mock.patch.object(emuseum, "http_get", side_effect=fake_http_get), \
                contextlib.redirect_stdout(stdout):
            code = emuseum.run(
                ["search", "--query", "청자", "--era", "고려", "--limit", "5", "--json"]
            )

        self.assertEqual(code, 0)
        params = urllib.parse.parse_qs(urllib.parse.urlparse(seen["url"]).query)
        self.assertEqual(params["relicName"], ["청자"])
        self.assertEqual(params["eraName"], ["고려"])
        self.assertEqual(params["numOfRows"], ["5"])
        self.assertEqual(params["serviceKey"], ["secret-key"])
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["total_count"], 2)
        self.assertEqual(payload["query"]["name"], "청자")
        self.assertNotIn("secret-key", payload["source"]["url"])

    def test_empty_result_is_success_with_exit_zero(self):
        empty = json.dumps(
            {
                "response": {
                    "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
                    "body": {"items": [], "numOfRows": 10, "pageNo": 1, "totalCount": 0},
                }
            }
        ).encode("utf-8")
        stdout = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_EMUSEUM_API_KEY": "key"}, clear=True), \
                mock.patch.object(emuseum, "http_get", return_value=empty), \
                contextlib.redirect_stdout(stdout):
            code = emuseum.run(["search", "--query", "없는검색어", "--json"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout.getvalue())["items"], [])

    def test_forbidden_http_maps_to_auth_error_without_traceback(self):
        stderr = io.StringIO()
        http_error = urllib.error.HTTPError("u", 403, "Forbidden", {}, None)
        with mock.patch.dict(os.environ, {"KSKILL_EMUSEUM_API_KEY": "key"}, clear=True), \
                mock.patch.object(emuseum.urllib.request, "urlopen", side_effect=http_error), \
                contextlib.redirect_stderr(stderr):
            code = emuseum.run(["search", "--query", "청자"])
        self.assertEqual(code, 1)
        output = stderr.getvalue()
        self.assertIn("403", output)
        self.assertIn("인증", output)
        self.assertNotIn("Traceback", output)

    def test_timeout_is_reported_without_traceback(self):
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_EMUSEUM_API_KEY": "key"}, clear=True), \
                mock.patch.object(
                    emuseum.urllib.request, "urlopen", side_effect=TimeoutError("timed out")
                ), \
                contextlib.redirect_stderr(stderr):
            code = emuseum.run(["search", "--query", "청자"])
        self.assertEqual(code, 1)
        self.assertIn("요청이 실패", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())

    def test_proxy_base_url_does_not_require_key(self):
        seen = {}

        def fake_http_get(url, timeout=20.0):
            seen["url"] = url
            return fixture("relic_search_list.json")

        stdout = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(emuseum, "http_get", side_effect=fake_http_get), \
                contextlib.redirect_stdout(stdout):
            code = emuseum.run(
                [
                    "search",
                    "--query",
                    "청자",
                    "--base-url",
                    "https://proxy.example.test",
                    "--search-path",
                    "/v1/emuseum/search",
                    "--json",
                ]
            )
        self.assertEqual(code, 0)
        self.assertIn("/v1/emuseum/search", seen["url"])
        self.assertNotIn("serviceKey", seen["url"])
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["source"]["endpoint"], "https://proxy.example.test/v1/emuseum/search")

    def test_dry_run_redacts_key(self):
        stdout = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_EMUSEUM_API_KEY": "super-secret"}, clear=True), \
                mock.patch.object(emuseum, "http_get") as http_mock, \
                contextlib.redirect_stdout(stdout):
            code = emuseum.run(["search", "--query", "청자", "--dry-run"])
        self.assertEqual(code, 0)
        http_mock.assert_not_called()
        output = stdout.getvalue()
        self.assertIn("serviceKey=REDACTED", output)
        self.assertNotIn("super-secret", output)
        payload = json.loads(output)
        self.assertEqual(payload["mode"], "direct")

    def test_dry_run_without_key_prints_request_url(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(emuseum, "http_get") as http_mock, \
                contextlib.redirect_stdout(stdout), \
                contextlib.redirect_stderr(stderr):
            code = emuseum.run(
                [
                    "search",
                    "--query",
                    "청자",
                    "--dry-run",
                    "--secrets-path",
                    "/tmp/missing-emuseum-secrets",
                ]
            )
        self.assertEqual(code, 0, stderr.getvalue())
        http_mock.assert_not_called()
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["mode"], "direct")
        self.assertIn("/selectRelicList.do", payload["url"])
        self.assertIn("relicName=", payload["url"])
        self.assertIn("serviceKey=REDACTED", payload["url"])

    def test_invalid_limit_returns_two(self):
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_EMUSEUM_API_KEY": "key"}, clear=True), \
                contextlib.redirect_stderr(stderr):
            code = emuseum.run(["search", "--limit", "0"])
        self.assertEqual(code, 2)
        self.assertIn("limit", stderr.getvalue())


class FormatTextTest(unittest.TestCase):
    def test_summary_includes_metadata(self):
        payload = emuseum.parse_response(fixture("relic_search_list.json"))
        payload["query"] = {"name": "청자", "era": "고려", "museum": "국립중앙박물관"}
        payload["source"] = {"endpoint": emuseum.DEFAULT_BASE_URL, "fetched_at": "2026-01-01T00:00:00+00:00"}
        text = emuseum.format_text(payload)
        self.assertIn("청자 상감운학문 매병", text)
        self.assertIn("시대: 고려", text)
        self.assertIn("소장: 국립중앙박물관", text)
        self.assertIn("관리번호: 덕수 1234", text)
        self.assertIn("이미지: https://www.emuseum.go.kr/image/1001.jpg", text)

    def test_empty_result_does_not_invent_items(self):
        payload = {
            "total_count": 0,
            "items": [],
            "query": {"name": "없는검색어", "era": "", "museum": ""},
            "source": {},
        }
        text = emuseum.format_text(payload)
        self.assertIn("찾지 못했습니다", text)
        self.assertNotIn("관리번호", text)


if __name__ == "__main__":
    unittest.main()