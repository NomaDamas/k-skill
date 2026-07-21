import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
import urllib.parse
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "highway-traffic-status" / "scripts" / "highway_traffic.py"
SPEC = importlib.util.spec_from_file_location("highway_traffic", MODULE_PATH)
highway_traffic = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(highway_traffic)


TRAFFIC_PAYLOAD = {
    "count": 3,
    "list": [
        {
            "routeName": "경부선",
            "routeNo": "0010",
            "conzoneName": "구서IC-영락IC",
            "conzoneId": "0010CZE010",
            "updownTypeCode": "E",
            "speed": "89",
            "trafficAmout": "20",
            "grade": "1",
            "stdDate": "20260721",
            "stdHour": "1530",
            "timeAvg": "73",
        },
        {
            "routeName": "경부선",
            "routeNo": "0010",
            "conzoneName": "서울TG-양재IC",
            "conzoneId": "0010CZE900",
            "updownTypeCode": "S",
            "speed": "35",
            "trafficAmout": "88",
            "grade": "3",
            "stdDate": "20260721",
            "stdHour": "1530",
            "timeAvg": "140",
        },
        {
            "routeName": "서해안선",
            "routeNo": "0150",
            "conzoneName": "매송IC-비봉IC",
            "conzoneId": "0150CZE010",
            "updownTypeCode": "S",
            "speed": "97",
            "trafficAmout": "12",
            "grade": "1",
            "stdDate": "20260721",
            "stdHour": "1530",
            "timeAvg": "60",
        },
    ],
}

ERROR_PAYLOAD = {"count": 0, "list": None, "message": "인증키가 유효하지 않습니다.", "code": "ERROR"}

CCTV_XML = """<?xml version='1.0' encoding='UTF-8'?>
<response>
    <coordtype>1</coordtype>
    <datacount>2</datacount>
    <data>
        <cctvtype>1</cctvtype>
        <cctvurl>http://cctvsec.example/stream1</cctvurl>
        <coordy>37.42889</coordy>
        <cctvformat>HLS</cctvformat>
        <cctvname>[수도권제1순환선] 성남</cctvname>
        <coordx>127.12361</coordx>
    </data>
    <data>
        <cctvtype>1</cctvtype>
        <cctvurl>http://cctvsec.example/stream2</cctvurl>
        <coordy>37.5</coordy>
        <cctvformat>HLS</cctvformat>
        <cctvname>[경부선] 서울TG</cctvname>
        <coordx>127.0</coordx>
    </data>
</response>
"""

CCTV_KEY_ERROR = json.dumps(
    {"header": {"resultCode": 4005, "resultMsg": "존재하지 않는 인증키입니다."}, "body": ""}
)


class BuildUrlTests(unittest.TestCase):
    def test_traffic_url_targets_exdata_realtime_endpoint_with_demo_key(self):
        args = highway_traffic.parse_args(["traffic"])
        url = highway_traffic.build_traffic_url(args, api_key=None)
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(parsed.hostname, "data.ex.co.kr")
        self.assertTrue(parsed.path.endswith("/trafficAmountByRealtime"))
        self.assertEqual(params["key"], [highway_traffic.EXDATA_DEMO_KEY])
        self.assertEqual(params["type"], ["json"])

    def test_traffic_url_uses_user_key_when_present(self):
        args = highway_traffic.parse_args(["traffic"])
        url = highway_traffic.build_traffic_url(args, api_key="mykey123")
        params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(params["key"], ["mykey123"])

    def test_cctv_url_requires_bbox_and_targets_its(self):
        args = highway_traffic.parse_args(
            ["cctv", "--min-x", "126.8", "--max-x", "127.2", "--min-y", "37.4", "--max-y", "37.7"]
        )
        url = highway_traffic.build_cctv_url(args, api_key=None)
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(parsed.hostname, "openapi.its.go.kr")
        self.assertEqual(params["apiKey"], [highway_traffic.ITS_DEMO_KEY])
        self.assertEqual(params["type"], ["ex"])
        self.assertEqual(params["cctvType"], ["1"])

    def test_cctv_bbox_bounds_are_validated(self):
        args = highway_traffic.parse_args(
            ["cctv", "--min-x", "127.5", "--max-x", "126.8", "--min-y", "37.4", "--max-y", "37.7"]
        )
        with self.assertRaisesRegex(highway_traffic.HelperError, "min-x"):
            highway_traffic.build_cctv_url(args, api_key=None)

    def test_cctv_bbox_must_stay_in_korea_range(self):
        args = highway_traffic.parse_args(
            ["cctv", "--min-x", "1.0", "--max-x", "2.0", "--min-y", "37.4", "--max-y", "37.7"]
        )
        with self.assertRaisesRegex(highway_traffic.HelperError, "범위"):
            highway_traffic.build_cctv_url(args, api_key=None)


