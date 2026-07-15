import io
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import korean_heritage_search


LIST_XML = """<?xml version="1.0" encoding="utf-8"?>
<result>
  <totalCnt>11</totalCnt>
  <pageUnit>2</pageUnit>
  <pageIndex>1</pageIndex>
  <item>
    <ccmaName><![CDATA[국보]]></ccmaName>
    <ccbaMnm1><![CDATA[서울 숭례문]]></ccbaMnm1>
    <ccbaMnm2><![CDATA[서울 崇禮門]]></ccbaMnm2>
    <ccbaCtcdNm><![CDATA[서울]]></ccbaCtcdNm>
    <ccsiName><![CDATA[중구]]></ccsiName>
    <ccbaAdmin><![CDATA[국가유산청 덕수궁관리소]]></ccbaAdmin>
    <ccbaKdcd>11</ccbaKdcd>
    <ccbaCtcd>11</ccbaCtcd>
    <ccbaAsno>0000010000000</ccbaAsno>
    <ccbaCncl>N</ccbaCncl>
    <longitude>126.975312652739</longitude>
    <latitude>37.559975221378</latitude>
    <regDt>2025-06-26 18:46:08</regDt>
  </item>
</result>"""

DETAIL_XML = """<?xml version="1.0" encoding="utf-8"?>
<result>
  <ccbaKdcd>11</ccbaKdcd>
  <ccbaAsno>0000010000000</ccbaAsno>
  <ccbaCtcd>11</ccbaCtcd>
  <longitude>126.975312652739</longitude>
  <latitude>37.559975221378</latitude>
  <item>
    <ccmaName><![CDATA[국보]]></ccmaName>
    <ccbaMnm1><![CDATA[서울 숭례문]]></ccbaMnm1>
    <gcodeName><![CDATA[유적건조물]]></gcodeName>
    <bcodeName><![CDATA[정치국방]]></bcodeName>
    <mcodeName><![CDATA[성]]></mcodeName>
    <scodeName><![CDATA[성곽시설]]></scodeName>
    <ccbaCtcdNm><![CDATA[서울특별시 ]]></ccbaCtcdNm>
    <ccsiName><![CDATA[중구]]></ccsiName>
    <ccbaLcad><![CDATA[서울 중구 세종대로 40]]></ccbaLcad>
    <ccbaAdmin><![CDATA[국가유산청 덕수궁관리소]]></ccbaAdmin>
    <imageUrl>http://www.khs.go.kr/image.jpg</imageUrl>
    <content><![CDATA[조선시대 한양도성의 정문이다.]]></content>
  </item>
</result>"""

EVENT_XML = """<?xml version="1.0" encoding="utf-8"?>
<result>
  <item>
    <subTitle><![CDATA[궁궐 행사]]></subTitle>
    <subContent><![CDATA[<b>서울</b>에서 열리는 행사]]></subContent>
    <sDate>20260701</sDate>
    <eDate>20260731</eDate>
    <subDate><![CDATA[7월 매주 토요일]]></subDate>
    <sido>서울특별시</sido>
    <gugun>종로구</gugun>
    <subDesc>경복궁</subDesc>
    <subPath>https://example.com/event</subPath>
  </item>
  <item>
    <subTitle>부산 행사</subTitle>
    <sido>부산광역시</sido>
    <gugun>중구</gugun>
  </item>
</result>"""


class HeritageParsingTests(unittest.TestCase):
    def test_parse_search_result_normalizes_codes_and_coordinates(self):
        report = korean_heritage_search.parse_search_result(
            ET.fromstring(LIST_XML),
            url=korean_heritage_search.LIST_URL,
            fetched_at="2026-07-15T00:00:00+00:00",
        )

        self.assertEqual(report["total_results"], 11)
        self.assertEqual(report["items"][0]["name"], "서울 숭례문")
        self.assertEqual(report["items"][0]["heritage_code"]["number"], "0000010000000")
        self.assertAlmostEqual(report["items"][0]["latitude"], 37.559975221378)

    def test_parse_detail_result_keeps_description_and_classification(self):
        detail = korean_heritage_search.parse_detail_result(
            ET.fromstring(DETAIL_XML),
            url=korean_heritage_search.DETAIL_URL,
            fetched_at="2026-07-15T00:00:00+00:00",
        )

        self.assertEqual(detail["name"], "서울 숭례문")
        self.assertEqual(detail["classification"], ["유적건조물", "정치국방", "성", "성곽시설"])
        self.assertEqual(detail["address"], "서울 중구 세종대로 40")
        self.assertEqual(detail["description"], "조선시대 한양도성의 정문이다.")

    def test_parse_events_strips_html_and_filters_region(self):
        events = korean_heritage_search.parse_event_result(
            ET.fromstring(EVENT_XML),
            year=2026,
            month=7,
            region="종로",
            limit=10,
            url=korean_heritage_search.EVENT_URL,
            fetched_at="2026-07-15T00:00:00+00:00",
        )

        self.assertEqual(events["returned_count"], 1)
        self.assertEqual(events["items"][0]["description"], "서울에서 열리는 행사")
        self.assertEqual(events["items"][0]["url"], "https://example.com/event")


class HeritageRequestTests(unittest.TestCase):
    def test_search_builds_official_query_and_parses_response(self):
        response = io.BytesIO(LIST_XML.encode("utf-8"))
        response.__enter__ = lambda: response
        response.__exit__ = lambda *args: None

        with patch("korean_heritage_search.urllib.request.urlopen", return_value=response) as urlopen:
            result = korean_heritage_search.search_heritage("경복궁", "서울", page=2, limit=5)

        request = urlopen.call_args.args[0]
        self.assertIn("ccbaMnm1=%EA%B2%BD%EB%B3%B5%EA%B6%81", request.full_url)
        self.assertIn("ccbaCtcd=11", request.full_url)
        self.assertIn("pageIndex=2", request.full_url)
        self.assertEqual(result["total_results"], 11)

    def test_normalize_region_rejects_unknown_value(self):
        with self.assertRaises(ValueError):
            korean_heritage_search.normalize_region("중앙")

    def test_parser_supports_search_detail_and_events_commands(self):
        parser = korean_heritage_search.build_parser()

        search = parser.parse_args(["search", "--query", "경복궁", "--region", "서울"])
        detail = parser.parse_args(["detail", "--ccba-kdcd", "11", "--ccba-asno", "1", "--ccba-ctcd", "11"])
        events = parser.parse_args(["events", "--year", "2026", "--month", "7"])

        self.assertEqual(search.command, "search")
        self.assertEqual(detail.command, "detail")
        self.assertEqual(events.command, "events")


if __name__ == "__main__":
    unittest.main()
