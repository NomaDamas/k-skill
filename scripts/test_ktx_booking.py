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
    valid = "Y"
    segments = []

    def __str__(self):
        return "[N카드] 대전~서울 card-1234"


class FakeClient:
    def __init__(self, trains, search_handler=None, ncards=None, ncard_trains=None):
        self._trains = trains
        self._search_handler = search_handler
        self._ncards = ncards or []
        self._ncard_trains = ncard_trains or []
        self.search_calls = []
        self.reserved_train = None
        self.reserved_passengers = None

    def owned_ncards(self):
        return list(self._ncards)

    def search_owned_ncard_trains(self, ncard, **kwargs):
        return list(self._ncard_trains)

    def search_train(self, *args, **kwargs):
        self.search_calls.append(kwargs)
        if self._search_handler is not None:
            return list(self._search_handler(*args, **kwargs))
        return list(self._trains)

    def reserve(self, train, passengers=None, **kwargs):
        self.reserved_train = train
        self.reserved_passengers = passengers
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
            train_type="ktx",
            include_no_seats=False,
            include_waiting_list=False,
            try_waiting=False,
            ncard_no=None,
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
            self.assertEqual(search_args.train_type, train_type)
            self.assertEqual(reserve_args.train_type, train_type)

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
            "--train-id", "ktx:v1:test",
            "--ncard-no", "1234567890123456",
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
        self.assertEqual(result["ncards"][0]["card_no"], ncard.discount_card_no)
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
        self.assertEqual(result["ncard"]["card_no"], ncard.discount_card_no)

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

    def test_command_reserve_with_ncard_no_uses_ncard_passenger(self):
        selected = FakeTrain(train_no="009", dep_time="100000", arr_time="105700",
                             dep_name="대전", arr_name="서울")
        train_id = ktx_booking.normalize_train(selected, index=1)["train_id"]
        client = FakeClient([selected])
        args = argparse.Namespace(
            dep="대전", arr="서울", date="20260512", time="100000",
            adults=1, children=0, toddlers=0, seniors=0,
            train_id=train_id, seat_option="general-first",
            train_type="ktx", include_no_seats=False,
            include_waiting_list=False, try_waiting=False,
            ncard_no="1234567890123456",
        )
        with patch.object(ktx_booking, "_NCARD_AVAILABLE", True):
            with patch.object(ktx_booking, "build_client", return_value=client):
                with redirect_stdout(io.StringIO()):
                    ktx_booking.command_reserve(args)
        self.assertIsNotNone(client.reserved_passengers)
        self.assertEqual(len(client.reserved_passengers), 1)
        self.assertIsInstance(client.reserved_passengers[0], ktx_booking.NCardPassenger)


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
            assert "ncard-list" in help_text
            assert "ncard-search" in help_text
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
