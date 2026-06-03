from __future__ import annotations

import argparse
import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import srt_booking
import srt_seats


SEAT_HTML = "\n".join([
    '<li class="scar-01 off"><strong>일반실<br />1호차</strong></li>',
    '<li class="scar-04 on"><a href="#none" onclick="selectScarInfo(\'0004\'); return false;"><strong>일반실<br />4호차</strong></a></li>',
    '<li class="scar-05"><a href="#none" onclick="selectScarInfo(\'0005\'); return false;"><strong>일반실<br />5호차</strong></a></li>',
    '<li class="scar-03 off"><strong>특실<br />3호차</strong></li>',
    '<a href="#none" onclick="selectSeatInfo(this, \'23\', \'6C\'); return false;">6C<strong><em>(정방향, 내측)</em></strong></a>',
    '<a href="#none" onclick="selectSeatInfo(this, \'11\', \'3A\'); return false;">3A<strong><em>(역방향, 창측)</em></strong></a>',
    "<span>5C<strong><em>(정방향, 내측, 선택불가)</em></strong></span>",
])

SPECIAL_SEAT_HTML = "\n".join([
    '<li class="scar-03 on"><a href="#none" onclick="selectScarInfo(\'0003\'); return false;"><strong>특실<br />3호차</strong></a></li>',
    '<li class="scar-05 off"><strong>일반실<br />5호차</strong></li>',
    '<a href="#none" onclick="selectSeatInfo(this, \'31\', \'1A\'); return false;">1A<strong><em>(정방향, 1인석)</em></strong></a>',
    "<span>2C<strong><em>(역방향, 내측, 선택불가)</em></strong></span>",
])

MISSING_DETAIL_HTML = "\n".join([
    '<a href="#none" onclick="selectSeatInfo(this, \'41\', \'9A\'); return false;">9A<strong><em>()</em></strong></a>',
])


class FakeTrain:
    train_number = "313"
    dep_date = "20260610"
    dep_time = "080000"
    arr_date = "20260610"
    arr_time = "103400"
    train_code = "17"
    train_name = "SRT"
    dep_station_code = "0551"
    dep_station_name = "수서"
    arr_station_code = "0020"
    arr_station_name = "부산"
    dep_station_run_order = "000001"
    arr_station_run_order = "000007"
    general_seat_state = "예약가능"
    special_seat_state = "매진"
    reserve_wait_possible_code = "-2"

    def general_seat_available(self) -> bool:
        return True

    def special_seat_available(self) -> bool:
        return False

    def reserve_standby_available(self) -> bool:
        return False


class FakeResponse:
    def __init__(self, text: str) -> None:
        self.text = text


class FakeSession:
    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []

    def get(self, _url: str, params: dict[str, str]) -> FakeResponse:
        self.calls.append(params)
        car = params["scarNo1"] or "0004"
        return FakeResponse(SEAT_HTML.replace("scar-04 on", f"scar-{car[-2:]} on"))


class FakeClient:
    def __init__(self, train: FakeTrain) -> None:
        self.train = train
        self._session = FakeSession()

    def search_train(
        self,
        _dep: str,
        _arr: str,
        _date: str,
        _time: str,
        _time_limit: str | None = None,
        available_only: bool = True,
    ) -> list[FakeTrain]:
        return [self.train]


class NoisySession(FakeSession):
    def get(self, _url: str, params: dict[str, str]) -> FakeResponse:
        print("접속자가 많아 대기열에 들어갑니다.")
        return super().get(_url, params)


class NoisyClient(FakeClient):
    def __init__(self, train: FakeTrain) -> None:
        self.train = train
        self._session = NoisySession()

    def search_train(
        self,
        _dep: str,
        _arr: str,
        _date: str,
        _time: str,
        _time_limit: str | None = None,
        available_only: bool = True,
    ) -> list[FakeTrain]:
        print("대기인원: 6명")
        return [self.train]


class EmptyClient(FakeClient):
    def search_train(
        self,
        _dep: str,
        _arr: str,
        _date: str,
        _time: str,
        _time_limit: str | None = None,
        available_only: bool = True,
    ) -> list[FakeTrain]:
        return []


