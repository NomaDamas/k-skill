import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("bond_search", ROOT / "scripts" / "bond_search.py")
bond_search = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(bond_search)


class BondSearchTests(unittest.TestCase):
    def test_amount_rate_date_and_flags(self):
        rows, source = bond_search.load_rows(str(ROOT / "tests" / "fixtures" / "bonds.json"))
        record = bond_search.normalize(rows[1], "2026-09-24T00:00:00+00:00", source)
        self.assertEqual(record["issue_amount_krw"], 50_000_000_000)
        self.assertEqual(record["coupon_rate_pct"], 2.5)
        self.assertEqual(record["maturity_date"], "2030-02-01")
        self.assertTrue(record["callable"])
        self.assertTrue(record["putable"])
        self.assertTrue(record["convertible"])
        self.assertIsNone(record["exchangeable"])

    def test_isin_format_and_check_digit_are_validated(self):
        self.assertEqual(bond_search.parse_isin("kr6000000010"), "KR6000000010")
        with self.assertRaises(bond_search.argparse.ArgumentTypeError):
            bond_search.parse_isin("KR6000000011")
        with self.assertRaises(bond_search.InputError):
            bond_search.normalize(
                {"종목코드": "KR6000000011", "종목명": "오류 종목"},
                "2026-09-24T00:00:00+00:00", "fixture",
            )

    def test_issue_date_after_maturity_is_rejected(self):
        with self.assertRaises(bond_search.InputError) as caught:
            bond_search.normalize(
                {"종목코드": "KR6000000010", "종목명": "날짜 오류", "발행일": "2030-01-01", "만기일": "2029-01-01"},
                "2026-09-24T00:00:00+00:00", "fixture",
            )
        self.assertEqual(caught.exception.code, "parse_failure")

    def test_nullable_field_is_not_inferred(self):
        rows, source = bond_search.load_rows(str(ROOT / "tests" / "fixtures" / "bonds.json"))
        record = bond_search.normalize(rows[2], "2026-09-24T00:00:00+00:00", source)
        self.assertIsNone(record["outstanding_amount_krw"])
        self.assertIsNone(record["currency"])
        self.assertIsNone(record["callable"], "사채권자의 조기상환청구권을 발행사 CALL로 분류하면 안 됩니다")
        self.assertTrue(record["putable"])

    def test_explicit_no_option_is_false(self):
        record = bond_search.normalize({"종목코드": "KR6000000010", "종목명": "채권", "옵션": "없음"}, "2026-09-24T00:00:00+00:00", "fixture")
        self.assertFalse(record["callable"])
        self.assertFalse(record["putable"])

    def test_header_money_unit_and_bp_rate(self):
        record = bond_search.normalize(
            {"종목코드": "KR6000000010", "종목명": "채권", "발행통화": "KRW", "발행금액(백만원)": "1500", "표면금리": "325bp"},
            "2026-09-24T00:00:00+00:00",
            "fixture",
        )
        self.assertEqual(record["issue_amount_krw"], 1_500_000_000)
        self.assertEqual(record["coupon_rate_pct"], 3.25)

    def test_html_table_and_invalid_html(self):
        with tempfile.TemporaryDirectory() as temp:
            good = Path(temp) / "good.html"
            good.write_text("<table><tr><th>종목코드</th><th>종목명</th></tr><tr><td>KR1</td><td>채권</td></tr></table>", encoding="utf-8")
            rows, _ = bond_search.load_rows(str(good))
            self.assertEqual(rows[0]["종목코드"], "KR1")
            bad = Path(temp) / "bad.html"
            bad.write_text("<html>error</html>", encoding="utf-8")
            with self.assertRaises(bond_search.InputError) as caught:
                bond_search.load_rows(str(bad))
            self.assertEqual(caught.exception.code, "parse_failure")

    def test_html_selects_bond_table_not_first_table(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tables.html"
            path.write_text(
                "<table><tr><th>공지</th></tr><tr><td>점검</td></tr></table>"
                "<table><tr><th>종목코드</th><th>종목명</th></tr><tr><td>KR6000000010</td><td>채권</td></tr></table>",
                encoding="utf-8",
            )
            rows, _ = bond_search.load_rows(str(path))
            self.assertEqual(rows, [{"종목코드": "KR6000000010", "종목명": "채권"}])

    def test_html_rejects_duplicate_headers_and_any_ragged_row(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "table.html"
            cases = (
                "<table><tr><th>종목코드</th><th>종목 코드</th></tr><tr><td>A</td><td>B</td></tr></table>",
                "<table><tr><th>종목코드</th><th>종목명</th></tr><tr><td>A</td><td>정상</td></tr><tr><td>B</td></tr></table>",
            )
            for body in cases:
                path.write_text(body, encoding="utf-8")
                with self.subTest(body=body), self.assertRaises(bond_search.InputError) as caught:
                    bond_search.load_rows(str(path))
                self.assertEqual(caught.exception.code, "parse_failure")

    def test_identical_duplicate_is_deduplicated_but_conflict_is_not(self):
        base = bond_search.normalize({"종목코드": "KR6000000010", "종목명": "채권"}, "2026-09-24T00:00:00+00:00", "a")
        duplicate = bond_search.normalize({"종목코드": "KR6000000010", "종목명": "채권"}, "2026-09-25T00:00:00+00:00", "b")
        conflict = bond_search.normalize({"종목코드": "KR6000000010", "종목명": "다른채권"}, "2026-09-24T00:00:00+00:00", "a")
        self.assertEqual(len(bond_search.dedupe_identical([base, duplicate, conflict])), 2)

    def test_json_items_contract(self):
        rows, _ = bond_search.load_rows(str(ROOT / "tests" / "fixtures" / "bonds.json"))
        self.assertEqual(len(rows), 3)
        payload = json.loads(json.dumps(rows, ensure_ascii=False))
        self.assertEqual(payload[0]["종목명"], "테스트자동차 101-1")

    def test_chat_renderer_is_user_facing_and_hides_null(self):
        rows, source = bond_search.load_rows(str(ROOT / "tests" / "fixtures" / "bonds.json"))
        items = [bond_search.compact_record(bond_search.normalize(row, "2026-09-24T09:00:00+09:00", source)) for row in rows[:2]]
        rendered = bond_search.render_chat({"result": "ok", "count": 2, "items": items, "truncated": False})
        self.assertIn("## 한국 채권 검색 결과", rendered)
        self.assertIn("상세히 볼 종목", rendered)
        self.assertIn("1,200억", rendered)
        self.assertNotIn('"schema_version"', rendered)
        self.assertNotIn("null", rendered)

    def test_unverified_file_output_does_not_claim_seibro_provenance(self):
        stdout = io.StringIO()
        with redirect_stdout(stdout), self.assertRaises(SystemExit) as caught:
            bond_search.main([
                "search", "--input", str(ROOT / "tests" / "fixtures" / "bonds.json"),
                "--issuer", "테스트자동차", "--observed-at", "2026-09-25T09:00:00+09:00",
            ])
        self.assertEqual(caught.exception.code, 0)
        rendered = stdout.getvalue()
        self.assertIn("출처: 입력 자료", rendered)
        self.assertIn("원천 확인 여부 미검증", rendered)
        self.assertNotIn(bond_search.SEIBRO_URL, rendered)
        self.assertNotIn("테스트자동차", rendered.split("출처:", 1)[-1])

    def test_source_line_marks_verification_only_when_basis_says_verified(self):
        verified = bond_search.source_line({
            "name": "SEIBro", "url": bond_search.SEIBRO_URL,
            "observed_at": "2026-09-25T09:00:00+09:00", "observed_at_basis": "source_verified",
        })
        provided = bond_search.source_line({
            "name": "입력 자료", "url": None,
            "observed_at": "2026-09-25T09:00:00+09:00", "observed_at_basis": "provided",
        })
        self.assertIn("원천 확인 시각 2026-09-25 09:00:00 +0900", verified)
        self.assertIn(f"[SEIBro]({bond_search.SEIBRO_URL})", verified)
        self.assertIn("원천 확인 여부 미검증", provided)
        self.assertNotIn(bond_search.SEIBRO_URL, provided)

    def test_verified_source_requires_explicit_observation_time(self):
        with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as caught:
            bond_search.main(["search", "--input", str(ROOT / "tests" / "fixtures" / "bonds.json"), "--name", "채권", "--verified-source"])
        self.assertEqual(caught.exception.code, 2)

    def test_call_and_put_terms_follow_the_bondholder_rights(self):
        self.assertEqual(bond_search.option_flag("매도청구권", "call"), True)
        self.assertIsNone(bond_search.option_flag("매도청구권", "put"))
        self.assertIsNone(bond_search.option_flag("조기상환청구권", "call"))
        self.assertEqual(bond_search.option_flag("조기상환청구권", "put"), True)
        self.assertIsNone(bond_search.option_flag("상환청구권", "put"))

    def test_explicit_option_absence_and_conflict_are_not_misclassified(self):
        self.assertIs(bond_search.option_flag("CALL 없음", "call"), False)
        self.assertIs(bond_search.option_flag("CALL 없음 / PUT 있음", "call"), False)
        self.assertIs(bond_search.option_flag("CALL 없음 / PUT 있음", "put"), True)
        self.assertIsNone(bond_search.option_flag("옵션 없음 / 2027 CALL", "call"))

    def test_direct_flags_conflicting_with_source_text_are_unknown(self):
        record = bond_search.normalize(
            {"종목코드": "KR6000000010", "종목명": "충돌채", "callable": False, "옵션": "CALL", "convertible": False, "주식관련": "CB"},
            "2026-09-24T00:00:00+00:00", "fixture",
        )
        self.assertIsNone(record["callable"])
        self.assertIsNone(record["convertible"])

    def test_korean_money_units_are_exact_and_partial_text_is_rejected(self):
        self.assertEqual(bond_search.parse_money("1천만원"), 10_000_000)
        self.assertEqual(bond_search.parse_money("1억 5천만원"), 150_000_000)
        self.assertEqual(bond_search.parse_money("1.2조원"), 1_200_000_000_000)
        self.assertIsNone(bond_search.parse_money("약 1,200억원"))
        self.assertEqual(bond_search.money_krw(120_004_000_000), "1,200억 400만")

    def test_non_krw_amounts_are_not_rendered_as_won(self):
        record = bond_search.normalize(
            {"종목코드": "KR6000000010", "종목명": "달러채", "발행통화": "USD", "발행금액": "1000000", "발행잔액": "500000"},
            "2026-09-24T00:00:00+00:00", "fixture",
        )
        self.assertIsNone(record["issue_amount_krw"])
        self.assertIsNone(record["outstanding_amount_krw"])
        self.assertEqual(record["raw"]["발행금액"], "1000000")

    def test_missing_currency_does_not_assume_krw_amount(self):
        record = bond_search.normalize(
            {"종목코드": "KR6000000010", "종목명": "통화 누락", "발행금액": "1000000"},
            "2026-09-24T00:00:00+00:00", "fixture",
        )
        self.assertIsNone(record["issue_amount_krw"])

    def test_rate_parser_accepts_basis_points_and_rejects_partial_text(self):
        self.assertEqual(bond_search.parse_rate("325 bps"), 3.25)
        self.assertIsNone(bond_search.parse_rate("약 3.25%"))
        self.assertIsNone(bond_search.parse_rate(float("inf")))

    def test_file_modification_time_is_not_presented_as_source_check_time(self):
        text = bond_search.source_time_text({
            "observed_at": "2026-09-24T00:00:00+00:00",
            "observed_at_basis": "file_mtime_fallback",
        })
        self.assertIn("입력 파일 수정 시각", text)
        self.assertIn("원천 확인시각 미제공", text)

    def test_json_rejects_duplicate_keys_and_non_finite_numbers(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "bonds.json"
            for body in (
                '[{"종목명":"첫값","종목명":"덮어쓴 값"}]',
                '[{"종목명":NaN}]',
                '[{"발행금액":1e400}]',
            ):
                path.write_text(body, encoding="utf-8")
                with self.subTest(body=body), self.assertRaises(bond_search.InputError) as caught:
                    bond_search.load_rows(str(path))
                self.assertEqual(caught.exception.code, "parse_failure")

    def test_csv_rejects_duplicate_headers_and_ragged_rows(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "bonds.csv"
            for body in (
                "종목명,종목 명\n채권,다른값\n",
                "종목명,발행사\n채권\n",
                "종목명,발행사\n채권,발행사,추가값\n",
            ):
                path.write_text(body, encoding="utf-8")
                with self.subTest(body=body), self.assertRaises(bond_search.InputError) as caught:
                    bond_search.load_rows(str(path))
                self.assertEqual(caught.exception.code, "parse_failure")

    def test_normalize_rejects_duplicate_normalized_json_fields(self):
        with self.assertRaises(bond_search.InputError) as caught:
            bond_search.normalize(
                {"종목명": "한빛채", "종목 명": "다른채"},
                "2026-09-24T00:00:00+00:00", "fixture",
            )
        self.assertEqual(caught.exception.code, "parse_failure")

    def test_normalize_rejects_conflicting_aliases_for_same_field(self):
        with self.assertRaises(bond_search.InputError) as caught:
            bond_search.normalize(
                {"종목코드": "KR6000000010", "ISIN": "KR6000000002", "종목명": "충돌채"},
                "2026-09-24T00:00:00+00:00", "fixture",
            )
        self.assertEqual(caught.exception.code, "parse_failure")

    def test_equivalent_alias_values_are_normalized_before_conflict_check(self):
        record = bond_search.normalize(
            {"종목코드": "KR6000000010", "ISIN": "KR6000000010", "종목명": "동일채", "표면금리": "3.25%", "쿠폰금리": "325bp", "발행통화": "KRW"},
            "2026-09-24T00:00:00+00:00", "fixture",
        )
        self.assertEqual(record["isin"], "KR6000000010")
        self.assertEqual(record["coupon_rate_pct"], 3.25)

    def test_conflicting_records_for_same_isin_are_explained_not_hidden(self):
        payload = {
            "schema_version": "1.0", "result": "ambiguous",
            "items": [
                {"isin": "KR6000000010", "name": "채권 1", "issuer": "발행사", "maturity_date": "2029-01-01", "coupon_rate_pct": 3.0, "outstanding_amount_krw": 10_000_000_000},
                {"isin": "KR6000000010", "name": "채권 1", "issuer": "발행사", "maturity_date": "2030-01-01", "coupon_rate_pct": 4.0, "outstanding_amount_krw": 9_000_000_000},
            ],
        }
        rendered = bond_search.render_chat(payload)
        self.assertIn("원천 자료의 발행조건 충돌", rendered)
        self.assertIn("임의로 선택하지 않았습니다", rendered)
        self.assertIn("2029-01-01", rendered)
        self.assertIn("2030-01-01", rendered)

    def test_search_omits_conflicted_isin_but_keeps_other_results(self):
        rows = [
            {"종목코드": "KR6000000010", "종목명": "테스트채권 1", "발행사": "발행사", "발행통화": "KRW", "만기일": "2029-01-01", "표면금리": "3%"},
            {"종목코드": "KR6000000010", "종목명": "테스트채권 1", "발행사": "발행사", "발행통화": "KRW", "만기일": "2030-01-01", "표면금리": "4%"},
            {"종목코드": "KR6000000002", "종목명": "테스트채권 2", "발행사": "다른발행사", "발행통화": "KRW", "만기일": "2031-01-01", "표면금리": "2%"},
        ]
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "records.json"
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            stdout = io.StringIO()
            with redirect_stdout(stdout), self.assertRaises(SystemExit) as caught:
                bond_search.main(["search", "--input", str(path), "--issuer", "발행사"])
        self.assertEqual(caught.exception.code, 0)
        rendered = stdout.getvalue()
        self.assertIn("테스트채권 2", rendered)
        self.assertIn("충돌한 ISIN", rendered)
        self.assertNotIn("| `KR6000000010` |", rendered)

    def test_source_metadata_does_not_expose_absolute_input_path(self):
        path = str(ROOT / "tests" / "fixtures" / "bonds.json")
        record = bond_search.normalize(
            {"종목코드": "KR6000000010", "종목명": "채권", "발행통화": "KRW"},
            "2026-09-24T00:00:00+00:00", path,
        )
        source = record["source"]
        self.assertEqual(source["input_file"], "bonds.json")
        self.assertNotIn(str(ROOT), json.dumps(source, ensure_ascii=False))

    def test_missing_input_error_does_not_echo_local_path(self):
        with tempfile.TemporaryDirectory() as temp:
            missing = Path(temp) / "private-folder" / "secret-export.csv"
            with self.assertRaises(bond_search.InputError) as caught:
                bond_search.load_rows(str(missing))
        self.assertNotIn("private-folder", str(caught.exception))
        self.assertNotIn("secret-export.csv", str(caught.exception))

    def test_search_date_arguments_are_strict_and_ordered(self):
        with self.assertRaises(Exception):
            bond_search.parse_iso_arg("20260924")
        with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            bond_search.main([
                "search", "--name", "채권", "--maturity-from", "2030-01-01",
                "--maturity-to", "2029-01-01", "--input", str(ROOT / "tests" / "fixtures" / "bonds.json"),
            ])

    def test_chat_shows_issuer_and_complete_option_schedule(self):
        rendered = bond_search.render_chat({
            "result": "ok",
            "item": {
                "name": "CB 101회", "isin": "KR6000000002", "issuer": "발행사",
                "bond_type": "corporate", "option_schedule": [{"raw": "2027-02-01 CALL"}],
                "callable": True, "putable": None, "convertible": True,
                "exchangeable": None, "warrant_attached": None,
                "source": {"url": bond_search.SEIBRO_URL, "observed_at": "2026-09-24T09:00:00+09:00"},
            },
        })
        self.assertIn("발행사", rendered)
        self.assertIn("2027-02-01 CALL", rendered)
        self.assertNotIn("옵션 일정: 1건", rendered)


if __name__ == "__main__":
    unittest.main()
