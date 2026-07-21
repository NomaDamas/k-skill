import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
import urllib.parse
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "bok-ecos-stats" / "scripts" / "bok_ecos.py"
SPEC = importlib.util.spec_from_file_location("bok_ecos", MODULE_PATH)
bok_ecos = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(bok_ecos)


SEARCH_PAYLOAD = {
    "StatisticSearch": {
        "list_total_count": 2,
        "row": [
            {
                "STAT_CODE": "722Y001",
                "STAT_NAME": "1.3.1. 한국은행 기준금리 및 여수신금리",
                "ITEM_CODE1": "0101000",
                "ITEM_NAME1": "한국은행 기준금리",
                "UNIT_NAME": "연%",
                "TIME": "20260105",
                "DATA_VALUE": "2.5",
            },
            {
                "STAT_CODE": "722Y001",
                "STAT_NAME": "1.3.1. 한국은행 기준금리 및 여수신금리",
                "ITEM_CODE1": "0101000",
                "ITEM_NAME1": "한국은행 기준금리",
                "UNIT_NAME": "연%",
                "TIME": "20260106",
                "DATA_VALUE": "2.5",
            },
        ],
    }
}

KEYSTAT_PAYLOAD = {
    "KeyStatisticList": {
        "list_total_count": 101,
        "row": [
            {
                "CLASS_NAME": "환율",
                "KEYSTAT_NAME": "원/달러 환율(종가)",
                "DATA_VALUE": "1473.4",
                "CYCLE": "20260721",
                "UNIT_NAME": "원",
            }
        ],
    }
}

TABLES_PAYLOAD = {
    "StatisticTableList": {
        "list_total_count": 1,
        "row": [
            {
                "P_STAT_CODE": "0000000001",
                "STAT_CODE": "722Y001",
                "STAT_NAME": "1.3.1. 한국은행 기준금리 및 여수신금리",
                "CYCLE": "D",
                "SRCH_YN": "Y",
                "ORG_NAME": "한국은행",
            }
        ],
    }
}

ITEMS_PAYLOAD = {
    "StatisticItemList": {
        "list_total_count": 1,
        "row": [
            {
                "STAT_CODE": "722Y001",
                "GRP_NAME": "계정항목",
                "ITEM_CODE": "0101000",
                "ITEM_NAME": "한국은행 기준금리",
                "CYCLE": "D",
                "START_TIME": "19990506",
                "END_TIME": "20260721",
            }
        ],
    }
}

WORD_PAYLOAD = {
    "StatisticWord": {
        "list_total_count": 1,
        "row": [{"WORD": "소비자물가지수", "CONTENT": "물가 변동을 종합적으로 파악하기 위한 지수."}],
    }
}

BAD_KEY_PAYLOAD = {
    "RESULT": {"CODE": "INFO-100", "MESSAGE": "인증키가 유효하지 않습니다. 인증키를 확인하십시오!"}
}

EMPTY_PAYLOAD = {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}

SAMPLE_LIMIT_PAYLOAD = {
    "RESULT": {"CODE": "ERROR-301", "MESSAGE": "sample은 최대 10건 이내에서 호출이 가능합니다."}
}


class UrlBuildTests(unittest.TestCase):
    def test_search_url_uses_sample_key_and_positional_segments(self):
        args = bok_ecos.parse_args([
            "search", "--stat-code", "722Y001", "--cycle", "D",
            "--start", "20260101", "--end", "20260110", "--item-code", "0101000",
        ])
        url = bok_ecos.build_url(args, api_key=None)
        self.assertIn("/StatisticSearch/sample/json/kr/1/10/722Y001/D/20260101/20260110/0101000", url)

    def test_search_url_uses_user_key_and_limit(self):
        args = bok_ecos.parse_args([
            "search", "--stat-code", "722Y001", "--cycle", "D",
            "--start", "20260101", "--end", "20260110", "--limit", "500",
        ])
        url = bok_ecos.build_url(args, api_key="MYKEY")
        self.assertIn("/StatisticSearch/MYKEY/json/kr/1/500/722Y001/D/20260101/20260110", url)

    def test_sample_key_caps_limit_to_ten(self):
        args = bok_ecos.parse_args([
            "search", "--stat-code", "722Y001", "--cycle", "D",
            "--start", "20260101", "--end", "20260110", "--limit", "500",
        ])
        url = bok_ecos.build_url(args, api_key=None)
        self.assertIn("/kr/1/10/", url)

    def test_alias_resolves_to_stat_code_cycle_item(self):
        args = bok_ecos.parse_args(["search", "--alias", "기준금리", "--start", "20260101", "--end", "20260110"])
        url = bok_ecos.build_url(args, api_key=None)
        self.assertIn("722Y001/D/20260101/20260110/0101000", url)

    def test_unknown_alias_raises(self):
        args = bok_ecos.parse_args(["search", "--alias", "없는지표", "--start", "2026", "--end", "2026"])
        with self.assertRaisesRegex(bok_ecos.HelperError, "alias"):
            bok_ecos.build_url(args, api_key=None)

    def test_search_requires_stat_code_or_alias(self):
        args = bok_ecos.parse_args(["search", "--start", "2026", "--end", "2026"])
        with self.assertRaisesRegex(bok_ecos.HelperError, "stat-code"):
            bok_ecos.build_url(args, api_key=None)

    def test_word_url_percent_encodes_korean(self):
        args = bok_ecos.parse_args(["word", "--query", "소비자물가지수"])
        url = bok_ecos.build_url(args, api_key=None)
        self.assertNotIn("소비자물가지수", url)
        self.assertIn(urllib.parse.quote("소비자물가지수"), url)

    def test_invalid_segment_characters_rejected(self):
        args = bok_ecos.parse_args([
            "search", "--stat-code", "722Y001/evil", "--cycle", "D",
            "--start", "20260101", "--end", "20260110",
        ])
        with self.assertRaisesRegex(bok_ecos.HelperError, "stat-code"):
            bok_ecos.build_url(args, api_key=None)


