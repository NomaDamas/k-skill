#!/usr/bin/env python3
"""Unit tests for the gov-service-search helper.

stdlib unittest only; no network access and no real API key required.
Every upstream response comes from tests/fixtures/ or an inline fake.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import pathlib
import sys
import unittest
import urllib.error
import urllib.parse
from io import StringIO
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import gov_service_search as mod  # noqa: E402

FIX = pathlib.Path(__file__).resolve().parent / "fixtures"
NO_SECRETS = "/tmp/__gov_service_search_no_secrets__.env"
FAKE_KEY = "super-secret-gov24-key"


def fixture_payload(name: str) -> dict:
    return json.loads((FIX / name).read_text(encoding="utf-8"))["payload"]


class FakeResponse:
    def __init__(self, body: str, status: int = 200, content_type: str = "application/json; charset=utf-8"):
        self._body = body.encode("utf-8")
        self.status = status
        self.headers = {"content-type": content_type}

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def opener_returning(response: FakeResponse, calls=None):
    def opener(request, timeout=None, context=None):
        if calls is not None:
            calls.append(request)
        return response
    return opener


def opener_raising(body: str, code: int, content_type: str = "application/json"):
    def opener(request, timeout=None, context=None):
        raise urllib.error.HTTPError(
            request.full_url,
            code,
            "fake upstream error",
            {"content-type": content_type},
            io.BytesIO(body.encode("utf-8")),
        )
    return opener


@contextlib.contextmanager
def clean_env(**values):
    with mock.patch.dict(os.environ, values, clear=True):
        yield


def parse_args(argv):
    return mod.make_parser().parse_args(argv)


class QueryBuildingTests(unittest.TestCase):
    def test_list_builds_cond_query(self):
        args = parse_args([
            "list", "--keyword", "청년", "--org", "국토교통부",
            "--org-type", "중앙부처", "--user-type", "개인", "--field", "주거",
            "--per-page", "5",
        ])
        query = mod.build_query(args, "list")
        self.assertEqual(query["cond[서비스명::LIKE]"], "청년")
        self.assertEqual(query["cond[소관기관명::LIKE]"], "국토교통부")
        self.assertEqual(query["cond[소관기관유형::LIKE]"], "중앙부처")
        self.assertEqual(query["cond[사용자구분::LIKE]"], "개인")
        self.assertEqual(query["cond[서비스분야::LIKE]"], "주거")
        self.assertEqual(query["page"], 1)
        self.assertEqual(query["perPage"], 5)
        self.assertEqual(query["returnType"], "json")

    def test_blank_filters_are_dropped(self):
        args = parse_args(["list", "--keyword", "   "])
        query = mod.build_query(args, "list")
        self.assertNotIn("cond[서비스명::LIKE]", query)

    def test_date_values_are_normalised(self):
        cases = {
            "20260131": "2026-01-31",
            "2026/01/31": "2026-01-31",
            "2026-01-31": "2026-01-31",
        }
        for raw, expected in cases.items():
            args = parse_args(["list", "--updated-since", raw, "--updated-until", "2026-12-31"])
            query = mod.build_query(args, "list")
            self.assertEqual(query["cond[수정일시::GTE]"], expected)

    def test_impossible_dates_are_rejected(self):
        for raw in ("20260230", "20260431", "20261301", "20260100", "2026-1-1", "not-a-date"):
            args = parse_args(["list", "--updated-since", raw])
            with self.assertRaises(mod.HelperError, msg=raw):
                mod.build_query(args, "list")

    def test_inverted_date_range_is_rejected(self):
        args = parse_args(["list", "--updated-since", "2026-06-01", "--updated-until", "2026-01-01"])
        with self.assertRaises(mod.HelperError):
            mod.build_query(args, "list")

    def test_page_and_per_page_bounds(self):
        with self.assertRaises(mod.HelperError):
            mod.build_query(parse_args(["list", "--page", "0"]), "list")
        with self.assertRaises(mod.HelperError):
            mod.build_query(parse_args(["list", "--per-page", "0"]), "list")
        with self.assertRaises(mod.HelperError):
            mod.build_query(parse_args(["list", "--per-page", str(mod.MAX_PER_PAGE + 1)]), "list")

    def test_detail_and_conditions_require_service_id(self):
        with mock.patch.object(sys, "stderr", StringIO()):
            with self.assertRaises(SystemExit):
                parse_args(["detail"])
            with self.assertRaises(SystemExit):
                parse_args(["conditions"])
        args = parse_args(["detail", "--service-id", "SYN-LIST-0001"])
        self.assertEqual(mod.build_query(args, "detail")["cond[서비스ID::EQ]"], "SYN-LIST-0001")


class UrlAndAuthTests(unittest.TestCase):
    def test_direct_url_targets_odcloud_and_carries_no_key(self):
        args = parse_args(["list", "--keyword", "청년"])
        query = mod.build_query(args, "list")
        url = mod.build_url("list", query, via_proxy=False, proxy_base_url="https://example.test")
        self.assertTrue(url.startswith(f"{mod.UPSTREAM_BASE_URL}/serviceList?"))
        self.assertNotIn("Infuser", url)
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(qs["cond[서비스명::LIKE]"], ["청년"])

    def test_proxy_urls_use_documented_route_paths(self):
        expected = {
            "list": "service-list",
            "detail": "service-detail",
            "conditions": "support-conditions",
        }
        for operation, path in expected.items():
            url = mod.build_url(operation, {"page": 1}, via_proxy=True, proxy_base_url="https://example.test/")
            self.assertTrue(url.startswith(f"https://example.test/v1/gov24/{path}?"), url)
            self.assertNotIn("serviceKey", url)

    def test_default_proxy_base_is_hosted(self):
        url = mod.build_url("list", {"page": 1}, via_proxy=True, proxy_base_url="")
        self.assertTrue(url.startswith("https://k-skill-proxy.nomadamas.org/v1/gov24/service-list?"))

    def test_key_is_sent_only_as_authorization_header(self):
        headers = mod.build_headers(FAKE_KEY)
        self.assertEqual(headers["authorization"], f"Infuser {FAKE_KEY}")
        without_auth = {key: value for key, value in headers.items() if key != "authorization"}
        self.assertNotIn(FAKE_KEY, json.dumps(without_auth))

    def test_no_key_means_no_authorization_header(self):
        self.assertNotIn("authorization", mod.build_headers(None))


class KeyResolutionTests(unittest.TestCase):
    def test_primary_env_var_wins(self):
        with clean_env(KSKILL_GOV24_API_KEY="primary", DATA_GO_KR_API_KEY="alias"):
            self.assertEqual(mod.resolve_api_key(NO_SECRETS), "primary")

    def test_data_go_kr_alias_is_accepted(self):
        with clean_env(DATA_GO_KR_API_KEY="alias"):
            self.assertEqual(mod.resolve_api_key(NO_SECRETS), "alias")

    def test_secrets_file_is_used_when_env_missing(self):
        path = "/tmp/__gov_service_search_secrets__.env"
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("# comment\nKSKILL_GOV24_API_KEY=\"from-file\"\nDATA_GO_KR_API_KEY=other\n")
        try:
            with clean_env():
                self.assertEqual(mod.resolve_api_key(path), "from-file")
        finally:
            os.unlink(path)

    def test_missing_key_returns_none(self):
        with clean_env():
            self.assertIsNone(mod.resolve_api_key(NO_SECRETS))

    def test_blank_env_var_is_ignored(self):
        with clean_env(KSKILL_GOV24_API_KEY="   "):
            self.assertIsNone(mod.resolve_api_key(NO_SECRETS))

    def test_load_secrets_tolerates_missing_file(self):
        self.assertEqual(mod.load_secrets(NO_SECRETS), {})


class ErrorMappingTests(unittest.TestCase):
    def test_success_returns_none(self):
        self.assertIsNone(mod.describe_upstream_error(200, "application/json", '{"page": 1, "data": []}'))

    def test_http_401_maps_to_auth_message(self):
        body = (FIX / "error_auth.json").read_text(encoding="utf-8")
        message = mod.describe_upstream_error(401, "application/json", body)
        self.assertIn("활용신청", message)
        self.assertIn("Decoding", message)

    def test_envelope_code_401_with_http_200_is_an_error(self):
        body = (FIX / "error_auth.json").read_text(encoding="utf-8")
        message = mod.describe_upstream_error(200, "application/json", body)
        self.assertIsNotNone(message)
        self.assertIn("활용신청", message)

    def test_http_429_maps_to_quota_message(self):
        message = mod.describe_upstream_error(429, "application/json", '{"code": -429, "msg": "too many requests"}')
        self.assertIn("한도", message)

    def test_http_500_maps_to_upstream_down(self):
        message = mod.describe_upstream_error(500, "text/html", "<html>500</html>")
        self.assertIn("upstream", message)

    def test_non_json_200_does_not_pass_as_success(self):
        html = (FIX / "error_html.txt").read_text(encoding="utf-8")
        message = mod.describe_upstream_error(200, "text/html", html)
        self.assertIsNotNone(message)
        self.assertIn("JSON", message)

    def test_redact_secret_removes_key(self):
        text = f"GET /x?key={FAKE_KEY} failed"
        self.assertNotIn(FAKE_KEY, mod.redact_secret(text, FAKE_KEY))
        self.assertIn(mod.DRY_RUN_PLACEHOLDER, mod.redact_secret(text, FAKE_KEY))

    def test_redact_secret_handles_none(self):
        self.assertEqual(mod.redact_secret("plain", None), "plain")


class ClientFilterTests(unittest.TestCase):
    @staticmethod
    def rows():
        return fixture_payload("service_list_page1.json")["data"]

    def test_region_filter_keeps_only_matching_rows(self):
        args = parse_args(["list", "--region", "서울"])
        payload = {"data": self.rows(), "currentCount": 6, "totalCount": 6}
        result = mod.apply_client_filters(payload, args, "list")
        names = [row["서비스ID"] for row in result["data"]]
        self.assertEqual(names, ["SYN-LIST-0002", "SYN-LIST-0006"])
        self.assertEqual(result["client_filter"]["upstream_returned"], 6)
        self.assertEqual(result["client_filter"]["after_filter"], 2)
        self.assertEqual(result["client_filter"]["fields"]["region"], "서울")

    def test_target_and_region_are_combined_with_and(self):
        args = parse_args(["list", "--region", "서울", "--target", "청년"])
        payload = {"data": self.rows()}
        result = mod.apply_client_filters(payload, args, "list")
        self.assertEqual([row["서비스ID"] for row in result["data"]], ["SYN-LIST-0002", "SYN-LIST-0006"])

    def test_multiple_tokens_require_all(self):
        args = parse_args(["list", "--target", "청년,미취업"])
        payload = {"data": self.rows()}
        result = mod.apply_client_filters(payload, args, "list")
        self.assertEqual([row["서비스ID"] for row in result["data"]], ["SYN-LIST-0006"])

    def test_no_filter_returns_payload_untouched(self):
        args = parse_args(["list"])
        payload = {"data": self.rows()}
        result = mod.apply_client_filters(payload, args, "list")
        self.assertNotIn("client_filter", result)

    def test_zero_after_filter_is_still_reported(self):
        args = parse_args(["list", "--region", "부산"])
        payload = {"data": self.rows()}
        result = mod.apply_client_filters(payload, args, "list")
        self.assertEqual(result["data"], [])
        self.assertEqual(result["client_filter"]["upstream_returned"], 6)
        self.assertEqual(result["client_filter"]["after_filter"], 0)

    def test_non_list_operation_is_passthrough(self):
        args = parse_args(["detail", "--service-id", "SYN-LIST-0001"])
        payload = {"data": [{"서비스명": "x"}]}
        self.assertIs(mod.apply_client_filters(payload, args, "detail"), payload)


class DisambiguationTests(unittest.TestCase):
    def test_duplicate_names_are_grouped_and_others_ignored(self):
        payload = {"data": fixture_payload("service_list_page1.json")["data"]}
        result = mod.disambiguate(payload)
        groups = result["disambiguation"]["duplicate_groups"]
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["count"], 2)
        ids = {candidate["서비스ID"] for candidate in groups[0]["candidates"]}
        self.assertEqual(ids, {"SYN-LIST-0001", "SYN-LIST-0002"})
        self.assertEqual(result["disambiguation"]["duplicate_rows"], 2)

    def test_name_normalisation_ignores_spacing_and_punctuation(self):
        self.assertEqual(
            mod.normalise_service_name("청년 월세 지원 (2026)"),
            mod.normalise_service_name("청년월세지원 2026"),
        )

    def test_no_duplicates_leaves_payload_untouched(self):
        payload = {"data": [{"서비스명": "A"}, {"서비스명": "B"}]}
        result = mod.disambiguate(payload)
        self.assertNotIn("disambiguation", result)


class ConditionTests(unittest.TestCase):
    @staticmethod
    def row():
        return fixture_payload("support_conditions.json")["data"][0]

    def test_decode_conditions_returns_korean_labels(self):
        labels = mod.decode_conditions(self.row())
        self.assertIn("여성", labels)
        self.assertIn("중위소득 51~75%", labels)
        self.assertIn("무주택세대", labels)
        self.assertIn("대상연령 19~34세", labels)

    def test_age_gender_income_match_true(self):
        match = mod.evaluate_condition_match(self.row(), age=30, gender_code="JA0102", income_code="JA0202")
        self.assertTrue(match["age"])
        self.assertTrue(match["gender"])
        self.assertTrue(match["income"])
        self.assertTrue(match["matched"])

    def test_age_out_of_range_and_wrong_gender(self):
        match = mod.evaluate_condition_match(self.row(), age=40, gender_code="JA0101", income_code="JA0201")
        self.assertFalse(match["age"])
        self.assertFalse(match["gender"])
        self.assertFalse(match["income"])
        self.assertFalse(match["matched"])

    def test_income_is_unconstrained_when_no_income_code_present(self):
        match = mod.evaluate_condition_match({"서비스ID": "X"}, income_code="JA0201")
        self.assertTrue(match["income"])

    def test_zero_age_bounds_mean_no_limit(self):
        second = fixture_payload("support_conditions.json")["data"][1]
        match = mod.evaluate_condition_match(second, age=70)
        self.assertTrue(match["age"])

    def test_invalid_gender_and_income_raise(self):
        with self.assertRaises(mod.HelperError):
            mod.normalise_gender("unknown")
        with self.assertRaises(mod.HelperError):
            mod.normalise_income("중위소득 42%")

    def test_income_label_without_prefix_is_accepted(self):
        self.assertEqual(mod.normalise_income("51~75%"), "JA0202")


class RunIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.list_body = json.dumps(fixture_payload("service_list_page1.json"), ensure_ascii=False)
        self.detail_body = json.dumps(fixture_payload("service_detail.json"), ensure_ascii=False)
        self.conditions_body = json.dumps(fixture_payload("support_conditions.json"), ensure_ascii=False)

    def _run(self, argv, opener, env=None):
        stdout, stderr = StringIO(), StringIO()
        with clean_env(**(env or {})):
            with mock.patch.object(sys, "stdout", stdout), mock.patch.object(sys, "stderr", stderr):
                rc = mod.run(argv, opener=opener)
        return rc, stdout.getvalue(), stderr.getvalue()

    def test_list_json_uses_api_without_leaking_key(self):
        calls = []
        rc, out, err = self._run(
            ["list", "--keyword", "청년", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.list_body), calls),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        self.assertNotIn(FAKE_KEY, out)
        payload = json.loads(out)
        self.assertEqual(payload["operation"], "list")
        self.assertEqual(payload["query"]["cond[서비스명::LIKE]"], "청년")
        self.assertTrue(payload["checked_at"].endswith("Z"))
        self.assertEqual(len(payload["data"]), 6)
        self.assertEqual(calls[0].get_header("Authorization"), f"Infuser {FAKE_KEY}")
        self.assertIn("/gov24/v3/serviceList?", calls[0].full_url)

    def test_list_text_summary_includes_id_and_url(self):
        rc, out, err = self._run(
            ["list", "--keyword", "청년", "--per-page", "3", "--text", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.list_body)),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        self.assertIn("청년월세지원", out)
        self.assertIn("SYN-LIST-0001", out)
        self.assertIn("https://www.gov.kr/portal/service/serviceInfo/SYN-LIST-0001", out)

    def test_list_with_client_filter_and_disambiguation(self):
        rc, out, err = self._run(
            ["list", "--target", "청년", "--disambiguate", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.list_body)),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        payload = json.loads(out)
        self.assertEqual(payload["client_filter"]["after_filter"], 3)
        self.assertEqual(len(payload["disambiguation"]["duplicate_groups"]), 1)
        self.assertEqual(payload["disambiguation"]["duplicate_groups"][0]["count"], 2)

    def test_list_with_region_filter_drops_non_matching_and_no_duplicates(self):
        rc, out, err = self._run(
            ["list", "--region", "서울", "--disambiguate", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.list_body)),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        payload = json.loads(out)
        self.assertEqual(payload["client_filter"]["after_filter"], 2)
        self.assertNotIn("disambiguation", payload)

    def test_detail_text_reports_online_application_url(self):
        rc, out, err = self._run(
            ["detail", "--service-id", "SYN-LIST-0001", "--text", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.detail_body)),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        self.assertIn("온라인신청: https://www.gov.kr/portal/apply/SYN-LIST-0001", out)
        self.assertIn("문의처: 1600-0000", out)

    def test_conditions_match_is_reported(self):
        rc, out, err = self._run(
            ["conditions", "--service-id", "SYN-LIST-0001", "--age", "40",
             "--gender", "여", "--income", "중위소득 51~75%", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.conditions_body)),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        payload = json.loads(out)
        first = payload["data"][0]
        self.assertFalse(first["match"]["age"])
        self.assertTrue(first["match"]["gender"])
        self.assertTrue(first["match"]["income"])
        self.assertIn("여성", first["labels"])

    def test_conditions_invalid_age_exits_2_without_network(self):
        def opener(*args, **kwargs):  # pragma: no cover - must not be called
            raise AssertionError("network must not be used for invalid input")

        rc, out, err = self._run(
            ["conditions", "--service-id", "X", "--age", "200", "--secrets-path", NO_SECRETS],
            opener,
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 2)
        self.assertIn("--age", err)

    def test_dry_run_redacts_key_and_never_calls_network(self):
        def opener(*args, **kwargs):  # pragma: no cover - must not be called
            raise AssertionError("dry-run must not use the network")

        rc, out, err = self._run(
            ["list", "--keyword", "청년", "--dry-run", "--secrets-path", NO_SECRETS],
            opener,
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        self.assertNotIn(FAKE_KEY, out)
        payload = json.loads(out)
        self.assertIn("/gov24/v3/serviceList?", payload["url"])
        self.assertNotIn("serviceKey", payload["url"])
        self.assertEqual(payload["auth"], "Authorization: Infuser <REDACTED>")

    def test_dry_run_without_key_reports_missing(self):
        rc, out, err = self._run(
            ["list", "--dry-run", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse("{}")),
        )
        self.assertEqual(rc, 0, err)
        self.assertEqual(json.loads(out)["auth"], "Authorization: Infuser (missing)")

    def test_missing_key_exits_3(self):
        rc, out, err = self._run(
            ["list", "--keyword", "청년", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.list_body)),
        )
        self.assertEqual(rc, 3)
        self.assertIn("15113968", err)

    def test_http_401_exits_6_with_auth_guidance(self):
        body = (FIX / "error_auth.json").read_text(encoding="utf-8")
        rc, out, err = self._run(
            ["list", "--secrets-path", NO_SECRETS],
            opener_raising(body, 401),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 6)
        self.assertIn("활용신청", err)
        self.assertNotIn(FAKE_KEY, err)

    def test_http_500_exits_6(self):
        rc, out, err = self._run(
            ["list", "--secrets-path", NO_SECRETS],
            opener_raising("<html>down</html>", 500, "text/html"),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 6)
        self.assertIn("upstream", err)

    def test_non_json_200_exits_5(self):
        html = (FIX / "error_html.txt").read_text(encoding="utf-8")
        rc, out, err = self._run(
            ["list", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(html, content_type="text/html")),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 5)
        self.assertIn("JSON", err)

    def test_via_proxy_uses_proxy_route_and_needs_no_key(self):
        calls = []
        rc, out, err = self._run(
            ["list", "--via-proxy", "--proxy-base-url", "https://example.test", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(self.list_body), calls),
        )
        self.assertEqual(rc, 0, err)
        self.assertTrue(calls[0].full_url.startswith("https://example.test/v1/gov24/service-list?"))
        self.assertIsNone(calls[0].get_header("Authorization"))

    def test_proxy_upstream_not_configured_message(self):
        rc, out, err = self._run(
            ["list", "--via-proxy", "--proxy-base-url", "https://example.test", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse('{"error":"upstream_not_configured","message":"no key"}', status=503)),
        )
        self.assertEqual(rc, 6)
        self.assertIn("운영자", err)

    def test_empty_result_is_not_an_error(self):
        body = json.dumps({"page": 1, "perPage": 10, "totalCount": 0, "currentCount": 0,
                           "matchCount": 0, "data": []})
        rc, out, err = self._run(
            ["list", "--text", "--secrets-path", NO_SECRETS],
            opener_returning(FakeResponse(body)),
            env={"KSKILL_GOV24_API_KEY": FAKE_KEY},
        )
        self.assertEqual(rc, 0, err)
        self.assertIn("항목이 없습니다", out)


if __name__ == "__main__":
    unittest.main()