class SpecialSession(FakeSession):
    def get(self, _url: str, params: dict[str, str]) -> FakeResponse:
        self.calls.append(params)
        return FakeResponse(SPECIAL_SEAT_HTML)


class SpecialClient(FakeClient):
    def __init__(self, train: FakeTrain) -> None:
        self.train = train
        self._session = SpecialSession()


class SrtSeatTests(unittest.TestCase):
    def test_normalize_car_and_seat_maps_srt_html(self) -> None:
        cars = srt_seats.parse_cars(SEAT_HTML)
        seats = srt_seats.parse_seats(SEAT_HTML)

        self.assertEqual([car["car_no"] for car in cars if car["available"]], [4, 5])
        self.assertEqual(cars[1]["room_class"], "일반실")
        self.assertTrue(cars[1]["current"])
        self.assertEqual([seat["seat"] for seat in seats if seat["available"]], ["6C", "3A"])
        self.assertEqual([seat["seat"] for seat in seats if not seat["available"]], ["5C"])
        self.assertEqual(seats[0]["direction"], "정방향")
        self.assertEqual(seats[0]["position"], "내측")
        self.assertEqual(seats[2]["notes"], ["선택불가"])

    def test_booking_priority_sorts_middle_cars_before_end_cars(self) -> None:
        cars: list[srt_seats.SrtCar] = [
            {"car_no": 1, "car_no_raw": "0001", "room_class": "일반실", "available": True, "current": False},
            {"car_no": 8, "car_no_raw": "0008", "room_class": "일반실", "available": True, "current": False},
            {"car_no": 2, "car_no_raw": "0002", "room_class": "일반실", "available": True, "current": False},
            {"car_no": 7, "car_no_raw": "0007", "room_class": "일반실", "available": True, "current": False},
            {"car_no": 3, "car_no_raw": "0003", "room_class": "일반실", "available": True, "current": False},
            {"car_no": 6, "car_no_raw": "0006", "room_class": "일반실", "available": True, "current": False},
            {"car_no": 4, "car_no_raw": "0004", "room_class": "일반실", "available": True, "current": False},
            {"car_no": 5, "car_no_raw": "0005", "room_class": "일반실", "available": True, "current": False},
        ]

        sorted_cars = srt_seats.sort_cars_for_booking(cars)

        self.assertEqual([car["car_no"] for car in sorted_cars], [4, 5, 3, 6, 2, 7, 1, 8])

    def test_booking_priority_sorts_forward_window_before_other_seats(self) -> None:
        seats: list[srt_seats.SrtSeat] = [
            {"seat": "3A", "seat_no": "11", "available": True, "direction": "역방향", "position": "창측", "notes": []},
            {"seat": "6C", "seat_no": "23", "available": True, "direction": "정방향", "position": "내측", "notes": []},
            {"seat": "2A", "seat_no": "7", "available": True, "direction": "정방향", "position": "창측", "notes": []},
        ]

        sorted_seats = srt_seats.sort_seats_for_booking(seats, "forward-window")

        self.assertEqual([seat["seat"] for seat in sorted_seats], ["2A", "6C", "3A"])

    def test_booking_priority_treats_single_seat_as_window_preference(self) -> None:
        seats: list[srt_seats.SrtSeat] = [
            {"seat": "1C", "seat_no": "3", "available": True, "direction": "정방향", "position": "내측", "notes": []},
            {"seat": "2A", "seat_no": "5", "available": True, "direction": "정방향", "position": "1인석", "notes": []},
        ]

        sorted_seats = srt_seats.sort_seats_for_booking(seats, "window-forward")

        self.assertEqual([seat["seat"] for seat in sorted_seats], ["2A", "1C"])

    def test_parse_seat_page_marks_missing_detail_attributes_unknown(self) -> None:
        seats = srt_seats.parse_seats(MISSING_DETAIL_HTML)

        self.assertEqual(seats[0]["direction"], "unknown")
        self.assertEqual(seats[0]["position"], "unknown")

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
