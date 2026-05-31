import argparse
import io
import json
import subprocess
import sys
import textwrap
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import ktx_booking


class FakeTrain:
    def __init__(
        self,
        *,
        train_no,
        dep_time,
        arr_time,
        dep_date="20260328",
        arr_date="20260328",
        run_date="20260328",
        train_group="00",
        dep_name="서울",
        arr_name="부산",
        dep_code="0001",
        arr_code="0020",
        train_type_name="KTX",
        has_general_seat=True,
        has_special_seat=False,
        has_waiting_list=False,
        label=None,
    ):
        self.train_no = train_no
        self.dep_time = dep_time
        self.arr_time = arr_time
        self.dep_date = dep_date
        self.arr_date = arr_date
        self.run_date = run_date
        self.train_group = train_group
        self.dep_name = dep_name
        self.arr_name = arr_name
        self.dep_code = dep_code
        self.arr_code = arr_code
        self.train_type_name = train_type_name
        self._has_general_seat = has_general_seat
        self._has_special_seat = has_special_seat
        self._has_waiting_list = has_waiting_list
        self.label = label or train_no

    def has_general_seat(self):
        return self._has_general_seat

    def has_special_seat(self):
        return self._has_special_seat

    def has_waiting_list(self):
        return self._has_waiting_list

    def has_general_waiting_list(self):
        return self._has_waiting_list

    def __str__(self):
        return self.label


class FakeReservation:
    rsv_id = "320260307102676"
    train_no = "009"
    train_type_name = "KTX"
    dep_name = "서울"
    dep_date = "20260328"
    dep_time = "090000"
    arr_name = "부산"
    arr_date = "20260328"
    arr_time = "113000"
    seat_no_count = 1
    price = 59800
    buy_limit_date = "20260327"
    buy_limit_time = "235900"
    journey_no = "001"
    journey_cnt = "01"
    rsv_chg_no = "00000"

    def __str__(self):
        return "reservation"


class FakeNCard:
    discount_card_no = "1234567890123456"
    ticket_kind_name = "N카드"
    dep_name = "대전"
    arr_name = "서울"
    valid = "20260101~20261231"

    def __str__(self):
        return f"[N카드] {self.dep_name}~{self.arr_name} {self.discount_card_no}"


class FakeClient:
    def __init__(
        self,
        trains,
        search_handler=None,
        ncards=None,
        ncard_trains=None,
        train_details=None,
        cars=None,
        seats_by_car=None,
        seat_payloads_by_car=None,
    ):
        self._trains = trains
        self._search_handler = search_handler
        self._ncards = ncards or []
        self._ncard_trains = ncard_trains or []
        self._train_details = train_details
        self._cars = cars or []
        self._seats_by_car = seats_by_car or {}
        self._seat_payloads_by_car = seat_payloads_by_car or {}
        self.search_calls = []
        self.search_detail_calls = []
        self.train_car_calls = []
        self.car_seat_calls = []
        self.reserved_train = None
        self.reserved_passengers = None

    def search_train(self, *args, **kwargs):
        self.search_calls.append(kwargs)
        if self._search_handler is not None:
            return list(self._search_handler(*args, **kwargs))
        return list(self._trains)

    def search_train_details(self, *args, **kwargs):
        self.search_detail_calls.append(kwargs)
        if self._train_details is not None:
            return list(self._train_details)
        return [(train, {}) for train in self._trains]

    def train_cars(self, raw_train, passenger_count=1, room_class="1"):
        self.train_car_calls.append({
            "raw_train": raw_train,
            "passenger_count": passenger_count,
            "room_class": room_class,
        })
        return list(self._cars)

    def car_seats(self, raw_train, car_no, passenger_count=1, room_class="1"):
        self.car_seat_calls.append({
            "raw_train": raw_train,
            "car_no": car_no,
            "passenger_count": passenger_count,
            "room_class": room_class,
        })
        if car_no in self._seat_payloads_by_car:
            return self._seat_payloads_by_car[car_no]
        return {"seat_infos": {"seat_info": list(self._seats_by_car.get(car_no, []))}}

    def reserve(self, train, **kwargs):
        self.reserved_train = train
        self.reserved_passengers = kwargs.get("passengers")
        return FakeReservation()

    def owned_ncards(self):
        return list(self._ncards)

    def search_owned_ncard_trains(self, ncard, **kwargs):
        return list(self._ncard_trains)


