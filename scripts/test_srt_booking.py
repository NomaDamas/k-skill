import importlib.util
import io
import json
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from requests import ConnectionError as RequestsConnectionError
from SRT.errors import SRTNetFunnelError

SCRIPT_PATH = Path(__file__).with_name("srt_booking.py")
CANONICAL_PATH = SCRIPT_PATH.parent.parent / "srt-booking" / "scripts" / "srt_booking.py"
SPEC = importlib.util.spec_from_file_location("srt_booking", SCRIPT_PATH)
assert SPEC and SPEC.loader
srt_booking = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = srt_booking
SPEC.loader.exec_module(srt_booking)


class FakeTrain:
    train_number = "303"
    train_name = "SRT"
    dep_date = "20260819"
    dep_time = "060000"
    arr_time = "083000"
    dep_station_name = "수서"
    arr_station_name = "부산"
    def general_seat_available(self):
        return True

    def special_seat_available(self):
        return False


class SoldOutFakeTrain(FakeTrain):
    def general_seat_available(self):
        return False

    def special_seat_available(self):
        return False


class FakeSRT:
    def __init__(self, srt_id, srt_pw, auto_login):
        self.init = (srt_id, srt_pw, auto_login)
        self.calls = []

    def search_train(self, **kwargs):
        self.calls.append(("search_train", kwargs))
        return [FakeTrain()]

    def reserve(self, *_args, **_kwargs):
        raise AssertionError("reserve must never be called")

    def cancel(self, *_args, **_kwargs):
        raise AssertionError("cancel must never be called")


class NoisyFakeSRT(FakeSRT):
    def search_train(self, **kwargs):
        print("대기인원: 10명")
        return super().search_train(**kwargs)


class FailingFakeSRT(FakeSRT):
    def __init__(self, error):
        super().__init__("", "", False)
        self.error = error

    def search_train(self, **kwargs):
        raise self.error


class SrtLiveReadOnlyTests(unittest.TestCase):
    def test_parser_exposes_only_search_and_source(self) -> None:
        parser = srt_booking.build_parser()
        subcommands = parser._subparsers._group_actions[0].choices

        self.assertEqual(set(subcommands), {"search", "source"})

    def test_helper_uses_live_srtrain_not_file_transport(self) -> None:
        source = CANONICAL_PATH.read_text()
        self.assertIn("SRTrain", source)
        self.assertNotIn("kordoc", source)
        self.assertNotIn("downloadAttach", source)
        self.assertNotIn("TemporaryDirectory", source)

    def test_search_uses_anonymous_client_and_only_search_train(self) -> None:
        client = FakeSRT("", "", False)
        with mock.patch.object(srt_booking, "build_client", return_value=client):
            result = srt_booking.search_live_timetable(
                dep="수서",
                arr="부산",
                date="20260819",
                earliest="0600",
                latest="1200",
                limit=5,
            )

        self.assertEqual(client.init, ("", "", False))
        self.assertEqual([name for name, _kwargs in client.calls], ["search_train"])
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["trains"][0]["train_no"], "303")
        self.assertEqual(result["trains"][0]["dep_time"], "06:00")
        self.assertEqual(result["source"]["transport"], "SRTrain")

    def test_search_preserves_sold_out_seat_availability(self) -> None:
        client = FakeSRT("", "", False)
        client.search_train = mock.Mock(return_value=[SoldOutFakeTrain()])

        with mock.patch.object(srt_booking, "build_client", return_value=client):
            result = srt_booking.search_live_timetable(
                dep="수서",
                arr="부산",
                date="20260819",
                earliest="0600",
                latest="1200",
                limit=5,
            )

        self.assertFalse(result["trains"][0]["general_seat_available"])
        self.assertFalse(result["trains"][0]["special_seat_available"])

    def test_source_reports_live_schedule_endpoint_only(self) -> None:
        source = srt_booking.source_info()

        self.assertEqual(source["mode"], "live")
        self.assertIn("selectListAra10007", source["endpoint"])
        self.assertEqual(source["queue_endpoint"], "https://nf.letskorail.com/ts.wseq")
        self.assertNotIn("reserve", source["endpoint"].lower())

    def test_module_has_no_state_changing_command_functions(self) -> None:
        for name in ("command_reserve", "command_cancel", "command_reservations", "command_payment"):
            self.assertFalse(hasattr(srt_booking, name))

    def test_station_input_drops_a_trailing_station_suffix(self) -> None:
        self.assertEqual(srt_booking.normalize_station("수서역"), "수서")
        self.assertEqual(srt_booking.normalize_station(" 부산 "), "부산")
        self.assertEqual(srt_booking.normalize_station("없는역"), "없는역")

    def test_search_normalizes_station_input_before_querying(self) -> None:
        client = FakeSRT("", "", False)
        with mock.patch.object(srt_booking, "build_client", return_value=client):
            srt_booking.search_live_timetable(
                dep="수서역",
                arr="부산역",
                date="20260819",
                earliest="0600",
                latest="1200",
                limit=5,
            )

        _name, kwargs = client.calls[0]
        self.assertEqual((kwargs["dep"], kwargs["arr"]), ("수서", "부산"))

    def test_cli_stdout_stays_json_when_srtrain_prints_queue_status(self) -> None:
        output = io.StringIO()
        client = NoisyFakeSRT("", "", False)

        with mock.patch.object(srt_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                exit_code = srt_booking.main(
                    [
                        "search",
                        "--dep",
                        "수서",
                        "--arr",
                        "부산",
                        "--date",
                        "20260819",
                        "--time",
                        "0600",
                    ]
                )

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(output.getvalue())["count"], 1)

    def test_cli_bad_date_fails_before_client_creation(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "search",
                "--dep",
                "수서",
                "--arr",
                "부산",
                "--date",
                "2026-08-19",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("YYYYMMDD", result.stderr)

    def test_cli_reports_upstream_failures_without_traceback(self) -> None:
        failures = [
            SRTNetFunnelError("queue down"),
            RequestsConnectionError("network down"),
        ]

        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                stderr = io.StringIO()
                client = FailingFakeSRT(failure)

                with mock.patch.object(srt_booking, "build_client", return_value=client):
                    with mock.patch("sys.stderr", stderr):
                        with self.assertRaises(SystemExit) as raised:
                            srt_booking.main([
                                "search",
                                "--dep",
                                "수서",
                                "--arr",
                                "부산",
                                "--date",
                                "20260819",
                            ])

                self.assertEqual(raised.exception.code, 2)
                self.assertIn("SRT timetable lookup unavailable", stderr.getvalue())
                self.assertNotIn("Traceback", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
