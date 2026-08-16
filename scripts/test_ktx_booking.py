import importlib.util
import io
import json
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from datetime import time
from pathlib import Path
from unittest import mock

from openpyxl import Workbook


SCRIPT_PATH = Path(__file__).with_name("ktx_booking.py")
CANONICAL_PATH = SCRIPT_PATH.parent.parent / "ktx-booking" / "scripts" / "ktx_booking.py"
SPEC = importlib.util.spec_from_file_location("ktx_booking", SCRIPT_PATH)
assert SPEC and SPEC.loader
ktx_booking = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ktx_booking
SPEC.loader.exec_module(ktx_booking)


BOARD_PAYLOAD = {
    "boardList": [
        {
            "bdTitle": "KTX 시각표(2026. 9. 1. 기준)",
            "fileId": ["jfile/202608/03/future.xlsx"],
            "regdt": "2026-08-03",
        },
        {
            "bdTitle": "KTX 시각표(2026. 5. 15. 기준)",
            "fileId": ["jfile/202605/01/current.xlsx"],
            "regdt": "2026-05-01",
        },
        {
            "bdTitle": "KTX 운임표(2026. 9. 1. 기준)",
            "fileId": ["jfile/202608/03/fares.xls"],
            "regdt": "2026-08-03",
        },
    ]
}


def workbook_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["열차번호", "편성", "서울", "대전", "부산"])
    sheet.append(["75", "KTX-산천", "06:03", "07:01", "08:49"])
    sheet.append(["7", "KTX", "06:33", "07:34", "09:22"])
    sheet.append(["1201", "무궁화호", "07:00", "09:00", "12:00"])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def realistic_workbook_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append([
        "열차번호",
        "편성",
        "서울",
        "대전",
        "부산",
        "비고",
        None,
        "열차번호",
        "편성",
        "부산",
        "대전",
        "서울",
        "비고",
    ])
    sheet.append([
        "1",
        "KTX",
        "05:13",
        "06:05",
        "07:50",
        "매일",
        None,
        "2",
        "KTX",
        "08:00",
        "09:00",
        "10:30",
        "매일",
    ])
    sheet.append([
        "117",
        "KTX",
        "22:58",
        "23:40",
        time(0, 0),
        "매일",
        None,
        "118",
        "KTX",
        "18:00",
        "19:00",
        "20:30",
        "매일",
    ])
    sheet.append([
        "281",
        "KTX",
        "06:00",
        "07:00",
        "08:30",
        "금토일",
        None,
        "282",
        "KTX",
        "12:00",
        "13:00",
        "14:30",
        "월화수목",
    ])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


