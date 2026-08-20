import unittest

import g2b_sanctioned_supplier as subject


class CoveragePassthroughTest(unittest.TestCase):
    def test_zero_result_keeps_proxy_coverage(self):
        payload = {
            "total_count": 0,
            "active_sanctions": [],
            "coverage": {"scope": "currently-effective-g2b-sanctions"},
        }

        response = subject.query_sanctions("123-45-67890", read_json=lambda _request: payload)

        self.assertIs(response, payload)
        self.assertEqual(response["coverage"]["scope"], "currently-effective-g2b-sanctions")

    def test_matched_result_keeps_proxy_coverage(self):
        payload = {
            "total_count": 1,
            "active_sanctions": [{"bizno": "1234567890"}],
            "coverage": {"match_basis": "exact-business-number"},
        }

        response = subject.query_sanctions("1234567890", read_json=lambda _request: payload)

        self.assertIs(response, payload)
        self.assertEqual(response["coverage"]["match_basis"], "exact-business-number")


if __name__ == "__main__":
    unittest.main()