class ParseTests(unittest.TestCase):
    def test_normalize_traffic_converts_numbers_and_grade_label(self):
        rows = highway_traffic.normalize_traffic(TRAFFIC_PAYLOAD)
        self.assertEqual(len(rows), 3)
        first = rows[0]
        self.assertEqual(first["route_name"], "경부선")
        self.assertEqual(first["speed_kmh"], 89)
        self.assertEqual(first["traffic_volume"], 20)
        self.assertEqual(first["congestion"], "원활")
        self.assertEqual(rows[1]["congestion"], "정체")
        self.assertEqual(first["direction"], "하행")
        self.assertEqual(rows[1]["direction"], "상행")

    def test_normalize_traffic_raises_typed_error_on_upstream_error_code(self):
        with self.assertRaises(highway_traffic.HelperError) as ctx:
            highway_traffic.normalize_traffic(ERROR_PAYLOAD)
        self.assertIn("인증키", str(ctx.exception))

    def test_filter_traffic_by_route_matches_name_or_number(self):
        rows = highway_traffic.normalize_traffic(TRAFFIC_PAYLOAD)
        by_name = highway_traffic.filter_traffic(rows, route="경부")
        self.assertEqual(len(by_name), 2)
        by_no = highway_traffic.filter_traffic(rows, route="0150")
        self.assertEqual(len(by_no), 1)
        self.assertEqual(by_no[0]["route_name"], "서해안선")

    def test_filter_traffic_by_keyword_matches_conzone(self):
        rows = highway_traffic.normalize_traffic(TRAFFIC_PAYLOAD)
        hits = highway_traffic.filter_traffic(rows, keyword="서울TG")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["conzone_name"], "서울TG-양재IC")

    def test_normalize_cctv_parses_xml_metadata(self):
        cams = highway_traffic.normalize_cctv(CCTV_XML)
        self.assertEqual(len(cams), 2)
        self.assertEqual(cams[0]["name"], "[수도권제1순환선] 성남")
        self.assertEqual(cams[0]["format"], "HLS")
        self.assertAlmostEqual(cams[0]["lat"], 37.42889)
        self.assertAlmostEqual(cams[0]["lon"], 127.12361)
        self.assertTrue(cams[0]["url"].startswith("http://cctvsec.example/"))

    def test_normalize_cctv_raises_on_key_error_json(self):
        with self.assertRaises(highway_traffic.HelperError) as ctx:
            highway_traffic.normalize_cctv(CCTV_KEY_ERROR)
        self.assertIn("인증키", str(ctx.exception))

    def test_normalize_cctv_raises_on_unexpected_body(self):
        with self.assertRaises(highway_traffic.HelperError):
            highway_traffic.normalize_cctv("<html>blocked</html>")


class RunTests(unittest.TestCase):
    def test_run_traffic_outputs_json_with_rows_and_source(self):
        stdout = io.StringIO()
        with mock.patch.object(
            highway_traffic, "http_get_json", return_value=TRAFFIC_PAYLOAD
        ), contextlib.redirect_stdout(stdout):
            code = highway_traffic.run(["traffic", "--route", "경부", "--limit", "1"])
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(len(payload["rows"]), 1)
        self.assertEqual(payload["total_matched"], 2)
        self.assertIn("data.ex.co.kr", payload["source"])

    def test_run_traffic_empty_result_is_explicit(self):
        stdout = io.StringIO()
        with mock.patch.object(
            highway_traffic, "http_get_json", return_value=TRAFFIC_PAYLOAD
        ), contextlib.redirect_stdout(stdout):
            code = highway_traffic.run(["traffic", "--route", "없는노선"])
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["rows"], [])
        self.assertIn("empty", payload["result"])

    def test_run_cctv_outputs_camera_metadata(self):
        stdout = io.StringIO()
        with mock.patch.object(
            highway_traffic, "http_get_text", return_value=CCTV_XML
        ), contextlib.redirect_stdout(stdout):
            code = highway_traffic.run(
                ["cctv", "--min-x", "126.8", "--max-x", "127.3", "--min-y", "37.3", "--max-y", "37.7"]
            )
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(len(payload["cameras"]), 2)
        self.assertIn("its.go.kr", payload["source"])

    def test_run_reports_helper_error_to_stderr(self):
        stderr = io.StringIO()
        with mock.patch.object(
            highway_traffic, "http_get_json", return_value=ERROR_PAYLOAD
        ), contextlib.redirect_stderr(stderr):
            code = highway_traffic.run(["traffic"])
        self.assertEqual(code, 1)
        self.assertIn("인증키", stderr.getvalue())

    def test_run_text_mode_renders_human_summary(self):
        stdout = io.StringIO()
        with mock.patch.object(
            highway_traffic, "http_get_json", return_value=TRAFFIC_PAYLOAD
        ), contextlib.redirect_stdout(stdout):
            code = highway_traffic.run(["traffic", "--route", "경부", "--text"])
        self.assertEqual(code, 0)
        out = stdout.getvalue()
        self.assertIn("경부선", out)
        self.assertIn("정체", out)


if __name__ == "__main__":
    unittest.main()
