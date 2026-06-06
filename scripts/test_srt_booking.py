from __future__ import annotations

import argparse
import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import srt_booking
from srt_booking_test_support import EmptyClient, FakeClient, FakeTrain, NoisyClient, SpecialClient


class SrtSeatTests(unittest.TestCase):
    def test_command_seats_outputs_available_seats_by_booking_preference(self) -> None:
        train = FakeTrain()
        train_id = srt_booking.build_train_id(train)
        client = FakeClient(train)
        args = argparse.Namespace(
            dep="수서",
            arr="부산",
            date="20260610",
            time="080000",
            time_limit=None,
            train_id=train_id,
            room="general",
            car_no=4,
            seat="6C",
            available_only=False,
            car_priority="center",
            seat_priority="forward-window",
            limit=10,
        )
        output = io.StringIO()

        with patch.object(srt_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                srt_booking.command_seats(args)

        result = json.loads(output.getvalue())
        car = result["cars"][0]
        self.assertEqual(car["car_no"], 4)
        self.assertTrue(car["requested_seat_available"])
        self.assertEqual(car["available_seats"], ["6C"])
        self.assertEqual(client._session.calls[-1]["scarNo1"], "0004")

    def test_command_seats_filters_unavailable_when_available_only(self) -> None:
        train = FakeTrain()
        train_id = srt_booking.build_train_id(train)
        client = FakeClient(train)
        args = argparse.Namespace(
            dep="수서",
            arr="부산",
            date="20260610",
            time="080000",
            time_limit=None,
            train_id=train_id,
            room="general",
            car_no=4,
            seat=None,
            available_only=True,
            car_priority="center",
            seat_priority="forward-window",
            limit=10,
        )
        output = io.StringIO()

        with patch.object(srt_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                srt_booking.command_seats(args)

        result = json.loads(output.getvalue())
        shown_seats = result["cars"][0]["seats"]
        self.assertEqual([seat["seat"] for seat in shown_seats], ["6C", "3A"])
        self.assertTrue(all(seat["available"] for seat in shown_seats))

    def test_command_seats_returns_special_room_cars(self) -> None:
        train = FakeTrain()
        train_id = srt_booking.build_train_id(train)
        client = SpecialClient(train)
        args = argparse.Namespace(
            dep="수서",
            arr="부산",
            date="20260610",
            time="080000",
            time_limit=None,
            train_id=train_id,
            room="special",
            car_no=3,
            seat=None,
            available_only=True,
            car_priority="center",
            seat_priority="window-forward",
            limit=10,
        )
        output = io.StringIO()

        with patch.object(srt_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                srt_booking.command_seats(args)

        result = json.loads(output.getvalue())
        self.assertEqual(result["room"], "special")
        self.assertEqual(result["cars"][0]["room_class"], "특실")
        self.assertEqual(result["cars"][0]["available_seats"], ["1A"])

    def test_command_seats_fails_when_train_id_is_stale(self) -> None:
        train = FakeTrain()
        args = argparse.Namespace(
            dep="수서",
            arr="부산",
            date="20260610",
            time="080000",
            time_limit=None,
            train_id=srt_booking.build_train_id(train),
            room="general",
            car_no=4,
            seat=None,
            available_only=False,
            car_priority="center",
            seat_priority="forward-window",
            limit=10,
        )

        with patch.object(srt_booking, "build_client", return_value=EmptyClient(train)):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    srt_booking.command_seats(args)

        self.assertIn("train_id", str(exc.exception))

    def test_command_seats_keeps_json_stdout_when_upstream_prints_queue_messages(self) -> None:
        train = FakeTrain()
        train_id = srt_booking.build_train_id(train)
        client = NoisyClient(train)
        args = argparse.Namespace(
            dep="수서",
            arr="부산",
            date="20260610",
            time="080000",
            time_limit=None,
            train_id=train_id,
            room="general",
            car_no=4,
            seat=None,
            available_only=True,
            car_priority="center",
            seat_priority="forward-window",
            limit=10,
        )
        output = io.StringIO()

        with patch.object(srt_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                srt_booking.command_seats(args)

        result = json.loads(output.getvalue())
        self.assertEqual(result["cars"][0]["available_seats"], ["6C", "3A"])

    def test_command_seats_explores_middle_cars_first(self) -> None:
        train = FakeTrain()
        train_id = srt_booking.build_train_id(train)
        client = FakeClient(train)
        args = argparse.Namespace(
            dep="수서",
            arr="부산",
            date="20260610",
            time="080000",
            time_limit=None,
            train_id=train_id,
            room="general",
            car_no=None,
            seat=None,
            available_only=True,
            car_priority="center",
            seat_priority="forward-window",
            limit=10,
        )

        with patch.object(srt_booking, "build_client", return_value=client):
            with redirect_stdout(io.StringIO()):
                srt_booking.command_seats(args)

        self.assertEqual([call["scarNo1"] for call in client._session.calls], ["", "0004", "0005"])

    def test_build_parser_accepts_seats_filters(self) -> None:
        args = srt_booking.build_parser().parse_args([
            "seats",
            "수서",
            "부산",
            "20260610",
            "080000",
            "--train-id",
            "srt:v1:test",
            "--car-no",
            "5",
            "--seat",
            "11A",
            "--seat-priority",
            "window-forward",
        ])

        self.assertEqual(args.car_no, 5)
        self.assertEqual(args.seat, "11A")
        self.assertEqual(args.seat_priority, "window-forward")


if __name__ == "__main__":
    unittest.main()
