import contextlib
import importlib.util
import io
import json
import os
import pathlib
import unittest
import urllib.error
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "hira-medical-institution-search" / "scripts" / "hira_medical_institution_search.py"
SPEC = importlib.util.spec_from_file_location("hira_medical_institution_search", MODULE_PATH)
hira = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(hira)

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"
MISSING_SECRETS = "/tmp/k-skill-hira-tests-missing-secrets"
KEY = "test-secret-key"


def fixture(name):
    return (FIXTURES / name).read_bytes()


def routed_http(mapping):
    def _get(url, timeout):
        for needle, raw in mapping.items():
            if needle in url:
                return raw
        raise AssertionError(f"unexpected URL: {url}")

    return _get


def with_key_env():
    return mock.patch.dict(os.environ, {"KSKILL_HIRA_API_KEY": KEY}, clear=True)


class NormalizationTests(unittest.TestCase):
    def test_json_response_is_normalized(self):
        payload = hira.ensure_success(hira.normalize_payload(fixture("hosp_basis_list.json")))
        self.assertEqual(payload["result_code"], "00")
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["yadmNm"], "서울삼성병원")

        result = hira.search_payload(payload)
        item = result["items"][0]
        self.assertEqual(item["ykiho"], "JDQ4MTg4MDE2MzQxMDI4MjAwMQ==")
        self.assertEqual(item["name"], "서울삼성병원")
        self.assertEqual(item["type"], "상급종합병원")
        self.assertEqual(item["address"], "서울특별시 강남구 일원로 81")
        self.assertEqual(item["phone"], "02-3410-2114")

    def test_xml_response_is_normalized(self):
        payload = hira.ensure_success(hira.normalize_payload(fixture("hosp_basis_list.xml")))
        self.assertEqual(payload["result_code"], "00")
        self.assertEqual(payload["total_count"], 1)
        item = hira.search_payload(payload)["items"][0]
        self.assertEqual(item["ykiho"], "XMLYKIHO0001")
        self.assertEqual(item["name"], "부산대학교병원")
        self.assertEqual(item["sigungu"], "서구")

    def test_single_item_object_and_empty_items(self):
        single = hira.normalize_payload(fixture("eqp_info.json"))
        self.assertEqual(len(single["items"]), 1)
        self.assertEqual(single["items"][0]["telno"], "02-3410-2114")

        empty = hira.normalize_payload(fixture("empty.json"))
        self.assertEqual(empty["items"], [])
        self.assertEqual(empty["total_count"], 0)

    def test_bare_list_payload_is_accepted(self):
        payload = hira.normalize_payload(json.dumps([{"yadmNm": "의원"}]).encode("utf-8"))
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["yadmNm"], "의원")

    def test_invalid_metadata_raises(self):
        raw = b"<response><header><resultCode>00</resultCode></header><body><pageNo>many</pageNo></body></response>"
        with self.assertRaisesRegex(hira.HelperError, "pageNo"):
            hira.normalize_payload(raw)

    def test_malformed_response_raises(self):
        with self.assertRaisesRegex(hira.HelperError, "해석"):
            hira.normalize_payload(b"<html><body>blocked</body></html>")


