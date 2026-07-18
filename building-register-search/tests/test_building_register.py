import contextlib
import importlib.util
import io
import json
import os
import pathlib
import unittest
import urllib.parse
import urllib.error
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "building-register-search" / "scripts" / "building_register.py"
SPEC = importlib.util.spec_from_file_location("building_register", MODULE_PATH)
building_register = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(building_register)


class BuildingRegisterHelperTests(unittest.TestCase):
    def test_pnu_land_categories_map_to_building_api_values(self):
        normal = building_register.parse_args(["title", "--pnu", "1168010100101230004"])
        mountain = building_register.parse_args(["title", "--pnu", "1168010100201230004"])
        self.assertEqual(building_register.build_query(normal)["platGbCd"], "0")
        self.assertEqual(building_register.build_query(mountain)["platGbCd"], "1")

        with self.assertRaisesRegex(building_register.HelperError, "PNU"):
            building_register.build_query(
                building_register.parse_args(["title", "--pnu", "1168010100001230004"])
            )

    def test_explicit_api_land_category_values_remain_compatible(self):
        for plat_gb_cd in ("0", "1", "2"):
            args = building_register.parse_args([
                "title", "--sigungu-cd", "11680", "--bjdong-cd", "10100",
                "--plat-gb-cd", plat_gb_cd, "--bun", "7", "--ji", "2",
                "--proxy-base-url", "https://example.test"
            ])
            query = building_register.build_query(args)
            self.assertEqual(query["platGbCd"], plat_gb_cd)
            self.assertEqual(query["bun"], "0007")
            self.assertEqual(query["ji"], "0002")
            expected_pnu = {
                "0": "1168010100100070002",
                "1": "1168010100200070002",
            }.get(plat_gb_cd)
            self.assertEqual(query.get("pnu"), expected_pnu)
            url_query = urllib.parse.parse_qs(
                urllib.parse.urlparse(building_register.build_title_url(args, query, api_key=None)).query
            )
            self.assertEqual(url_query["platGbCd"], [plat_gb_cd])
            self.assertNotIn("pnu", url_query)

    def test_conflicting_and_missing_inputs_stop_explicitly(self):
        with self.assertRaises(building_register.HelperError):
            building_register.build_query(building_register.parse_args(["title"]))
        with self.assertRaises(building_register.HelperError):
            building_register.build_query(building_register.parse_args([
                "title", "--pnu", "1168010100101230004", "--sigungu-cd", "11680"
            ]))
        with self.assertRaises(building_register.HelperError):
            building_register.build_query(building_register.parse_args(["title", "--address", "서울", "--direct"]))

    def test_proxy_url_has_no_key(self):
        args = building_register.parse_args([
            "title", "--pnu", "1168010100101230004", "--proxy-base-url", "https://example.test"
        ])
        url = building_register.build_title_url(args, building_register.build_query(args), api_key=None)
        self.assertTrue(url.startswith("https://example.test/v1/building-register/title?"))
        self.assertNotIn("serviceKey", url)

    def test_direct_missing_key_reports_dataset_and_preferred_variable(self):
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stderr(stderr):
            code = building_register.run([
                "title", "--pnu", "1168010100101230004", "--direct", "--secrets-path", "/tmp/missing-building-secrets"
            ])
        self.assertEqual(code, 1)
        self.assertIn("15134735", stderr.getvalue())
        self.assertIn("KSKILL_BUILDING_REGISTER_API_KEY", stderr.getvalue())

    def test_dry_run_redacts_direct_key(self):
        stdout = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_BUILDING_REGISTER_API_KEY": "super-secret"}, clear=True), contextlib.redirect_stdout(stdout):
            code = building_register.run(["title", "--pnu", "1168010100101230004", "--direct", "--dry-run"])
        self.assertEqual(code, 0)
        self.assertNotIn("super-secret", stdout.getvalue())
        self.assertIn("REDACTED", stdout.getvalue())

    def test_timeout_is_reported_without_traceback_for_proxy_and_direct(self):
        stderr = io.StringIO()
        with mock.patch.object(building_register.urllib.request, "urlopen", side_effect=TimeoutError("timed out")), contextlib.redirect_stderr(stderr):
            code = building_register.run(["title", "--pnu", "1168010100101230004"])
        self.assertEqual(code, 1)
        self.assertIn("시간이 초과", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())

        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {"KSKILL_BUILDING_REGISTER_API_KEY": "key"}, clear=True), mock.patch.object(
            building_register.urllib.request, "urlopen", side_effect=TimeoutError("timed out")
        ), contextlib.redirect_stderr(stderr):
            code = building_register.run(["title", "--pnu", "1168010100101230004", "--direct"])
        self.assertEqual(code, 1)
        self.assertIn("시간이 초과", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())

    def test_address_geocode_missing_kakao_key_is_not_building_key_error(self):
        body = io.BytesIO(json.dumps({
            "error": "upstream_not_configured",
            "message": "KAKAO_REST_API_KEY is not configured on the proxy server."
        }).encode("utf-8"))
        error = urllib.error.HTTPError(
            "https://example.test/v1/kakao-local/geocode?q=test",
            503,
            "Service Unavailable",
            {},
            body,
        )
        with mock.patch.object(building_register.urllib.request, "urlopen", side_effect=error):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = building_register.run([
                    "title",
                    "--address",
                    "서울 강남구 삼성동 159",
                    "--proxy-base-url",
                    "https://example.test",
                ])
        self.assertEqual(code, 1)
        message = stderr.getvalue()
        self.assertIn("Kakao Local", message)
        self.assertNotIn("건축물대장 API 키", message)

    def test_direct_xml_rejects_invalid_pagination_metadata(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"<response><header><resultCode>00</resultCode></header><body><pageNo>many</pageNo><numOfRows>10</numOfRows><totalCount>0</totalCount><items /></body></response>"
        with mock.patch.object(building_register.urllib.request, "urlopen", return_value=response):
            with self.assertRaisesRegex(building_register.HelperError, "pageNo"):
                building_register.http_get_direct_xml("https://example.test", 1)

    def test_address_proxy_flow_geocodes_then_calls_building_route(self):
        calls = []

        def fake_get(url, timeout, via_proxy):
            calls.append(url)
            if "/v1/kakao-local/geocode" in url:
                return {
                    "documents": [{
                        "address_name": "서울 강남구 역삼동 123-4",
                        "address": {
                            "address_name": "서울 강남구 역삼동 123-4",
                            "b_code": "1168010100",
                            "mountain_yn": "N",
                            "main_address_no": "123",
                            "sub_address_no": "4"
                        }
                    }]
                }
            return {"total_count": 0, "items": []}

        stdout = io.StringIO()
        with mock.patch.object(building_register, "http_get_json", side_effect=fake_get), contextlib.redirect_stdout(stdout):
            code = building_register.run([
                "title", "--address", "서울 강남구 역삼동 123-4", "--proxy-base-url", "https://example.test", "--json"
            ])
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 2)
        self.assertIn("/v1/kakao-local/geocode?", calls[0])
        query = urllib.parse.parse_qs(urllib.parse.urlparse(calls[1]).query)
        self.assertEqual(query["sigunguCd"], ["11680"])
        self.assertEqual(query["bjdongCd"], ["10100"])
        self.assertEqual(query["platGbCd"], ["0"])
        self.assertEqual(query["bun"], ["0123"])
        self.assertEqual(query["ji"], ["0004"])
        self.assertNotIn("pnu", query)
        self.assertNotIn("serviceKey", calls[1])

    def test_address_payload_constructs_standard_normal_and_mountain_pnu(self):
        base_address = {
            "b_code": "1168010100",
            "main_address_no": "123",
            "sub_address_no": "4",
        }
        normal = building_register.query_from_address_payload({
            "documents": [{"address": {**base_address, "mountain_yn": "N"}}]
        })
        mountain = building_register.query_from_address_payload({
            "documents": [{"address": {**base_address, "mountain_yn": "Y"}}]
        })
        self.assertEqual(normal["platGbCd"], "0")
        self.assertEqual(normal["pnu"], "1168010100101230004")
        self.assertEqual(mountain["platGbCd"], "1")
        self.assertEqual(mountain["pnu"], "1168010100201230004")

    def test_address_dry_run_describes_explicit_building_query(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = building_register.run([
                "title", "--address", "서울 강남구 역삼동 123-4",
                "--proxy-base-url", "https://example.test", "--dry-run",
            ])

        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(
            payload["next"],
            "/v1/building-register/title?sigunguCd=<derived>&bjdongCd=<derived>"
            "&platGbCd=<derived>&bun=<derived>&ji=<derived>",
        )
        self.assertNotIn("pnu=<derived>", payload["next"])

    def test_address_ambiguity_or_missing_parcel_stops(self):
        cases = [
            {"documents": [{"address": {"b_code": "1168010100", "main_address_no": "1"}}, {"address": {"b_code": "1168010100", "main_address_no": "2"}}]},
            {"documents": [{"address": {"b_code": "", "main_address_no": "1"}}]},
            {"documents": [{"place_name": "역삼역", "x": "127", "y": "37"}]},
        ]
        for payload in cases:
            stderr = io.StringIO()
            with mock.patch.object(building_register, "http_get_json", return_value=payload), contextlib.redirect_stderr(stderr):
                code = building_register.run(["title", "--address", "역삼"])
            self.assertEqual(code, 1)
            self.assertRegex(stderr.getvalue(), "주소|필지|법정동|하나")

    def test_korean_summary_and_json_output(self):
        payload = {
            "total_count": 1,
            "items": [{
                "platPlc": "서울특별시 강남구 역삼동 123-4",
                "mainPurpsCdNm": "업무시설",
                "totArea": "1234.56",
                "grndFlrCnt": "12",
                "ugrndFlrCnt": "3",
                "useAprDay": "20240131"
            }]
        }
        self.assertIn("건축물대장 표제부 조회 결과: 1건", building_register.format_text(payload))
        self.assertIn("업무시설", building_register.format_text(payload))

        with mock.patch.object(building_register, "http_get_json", return_value=payload):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(building_register.run(["title", "--pnu", "1168010100101230004", "--json"]), 0)
            self.assertEqual(json.loads(stdout.getvalue())["total_count"], 1)


if __name__ == "__main__":
    unittest.main()