class NormalizeTests(unittest.TestCase):
    def test_normalize_search_rows(self):
        rows = bok_ecos.normalize_payload(SEARCH_PAYLOAD, "StatisticSearch")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["DATA_VALUE"], "2.5")

    def test_normalize_raises_typed_error_on_bad_key(self):
        with self.assertRaises(bok_ecos.HelperError) as ctx:
            bok_ecos.normalize_payload(BAD_KEY_PAYLOAD, "StatisticSearch")
        self.assertIn("인증키", str(ctx.exception))

    def test_normalize_returns_empty_list_for_no_data(self):
        rows = bok_ecos.normalize_payload(EMPTY_PAYLOAD, "StatisticSearch")
        self.assertEqual(rows, [])

    def test_normalize_raises_on_sample_limit_error(self):
        with self.assertRaises(bok_ecos.HelperError) as ctx:
            bok_ecos.normalize_payload(SAMPLE_LIMIT_PAYLOAD, "StatisticSearch")
        self.assertIn("10건", str(ctx.exception))

    def test_normalize_raises_on_unexpected_shape(self):
        with self.assertRaises(bok_ecos.HelperError):
            bok_ecos.normalize_payload({"weird": True}, "StatisticSearch")


class RunTests(unittest.TestCase):
    def _run(self, argv, payload):
        stdout = io.StringIO()
        with mock.patch.object(bok_ecos, "http_get_json", return_value=payload), \
                contextlib.redirect_stdout(stdout):
            code = bok_ecos.run(argv)
        return code, stdout.getvalue()

    def test_run_search_outputs_series_json(self):
        code, out = self._run(
            ["search", "--alias", "기준금리", "--start", "20260101", "--end", "20260110"],
            SEARCH_PAYLOAD,
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "ok")
        self.assertEqual(len(payload["rows"]), 2)
        self.assertEqual(payload["rows"][0]["value"], "2.5")
        self.assertIn("ecos.bok.or.kr", payload["source"])

    def test_run_search_empty_is_explicit(self):
        code, out = self._run(
            ["search", "--stat-code", "722Y001", "--cycle", "D", "--start", "19000101", "--end", "19000102"],
            EMPTY_PAYLOAD,
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "empty")
        self.assertEqual(payload["rows"], [])

    def test_run_key_outputs_headline_stats(self):
        code, out = self._run(["key"], KEYSTAT_PAYLOAD)
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["rows"][0]["name"], "원/달러 환율(종가)")

    def test_run_tables_and_items_and_word(self):
        code, out = self._run(["tables"], TABLES_PAYLOAD)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["rows"][0]["stat_code"], "722Y001")

        code, out = self._run(["items", "--stat-code", "722Y001"], ITEMS_PAYLOAD)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["rows"][0]["item_code"], "0101000")

        code, out = self._run(["word", "--query", "소비자물가지수"], WORD_PAYLOAD)
        self.assertEqual(code, 0)
        self.assertIn("지수", json.loads(out)["rows"][0]["content"])

    def test_run_reports_key_error_to_stderr(self):
        stderr = io.StringIO()
        with mock.patch.object(bok_ecos, "http_get_json", return_value=BAD_KEY_PAYLOAD), \
                contextlib.redirect_stderr(stderr):
            code = bok_ecos.run(["search", "--alias", "기준금리", "--start", "2026", "--end", "2026"])
        self.assertEqual(code, 1)
        self.assertIn("인증키", stderr.getvalue())

    def test_run_text_mode_renders_series(self):
        stdout = io.StringIO()
        with mock.patch.object(bok_ecos, "http_get_json", return_value=SEARCH_PAYLOAD), \
                contextlib.redirect_stdout(stdout):
            code = bok_ecos.run(["search", "--alias", "기준금리", "--start", "20260101", "--end", "20260110", "--text"])
        self.assertEqual(code, 0)
        self.assertIn("한국은행 기준금리", stdout.getvalue())
        self.assertIn("2.5", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
