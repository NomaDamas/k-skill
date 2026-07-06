import base64
import hashlib
import hmac
import importlib.util
import json
import pathlib
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "naver-ad-performance" / "scripts" / "naver_ad_performance.py"
MODULE_SPEC = importlib.util.spec_from_file_location("naver_ad_performance", MODULE_PATH)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError(f"Unable to load naver_ad_performance module from {MODULE_PATH}")
nap = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(nap)


ENV = {
    nap.API_KEY_ENV: "test-api-key",
    nap.SECRET_KEY_ENV: "test-secret-key",
    nap.CUSTOMER_ID_ENV: "test-customer-id",
}


class SignatureTest(unittest.TestCase):
    def test_build_signature_matches_reference_hmac_sha256_base64(self):
        expected = base64.b64encode(
            hmac.new(b"secret", b"1718700000000.GET./stats", hashlib.sha256).digest()
        ).decode("utf-8")

        signature = nap.build_signature("secret", "1718700000000", "GET", "/stats")

        self.assertEqual(signature, expected)

    def test_request_signature_excludes_query_string_from_message(self):
        expected = nap.build_signature("test-secret-key", "123000", "GET", "/stats")
        response = mock.MagicMock()
        response.read.return_value = b"[]"
        urlopen_context = mock.MagicMock()
        urlopen_context.__enter__.return_value = response

        with mock.patch.dict("os.environ", ENV, clear=True), \
                mock.patch.object(nap.time, "time", return_value=123), \
                mock.patch.object(nap.urllib.request, "urlopen", return_value=urlopen_context) as urlopen:
            nap.request("GET", "/stats", {"ids": '["cmp-a"]', "fields": '["impCnt"]'})

        request = urlopen.call_args.args[0]
        query_including_signature = nap.build_signature(
            "test-secret-key",
            "123000",
            "GET",
            request.full_url.removeprefix(nap.BASE_URL),
        )
        signature = request.headers["X-signature"]

        self.assertIn("?", request.full_url)
        self.assertEqual(signature, expected)
        self.assertNotEqual(signature, query_including_signature)


class CredentialResolutionTest(unittest.TestCase):
    def test_resolve_credentials_lists_every_missing_var_by_name(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(nap.CredentialError) as ctx:
                nap.resolve_credentials()

        message = str(ctx.exception)
        self.assertIn(nap.API_KEY_ENV, message)
        self.assertIn(nap.SECRET_KEY_ENV, message)
        self.assertIn(nap.CUSTOMER_ID_ENV, message)

    def test_resolve_credentials_returns_values_when_all_present(self):
        with mock.patch.dict("os.environ", ENV, clear=True):
            api_key, secret_key, customer_id = nap.resolve_credentials()

        self.assertEqual((api_key, secret_key, customer_id), tuple(ENV.values()))


class StatsLabelingTest(unittest.TestCase):
    def test_with_derived_stats_computes_ctr_and_cpc_when_absent(self):
        row = nap.with_derived_stats({"impCnt": 200, "clkCnt": 10, "salesAmt": 5000})

        self.assertEqual(row["ctr"], 5.0)
        self.assertEqual(row["cpc"], 500.0)

    def test_with_derived_stats_avoids_division_by_zero(self):
        row = nap.with_derived_stats({"impCnt": 0, "clkCnt": 0, "salesAmt": 0})

        self.assertEqual(row["ctr"], 0)
        self.assertEqual(row["cpc"], 0)

    def test_label_stats_attaches_korean_labels_including_derived_ctr_cpc(self):
        labeled = nap.label_stats([{"impCnt": 100, "clkCnt": 5, "salesAmt": 1000}])

        self.assertEqual(
            labeled[0]["labels"],
            {"impCnt": "노출수", "clkCnt": "클릭수", "salesAmt": "광고비", "ctr": "CTR", "cpc": "CPC"},
        )

    def test_label_stats_does_not_label_fields_absent_even_after_derivation(self):
        labeled = nap.label_stats([{"impCnt": 100, "clkCnt": 5, "salesAmt": 1000}])

        self.assertNotIn("avgRnk", labeled[0]["labels"])
        self.assertNotIn("ccnt", labeled[0]["labels"])


class RequestScopeTest(unittest.TestCase):
    def test_command_functions_only_call_get_requests(self):
        with mock.patch.object(nap, "request", return_value=[]) as mock_request, \
                mock.patch.dict("os.environ", ENV, clear=True):
            nap.cmd_campaigns(argparse_namespace())
            nap.cmd_adgroups(argparse_namespace(campaign="1"))
            nap.cmd_keywords(argparse_namespace(adgroup="1"))

        for call in mock_request.call_args_list:
            method = call.args[0]
            self.assertEqual(method, "GET")


class CliErrorHandlingTest(unittest.TestCase):
    def test_main_reports_missing_credentials_without_network_call(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            exit_code = nap.main(["campaigns"])

        self.assertEqual(exit_code, 1)

    def test_main_maps_api_error_status_to_exit_code_two(self):
        with mock.patch.object(nap, "request", side_effect=nap.ApiError(401, "bad signature")), \
                mock.patch.dict("os.environ", ENV, clear=True):
            exit_code = nap.main(["campaigns"])

        self.assertEqual(exit_code, 2)


def argparse_namespace(**kwargs):
    import argparse

    return argparse.Namespace(**kwargs)


if __name__ == "__main__":
    unittest.main()