class KtxBookingTests(unittest.TestCase):
    def make_args(self, train_id, ncard_no=None):
        return argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            seat_option="general-first",
            train_type="ktx",
            include_no_seats=False,
            include_waiting_list=False,
            try_waiting=False,
            ncard_no=ncard_no,
        )

    def test_normalize_train_emits_stable_train_id(self):
        train = FakeTrain(train_no="009", dep_time="090000", arr_time="113000")

        normalized = ktx_booking.normalize_train(train, index=2)

        self.assertIn("train_id", normalized)
        train_id = normalized["train_id"]
        if not isinstance(train_id, str):
            self.fail("train_id should be emitted as a string")
        resolved = ktx_booking.find_train_by_id([train], train_id)
        self.assertIs(resolved, train)

    def test_build_parser_requires_train_id_for_reserve(self):
        args = ktx_booking.build_parser().parse_args([
            "reserve",
            "서울",
            "부산",
            "20260328",
            "090000",
            "--train-id",
            "ktx:v1:test",
        ])

        self.assertEqual(args.train_id, "ktx:v1:test")
        self.assertEqual(args.train_type, "ktx")

    def test_build_parser_accepts_seats_filters(self):
        args = ktx_booking.build_parser().parse_args([
            "seats",
            "서울",
            "부산",
            "20260328",
            "090000",
            "--train-id",
            "ktx:v1:test",
            "--room",
            "special",
            "--car-no",
            "5",
            "--available-only",
            "--power-only",
            "--limit",
            "10",
        ])

        self.assertEqual(args.train_id, "ktx:v1:test")
        self.assertEqual(args.room, "special")
        self.assertEqual(args.car_no, 5)
        self.assertTrue(args.available_only)
        self.assertTrue(args.power_only)
        self.assertEqual(args.limit, 10)

    def test_build_parser_defaults_search_train_type_to_ktx(self):
        args = ktx_booking.build_parser().parse_args([
            "search",
            "서울",
            "부산",
            "20260328",
            "090000",
        ])

        self.assertEqual(args.train_type, "ktx")

    def test_parser_train_type_choices_match_supported_train_types(self):
        parser = ktx_booking.build_parser()
        for train_type in sorted(ktx_booking.TRAIN_TYPE_MAP):
            search_args = parser.parse_args([
                "search",
                "서울",
                "부산",
                "20260328",
                "090000",
                "--train-type",
                train_type,
            ])
            reserve_args = parser.parse_args([
                "reserve",
                "서울",
                "부산",
                "20260328",
                "090000",
                "--train-id",
                "ktx:v1:test",
                "--train-type",
                train_type,
            ])
            seats_args = parser.parse_args([
                "seats",
                "서울",
                "부산",
                "20260328",
                "090000",
                "--train-id",
                "ktx:v1:test",
                "--train-type",
                train_type,
            ])
            self.assertEqual(search_args.train_type, train_type)
            self.assertEqual(reserve_args.train_type, train_type)
            self.assertEqual(seats_args.train_type, train_type)

    def test_normalize_car_and_seat_maps_korail_codes(self):
        car = ktx_booking.normalize_car({
            "h_srcar_no": "05",
            "h_psrm_cl_cd": "1",
            "h_psrm_cl_nm": "ignored",
            "h_seat_cnt": "48",
            "h_rest_seat_cnt": "7",
        })
        seat = ktx_booking.normalize_seat({
            "h_con_seat_no": "7A",
            "h_seat_no": "007001",
            "h_sale_psb_flg": "Y",
            "h_for_rev_dir_dv": "009",
            "h_sigl_win_in_dv": "012",
            "h_dmd_seat_att": "015",
            "h_door_nbor_flg": "Y",
        })

        self.assertEqual(car["car_no"], 5)
        self.assertEqual(car["room_class"], "일반실")
        self.assertEqual(car["remaining_seats"], 7)
        self.assertEqual(seat["seat"], "7A")
        self.assertTrue(seat["available"])
        self.assertEqual(seat["direction"], "순방향")
        self.assertEqual(seat["position"], "창측")
        self.assertEqual(seat["seat_type"], "일반석")
        self.assertTrue(seat["near_door"])
        self.assertEqual(seat["power_outlet"], "direct")

    def test_power_outlet_match_distinguishes_direct_adjacent_and_none(self):
        self.assertEqual(ktx_booking.power_outlet_match("1A"), "direct")
        self.assertEqual(ktx_booking.power_outlet_match("1B"), "adjacent")
        self.assertEqual(ktx_booking.power_outlet_match("2A"), "none")
        self.assertEqual(ktx_booking.power_outlet_match("bad"), "none")

    def test_booking_priority_sorts_middle_cars_before_end_cars(self):
        cars = [
            {"car_no": 1},
            {"car_no": 8},
            {"car_no": 2},
            {"car_no": 7},
            {"car_no": 3},
            {"car_no": 6},
            {"car_no": 4},
            {"car_no": 5},
        ]

        sorted_cars = ktx_booking.sort_cars_for_booking(cars)

        self.assertEqual([car["car_no"] for car in sorted_cars], [4, 5, 3, 6, 2, 7, 1, 8])

    def test_booking_priority_sorts_power_outlet_before_forward_direction(self):
        seats = [
            {"seat": "2A", "power_outlet": "none", "direction": "순방향"},
            {"seat": "1C", "power_outlet": "adjacent", "direction": "역방향"},
            {"seat": "1A", "power_outlet": "direct", "direction": "역방향"},
            {"seat": "3A", "power_outlet": "direct", "direction": "순방향"},
        ]

        sorted_seats = ktx_booking.sort_seats_for_booking(seats)

        self.assertEqual([seat["seat"] for seat in sorted_seats], ["3A", "1A", "1C", "2A"])

    def test_is_phone_login_id_accepts_digits_only_mobile_numbers(self):
        self.assertTrue(ktx_booking.is_phone_login_id("01012345678"))
        self.assertTrue(ktx_booking.is_phone_login_id("0101234567"))
        self.assertFalse(ktx_booking.is_phone_login_id("1234567890"))
        self.assertFalse(ktx_booking.is_phone_login_id("user@example.com"))

    def test_command_search_replays_selected_train_type(self):
        selected = FakeTrain(
            train_no="2080",
            dep_time="155300",
            arr_time="170000",
            dep_name="남춘천",
            arr_name="용산",
            train_type_name="ITX-청춘",
        )
        client = FakeClient([selected])
        args = argparse.Namespace(
            dep="남춘천",
            arr="용산",
            date="20260503",
            time="150000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            limit=5,
            train_type="itx-cheongchun",
            include_no_seats=False,
            include_waiting_list=False,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(io.StringIO()):
                ktx_booking.command_search(args)

        self.assertEqual(
            client.search_calls[-1]["train_type"],
            ktx_booking.TRAIN_TYPE_MAP["itx-cheongchun"],
        )

    def test_command_reserve_targets_exact_train_id_even_if_order_changes(self):
        sold_out_first = FakeTrain(
            train_no="001",
            dep_time="050000",
            arr_time="080000",
            has_general_seat=False,
            label="soldout-first",
        )
        user_selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="user-selected")
        other_train = FakeTrain(train_no="011", dep_time="093000", arr_time="120000", label="other-train")
        train_id = ktx_booking.normalize_train(user_selected, index=2)["train_id"]
        client = FakeClient([other_train, sold_out_first, user_selected])

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(io.StringIO()):
                ktx_booking.command_reserve(self.make_args(train_id))

        self.assertIs(client.reserved_train, user_selected)

    def test_command_reserve_fails_if_selected_train_is_no_longer_available(self):
        user_selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="user-selected")
        other_train = FakeTrain(train_no="011", dep_time="093000", arr_time="120000", label="other-train")
        train_id = ktx_booking.normalize_train(user_selected, index=2)["train_id"]
        client = FakeClient([other_train])

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_reserve(self.make_args(train_id))

        self.assertIn("train_id", str(exc.exception))

    def test_command_reserve_replays_selected_train_type(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient([selected])
        args = self.make_args(train_id)
        args.train_type = "itx-cheongchun"

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(io.StringIO()):
                ktx_booking.command_reserve(args)

        self.assertEqual(client.search_calls[-1]["train_type"], ktx_booking.TRAIN_TYPE_MAP["itx-cheongchun"])
        self.assertIs(client.reserved_train, selected)

    def test_command_reserve_try_waiting_replays_search_with_waiting_list_enabled(self):
        waiting_only = FakeTrain(
            train_no="003",
            dep_time="070000",
            arr_time="093000",
            has_general_seat=False,
            has_special_seat=False,
            has_waiting_list=True,
            label="waiting-only",
        )
        train_id = ktx_booking.normalize_train(waiting_only, index=1)["train_id"]
        client = FakeClient(
            [],
            search_handler=lambda *args, **kwargs: [waiting_only] if kwargs.get("include_waiting_list") else [],
        )
        args = self.make_args(train_id)
        args.try_waiting = True

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(io.StringIO()):
                ktx_booking.command_reserve(args)

        self.assertTrue(client.search_calls)
        self.assertTrue(client.search_calls[-1]["include_waiting_list"])
        self.assertIs(client.reserved_train, waiting_only)

    def test_command_seats_returns_available_power_seats_for_selected_car(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        raw_train = {"h_trn_no": "009", "h_dpt_dt": "20260328"}
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, raw_train)],
            cars=[
                {
                    "h_srcar_no": "04",
                    "h_psrm_cl_cd": "1",
                    "h_seat_cnt": "48",
                    "h_rest_seat_cnt": "9",
                },
                {
                    "h_srcar_no": "05",
                    "h_psrm_cl_cd": "1",
                    "h_seat_cnt": "48",
                    "h_rest_seat_cnt": "3",
                },
            ],
            seats_by_car={
                "05": [
                    {
                        "h_con_seat_no": "1A",
                        "h_seat_no": "001001",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "009",
                        "h_sigl_win_in_dv": "012",
                        "h_dmd_seat_att": "015",
                    },
                    {
                        "h_con_seat_no": "1B",
                        "h_seat_no": "001002",
                        "h_sale_psb_flg": "N",
                        "h_for_rev_dir_dv": "010",
                        "h_sigl_win_in_dv": "013",
                        "h_dmd_seat_att": "015",
                    },
                    {
                        "h_con_seat_no": "2A",
                        "h_seat_no": "002001",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "009",
                        "h_sigl_win_in_dv": "012",
                        "h_dmd_seat_att": "015",
                    },
                    {
                        "h_con_seat_no": "0A",
                        "h_seat_no": "000000",
                        "h_sale_psb_flg": "Y",
                    },
                ],
            },
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=2,
            children=1,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=5,
            available_only=True,
            power_only=True,
            limit=10,
        )
        output = io.StringIO()

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                ktx_booking.command_seats(args)

        result = json.loads(output.getvalue())
        self.assertEqual(result["room"], "general")
        self.assertEqual(result["passenger_count"], 3)
        self.assertTrue(result["available_only"])
        self.assertTrue(result["power_only"])
        self.assertEqual(len(result["cars"]), 1)
        self.assertEqual(result["cars"][0]["car_no"], 5)
        self.assertEqual(result["cars"][0]["remaining_seats"], 3)
        self.assertEqual(result["cars"][0]["available_seat_count"], 1)
        self.assertEqual(result["cars"][0]["available_seats"], ["1A"])
        self.assertEqual(result["cars"][0]["shown_seat_count"], 1)
        self.assertEqual(result["cars"][0]["seats"][0]["seat"], "1A")
        self.assertEqual(result["cars"][0]["seats"][0]["power_outlet"], "direct")
        self.assertEqual(client.search_detail_calls[-1]["train_type"], ktx_booking.TRAIN_TYPE_MAP["ktx"])
        self.assertTrue(client.search_detail_calls[-1]["include_no_seats"])
        self.assertTrue(client.search_detail_calls[-1]["include_waiting_list"])
        self.assertEqual(client.train_car_calls[-1]["passenger_count"], 3)
        self.assertEqual(client.train_car_calls[-1]["room_class"], "1")
        self.assertEqual(client.car_seat_calls[-1]["car_no"], "05")

    def test_command_seats_explores_middle_cars_first(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        raw_train = {"h_trn_no": "009", "h_dpt_dt": "20260328"}
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, raw_train)],
            cars=[
                {"h_srcar_no": "01", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "1"},
                {"h_srcar_no": "08", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "1"},
                {"h_srcar_no": "04", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "1"},
                {"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "1"},
            ],
            seats_by_car={
                car_no: [{"h_con_seat_no": "1A", "h_seat_no": "001001", "h_sale_psb_flg": "Y"}]
                for car_no in ("01", "04", "05", "08")
            },
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )
        output = io.StringIO()

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                ktx_booking.command_seats(args)

        result = json.loads(output.getvalue())
        self.assertEqual([car["car_no"] for car in result["cars"]], [4, 5, 1, 8])
        self.assertEqual([call["car_no"] for call in client.car_seat_calls], ["04", "05", "01", "08"])

    def test_command_seats_outputs_available_seats_by_booking_preference(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        raw_train = {"h_trn_no": "009", "h_dpt_dt": "20260328"}
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, raw_train)],
            cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "4"}],
            seats_by_car={
                "05": [
                    {
                        "h_con_seat_no": "2A",
                        "h_seat_no": "002001",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "009",
                        "h_sigl_win_in_dv": "012",
                        "h_dmd_seat_att": "015",
                    },
                    {
                        "h_con_seat_no": "1C",
                        "h_seat_no": "001003",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "010",
                        "h_sigl_win_in_dv": "013",
                        "h_dmd_seat_att": "015",
                    },
                    {
                        "h_con_seat_no": "1A",
                        "h_seat_no": "001001",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "010",
                        "h_sigl_win_in_dv": "012",
                        "h_dmd_seat_att": "015",
                    },
                    {
                        "h_con_seat_no": "3A",
                        "h_seat_no": "003001",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "009",
                        "h_sigl_win_in_dv": "012",
                        "h_dmd_seat_att": "015",
                    },
                ],
            },
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=True,
            power_only=False,
            limit=10,
        )
        output = io.StringIO()

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                ktx_booking.command_seats(args)

        result = json.loads(output.getvalue())
        car = result["cars"][0]
        self.assertEqual(car["available_seats"], ["3A", "1A", "1C", "2A"])
        self.assertEqual([seat["seat"] for seat in car["seats"]], ["3A", "1A", "1C", "2A"])

    def test_command_seats_available_summary_matches_power_filter(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        raw_train = {"h_trn_no": "009", "h_dpt_dt": "20260328"}
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, raw_train)],
            cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "4"}],
            seats_by_car={
                "05": [
                    {
                        "h_con_seat_no": "1A",
                        "h_seat_no": "001001",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "009",
                        "h_sigl_win_in_dv": "012",
                        "h_dmd_seat_att": "015",
                    },
                    {
                        "h_con_seat_no": "2C",
                        "h_seat_no": "002003",
                        "h_sale_psb_flg": "Y",
                        "h_for_rev_dir_dv": "009",
                        "h_sigl_win_in_dv": "013",
                        "h_dmd_seat_att": "015",
                    },
                ],
            },
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=True,
            power_only=True,
            limit=10,
        )
        output = io.StringIO()

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                ktx_booking.command_seats(args)

        car = json.loads(output.getvalue())["cars"][0]
        self.assertEqual(car["available_seat_count"], 1)
        self.assertEqual(car["available_seats"], ["1A"])
        self.assertEqual([seat["seat"] for seat in car["seats"]], ["1A"])

    def test_command_seats_supports_special_room_and_stale_train_error(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        other = FakeTrain(train_no="011", dep_time="093000", arr_time="120000", label="other")
        client = FakeClient(
            [],
            train_details=[(other, {"h_trn_no": "011"})],
            cars=[{"h_srcar_no": "01", "h_psrm_cl_cd": "2", "h_seat_cnt": "30", "h_rest_seat_cnt": "1"}],
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="special",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_seats(args)

        self.assertIn("train_id", str(exc.exception))

    def test_command_seats_fails_when_requested_car_is_not_available(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, {"h_trn_no": "009"})],
            cars=[{"h_srcar_no": "04", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "9"}],
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=5,
            available_only=False,
            power_only=False,
            limit=10,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_seats(args)

        self.assertIn("car_no 5", str(exc.exception))

    def test_command_seats_fails_when_seat_payload_is_malformed(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, {"h_trn_no": "009"})],
            cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "4"}],
        )
        client.car_seats = lambda *args, **kwargs: {"seat_infos": None}
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_seats(args)

        self.assertIn("seat detail data is unavailable", str(exc.exception))

    def test_command_seats_fails_when_seat_info_key_is_missing(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, {"h_trn_no": "009"})],
            cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "9"}],
        )
        client.car_seats = lambda *args, **kwargs: {"seat_infos": {}}
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_seats(args)

        self.assertIn("seat detail data is unavailable", str(exc.exception))

    def test_command_seats_fails_when_remaining_seats_have_empty_seat_info(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, {"h_trn_no": "009"})],
            cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "9"}],
            seat_payloads_by_car={"05": {"seat_infos": {"seat_info": []}}},
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_seats(args)

        self.assertIn("seat detail data is unavailable", str(exc.exception))

    def test_command_seats_fails_when_seat_info_contains_non_object_entries(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )

        for bad_entry in ["bad", None]:
            with self.subTest(bad_entry=bad_entry):
                client = FakeClient(
                    [],
                    train_details=[(selected, {"h_trn_no": "009"})],
                    cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "9"}],
                    seat_payloads_by_car={"05": {"seat_infos": {"seat_info": [bad_entry]}}},
                )

                with patch.object(ktx_booking, "build_client", return_value=client):
                    with self.assertRaises(SystemExit) as exc:
                        with redirect_stdout(io.StringIO()):
                            ktx_booking.command_seats(args)

                self.assertIn("seat detail data is unavailable", str(exc.exception))

    def test_command_seats_fails_when_remaining_seats_have_only_sentinel_seat_info(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, {"h_trn_no": "009"})],
            cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "9"}],
            seat_payloads_by_car={
                "05": {
                    "seat_infos": {
                        "seat_info": [
                            {"h_con_seat_no": "0A", "h_seat_no": "000000", "h_sale_psb_flg": "N"},
                        ],
                    },
                },
            },
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_seats(args)

        self.assertIn("seat detail data is unavailable", str(exc.exception))

    def test_command_seats_fails_when_seat_info_object_is_missing_required_fields(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )
        malformed_rows = [
            {},
            {"h_seat_no": "001001", "h_sale_psb_flg": "Y"},
            {"h_con_seat_no": "1A", "h_sale_psb_flg": "Y"},
            {"h_con_seat_no": "1A", "h_seat_no": "001001"},
        ]

        for row in malformed_rows:
            with self.subTest(row=row):
                client = FakeClient(
                    [],
                    train_details=[(selected, {"h_trn_no": "009"})],
                    cars=[{"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "9"}],
                    seat_payloads_by_car={"05": {"seat_infos": {"seat_info": [row]}}},
                )

                with patch.object(ktx_booking, "build_client", return_value=client):
                    with self.assertRaises(SystemExit) as exc:
                        with redirect_stdout(io.StringIO()):
                            ktx_booking.command_seats(args)

                self.assertIn("seat detail data is unavailable", str(exc.exception))

    def test_command_seats_allows_empty_seat_info_when_no_remaining_seats(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, {"h_trn_no": "009"})],
            cars=[{"h_srcar_no": 5, "h_psrm_cl_cd": "1", "h_seat_cnt": 48, "h_rest_seat_cnt": 0}],
            seat_payloads_by_car={"5": {"seat_infos": {"seat_info": []}}},
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )
        output = io.StringIO()

        with patch.object(ktx_booking, "build_client", return_value=client):
            with redirect_stdout(output):
                ktx_booking.command_seats(args)

        car = json.loads(output.getvalue())["cars"][0]
        self.assertEqual(car["remaining_seats"], 0)
        self.assertEqual(car["available_seat_count"], 0)
        self.assertEqual(car["seats"], [])

    def test_command_seats_fails_when_car_metadata_is_malformed(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )
        malformed_cars = [
            "bad",
            {"h_srcar_no": "bad", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "9"},
            {"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "bad", "h_rest_seat_cnt": "9"},
            {"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48", "h_rest_seat_cnt": "bad"},
            {"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_rest_seat_cnt": "9"},
            {"h_srcar_no": "05", "h_psrm_cl_cd": "1", "h_seat_cnt": "48"},
        ]

        for raw_car in malformed_cars:
            with self.subTest(raw_car=raw_car):
                client = FakeClient(
                    [],
                    train_details=[(selected, {"h_trn_no": "009"})],
                    cars=[raw_car],
                    seats_by_car={"05": [{"h_con_seat_no": "1A", "h_seat_no": "001001", "h_sale_psb_flg": "Y"}]},
                )

                with patch.object(ktx_booking, "build_client", return_value=client):
                    with self.assertRaises(SystemExit) as exc:
                        with redirect_stdout(io.StringIO()):
                            ktx_booking.command_seats(args)

                self.assertIn("seat car data is unavailable", str(exc.exception))

    def test_command_seats_fails_when_car_data_is_unavailable(self):
        selected = FakeTrain(train_no="009", dep_time="090000", arr_time="113000", label="selected")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient(
            [],
            train_details=[(selected, {"h_trn_no": "009"})],
            cars=[],
        )
        args = argparse.Namespace(
            dep="서울",
            arr="부산",
            date="20260328",
            time="090000",
            adults=1,
            children=0,
            toddlers=0,
            seniors=0,
            train_id=train_id,
            room="general",
            train_type="ktx",
            car_no=None,
            available_only=False,
            power_only=False,
            limit=10,
        )

        with patch.object(ktx_booking, "build_client", return_value=client):
            with self.assertRaises(SystemExit) as exc:
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_seats(args)

        self.assertIn("seat car data is unavailable", str(exc.exception))

    def test_seat_research_endpoints_use_dynapath_sid_boundary(self):
        class FakeEngine:
            def __init__(self):
                self.calls = []

            def generate_token(self, device_id, timestamp_ms, nonce):
                self.calls.append((device_id, timestamp_ms, nonce))
                return "dynapath-token"

        client = ktx_booking.PatchedKorail.__new__(ktx_booking.PatchedKorail)
        client._engine = FakeEngine()
        client._device_id = "device-id"
        client._generate_sid = lambda timestamp_ms: f"sid-{timestamp_ms}"

        for url in (ktx_booking.KORAIL_CARS_INFO, ktx_booking.KORAIL_CAR_DETAIL):
            with self.subTest(url=url):
                with patch.object(ktx_booking.time, "time", return_value=1234.567):
                    with patch.object(ktx_booking.random, "choices", return_value=list("ABCD")):
                        headers, sid = client._auth_headers_and_sid(url)

                self.assertEqual(headers["x-dynapath-m-token"], "dynapath-token")
                self.assertEqual(sid, "sid-1234567")

        self.assertEqual(
            client._engine.calls,
            [("device-id", 1234567, "ABCD"), ("device-id", 1234567, "ABCD")],
        )

    def test_build_parser_has_ncard_commands(self):
        parser = ktx_booking.build_parser()
        help_text = parser.format_help()
        self.assertIn("ncard-list", help_text)
        self.assertIn("ncard-search", help_text)

    def test_ncard_search_parser_accepts_ncard_index(self):
        args = ktx_booking.build_parser().parse_args([
            "ncard-search", "대전", "서울", "20260512", "100000", "--ncard-index", "1",
        ])
        self.assertEqual(args.ncard_index, 1)
        self.assertEqual(args.train_type, "ktx")

    def test_reserve_parser_accepts_ncard_no(self):
        args = ktx_booking.build_parser().parse_args([
            "reserve", "대전", "서울", "20260512", "100000",
            "--train-id", "ktx:v1:test", "--ncard-no", "1234567890123456",
        ])
        self.assertEqual(args.ncard_no, "1234567890123456")

    def test_command_ncard_list_returns_owned_cards(self):
        ncard = FakeNCard()
        client = FakeClient([], ncards=[ncard])
        output = io.StringIO()
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", True):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with redirect_stdout(output):
                    ktx_booking.command_ncard_list(argparse.Namespace())
        result = json.loads(output.getvalue())
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["ncards"][0]["index"], 1)
        self.assertEqual(result["ncards"][0]["card_no"], "************3456")
        self.assertTrue(result["ncards"][0]["card_no_masked"])
        self.assertEqual(result["ncards"][0]["dep_name"], ncard.dep_name)

    def test_command_ncard_search_returns_trains_with_discount_info(self):
        ncard = FakeNCard()
        ncard_train = FakeTrain(
            train_no="009", dep_time="100000", arr_time="105700",
            dep_name="대전", arr_name="서울",
        )
        ncard_train.price = "9900"
        ncard_train.discount_name = "15%할인"
        ncard_train.general_remaining_seats = "023"
        ncard_train.standing_remaining_seats = None
        client = FakeClient([], ncards=[ncard], ncard_trains=[ncard_train])
        args = argparse.Namespace(
            dep="대전", arr="서울", date="20260512", time="100000",
            ncard_index=1, limit=5, train_type="ktx",
        )
        output = io.StringIO()
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", True):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with redirect_stdout(output):
                    ktx_booking.command_ncard_search(args)
        result = json.loads(output.getvalue())
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["trains"][0]["discount_name"], "15%할인")
        self.assertEqual(result["trains"][0]["price"], "9900")
        self.assertEqual(result["ncard"]["card_no"], "************3456")

    def test_command_ncard_search_fails_on_invalid_index(self):
        ncard = FakeNCard()
        client = FakeClient([], ncards=[ncard])
        args = argparse.Namespace(
            dep="대전", arr="서울", date="20260512", time="100000",
            ncard_index=5, limit=5, train_type="ktx",
        )
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", True):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with self.assertRaises(SystemExit):
                    ktx_booking.command_ncard_search(args)

    def test_reserve_parser_accepts_ncard_index(self):
        args = ktx_booking.build_parser().parse_args([
            "reserve", "대전", "서울", "20260512", "100000",
            "--train-id", "ktx:v1:test", "--ncard-index", "1",
        ])
        self.assertEqual(args.ncard_index, 1)

    def test_command_ncard_search_fails_on_zero_index(self):
        ncard = FakeNCard()
        client = FakeClient([], ncards=[ncard])
        args = argparse.Namespace(
            dep="대전", arr="서울", date="20260512", time="100000",
            ncard_index=0, limit=5, train_type="ktx",
        )
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", True):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with self.assertRaises(SystemExit) as exc:
                    ktx_booking.command_ncard_search(args)
        self.assertIn("ncard-index", str(exc.exception))

    def test_command_ncard_list_requires_ncard_package(self):
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", False):
            with self.assertRaises(SystemExit) as exc:
                ktx_booking.command_ncard_list(argparse.Namespace())
        self.assertIn("korail2-ncard", str(exc.exception))

    def test_command_reserve_with_ncard_no_requires_ncard_package(self):
        selected = FakeTrain(train_no="009", dep_time="100000", arr_time="105700",
                             dep_name="대전", arr_name="서울")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        args = self.make_args(train_id, ncard_no="1234567890123456")
        args.ncard_index = None
        client = FakeClient([selected])
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", False):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with self.assertRaises(SystemExit) as exc:
                    ktx_booking.command_reserve(args)
        self.assertIn("korail2-ncard", str(exc.exception))


    def test_command_reserve_with_ncard_no_uses_ncard_passenger(self):
        selected = FakeTrain(train_no="009", dep_time="100000", arr_time="105700",
                             dep_name="대전", arr_name="서울")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient([selected])
        args = self.make_args(train_id, ncard_no="1234567890123456")
        args.ncard_index = None
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", True):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_reserve(args)
        self.assertIsNotNone(client.reserved_passengers)
        self.assertEqual(len(client.reserved_passengers), 1)
        self.assertIsInstance(client.reserved_passengers[0], ktx_booking.NCardPassenger)

    def test_command_reserve_with_ncard_index_uses_owned_card_without_exposing_full_number(self):
        selected = FakeTrain(train_no="009", dep_time="100000", arr_time="105700",
                             dep_name="대전", arr_name="서울")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient([selected], ncards=[FakeNCard()])
        args = self.make_args(train_id)
        args.ncard_index = 1
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", True):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_reserve(args)
        self.assertEqual(client.reserved_passengers[0].card_no, "1234567890123456")

    def test_ncard_unavailable_error_message_is_shared(self):
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", False):
            with self.assertRaises(SystemExit) as exc:
                ktx_booking.ensure_ncard_available()
        self.assertIn("korail2-ncard", str(exc.exception))


