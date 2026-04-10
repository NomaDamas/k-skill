import json
import unittest
from unittest import mock

from scripts.zipcode_search import (
    SEARCH_URL,
    AddressSearchResult,
    fetch_search_page,
    lookup_korean_address,
    parse_search_results,
)

SAMPLE_HTML = """
<table>
  <tbody>
    <tr class="title2">
      <th scope="row">06133</th>
      <td class="t_a_l l_h_18">
        서울특별시 강남구 테헤란로 123 (역삼동, 여삼빌딩)<br />
        서울특별시 강남구 역삼동 648-23 (여삼빌딩)
      </td>
      <td><a class="btn_s gray" href="#" onclick="javascript:viewDetail('06133','서울특별시 강남구 테헤란로 123 (역삼동, 여삼빌딩)','123, Teheran-ro, Gangnam-gu, Seoul, 06133, Rep. of KOREA','서울특별시 강남구 역삼동 648-23 (여삼빌딩)', '0');" title="보기">더보기</a></td>
    </tr>
    <tr class="view">
      <td class="p_l_86px" colspan="3">
        123, Teheran-ro, Gangnam-gu, Seoul, 06133, Rep. of KOREA
      </td>
    </tr>
  </tbody>
</table>
"""


class ZipcodeSearchParsingTest(unittest.TestCase):
    def test_parse_search_results_extracts_official_korean_and_english_addresses(self):
        items = parse_search_results(SAMPLE_HTML)

        self.assertEqual(
            items,
            [
                AddressSearchResult(
                    zip_code="06133",
                    road_address="서울특별시 강남구 테헤란로 123 (역삼동, 여삼빌딩)",
                    english_address="123, Teheran-ro, Gangnam-gu, Seoul, 06133, Rep. of KOREA",
                    jibun_address="서울특별시 강남구 역삼동 648-23 (여삼빌딩)",
                )
            ],
        )

    def test_lookup_korean_address_rejects_blank_query(self):
        with self.assertRaisesRegex(ValueError, "query"):
            lookup_korean_address("   ")


class ZipcodeSearchTransportTest(unittest.TestCase):
    def test_fetch_search_page_uses_official_https_endpoint_and_curl_safety_flags(self):
        runner = mock.Mock(return_value=mock.Mock(stdout="<html></html>"))

        page = fetch_search_page("서울특별시 강남구 테헤란로 123", runner=runner)

        self.assertEqual(page, "<html></html>")
        command = runner.call_args.args[0]
        self.assertEqual(command[0], "curl")
        self.assertIn("--http1.1", command)
        self.assertEqual(command[command.index("--tls-max") + 1], "1.2")
        self.assertEqual(command[command.index("--retry") + 1], "3")
        self.assertIn("--retry-all-errors", command)
        self.assertEqual(command[command.index("--retry-delay") + 1], "1")
        self.assertEqual(command[command.index("--max-time") + 1], "20")
        self.assertEqual(command[-1], SEARCH_URL)


class ZipcodeSearchCliShapeTest(unittest.TestCase):
    def test_lookup_response_is_json_serializable(self):
        response = lookup_korean_address(
            "서울특별시 강남구 테헤란로 123",
            fetcher=lambda _query: SAMPLE_HTML,
        )

        payload = json.loads(response.to_json())
        self.assertEqual(payload["query"], "서울특별시 강남구 테헤란로 123")
        self.assertEqual(payload["results"][0]["zip_code"], "06133")
        self.assertIn("Teheran-ro", payload["results"][0]["english_address"])


if __name__ == "__main__":
    unittest.main()
