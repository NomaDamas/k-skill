import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "seoul-bike" / "scripts" / "seoul_bike.py"
spec = importlib.util.spec_from_file_location("seoul_bike", MODULE_PATH)
seoul_bike = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(seoul_bike)


NEARBY_PAYLOAD = {
    "query": {"latitude": 37.5717, "longitude": 126.9763, "radius_m": 500, "limit": 2},
    "count": 2,
    "items": [
        {
            "station_id": "ST-101",
            "station_name": "101. 광화문역 1번출구 앞",
            "available_bikes": 4,
            "empty_docks": 11,
            "rack_total_count": 15,
            "shared_percent": 27,
            "distance_m": 0,
            "latitude": 37.5717,
            "longitude": 126.9763,
        },
        {
            "station_id": "ST-102",
            "station_name": "102. 세종대로 앞",
            "available_bikes": 0,
            "empty_docks": 12,
            "rack_total_count": 12,
            "shared_percent": 0,
            "distance_m": 80,
            "latitude": 37.5720,
            "longitude": 126.9770,
        },
    ],
    "proxy": {"requested_at": "2026-05-21T06:10:00.000Z"},
}

REALTIME_PAYLOAD = {
    "rentBikeStatus": {
        "row": [
            {
                "stationId": "ST-101",
                "stationName": "101. 광화문역 1번출구 앞",
                "rackTotCnt": "15",
                "parkingBikeTotCnt": "4",
                "shared": "27",
                "stationLatitude": "37.5717",
                "stationLongitude": "126.9763",
            }
        ]
    },
    "proxy": {"requested_at": "2026-05-21T06:10:00.000Z"},
}


class SeoulBikePayloadTest(unittest.TestCase):
    def test_summarize_nearby_includes_bikes_docks_distance_and_timestamp(self):
        lines = seoul_bike.format_nearby(NEARBY_PAYLOAD)

        joined = "\n".join(lines)
        self.assertIn("101. 광화문역 1번출구 앞", joined)
        self.assertIn("대여 가능 4대", joined)
        self.assertIn("빈 거치대 11개", joined)
        self.assertIn("0m", joined)
        self.assertIn("조회 시각: 2026-05-21T06:10:00.000Z", joined)

    def test_search_realtime_filters_station_names_and_reports_empty_docks(self):
        matches = seoul_bike.filter_realtime_rows(REALTIME_PAYLOAD, "광화문", limit=5)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["station_id"], "ST-101")
        self.assertEqual(matches[0]["available_bikes"], 4)
        self.assertEqual(matches[0]["empty_docks"], 11)


    def test_search_fetches_all_realtime_pages_before_filtering(self):
        first = {
            "rentBikeStatus": {
                "list_total_count": 2,
                "row": [{"stationId": "ST-001", "stationName": "001. 첫 페이지", "rackTotCnt": "1", "parkingBikeTotCnt": "1"}],
            }
        }
        second = {
            "rentBikeStatus": {
                "list_total_count": 2,
                "row": [{"stationId": "ST-999", "stationName": "999. 마지막 광화문", "rackTotCnt": "3", "parkingBikeTotCnt": "2"}],
            }
        }
        with mock.patch.object(seoul_bike, "fetch_json", side_effect=[first, second]) as fetch_json:
            rows = seoul_bike.fetch_realtime_pages(1, 1)

        self.assertEqual([row["stationId"] for row in rows], ["ST-001", "ST-999"])
        self.assertEqual(fetch_json.call_count, 2)

    def test_cli_search_prints_realtime_lookup_timestamp(self):
        payload = {
            "rentBikeStatus": {
                "list_total_count": 1,
                "row": [
                    {
                        "stationId": "ST-101",
                        "stationName": "101. 광화문역 1번출구 앞",
                        "rackTotCnt": "15",
                        "parkingBikeTotCnt": "4",
                    }
                ],
            },
            "proxy": {"requested_at": "2026-05-21T06:10:00.000Z"},
        }
        with mock.patch.object(seoul_bike, "fetch_json", return_value=payload):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = seoul_bike.main(["search", "광화문"])

        self.assertEqual(exit_code, 0)
        self.assertIn("조회 시각: 2026-05-21T06:10:00.000Z", stdout.getvalue())

    def test_cli_nearby_prints_json_when_requested(self):
        with mock.patch.object(seoul_bike, "fetch_json", return_value=NEARBY_PAYLOAD):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exit_code = seoul_bike.main([
                    "nearby",
                    "--lat",
                    "37.5717",
                    "--lon",
                    "126.9763",
                    "--json",
                ])

        self.assertEqual(exit_code, 0)
        body = json.loads(stdout.getvalue())
        self.assertEqual(body["items"][0]["station_id"], "ST-101")

    def test_proxy_base_url_defaults_to_hosted_proxy(self):
        with mock.patch.dict(seoul_bike.os.environ, {}, clear=True):
            self.assertEqual(seoul_bike.get_proxy_base_url(), "https://k-skill-proxy.nomadamas.org")


if __name__ == "__main__":
    unittest.main()