class KtxOfficialTimetableTests(unittest.TestCase):
    def test_chooses_timetable_applicable_to_requested_date(self) -> None:
        source = ktx_booking.choose_timetable_for_date(BOARD_PAYLOAD, "20260819")

        self.assertEqual(source.title, "KTX 시각표(2026. 5. 15. 기준)")
        self.assertTrue(source.download_url.endswith("current.xlsx"))

    def test_ignores_fare_tables_and_legacy_xls_files(self) -> None:
        candidates = ktx_booking.timetable_candidates(BOARD_PAYLOAD)

        self.assertEqual([item.title for item in candidates], [
            "KTX 시각표(2026. 9. 1. 기준)",
            "KTX 시각표(2026. 5. 15. 기준)",
        ])

    def test_search_reads_official_workbook_without_credentials(self) -> None:
        with mock.patch.object(ktx_booking, "fetch_json", return_value=BOARD_PAYLOAD):
            with mock.patch.object(ktx_booking, "download_bytes", return_value=workbook_bytes()):
                result = ktx_booking.search_public_timetable(
                    dep="서울역",
                    arr="부산역",
                    date="20260819",
                    earliest="0600",
                    latest="0700",
                    limit=5,
                )

        self.assertEqual(result["count"], 2)
        self.assertEqual(result["trains"][0]["train_no"], "75")
        self.assertEqual(result["trains"][0]["train_type"], "KTX-산천")
        self.assertNotIn("general_seat_available", result["trains"][0])
        self.assertIn("실시간 잔여석", result["schedule_note"])

    def test_search_returns_empty_result_for_missing_route_window(self) -> None:
        with mock.patch.object(ktx_booking, "fetch_json", return_value=BOARD_PAYLOAD):
            with mock.patch.object(ktx_booking, "download_bytes", return_value=workbook_bytes()):
                result = ktx_booking.search_public_timetable(
                    dep="서울",
                    arr="부산",
                    date="20260819",
                    earliest="2300",
                    latest="2359",
                    limit=5,
                )

        self.assertEqual(result["trains"], [])
        self.assertEqual(result["count"], 0)

    def test_reverse_direction_uses_only_matching_table_section(self) -> None:
        with mock.patch.object(ktx_booking, "fetch_json", return_value=BOARD_PAYLOAD):
            with mock.patch.object(ktx_booking, "download_bytes", return_value=realistic_workbook_bytes()):
                result = ktx_booking.search_public_timetable(
                    dep="부산",
                    arr="서울",
                    date="20260819",
                    earliest="0000",
                    latest="2359",
                    limit=20,
                )

        self.assertEqual([train["train_no"] for train in result["trains"]], ["2", "282", "118"])
        self.assertTrue(all(train["dep_time"] < train["arr_time"] for train in result["trains"]))

    def test_no_stop_time_cell_is_not_reported_as_midnight_service(self) -> None:
        with mock.patch.object(ktx_booking, "fetch_json", return_value=BOARD_PAYLOAD):
            with mock.patch.object(ktx_booking, "download_bytes", return_value=realistic_workbook_bytes()):
                result = ktx_booking.search_public_timetable(
                    dep="부산",
                    arr="서울",
                    date="20260819",
                    earliest="0000",
                    latest="2359",
                    limit=20,
                )

        self.assertNotIn("117", [train["train_no"] for train in result["trains"]])

    def test_requested_date_filters_weekday_specific_service(self) -> None:
        with mock.patch.object(ktx_booking, "fetch_json", return_value=BOARD_PAYLOAD):
            with mock.patch.object(ktx_booking, "download_bytes", return_value=realistic_workbook_bytes()):
                result = ktx_booking.search_public_timetable(
                    dep="서울",
                    arr="부산",
                    date="20260819",
                    earliest="0000",
                    latest="2359",
                    limit=20,
                )

        train_numbers = [train["train_no"] for train in result["trains"]]
        self.assertNotIn("281", train_numbers)
        self.assertIn("1", train_numbers)

    def test_unknown_station_is_reported_as_invalid_input(self) -> None:
        with mock.patch.object(ktx_booking, "fetch_json", return_value=BOARD_PAYLOAD):
            with mock.patch.object(ktx_booking, "download_bytes", return_value=realistic_workbook_bytes()):
                with self.assertRaisesRegex(RuntimeError, "station"):
                    ktx_booking.search_public_timetable(
                        dep="없는역",
                        arr="부산",
                        date="20260819",
                        earliest="0000",
                        latest="2359",
                        limit=20,
                    )

    def test_cli_source_prints_official_attachment(self) -> None:
        output = io.StringIO()
        with mock.patch.object(ktx_booking, "fetch_json", return_value=BOARD_PAYLOAD):
            with redirect_stdout(output):
                exit_code = ktx_booking.main(["source"])

        self.assertEqual(exit_code, 0)
        source = json.loads(output.getvalue())
        self.assertIn("KTX 시각표", source["title"])
        self.assertIn("korail.com/file/cubedata", source["download_url"])

    def test_bad_time_fails_before_network_access(self) -> None:
        with mock.patch.object(ktx_booking, "fetch_json") as fetch:
            with self.assertRaises(SystemExit):
                ktx_booking.main([
                    "search",
                    "--dep",
                    "서울",
                    "--arr",
                    "부산",
                    "--date",
                    "20260819",
                    "--time",
                    "2500",
                ])
        fetch.assert_not_called()

    def test_helper_contains_no_mobile_api_or_state_changing_commands(self) -> None:
        source = CANONICAL_PATH.read_text(encoding="utf-8")

        self.assertNotIn("ScheduleView", source)
        self.assertNotIn("korail2", source)
        self.assertNotIn("Dynapath", source)
        self.assertNotRegex(source, r"def (reserve|cancel|pay|login)")

    def test_bundled_helper_matches_source(self) -> None:
        bundled = (
            SCRIPT_PATH.parent.parent
            / "packages"
            / "k-skill-cli"
            / "skills"
            / "ktx-booking"
            / "scripts"
            / "ktx_booking.py"
        )
        self.assertEqual(CANONICAL_PATH.read_bytes(), bundled.read_bytes())
        parser_source = CANONICAL_PATH.with_name("ktx_timetable.py")
        parser_bundled = bundled.with_name("ktx_timetable.py")
        self.assertEqual(parser_source.read_bytes(), parser_bundled.read_bytes())

    def test_cli_rejects_removed_reserve_command(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "reserve"],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(completed.returncode, 2)
        self.assertIn("invalid choice", completed.stderr)


if __name__ == "__main__":
    unittest.main()