class FallbackImportTests(unittest.TestCase):
    def test_module_imports_when_korail2_is_missing(self):
        script_dir = Path(__file__).resolve().parent
        helper = textwrap.dedent(
            """
            import importlib
            import sys

            sys.modules["korail2"] = None
            sys.modules.pop("ktx_booking", None)
            module = importlib.import_module("ktx_booking")

            assert module._KORAIL_IMPORT_ERROR is not None, "expected fallback path"
            assert module.TRAIN_TYPE_MAP["ktx"] == "100"
            assert module.TRAIN_TYPE_MAP["itx-cheongchun"] == "104"
            assert module.TRAIN_TYPE_MAP["itx-saemaeul"] == "101"
            assert module.TRAIN_TYPE_MAP["mugunghwa"] == "102"
            assert module.TRAIN_TYPE_MAP["nuriro"] == "102"
            assert module.TRAIN_TYPE_MAP["tonggeun"] == "103"
            assert module.TRAIN_TYPE_MAP["airport"] == "105"
            assert module.TRAIN_TYPE_MAP["all"] == "109"
            print("ok")
            """
        ).strip()
        env = {
            "PYTHONPATH": str(script_dir),
            "PYTHONNOUSERSITE": "1",
            "PATH": "",
        }
        result = subprocess.run(
            [sys.executable, "-S", "-c", helper],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("ok", result.stdout)

    def test_help_works_when_korail2_is_missing(self):
        script_dir = Path(__file__).resolve().parent
        helper = textwrap.dedent(
            """
            import importlib
            import sys

            sys.modules["korail2"] = None
            sys.modules.pop("ktx_booking", None)
            module = importlib.import_module("ktx_booking")
            parser = module.build_parser()
            help_text = parser.format_help()
            assert "search" in help_text
            assert "reserve" in help_text
            print("ok")
            """
        ).strip()
        env = {
            "PYTHONPATH": str(script_dir),
            "PYTHONNOUSERSITE": "1",
            "PATH": "",
        }
        result = subprocess.run(
            [sys.executable, "-S", "-c", helper],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("ok", result.stdout)


if __name__ == "__main__":
    unittest.main()
