import json
import importlib.util
from pathlib import Path
import unittest
import urllib.error

from scripts.nts_business_registration import (
    ApiError,
    build_status_payload,
    build_validate_business,
    normalize_business_number,
    normalize_start_date,
    query_status,
    resolve_proxy_base_url,
    validate_businesses,
)


class NtsBusinessNormalizationTest(unittest.TestCase):
    def test_normalize_business_number_keeps_ten_digits_only(self):
        self.assertEqual(normalize_business_number("123-45-67890"), "1234567890")
        with self.assertRaisesRegex(ValueError, "사업자등록번호"):
            normalize_business_number("123")

    def test_normalize_start_date_accepts_common_date_separators(self):
        self.assertEqual(normalize_start_date("2020-01-31"), "20200131")
        self.assertEqual(normalize_start_date("2020.01.31"), "20200131")
        with self.assertRaisesRegex(ValueError, "개업일자"):
            normalize_start_date("2020-13-01")

    def test_build_status_payload_limits_batch_size(self):
        self.assertEqual(build_status_payload(["123-45-67890"]), {"b_no": ["1234567890"]})
        with self.assertRaisesRegex(ValueError, "100개"):
            build_status_payload([f"{index:010d}" for index in range(101)])

    def test_build_validate_business_trims_optional_fields(self):
        business = build_validate_business(
            b_no="123-45-67890",
            start_dt="2020-01-31",
            p_nm=" 홍길동 ",
            b_nm="테스트상사",
            corp_no="110111-1234567",
            p_nm2="",
        )
        self.assertEqual(
            business,
            {
                "b_no": "1234567890",
                "start_dt": "20200131",
                "p_nm": "홍길동",
                "b_nm": "테스트상사",
                "corp_no": "1101111234567",
            },
        )

    def test_build_validate_business_rejects_malformed_or_oversized_optional_fields(self):
        base = {"b_no": "1234567890", "start_dt": "20200101", "p_nm": "홍길동"}

        with self.assertRaisesRegex(ValueError, "corp_no"):
            build_validate_business(**base, corp_no="123")

        with self.assertRaisesRegex(ValueError, "p_nm"):
            build_validate_business(b_no="1234567890", start_dt="20200101", p_nm="홍" * 31)

        with self.assertRaisesRegex(ValueError, "b_adr"):
            build_validate_business(**base, b_adr="가" * 501)

    def test_skill_local_helper_matches_runtime_validation_behavior(self):
        helper_path = Path(__file__).resolve().parents[1] / "nts-business-registration" / "scripts" / "nts_business_registration.py"
        spec = importlib.util.spec_from_file_location("skill_local_nts_business_registration", helper_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        self.assertEqual(
            module.build_validate_business(
                b_no="123-45-67890",
                start_dt="2020.01.31",
                p_nm="홍길동",
                corp_no="110111-1234567",
            ),
            {
                "b_no": "1234567890",
                "start_dt": "20200131",
                "p_nm": "홍길동",
                "corp_no": "1101111234567",
            },
        )
        with self.assertRaisesRegex(ValueError, "corp_no"):
            module.build_validate_business(b_no="1234567890", start_dt="20200101", p_nm="홍길동", corp_no="abc")


class NtsBusinessProxyTest(unittest.TestCase):
    def test_query_status_posts_to_proxy_route(self):
        captured = {}

        def fake_read_json(request):
            captured["url"] = request.full_url
            captured["data"] = json.loads(request.data.decode("utf-8"))
            captured["method"] = request.get_method()
            return {"data": [{"b_no": "1234567890", "b_stt": "계속사업자"}]}

        payload = query_status(["123-45-67890"], base_url="https://proxy.example.com", read_json=fake_read_json)

        self.assertEqual(payload["data"][0]["b_stt"], "계속사업자")
        self.assertEqual(captured["url"], "https://proxy.example.com/v1/nts-business/status")
        self.assertEqual(captured["data"], {"b_no": ["1234567890"]})
        self.assertEqual(captured["method"], "POST")

    def test_validate_businesses_posts_to_proxy_route(self):
        captured = {}

        def fake_read_json(request):
            captured["url"] = request.full_url
            captured["data"] = json.loads(request.data.decode("utf-8"))
            return {"data": [{"valid": "01"}]}

        payload = validate_businesses(
            [{"b_no": "1234567890", "start_dt": "20200101", "p_nm": "홍길동"}],
            base_url="https://proxy.example.com/",
            read_json=fake_read_json,
        )

        self.assertEqual(payload["data"][0]["valid"], "01")
        self.assertEqual(captured["url"], "https://proxy.example.com/v1/nts-business/validate")
        self.assertEqual(captured["data"], {"businesses": [{"b_no": "1234567890", "start_dt": "20200101", "p_nm": "홍길동"}]})

    def test_resolve_proxy_base_url_defaults_to_hosted_proxy(self):
        self.assertEqual(resolve_proxy_base_url(None, env={}), "https://k-skill-proxy.nomadamas.org")
        self.assertEqual(resolve_proxy_base_url(None, env={"KSKILL_PROXY_BASE_URL": "https://proxy.example.com/"}), "https://proxy.example.com")
        with self.assertRaisesRegex(ValueError, "KSKILL_PROXY_BASE_URL"):
            resolve_proxy_base_url(None, env={"KSKILL_PROXY_BASE_URL": "off"})


if __name__ == "__main__":
    unittest.main()