class FailureModeTests(unittest.TestCase):
    def test_success_and_empty_codes_do_not_raise(self):
        for name in ("hosp_basis_list.json", "empty.json", "nodata.json"):
            self.assertIsNotNone(hira.ensure_success(hira.normalize_payload(fixture(name))))

    def test_auth_error_mentions_dataset_application(self):
        with self.assertRaisesRegex(hira.HelperError, "20.*활용신청"):
            hira.ensure_success(hira.normalize_payload(fixture("auth_error.json")))

    def test_quota_error_mentions_limit(self):
        with self.assertRaisesRegex(hira.HelperError, "한도 초과\\(22\\)"):
            hira.ensure_success(hira.normalize_payload(fixture("quota_error.json")))

    def test_other_gateway_codes_map(self):
        cases = {"23": "초당", "10": "파라미터", "12": "서비스", "01": "게이트웨이"}
        for code, needle in cases.items():
            raw = json.dumps({"header": {"resultCode": code, "resultMsg": "X"}}).encode("utf-8")
            with self.assertRaisesRegex(hira.HelperError, needle):
                hira.ensure_success(hira.normalize_payload(raw))

    def test_missing_key_names_env_vars_and_datasets(self):
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stderr(stderr):
            code = hira.run(["search", "--name", "서울삼성병원", "--secrets-path", MISSING_SECRETS])
        self.assertEqual(code, 1)
        message = stderr.getvalue()
        self.assertIn("KSKILL_HIRA_API_KEY", message)
        self.assertIn("DATA_GO_KR_API_KEY", message)
        self.assertIn("15001698", message)
        self.assertIn("15001699", message)

    def test_http_error_reports_status_without_key(self):
        error = urllib.error.HTTPError(
            "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList",
            403,
            "Forbidden",
            {},
            io.BytesIO(b""),
        )
        stderr = io.StringIO()
        with with_key_env(), mock.patch.object(hira.urllib.request, "urlopen", side_effect=error), contextlib.redirect_stderr(stderr):
            code = hira.run(["search", "--name", "서울삼성병원", "--secrets-path", MISSING_SECRETS])
        self.assertEqual(code, 1)
        self.assertIn("403", stderr.getvalue())
        self.assertNotIn(KEY, stderr.getvalue())

    def test_timeout_is_reported_without_traceback(self):
        stderr = io.StringIO()
        with with_key_env(), mock.patch.object(
            hira.urllib.request, "urlopen", side_effect=TimeoutError("timed out")
        ), contextlib.redirect_stderr(stderr):
            code = hira.run(["search", "--name", "서울삼성병원", "--secrets-path", MISSING_SECRETS])
        self.assertEqual(code, 1)
        self.assertIn("시간이 초과", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())


class DryRunAndValidationTests(unittest.TestCase):
    def test_search_dry_run_redacts_key(self):
        stdout = io.StringIO()
        with with_key_env(), contextlib.redirect_stdout(stdout):
            code = hira.run(["search", "--name", "서울삼성병원", "--sggu-cd", "110019", "--dry-run"])
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertNotIn(KEY, stdout.getvalue())
        self.assertIn("REDACTED", payload["url"])
        self.assertIn("hospInfoServicev2/getHospBasisList", payload["url"])
        self.assertIn("sgguCd=110019", payload["url"])

    def test_detail_dry_run_lists_sections_without_network(self):
        stdout = io.StringIO()
        with with_key_env(), contextlib.redirect_stdout(stdout):
            code = hira.run(["detail", "--ykiho", "YKIHO-AAA", "--sections", "facility,departments", "--dry-run"])
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertNotIn(KEY, stdout.getvalue())
        self.assertEqual(len(payload["urls"]), 2)
        self.assertIn("getEqpInfo2.8", payload["urls"][0])
        self.assertIn("getDgsbjtInfo2.8", payload["urls"][1])
        self.assertTrue(all("REDACTED" in url for url in payload["urls"]))

    def test_paging_and_code_validation(self):
        stderr = io.StringIO()
        with with_key_env(), contextlib.redirect_stderr(stderr):
            code = hira.run(["search", "--name", "x", "--num-of-rows", "0", "--dry-run"])
        self.assertEqual(code, 1)
        self.assertIn("numOfRows", stderr.getvalue())

        stderr = io.StringIO()
        with with_key_env(), contextlib.redirect_stderr(stderr):
            code = hira.run(["search", "--name", "x", "--sggu-cd", "12ab", "--dry-run"])
        self.assertEqual(code, 1)
        self.assertIn("sgguCd", stderr.getvalue())

    def test_sections_validation(self):
        self.assertEqual(hira.parse_sections(None), list(hira.DEFAULT_SECTIONS))
        self.assertEqual(len(hira.parse_sections("all")), len(hira.DETAIL_SECTIONS))
        with self.assertRaisesRegex(hira.HelperError, "알 수 없는 섹션"):
            hira.parse_sections("bogus")


