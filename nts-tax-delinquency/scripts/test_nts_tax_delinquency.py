import unittest
from unittest.mock import patch

import nts_tax_delinquency as subject


class CoverageTest(unittest.TestCase):
    def test_zero_result_explains_disclosure_scope(self):
        with patch.object(subject, "_search", side_effect=[[], []]):
            response = subject.lookup("테스트상사")

        self.assertEqual(response["status"], "ok")
        self.assertEqual(response["result"]["corporate_list"]["match_count"], 0)
        self.assertEqual(response["result"]["individual_list"]["match_count"], 0)
        self.assertEqual(response["coverage"]["match_basis"], "corporate-name-and-trade-name-string-match")
        self.assertTrue(response["coverage"]["zero_result_meaning"])
        self.assertTrue(response["coverage"]["checked_at"])

    def test_matched_result_keeps_same_coverage_contract(self):
        corporate = [{"법인명": "테스트상사", "총체납액": "1억원"}]
        individual = [{"상호": "테스트상사", "총체납액": "2억원"}]
        with patch.object(subject, "_search", side_effect=[corporate, individual]):
            response = subject.lookup("테스트상사")

        self.assertEqual(response["result"]["corporate_list"]["matches"], corporate)
        self.assertEqual(response["result"]["individual_list"]["matches"], individual)
        self.assertEqual(response["coverage"]["scope"], "nts-high-amount-habitual-delinquent-disclosure")
        self.assertIn("사업자등록번호 동일성 확인", response["coverage"]["exclusions"])


if __name__ == "__main__":
    unittest.main()
