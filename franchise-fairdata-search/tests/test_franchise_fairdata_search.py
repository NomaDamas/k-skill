"""Network-free tests for the franchise-fairdata-search helper.

All upstream payloads are deterministic fixtures under tests/fixtures/. No test
opens a real secret file or performs a network call: the fetch callable is
always injected.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import stat
import tempfile
import unittest
import urllib.parse

TESTS_DIR = pathlib.Path(__file__).resolve().parent
ROOT = TESTS_DIR.parents[1]
FIXTURES = TESTS_DIR / "fixtures"
MODULE_PATH = ROOT / "franchise-fairdata-search" / "scripts" / "franchise_fairdata_search.py"

SPEC = importlib.util.spec_from_file_location("franchise_fairdata_search", MODULE_PATH)
fair = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(fair)

TEST_KEY = "TESTKEY+abc/with=special"
YEAR = "2023"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def operation_of(url: str) -> str:
    return urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1]


class FakeFetcher:
    """Dispatch by gateway operation name; records every URL it was asked for."""

    def __init__(self, routes, default=None):
        self.routes = routes
        self.default = default
        self.calls = []

    def __call__(self, url: str, timeout: int = 30):
        self.calls.append(url)
        operation = operation_of(url)
        handler = self.routes.get(operation, self.default)
        if handler is None:
            raise AssertionError(f"unexpected operation in test: {operation} ({url})")
        return handler(url) if callable(handler) else handler

    @property
    def operations(self):
        return [operation_of(url) for url in self.calls]


def base_env(**overrides):
    env = {"KSKILL_FAIRDATA_API_KEY": TEST_KEY, "KSKILL_SECRETS_PATH": "/nonexistent/secrets.env"}
    env.update(overrides)
    return env


def run_cli(argv, *, fetch, env=None, today=None):
    stdout, stderr = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        code = fair.run(
            argv,
            fetch=fetch,
            env=base_env() if env is None else env,
            today=today,
            checked_at="2026-09-27T00:00:00+00:00",
        )
    return code, stdout.getvalue(), stderr.getvalue()


class CredentialTests(unittest.TestCase):
    def test_env_primary_wins(self):
        env = {"KSKILL_FAIRDATA_API_KEY": "primary", "DATA_GO_KR_API_KEY": "fallback"}
        self.assertEqual(fair.resolve_api_key(env, pathlib.Path("/nonexistent")), "primary")

    def test_env_fallback_when_primary_absent(self):
        env = {"DATA_GO_KR_API_KEY": "fallback"}
        self.assertEqual(fair.resolve_api_key(env, pathlib.Path("/nonexistent")), "fallback")

    def test_placeholder_value_is_ignored(self):
        env = {"KSKILL_FAIRDATA_API_KEY": "replace-me", "DATA_GO_KR_API_KEY": "fallback"}
        self.assertEqual(fair.resolve_api_key(env, pathlib.Path("/nonexistent")), "fallback")

    def test_secrets_file_used_when_env_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "secrets.env"
            path.write_text(f"# comment\n{ fair.API_KEY_ENV_PRIMARY } = {TEST_KEY}\n", encoding="utf-8")
            os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
            self.assertEqual(fair.resolve_api_key({}, path), TEST_KEY)

    def test_missing_key_returns_none(self):
        self.assertIsNone(fair.resolve_api_key({}, pathlib.Path("/nonexistent/secrets.env")))


class UrlBuildTests(unittest.TestCase):
    def test_build_url_uses_service_operation_and_query(self):
        url = fair.build_url("stores", TEST_KEY, year=YEAR, extra={"brandMnno": "BRD_20080100006"})
        self.assertTrue(url.startswith("https://apis.data.go.kr/1130000/FftcBrandFrcsDropInfo3_Service/getbrandFrcsDmsstus2?"))
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        self.assertEqual(query["serviceKey"], [TEST_KEY])
        self.assertEqual(query["jngBizCrtraYr"], [YEAR])
        self.assertEqual(query["brandMnno"], ["BRD_20080100006"])
        self.assertEqual(query["resultType"], ["json"])

    def test_build_url_requires_detail_param(self):
        with self.assertRaises(fair.HelperError):
            fair.build_url("stores", TEST_KEY, year=YEAR, extra=None)

    def test_redact_url_hides_key(self):
        url = fair.build_url("brand_list", TEST_KEY, year=YEAR)
        redacted = fair.redact_url(url)
        self.assertNotIn("TESTKEY", redacted)
        self.assertIn("serviceKey=REDACTED", redacted)

    def test_api_base_override(self):
        url = fair.build_url("brand_list", TEST_KEY, year=YEAR, api_base="http://127.0.0.1:9000/")
        self.assertTrue(url.startswith("http://127.0.0.1:9000/FftcBrandRlsInfo2_Service/getBrandinfo?"))


class NormalizePayloadTests(unittest.TestCase):
    def test_wrapped_envelope_ok(self):
        total, rows = fair.normalize_payload(load_fixture("brand_list.json"))
        self.assertEqual(total, 2)
        self.assertEqual(rows[0]["brandNm"], "테스트치킨")

    def test_single_item_dict_is_list(self):
        _, rows = fair.normalize_payload(load_fixture("brand_list_single.json"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["brandMnno"], "BRD_20080100006")

    def test_flat_envelope_ok(self):
        payload = {"resultCode": "00", "totalCount": "1", "items": {"item": {"brandNm": "x"}}}
        total, rows = fair.normalize_payload(payload)
        self.assertEqual(total, 1)
        self.assertEqual(rows[0]["brandNm"], "x")

    def test_empty_code_returns_zero_rows(self):
        total, rows = fair.normalize_payload(load_fixture("empty_flat.json"))
        self.assertEqual(total, 0)
        self.assertEqual(rows, [])

    def test_gateway_auth_error_is_typed(self):
        with self.assertRaises(fair.ApiError) as ctx:
            fair.normalize_payload(load_fixture("error_auth.json"))
        self.assertIn("인증키", str(ctx.exception))

    def test_flat_parameter_error_is_typed(self):
        with self.assertRaises(fair.ApiError) as ctx:
            fair.normalize_payload(load_fixture("error_flat.json"))
        self.assertIn("파라미터", str(ctx.exception))

    def test_non_object_payload_is_rejected(self):
        with self.assertRaises(fair.ApiError):
            fair.normalize_payload([1, 2, 3])


class NameMatchingTests(unittest.TestCase):
    def test_name_key_ignores_whitespace_and_case(self):
        self.assertEqual(fair.name_key(" Test Chicken "), "testchicken")

    def test_name_matches_substring(self):
        self.assertTrue(fair.name_matches("테스트치킨", "테스트"))
        self.assertTrue(fair.name_matches("Test Chicken", "testchicken"))
        self.assertFalse(fair.name_matches("다른브랜드", "테스트"))


class PagingTests(unittest.TestCase):
    def test_fetch_pages_stops_after_total_and_matches(self):
        pages = {
            1: load_fixture("brand_list_page1.json"),
            2: load_fixture("brand_list_page2.json"),
        }

        def route(url):
            return pages[int(urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["pageNo"][0])]

        fetcher = FakeFetcher({"getBrandinfo": route})
        ctx = fair.QueryContext(
            api_key=TEST_KEY,
            api_base=fair.DEFAULT_API_BASE,
            fetch=fetcher,
            timeout=30,
            num_of_rows=1,
            max_pages=5,
        )
        rows, meta = fair.search_brands(ctx, name="테스트치킨", year=YEAR, limit=5)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["brandMnno"], "BRD_20080100006")
        self.assertEqual(meta["total_count"], 2)
        self.assertTrue(meta["complete"])
        self.assertEqual(meta["stop_reason"], "exhausted")
        self.assertEqual(fetcher.operations, ["getBrandinfo", "getBrandinfo"])

    def test_fetch_pages_marks_incomplete_at_max_pages(self):
        fetcher = FakeFetcher({"getBrandinfo": load_fixture("brand_list_page1.json")})
        ctx = fair.QueryContext(
            api_key=TEST_KEY,
            api_base=fair.DEFAULT_API_BASE,
            fetch=fetcher,
            timeout=30,
            num_of_rows=1,
            max_pages=1,
        )
        rows, meta = fair.fetch_pages(ctx, "brand_list", year=YEAR)
        self.assertEqual(len(rows), 1)
        self.assertFalse(meta["complete"])
        self.assertEqual(meta["stop_reason"], "max_pages")
        self.assertEqual(meta["matched_count"], 1)
        self.assertEqual(len(fetcher.operations), 1)


class SummarizeTests(unittest.TestCase):
    def test_summarize_stores_sums_rows(self):
        rows = load_fixture("stores.json")["response"]["body"]["items"]["item"]
        summary = fair.summarize_stores(rows)
        self.assertEqual(summary["franchise_store_count"], 85)
        self.assertEqual(summary["direct_store_count"], 15)
        self.assertEqual(summary["all_store_count"], 100)
        self.assertEqual(summary["row_count"], 2)

    def test_summarize_changes_picks_first_row(self):
        rows = [load_fixture("changes.json")["response"]["body"]["items"]["item"]]
        summary = fair.summarize_changes(rows)
        self.assertEqual(summary["ystFrcsCnt"], "100")
        self.assertEqual(summary["ctrtCncltnFrcsCnt"], "3")

    def test_summarize_changes_none_when_empty(self):
        self.assertIsNone(fair.summarize_changes([]))


class RunBrandsTests(unittest.TestCase):
    def test_brands_returns_matches_and_hides_key(self):
        fetcher = FakeFetcher({"getBrandinfo": load_fixture("brand_list.json")})
        code, out, err = run_cli(["brands", "--name", "테스트", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        self.assertNotIn("TESTKEY", out)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "ok")
        self.assertEqual([row["brandMnno"] for row in payload["rows"]], ["BRD_20080100006"])

    def test_brands_empty_is_explicit(self):
        fetcher = FakeFetcher({"getBrandinfo": load_fixture("empty_flat.json")})
        code, out, _ = run_cli(["brands", "--name", "없는브랜드", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "empty")
        self.assertEqual(payload["rows"], [])

    def test_brands_partial_when_max_pages_reached(self):
        pages = {
            1: load_fixture("brand_list_page1.json"),
            2: load_fixture("brand_list_page2.json"),
        }

        def route(url):
            return pages[int(urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["pageNo"][0])]

        fetcher = FakeFetcher({"getBrandinfo": route})
        code, out, _ = run_cli(
            [
                "brands",
                "--name",
                "테스트치킨",
                "--year",
                YEAR,
                "--num-of-rows",
                "1",
                "--max-pages",
                "1",
            ],
            fetch=fetcher,
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "partial")
        self.assertFalse(payload["meta"]["complete"])
        self.assertEqual(payload["meta"]["stop_reason"], "max_pages")
        self.assertTrue(payload["warnings"])
        self.assertEqual(fetcher.operations, ["getBrandinfo"])

    def test_brands_partial_text_warns_on_stderr(self):
        fetcher = FakeFetcher({"getBrandinfo": load_fixture("brand_list_page1.json")})
        code, out, err = run_cli(
            [
                "brands",
                "--name",
                "테스트치킨",
                "--year",
                YEAR,
                "--num-of-rows",
                "1",
                "--max-pages",
                "1",
                "--text",
            ],
            fetch=fetcher,
        )
        self.assertEqual(code, 0)
        self.assertIn("조건에 맞는 브랜드가 없습니다", out)
        self.assertIn("--max-pages", err)

    def test_missing_key_exits_one(self):
        fetcher = FakeFetcher({"getBrandinfo": load_fixture("brand_list.json")})
        code, out, err = run_cli(
            ["brands", "--name", "테스트", "--year", YEAR],
            fetch=fetcher,
            env={"KSKILL_SECRETS_PATH": "/nonexistent/secrets.env"},
        )
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn(fair.API_KEY_ENV_PRIMARY, err)
        self.assertEqual(fetcher.calls, [])

    def test_dry_run_redacts_key_and_skips_network(self):
        fetcher = FakeFetcher({})
        code, out, _ = run_cli(
            ["brands", "--name", "테스트", "--year", YEAR, "--dry-run"], fetch=fetcher
        )
        self.assertEqual(code, 0)
        self.assertEqual(fetcher.calls, [])
        payload = json.loads(out)
        self.assertTrue(payload["dry_run"])
        self.assertIn("serviceKey=REDACTED", payload["request_url"])
        self.assertNotIn("TESTKEY", out)

    def test_invalid_year_rejected_before_fetch(self):
        fetcher = FakeFetcher({})
        code, _, err = run_cli(["brands", "--name", "테스트", "--year", "23"], fetch=fetcher)
        self.assertEqual(code, 1)
        self.assertIn("연도", err)
        self.assertEqual(fetcher.calls, [])


class RunHqTests(unittest.TestCase):
    def test_hq_detail_included(self):
        fetcher = FakeFetcher(
            {
                "getjnghdqrtrsListinfo": load_fixture("hq_list.json"),
                "getjnghdqrtrsGnlinfo2": load_fixture("hq_detail.json"),
            }
        )
        code, out, _ = run_cli(["hq", "--name", "테스트", "--year", YEAR, "--detail"], fetch=fetcher)
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["rows"][0]["jnghdqrtrsMnno"], "HDR_20080000001")
        self.assertEqual(payload["details"][0]["status"], "ok")
        self.assertEqual(payload["details"][0]["rows"][0]["entScaleNm"], "중소기업")

    def test_hq_detail_text_includes_address_and_scale(self):
        fetcher = FakeFetcher(
            {
                "getjnghdqrtrsListinfo": load_fixture("hq_list.json"),
                "getjnghdqrtrsGnlinfo2": load_fixture("hq_detail.json"),
            }
        )
        code, out, _ = run_cli(
            ["hq", "--name", "테스트", "--year", YEAR, "--detail", "--text"], fetch=fetcher
        )
        self.assertEqual(code, 0)
        self.assertIn("테스트에프앤비", out)
        self.assertIn("중소기업", out)
        self.assertIn("서울특별시 강남구 테스트로 1 3층", out)
        self.assertIn("가맹본부관리번호 HDR_20080000001", out)


class RunDetailCommandTests(unittest.TestCase):
    def test_stores_by_brand_mnno(self):
        fetcher = FakeFetcher({"getbrandFrcsDmsstus2": load_fixture("stores.json")})
        code, out, _ = run_cli(
            ["stores", "--brand-mnno", "BRD_20080100006", "--year", YEAR], fetch=fetcher
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "ok")
        self.assertEqual(len(payload["section"]["rows"]), 2)

    def test_stores_by_brand_name_resolves_management_number(self):
        fetcher = FakeFetcher(
            {
                "getBrandinfo": load_fixture("brand_list.json"),
                "getbrandFrcsDmsstus2": load_fixture("stores.json"),
            }
        )
        code, out, _ = run_cli(["stores", "--brand", "테스트", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["brand_mnno"], "BRD_20080100006")
        self.assertEqual(payload["resolution"]["matched_by"], "brand_name")

    def test_changes_text_mode(self):
        fetcher = FakeFetcher({"getbrandFrcsFlctnstus": load_fixture("changes.json")})
        code, out, _ = run_cli(
            ["changes", "--brand-mnno", "BRD_20080100006", "--year", YEAR, "--text"], fetch=fetcher
        )
        self.assertEqual(code, 0)
        self.assertIn("계약해지 3", out)

    def test_stores_ambiguous_brand_name_refuses_instead_of_picking_first(self):
        fetcher = FakeFetcher(
            {
                "getBrandinfo": load_fixture("brand_list_ambiguous.json"),
                "getbrandFrcsDmsstus2": load_fixture("stores.json"),
            }
        )
        code, out, err = run_cli(["stores", "--brand", "테스트", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("여러 개", err)
        self.assertIn("--brand-mnno", err)
        self.assertEqual(fetcher.operations, ["getBrandinfo"])

    def test_stores_incomplete_brand_search_refuses(self):
        fetcher = FakeFetcher({"getBrandinfo": load_fixture("brand_list_page1.json")})
        code, out, err = run_cli(
            [
                "stores",
                "--brand",
                "테스트치킨",
                "--year",
                YEAR,
                "--num-of-rows",
                "1",
                "--max-pages",
                "1",
            ],
            fetch=fetcher,
        )
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("max-pages", err)
        self.assertEqual(fetcher.operations, ["getBrandinfo"])

    def test_brand_compare_required_message_when_missing(self):
        fetcher = FakeFetcher({})
        code, _, err = run_cli(["stores", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 1)
        self.assertIn("--brand", err)

    def test_api_error_does_not_leak_key(self):
        fetcher = FakeFetcher({"getbrandFrcsDmsstus2": load_fixture("error_auth.json")})
        code, out, err = run_cli(
            ["stores", "--brand-mnno", "BRD_20080100006", "--year", YEAR], fetch=fetcher
        )
        self.assertEqual(code, 1)
        self.assertNotIn("TESTKEY", out)
        self.assertNotIn("TESTKEY", err)
        self.assertIn("인증키", out)


class RunReportTests(unittest.TestCase):
    def _routes(self):
        return {
            "getBrandinfo": load_fixture("brand_list.json"),
            "getbrandFrcsDmsstus2": load_fixture("stores.json"),
            "getbrandFrcsFlctnstus": load_fixture("changes.json"),
            "getbrandFrcsBzmnAvrgsls2": load_fixture("sales.json"),
            "getbrandCompListinfo": load_fixture("brand_compare.json"),
            "getjnghdqrtrsGnlinfo2": load_fixture("hq_detail.json"),
        }

    def test_report_assembles_all_sections(self):
        fetcher = FakeFetcher(self._routes())
        code, out, _ = run_cli(["report", "--brand", "테스트", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 0)
        payload = json.loads(out)
        report = payload["reports"][0]
        self.assertEqual(report["brand"]["brandMnno"], "BRD_20080100006")
        self.assertEqual(report["summary"]["stores"]["franchise_store_count"], 85)
        self.assertEqual(report["summary"]["changes"]["ctrtCncltnFrcsCnt"], "3")
        self.assertEqual(report["failures"], [])

    def test_report_degrades_when_one_section_errors(self):
        routes = self._routes()
        routes["getbrandFrcsFlctnstus"] = load_fixture("error_auth.json")
        fetcher = FakeFetcher(routes)
        code, out, _ = run_cli(["report", "--brand", "테스트", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 0)
        report = json.loads(out)["reports"][0]
        self.assertEqual(report["sections"]["changes"]["status"], "error")
        self.assertEqual(report["sections"]["stores"]["status"], "ok")
        self.assertEqual(len(report["failures"]), 1)
        self.assertEqual(report["failures"][0]["section"], "changes")

    def test_report_empty_when_brand_not_found(self):
        routes = self._routes()
        routes["getBrandinfo"] = load_fixture("empty_flat.json")
        fetcher = FakeFetcher(routes)
        code, out, _ = run_cli(["report", "--brand", "없음", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "empty")
        self.assertEqual(payload["reports"], [])

    def test_report_ambiguous_brand_requires_disambiguation(self):
        routes = self._routes()
        routes["getBrandinfo"] = load_fixture("brand_list_ambiguous.json")
        fetcher = FakeFetcher(routes)
        code, out, err = run_cli(["report", "--brand", "테스트", "--year", YEAR], fetch=fetcher)
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("여러 개", err)
        self.assertNotIn("getbrandFrcsDmsstus2", fetcher.operations)

    def test_report_single_with_truncated_search_refuses(self):
        routes = self._routes()
        routes["getBrandinfo"] = load_fixture("brand_list_ambiguous.json")
        fetcher = FakeFetcher(routes)
        code, out, err = run_cli(
            ["report", "--brand", "테스트", "--year", YEAR, "--limit", "1"], fetch=fetcher
        )
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("limit", err)

    def test_report_all_warns_when_search_truncated(self):
        routes = self._routes()
        routes["getBrandinfo"] = load_fixture("brand_list_ambiguous.json")
        fetcher = FakeFetcher(routes)
        code, out, _ = run_cli(
            ["report", "--brand", "테스트", "--year", YEAR, "--all", "--limit", "1"],
            fetch=fetcher,
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "partial")
        self.assertEqual(len(payload["reports"]), 1)
        self.assertTrue(payload["warnings"])

    def test_report_all_partial_when_empty_and_incomplete(self):
        routes = self._routes()
        routes["getBrandinfo"] = load_fixture("brand_list_page1.json")
        fetcher = FakeFetcher(routes)
        code, out, _ = run_cli(
            [
                "report",
                "--brand",
                "테스트치킨",
                "--year",
                YEAR,
                "--all",
                "--num-of-rows",
                "1",
                "--max-pages",
                "1",
            ],
            fetch=fetcher,
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "partial")
        self.assertEqual(payload["reports"], [])
        self.assertTrue(payload["warnings"])

    def test_report_dry_run_uses_placeholder_and_no_network(self):
        fetcher = FakeFetcher({})
        code, out, _ = run_cli(
            ["report", "--brand", "테스트", "--year", YEAR, "--dry-run"], fetch=fetcher
        )
        self.assertEqual(code, 0)
        self.assertEqual(fetcher.calls, [])
        payload = json.loads(out)
        self.assertTrue(payload["dry_run"])


class DatasetsTests(unittest.TestCase):
    def test_datasets_lists_all_operations_without_key(self):
        code, out, _ = run_cli(["datasets"], fetch=FakeFetcher({}), env={})
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertIn("15125490", {meta["dataset_id"] for meta in payload["datasets"].values()})
        self.assertIn("brandNm", payload["field_labels"])


if __name__ == "__main__":
    unittest.main()
