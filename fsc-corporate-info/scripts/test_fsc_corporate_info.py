import unittest

import fsc_corporate_info as subject


class CoveragePassthroughTest(unittest.TestCase):
    def test_zero_result_keeps_proxy_coverage(self):
        payload = {
            "candidate_count": 0,
            "candidates": [],
            "coverage": {"scope": "fsc-corporate-outline-dataset"},
        }

        response = subject.query_corp_outline("없는법인", read_json=lambda _request: payload)

        self.assertIs(response, payload)
        self.assertEqual(response["coverage"]["scope"], "fsc-corporate-outline-dataset")

    def test_matched_result_keeps_proxy_coverage(self):
        payload = {
            "candidate_count": 1,
            "candidates": [{"corpNm": "테스트"}],
            "coverage": {
                "match_basis": "corporate-name-candidates-with-optional-business-number-cross-check"
            },
        }

        response = subject.query_corp_outline(
            "테스트",
            "123-45-67890",
            read_json=lambda _request: payload,
        )

        self.assertIs(response, payload)
        self.assertEqual(
            response["coverage"]["match_basis"],
            "corporate-name-candidates-with-optional-business-number-cross-check",
        )


if __name__ == "__main__":
    unittest.main()
