import importlib.util
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
HELPER_PATH = SCRIPT_DIR.parent / "scripts" / "run_kosis_stats.py"
FIXTURES_DIR = SCRIPT_DIR / "fixtures"


def load_helper():
    spec = importlib.util.spec_from_file_location("run_kosis_stats", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load helper from {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["run_kosis_stats"] = module
    spec.loader.exec_module(module)
    return module


helper = load_helper()


def read_fixture(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


class ParseArgsTest(unittest.TestCase):
    def test_search_subcommand_parses_query(self):
        args = helper.parse_args(["search", "--query", "인구"])
        self.assertEqual(args.command, "search")
        self.assertEqual(args.query, "인구")
        self.assertEqual(args.result_count, 20)

    def test_data_subcommand_requires_period_fields(self):
        args = helper.parse_args([
            "data", "--table-id", "DT_1JC1501",
            "--prd-se", "Y", "--start", "2020", "--end", "2023",
        ])
        self.assertEqual(args.prd_se, "Y")
        self.assertEqual(args.itm_id, "ALL")

    def test_meta_subcommand_defaults_org_id_to_101(self):
        args = helper.parse_args(["meta", "--table-id", "DT_1IN0001"])
        self.assertEqual(args.org_id, "101")
        self.assertEqual(args.meta_type, "TBL")

    def test_bigdata_subcommand_requires_user_stats_id(self):
        args = helper.parse_args([
            "bigdata", "--user-stats-id", "openapisample/101/DT_1IN1502/2/1/abc",
        ])
        self.assertEqual(args.user_stats_id, "openapisample/101/DT_1IN1502/2/1/abc")
        self.assertEqual(args.bigdata_format, "json")

    def test_invalid_prd_se_rejected(self):
        with self.assertRaises(SystemExit):
            helper.parse_args([
                "data", "--table-id", "X", "--prd-se", "X",
                "--start", "2020", "--end", "2021",
            ])

    def test_result_count_out_of_range_rejected(self):
        with self.assertRaises(SystemExit):
            helper.parse_args([
                "search", "--query", "x", "--result-count", "9999",
            ])

    def test_list_subcommand_parses_vw_cd(self):
        args = helper.parse_args(["list", "--vw-cd", "MT_ZTITLE"])
        self.assertEqual(args.command, "list")
        self.assertEqual(args.vw_cd, "MT_ZTITLE")
        self.assertEqual(args.parent_id, "")

    def test_list_invalid_vw_cd_rejected(self):
        with self.assertRaises(SystemExit):
            helper.parse_args(["list", "--vw-cd", "INVALID_CODE"])

    def test_explain_requires_stat_id_or_org_tbl(self):
        args = helper.parse_args(["explain", "--stat-id", "A10120100413104843"])
        self.assertEqual(args.stat_id, "A10120100413104843")
        args2 = helper.parse_args(["explain", "--org-id", "101", "--table-id", "DT_1IN0001"])
        self.assertEqual(args2.org_id, "101")
        self.assertEqual(args2.table_id, "DT_1IN0001")

    def test_indicator_defaults_service_to_1(self):
        args = helper.parse_args(["indicator", "--jipyo-id", "160"])
        self.assertEqual(args.service, "1")
        self.assertEqual(args.jipyo_id, "160")
        self.assertEqual(args.page_no, 1)
        self.assertEqual(args.num_of_rows, 10)

    def test_indicator_invalid_service_rejected(self):
        with self.assertRaises(SystemExit):
            helper.parse_args(["indicator", "--jipyo-id", "160", "--service", "9"])


class CredentialResolutionTest(unittest.TestCase):
    def test_env_var_takes_precedence(self):
        env = {"KSKILL_KOSIS_API_KEY": "env-key"}
        secrets = SCRIPT_DIR / "fixtures" / "missing.env"
        self.assertEqual(helper.resolve_api_key(env=env, secrets_path=secrets), "env-key")

    def test_secrets_env_used_when_env_var_missing(self):
        secrets = SCRIPT_DIR / "fixtures" / "tmp_secrets.env"
        secrets.write_text("KSKILL_KOSIS_API_KEY=file-key\n", encoding="utf-8")
        try:
            self.assertEqual(
                helper.resolve_api_key(env={}, secrets_path=secrets), "file-key"
            )
        finally:
            secrets.unlink()

    def test_missing_credentials_exits_with_helpful_message(self):
        secrets = SCRIPT_DIR / "fixtures" / "missing.env"
        with self.assertRaises(SystemExit) as ctx:
            helper.resolve_api_key(env={}, secrets_path=secrets)
        message = str(ctx.exception)
        self.assertIn("KSKILL_KOSIS_API_KEY", message)
        self.assertIn("kosis.kr/openapi", message)

    def test_proxy_base_url_defaults_to_hosted_proxy(self):
        self.assertEqual(
            helper.resolve_proxy_base_url(env={}),
            "https://k-skill-proxy.nomadamas.org"
        )

    def test_proxy_base_url_env_override_is_trimmed(self):
        self.assertEqual(
            helper.resolve_proxy_base_url(env={"KSKILL_PROXY_BASE_URL": "https://proxy.example/"}),
            "https://proxy.example"
        )

    def test_proxy_base_url_can_be_disabled_for_direct_mode(self):
        with self.assertRaises(SystemExit):
            helper.resolve_proxy_base_url(env={"KSKILL_PROXY_BASE_URL": "off"})


class UrlBuilderTest(unittest.TestCase):
    def test_search_params_include_required_fields(self):
        args = helper.parse_args(["search", "--query", "인구"])
        params = helper.build_search_params("KEY", args)
        self.assertEqual(params["method"], "getList")
        self.assertEqual(params["searchNm"], "인구")
        self.assertEqual(params["apiKey"], "KEY")
        self.assertEqual(params["format"], "json")

    def test_data_params_include_obj_l_default(self):
        args = helper.parse_args([
            "data", "--table-id", "DT_1JC1501",
            "--prd-se", "Y", "--start", "2020", "--end", "2023",
        ])
        params = helper.build_data_params("KEY", args)
        self.assertEqual(params["objL1"], "ALL")
        self.assertEqual(params["prdSe"], "Y")
        self.assertEqual(params["startPrdDe"], "2020")
        self.assertEqual(params["endPrdDe"], "2023")

    def test_data_params_apply_obj_l_overrides(self):
        args = helper.parse_args([
            "data", "--table-id", "DT_X", "--prd-se", "Y",
            "--start", "2020", "--end", "2020",
            "--obj-l", "1=ALL", "--obj-l", "2=00",
        ])
        params = helper.build_data_params("KEY", args)
        self.assertEqual(params["objL1"], "ALL")
        self.assertEqual(params["objL2"], "00")

    def test_obj_l_rejects_bad_index(self):
        args = helper.parse_args([
            "data", "--table-id", "DT_X", "--prd-se", "Y",
            "--start", "2020", "--end", "2020", "--obj-l", "9=ALL",
        ])
        with self.assertRaises(SystemExit):
            helper.build_data_params("KEY", args)

    def test_meta_params_include_type_and_table(self):
        args = helper.parse_args(["meta", "--table-id", "DT_1IN0001"])
        params = helper.build_meta_params("KEY", args)
        self.assertEqual(params["method"], "getMeta")
        self.assertEqual(params["type"], "TBL")
        self.assertEqual(params["tblId"], "DT_1IN0001")

    def test_bigdata_params_include_format_and_optional_fields(self):
        args = helper.parse_args([
            "bigdata", "--user-stats-id", "abc/def",
            "--format", "sdmx", "--prd-se", "Y", "--new-est-prd-cnt", "5",
        ])
        params = helper.build_bigdata_params("KEY", args)
        self.assertEqual(params["format"], "sdmx")
        self.assertEqual(params["userStatsId"], "abc/def")
        self.assertEqual(params["prdSe"], "Y")
        self.assertEqual(params["newEstPrdCnt"], "5")

    def test_build_url_round_trip(self):
        url = helper.build_url("https://example.com/x", {"a": "1", "b": "한글"})
        self.assertTrue(url.startswith("https://example.com/x?"))
        self.assertIn("a=1", url)
        self.assertIn("b=", url)

    def test_list_params_include_vw_cd_and_parent_id(self):
        args = helper.parse_args(["list", "--vw-cd", "MT_ZTITLE", "--parent-id", "sub123"])
        params = helper.build_list_params("KEY", args)
        self.assertEqual(params["vwCd"], "MT_ZTITLE")
        self.assertEqual(params["parentId"], "sub123")
        self.assertEqual(params["method"], "getList")

    def test_explain_params_with_org_and_table(self):
        args = helper.parse_args(["explain", "--org-id", "101", "--table-id", "DT_1IN0001"])
        params = helper.build_explain_params("KEY", args)
        self.assertEqual(params["orgId"], "101")
        self.assertEqual(params["tblId"], "DT_1IN0001")
        self.assertEqual(params["metaItm"], "All")

    def test_explain_params_with_stat_id(self):
        args = helper.parse_args(["explain", "--stat-id", "A10120100413104843"])
        params = helper.build_explain_params("KEY", args)
        self.assertEqual(params["statId"], "A10120100413104843")
        self.assertNotIn("orgId", params)

    def test_explain_without_any_id_exits(self):
        args = helper.parse_args(["explain"])
        with self.assertRaises(SystemExit):
            helper.build_explain_params("KEY", args)

    def test_indicator_params_include_service_and_jipyo_id(self):
        args = helper.parse_args(["indicator", "--jipyo-id", "160", "--service", "2"])
        params = helper.build_indicator_params("KEY", args)
        self.assertEqual(params["jipyoId"], "160")
        self.assertEqual(params["service"], "2")
        self.assertEqual(params["serviceDetail"], "pkCalcSource")
        self.assertEqual(params["pageNo"], "1")
        self.assertEqual(params["numOfRows"], "10")


class JsonHandlingTest(unittest.TestCase):
    def test_unquoted_keys_are_fixed(self):
        text = '{ORG_ID:"101",TBL_ID:"DT_X"}'
        fixed = helper.fix_unquoted_keys(text)
        self.assertEqual(json.loads(fixed), {"ORG_ID": "101", "TBL_ID": "DT_X"})

    def test_parse_kosis_json_handles_clean_json(self):
        payload = helper.parse_kosis_json('{"a":1,"b":"x"}')
        self.assertEqual(payload, {"a": 1, "b": "x"})

    def test_parse_kosis_json_handles_unquoted_keys(self):
        payload = helper.parse_kosis_json('{a:1,b:"x"}')
        self.assertEqual(payload, {"a": 1, "b": "x"})


class ErrorDetectionTest(unittest.TestCase):
    def test_err_field_detected(self):
        err = helper.detect_kosis_error({"err": "31", "errMsg": "조회결과 초과"})
        self.assertIsNotNone(err)
        self.assertEqual(err.code, "31")
        self.assertIn("31", str(err))
        # 31 hint 가 분할 + bigdata + 구체 예시 모두 안내
        self.assertIn("좁히", str(err))
        self.assertIn("obj-l", str(err))
        self.assertIn("bigdata", str(err))

    def test_errcode_field_detected(self):
        err = helper.detect_kosis_error({"errCode": "10", "errMsg": "인증키 누락"})
        self.assertIsNotNone(err)
        self.assertEqual(err.code, "10")
        self.assertIn("KSKILL_KOSIS_API_KEY", str(err))

    def test_code_20_hint_directs_to_meta(self):
        err = helper.detect_kosis_error({"err": "20", "errMsg": "필수요청변수값이 누락"})
        self.assertIsNotNone(err)
        self.assertIn("meta", str(err))
        self.assertIn("--obj-l", str(err))

    def test_code_21_hint_suggests_search(self):
        err = helper.detect_kosis_error({"err": "21", "errMsg": "잘못된 요청"})
        self.assertIsNotNone(err)
        self.assertIn("search", str(err))

    def test_code_30_hint_includes_keyword_relaxation(self):
        err = helper.detect_kosis_error({"err": "30", "errMsg": "결과 없음"})
        self.assertIsNotNone(err)
        self.assertIn("키워드", str(err))
        self.assertIn("meta-type", str(err))

    def test_unknown_code_still_reported(self):
        err = helper.detect_kosis_error({"err": "99", "errMsg": "알 수 없음"})
        self.assertIsNotNone(err)
        self.assertEqual(err.code, "99")

    def test_normal_payload_returns_none(self):
        self.assertIsNone(helper.detect_kosis_error([{"DT": "1"}]))
        self.assertIsNone(helper.detect_kosis_error({"OK": True}))

    def test_xml_error_detected(self):
        body = '<?xml version="1.0"?><error><err>11</err><errMsg>유효하지않은 인증KEY입니다.</errMsg></error>'
        err = helper.detect_xml_error(body)
        self.assertIsNotNone(err)
        self.assertEqual(err.code, "11")
        self.assertIn("11", str(err))

    def test_xml_error_returns_none_for_normal_text(self):
        self.assertIsNone(helper.detect_xml_error("<sdmx:GenericData/>"))


class CallKosisTest(unittest.TestCase):
    def test_call_kosis_returns_payload_on_success(self):
        with mock.patch.object(helper, "fetch_text", return_value=read_fixture("search_response.json")):
            payload = helper.call_kosis("https://example", 5)
        self.assertIsInstance(payload, list)
        self.assertEqual(payload[0]["TBL_ID"], "DT_1JC1501")

    def test_call_kosis_raises_on_kosis_error_payload(self):
        body = json.dumps({"err": "31", "errMsg": "조회결과 초과"})
        with mock.patch.object(helper, "fetch_text", return_value=body):
            with self.assertRaises(helper.KosisError) as ctx:
                helper.call_kosis("https://example", 5)
        self.assertEqual(ctx.exception.code, "31")

    def test_call_kosis_returns_text_for_non_json_format(self):
        with mock.patch.object(helper, "fetch_text", return_value="<sdmx/>"):
            payload = helper.call_kosis("https://example", 5, format_hint="sdmx")
        self.assertEqual(payload, "<sdmx/>")

    def test_call_kosis_detects_json_error_envelope_in_non_json_format(self):
        body = json.dumps({"err": "11", "errMsg": "유효하지 않은 인증KEY입니다."})
        with mock.patch.object(helper, "fetch_text", return_value=body):
            with self.assertRaises(helper.KosisError) as ctx:
                helper.call_kosis("https://example", 5, format_hint="csv")
        self.assertEqual(ctx.exception.code, "11")

    def test_call_kosis_returns_csv_text_when_no_error_envelope(self):
        body = "PRD_DE,DT\n2024,1\n"
        with mock.patch.object(helper, "fetch_text", return_value=body):
            payload = helper.call_kosis("https://example", 5, format_hint="csv")
        self.assertEqual(payload, body)

    def test_bigdata_format_xls_is_rejected(self):
        with self.assertRaises(SystemExit):
            helper.parse_args([
                "bigdata", "--user-stats-id", "abc/def", "--format", "xls",
            ])


class RenderTextTest(unittest.TestCase):
    def test_search_text_lists_each_table(self):
        payload = json.loads(read_fixture("search_response.json"))
        text = helper.render_search_text(payload)
        self.assertIn("DT_1JC1501", text)
        self.assertIn("1인 가구 비율", text)

    def test_search_empty_renders_friendly_message(self):
        text = helper.render_search_text([])
        self.assertIn("결과가 없습니다", text)
        self.assertIn("키워드", text)
        self.assertIn("--start-count", text)

    def test_search_text_includes_next_step_hint(self):
        payload = json.loads(read_fixture("search_response.json"))
        text = helper.render_search_text(payload)
        self.assertIn("Next", text)
        self.assertIn("meta", text)
        self.assertIn("data", text)

    def test_meta_empty_suggests_other_meta_type(self):
        text = helper.render_meta_text([])
        self.assertIn("--meta-type", text)
        self.assertIn("TBL", text)

    def test_data_empty_suggests_filter_relaxation(self):
        text = helper.render_data_text([])
        self.assertIn("--obj-l", text)
        self.assertIn("meta", text)

    def test_data_text_includes_summary_with_period_and_unit(self):
        payload = json.loads(read_fixture("data_response.json"))
        text = helper.render_data_text(payload)
        self.assertIn("[summary]", text)
        self.assertIn("rows=2", text)
        self.assertIn("period=2023~2024", text)
        self.assertIn("unit=%", text)

    def test_data_text_summary_marks_missing_unit(self):
        text = helper.render_data_text([{"PRD_DE": "2024", "ITM_NM": "x", "DT": "1"}])
        self.assertIn("UNIT_NM 미포함", text)

    def test_meta_text_includes_korean_and_english(self):
        payload = json.loads(read_fixture("meta_response.json"))
        text = helper.render_meta_text(payload)
        self.assertIn("1인 가구 비율", text)
        self.assertIn("Single-person", text)

    def test_data_text_lists_period_and_value(self):
        payload = json.loads(read_fixture("data_response.json"))
        text = helper.render_data_text(payload)
        self.assertIn("2023", text)
        self.assertIn("35.5", text)
        self.assertIn("%", text)

    def test_list_empty_suggests_parent_id_or_vw_cd(self):
        text = helper.render_list_text([])
        self.assertIn("--parent-id", text)
        self.assertIn("--vw-cd", text)

    def test_list_text_shows_category_entries(self):
        payload = [
            {"LIST_ID": "L1", "LIST_NM": "인구/가구", "ORG_ID": "", "TBL_ID": "", "TBL_NM": "", "SEND_DE": ""},
            {"LIST_ID": "L2", "LIST_NM": "경제/산업", "ORG_ID": "101", "TBL_ID": "DT_X", "TBL_NM": "GDP", "SEND_DE": "20240101"},
        ]
        text = helper.render_list_text(payload)
        self.assertIn("인구/가구", text)
        self.assertIn("GDP", text)
        self.assertIn("DT_X", text)

    def test_explain_empty_suggests_search(self):
        text = helper.render_explain_text([])
        self.assertIn("search", text)

    def test_explain_text_shows_fields(self):
        payload = [{"statsNm": "인구총조사", "writingPurps": "인구 파악", "statsPeriod": "5년"}]
        text = helper.render_explain_text(payload)
        self.assertIn("인구총조사", text)
        self.assertIn("인구 파악", text)
        self.assertIn("조사주기", text)

    def test_indicator_empty_suggests_jipyo_id(self):
        text = helper.render_indicator_text([])
        self.assertIn("--jipyo-id", text)

    def test_indicator_text_shows_concept(self):
        payload = [{"statJipyoId": "160", "statJipyoNm": "인구밀도", "jipyoExplan": "인구밀도 설명", "jipyoExplan1": "1km²당 인구수"}]
        text = helper.render_indicator_text(payload)
        self.assertIn("160", text)
        self.assertIn("인구밀도", text)
        self.assertIn("1km²당 인구수", text)


class DryRunTest(unittest.TestCase):
    def test_dry_run_redacts_api_key_and_does_not_call_network(self):
        args = helper.parse_args(["search", "--query", "인구", "--dry-run", "--json"])
        with mock.patch.object(helper, "fetch_text") as fetch_mock:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = helper.run(args)
        self.assertEqual(rc, 0)
        fetch_mock.assert_not_called()
        out = buf.getvalue()
        self.assertIn('"via_proxy": true', out)
        self.assertNotIn("apiKey", json.dumps(json.loads(out)["params"]))
        self.assertIn("/v1/kosis/search", out)
        self.assertIn("statisticsSearch.do", out)

    def test_direct_dry_run_redacts_api_key(self):
        args = helper.parse_args(["search", "--query", "인구", "--dry-run", "--direct", "--json"])
        with mock.patch.object(helper, "fetch_text") as fetch_mock:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = helper.run(args)
        self.assertEqual(rc, 0)
        fetch_mock.assert_not_called()
        out = buf.getvalue()
        self.assertIn("<DRY-RUN>", out)
        self.assertIn('"via_proxy": false', out)
        self.assertIn("apiKey", out)

    def test_list_dry_run_uses_proxy_and_no_api_key(self):
        args = helper.parse_args(["list", "--vw-cd", "MT_ZTITLE", "--dry-run", "--json"])
        with mock.patch.object(helper, "fetch_text") as fetch_mock:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = helper.run(args)
        self.assertEqual(rc, 0)
        fetch_mock.assert_not_called()
        out = buf.getvalue()
        self.assertIn('"via_proxy": true', out)
        self.assertIn("/v1/kosis/list", out)
        self.assertIn("statisticsList.do", out)

    def test_explain_dry_run_uses_proxy(self):
        args = helper.parse_args(["explain", "--org-id", "101", "--table-id", "DT_1IN0001", "--dry-run", "--json"])
        with mock.patch.object(helper, "fetch_text") as fetch_mock:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = helper.run(args)
        self.assertEqual(rc, 0)
        fetch_mock.assert_not_called()
        out = buf.getvalue()
        self.assertIn('"via_proxy": true', out)
        self.assertIn("/v1/kosis/explain", out)
        self.assertIn("statisticsExplData.do", out)

    def test_indicator_dry_run_uses_proxy(self):
        args = helper.parse_args(["indicator", "--jipyo-id", "160", "--dry-run", "--json"])
        with mock.patch.object(helper, "fetch_text") as fetch_mock:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = helper.run(args)
        self.assertEqual(rc, 0)
        fetch_mock.assert_not_called()
        out = buf.getvalue()
        self.assertIn('"via_proxy": true', out)
        self.assertIn("/v1/kosis/indicator", out)
        self.assertIn("pkNumberService.do", out)


class RunIntegrationTest(unittest.TestCase):
    def test_run_search_text_renders_fixture_payload(self):
        args = helper.parse_args(["search", "--query", "1인 가구", "--text"])
        with mock.patch.object(helper, "fetch_text", return_value=read_fixture("search_response.json")) as fetch_mock:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = helper.run(args)
        self.assertEqual(rc, 0)
        out = buf.getvalue()
        self.assertIn("DT_1JC1501", out)
        self.assertIn("statisticsSearch.do", out)
        self.assertIn("/v1/kosis/search", fetch_mock.call_args.args[0])
        self.assertNotIn("apiKey=", fetch_mock.call_args.args[0])

    def test_run_returns_2_on_kosis_error(self):
        args = helper.parse_args(["data", "--table-id", "DT_X",
                                  "--prd-se", "Y", "--start", "2020", "--end", "2024", "--json"])
        body = json.dumps({"err": "31", "errMsg": "조회결과 초과"})
        with mock.patch.object(helper, "resolve_api_key", return_value="KEY"), \
             mock.patch.object(helper, "fetch_text", return_value=body):
            rc = helper.run(args)
        self.assertEqual(rc, 2)


@unittest.skipUnless(os.getenv("KSKILL_KOSIS_API_KEY"), "live KOSIS test skipped without KSKILL_KOSIS_API_KEY")
class LiveKosisSmokeTest(unittest.TestCase):
    def test_live_search_returns_list(self):
        args = helper.parse_args(["search", "--query", "인구", "--result-count", "1", "--json", "--direct"])
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = helper.run(args)
        self.assertEqual(rc, 0)
        payload = json.loads(buf.getvalue())
        self.assertIsInstance(payload, list)
        self.assertGreaterEqual(len(payload), 1)


if __name__ == "__main__":
    unittest.main()
