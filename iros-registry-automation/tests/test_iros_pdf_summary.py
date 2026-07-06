"""iros_pdf_summary 파서 유닛테스트 — 모의 등기부 텍스트(실 PDF·실제 개인정보 없음).

핵심 순수 함수(summarize_registry 등)만 검증한다. 로그인·PDF 발급 없이 실행 가능.
"""
import importlib.util
import sys
import unittest
from pathlib import Path

HELPER_PATH = Path(__file__).resolve().parent.parent / "scripts" / "iros_pdf_summary.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("iros_pdf_summary", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load helper from {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["iros_pdf_summary"] = module
    spec.loader.exec_module(module)
    return module


helper = load_helper()

# 모의 등기부 — 실제 개인정보 아님(주민번호는 마스킹 검증용 더미)
REALTY_TEXT = """등기사항전부증명서(말소사항 포함) - 집합건물
【표제부】 (1동의 건물의 표시)  서울특별시 강남구 예시동 1
【갑구】 (소유권에 관한 사항)
1 소유권보존 2015년1월2일
2 소유권이전 2018년3월5일 매매 소유자 홍길동 800101-1234567
3 소유권이전 2021년7월20일 매매 소유자 김철수
【을구】 (소유권 이외의 권리에 관한 사항)
1 근저당권설정 2018년3월5일 제1234호 채권최고액 금 240,000,000원 근저당권자 국민은행
2 근저당권설정 2021년7월20일 제5678호 채권최고액 금 120,000,000원 근저당권자 우리은행
3 1번근저당권설정등기말소 2021년7월20일 제5679호
4 가압류 2022년1월2일 청구금액 금 30,000,000원 채권자 someone
열람일시 : 2026년07월03일 11시20분
"""

CORP_TEXT = """등기사항전부증명서 - 법인
상        호  예시 주식회사
본        점  서울특별시 중구 세종대로 1
임원에 관한 사항
발행할 주식의 총수 100000주
"""

CLEAN_TEXT = "등기사항전부증명서 집합건물 【갑구】 소유권보존 【을구】 근저당권 없음 열람일시 : 2026년01월01일"


class MaskPiiTest(unittest.TestCase):
    def test_masks_resident_registration_number(self):
        self.assertNotIn("800101-1234567", helper.mask_pii(REALTY_TEXT))
        self.assertIn("******-*******", helper.mask_pii("소유자 800101-1234567"))


class DocTypeTest(unittest.TestCase):
    def test_detects_realty(self):
        self.assertEqual(helper.detect_doc_type(REALTY_TEXT), "부동산")

    def test_detects_corp(self):
        self.assertEqual(helper.detect_doc_type(CORP_TEXT), "법인")

    def test_unknown_when_no_markers(self):
        self.assertEqual(helper.detect_doc_type("아무 내용 없음"), "불명")


class OwnerChangeTest(unittest.TestCase):
    def test_counts_ownership_transfers(self):
        self.assertEqual(helper.count_owner_changes(REALTY_TEXT), 2)

    def test_excludes_transfer_claim_provisional(self):
        self.assertEqual(helper.count_owner_changes("소유권이전청구권가등기"), 0)


class MortgageTest(unittest.TestCase):
    def test_extracts_amount_and_date(self):
        ms = helper.extract_mortgages(REALTY_TEXT)
        self.assertEqual(len(ms), 2)
        self.assertEqual(ms[0]["amount_won"], 240000000)
        self.assertEqual(ms[0]["registered_date"], "2018-03-05")

    def test_marks_canceled_by_rank(self):
        ms = helper.extract_mortgages(REALTY_TEXT)
        by_amount = {m["amount_won"]: m for m in ms}
        self.assertTrue(by_amount[240000000]["canceled"])   # 1번 말소
        self.assertFalse(by_amount[120000000]["canceled"])  # 2번 유효


class EncumbranceTest(unittest.TestCase):
    def test_counts_provisional_seizure(self):
        enc = helper.count_encumbrances(REALTY_TEXT)
        self.assertEqual(enc["가압류"], 1)
        self.assertEqual(enc["압류"], 0)  # '가압류'의 압류는 중복 집계하지 않음


class SummaryTest(unittest.TestCase):
    def test_summary_shape_and_no_pii(self):
        s = helper.summarize_registry(REALTY_TEXT)
        self.assertEqual(s["doc_type"], "부동산")
        self.assertEqual(s["issued_at"], "2026-07-03")
        self.assertEqual(s["owner_change_count"], 2)
        self.assertEqual(s["mortgage_count"], 2)
        self.assertEqual(s["active_mortgage_count"], 1)
        self.assertEqual(s["canceled_mortgage_count"], 1)
        # 요약 어디에도 판단형 언어·주민번호가 없어야 한다
        blob = helper.json.dumps(s, ensure_ascii=False)
        self.assertNotIn("800101-1234567", blob)
        for judgey in ("안전", "위험", "추천", "권장합니다", "괜찮"):
            self.assertNotIn(judgey, blob)

    def test_render_markdown_facts_only(self):
        md = helper.render_markdown(helper.summarize_registry(REALTY_TEXT))
        self.assertIn("근저당권", md)
        for judgey in ("안전", "위험", "추천"):
            self.assertNotIn(judgey, md)

    def test_clean_registry_no_mortgages(self):
        s = helper.summarize_registry(CLEAN_TEXT)
        self.assertEqual(s["mortgage_count"], 0)
        self.assertEqual(s["active_mortgage_count"], 0)


if __name__ == "__main__":
    unittest.main()
