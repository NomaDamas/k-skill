import io
import json
import pathlib
import unittest
from contextlib import redirect_stdout

import fine_dust


FIXTURES = pathlib.Path(__file__).with_name("fixtures")


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class FineDustTests(unittest.TestCase):
    def test_pick_station_prefers_nearest_station_for_coordinates(self):
        stations = load_fixture("fine-dust-stations.json")

        station = fine_dust.pick_station(
            fine_dust.extract_items(stations),
            lat=37.5665,
            lon=126.9780,
        )

        self.assertEqual(station["stationName"], "중구")

    def test_pick_station_prefers_specific_region_token_over_generic_city_token(self):
        stations = load_fixture("fine-dust-stations.json")

        station = fine_dust.pick_station(
            fine_dust.extract_items(stations),
            region_hint="서울 강남구",
        )

        self.assertEqual(station["stationName"], "강남구")

    def test_pick_station_falls_back_to_region_hint_without_coordinates(self):
        stations = load_fixture("fine-dust-stations.json")

        station = fine_dust.pick_station(
            fine_dust.extract_items(stations),
            region_hint="강남",
        )

        self.assertEqual(station["stationName"], "강남구")

    def test_build_report_combines_station_and_measurement_summary(self):
        stations = load_fixture("fine-dust-stations.json")
        measurements = load_fixture("fine-dust-measurements.json")

        report = fine_dust.build_report(
            station_items=fine_dust.extract_items(stations),
            measurement_items=fine_dust.extract_items(measurements),
            lat=37.5665,
            lon=126.9780,
        )

        self.assertEqual(report["station_name"], "중구")
        self.assertEqual(report["pm10"], {"value": "42", "grade": "보통"})
        self.assertEqual(report["pm25"], {"value": "19", "grade": "보통"})
        self.assertEqual(report["measured_at"], "2026-03-27 21:00")

    def test_cli_report_supports_fixture_inputs(self):
        station_path = FIXTURES / "fine-dust-stations.json"
        measurement_path = FIXTURES / "fine-dust-measurements.json"
        stdout = io.StringIO()

        with redirect_stdout(stdout):
            fine_dust.main([
                "report",
                "--station-file",
                str(station_path),
                "--measurement-file",
                str(measurement_path),
                "--lat",
                "37.5665",
                "--lon",
                "126.9780",
            ])

        rendered = stdout.getvalue()
        self.assertIn("측정소: 중구", rendered)
        self.assertIn("PM10: 42 (보통)", rendered)
        self.assertIn("PM2.5: 19 (보통)", rendered)


if __name__ == "__main__":
    unittest.main()
