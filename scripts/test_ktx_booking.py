import argparse
import io
import unittest
from contextlib import redirect_stdout
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


class FakeClient:
    def __init__(self, trains, search_handler=None):
        self._trains = trains
        self._search_handler = search_handler
        self.search_calls = []
        self.reserved_train = None

    def search_train(self, *args, **kwargs):
        self.search_calls.append(kwargs)
        if self._search_handler is not None:
            return list(self._search_handler(*args, **kwargs))
        return list(self._trains)

    def reserve(self, train, **kwargs):
        self.reserved_train = train
        return FakeReservation()


class KtxBookingTests(unittest.TestCase):
    def make_args(self, train_id):
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
            include_no_seats=False,
            include_waiting_list=False,
            try_waiting=False,
        )

    def test_normalize_train_emits_stable_train_id(self):
        train = FakeTrain(train_no="009", dep_time="090000", arr_time="113000")

        normalized = ktx_booking.normalize_train(train, index=2)

        self.assertIn("train_id", normalized)
        resolved = ktx_booking.find_train_by_id([train], normalized["train_id"])
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


if __name__ == "__main__":
    unittest.main()