class DetailFlowTests(unittest.TestCase):
    def _routes(self, basis="hosp_basis_list.json"):
        return {
            "hospInfoServicev2/getHospBasisList": fixture(basis),
            "MadmDtlInfoService2.8/getEqpInfo2.8": fixture("eqp_info.json"),
            "MadmDtlInfoService2.8/getDtlInfo2.8": fixture("dtl_info.json"),
            "MadmDtlInfoService2.8/getDgsbjtInfo2.8": fixture("dgsbjt_info.json"),
            "MadmDtlInfoService2.8/getMedOftInfo2.8": fixture("oft_info.json"),
            "MadmDtlInfoService2.8/getSpclDiagInfo2.8": fixture("spcl_diag.json"),
        }

    def test_detail_by_ykiho_summarizes_core_sections(self):
        stdout = io.StringIO()
        with with_key_env(), mock.patch.object(
            hira, "http_get", side_effect=routed_http(self._routes())
        ), contextlib.redirect_stdout(stdout):
            code = hira.run(["detail", "--ykiho", "YKIHO-AAA", "--sections", "facility,departments,equipment,special", "--json"])
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["ykiho"], "YKIHO-AAA")
        sections = {section["key"]: section for section in payload["sections"]}
        self.assertEqual(sections["facility"]["items"][0]["addr"], "서울특별시 강남구 일원로 81")
        self.assertEqual(sections["departments"]["total_count"], 3)
        self.assertEqual(sections["equipment"]["items"][1]["oftCdNm"], "MRI")
        self.assertNotIn(KEY, stdout.getvalue())

    def test_detail_text_summary_and_no_key_leak(self):
        stdout = io.StringIO()
        with with_key_env(), mock.patch.object(
            hira, "http_get", side_effect=routed_http(self._routes())
        ), contextlib.redirect_stdout(stdout):
            code = hira.run(["detail", "--ykiho", "YKIHO-AAA", "--sections", "facility,equipment,special"])
        self.assertEqual(code, 0)
        text = stdout.getvalue()
        self.assertIn("서울삼성병원", text)
        self.assertIn("MRI x2", text)
        self.assertIn("중증외상", text)
        self.assertIn("119", text)
        self.assertNotIn(KEY, text)

    def test_detail_by_name_requires_unique_match(self):
        stderr = io.StringIO()
        with with_key_env(), mock.patch.object(
            hira, "http_get", side_effect=routed_http(self._routes(basis="hosp_basis_multi.json"))
        ), contextlib.redirect_stderr(stderr):
            code = hira.run(["detail", "--name", "삼성", "--sections", "facility"])
        self.assertEqual(code, 1)
        self.assertIn("--ykiho", stderr.getvalue())
        self.assertNotIn(KEY, stderr.getvalue())

    def test_detail_by_name_resolves_single_match(self):
        stdout = io.StringIO()
        with with_key_env(), mock.patch.object(
            hira, "http_get", side_effect=routed_http(self._routes())
        ), contextlib.redirect_stdout(stdout):
            code = hira.run(["detail", "--name", "서울삼성병원", "--sections", "facility", "--json"])
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["ykiho"], "JDQ4MTg4MDE2MzQxMDI4MjAwMQ==")
        self.assertEqual(payload["name"], "서울삼성병원")

    def test_search_by_empty_result_is_not_an_error(self):
        stdout = io.StringIO()
        with with_key_env(), mock.patch.object(
            hira, "http_get", return_value=fixture("empty.json")
        ), contextlib.redirect_stdout(stdout):
            code = hira.run(["search", "--name", "없는병원", "--json"])
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["total_count"], 0)


if __name__ == "__main__":
    unittest.main()
