#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import random
import string
import sys
import time
from functools import reduce

import requests
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from korail2 import (
    AdultPassenger,
    ChildPassenger,
    Korail,
    KorailError,
    NeedToLoginError,
    NoResultsError,
    Passenger,
    ReserveOption,
    SeniorPassenger,
    SoldOutError,
    ToddlerPassenger,
    TrainType,
)
import korail2.korail2 as korail_mod

DEFAULT_USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 13; SM-S928N Build/UP1A.231005.007)"
DYNAPATH_PATHS = [
    "/classes/com.korail.mobile.certification.TicketReservation",
    "/classes/com.korail.mobile.nonMember.NonMemTicket",
    "/classes/com.korail.mobile.seatMovie.ScheduleView",
    "/classes/com.korail.mobile.seatMovie.ScheduleViewSpecial",
    "/classes/com.korail.mobile.trn.prcFare.do",
    "/classes/com.korail.mobile.login.Login",
]
RESERVE_OPTION_MAP = {
    "general-first": ReserveOption.GENERAL_FIRST,
    "general-only": ReserveOption.GENERAL_ONLY,
    "special-first": ReserveOption.SPECIAL_FIRST,
    "special-only": ReserveOption.SPECIAL_ONLY,
}
TRAIN_ID_PREFIX = "ktx:v1:"
TRAIN_ID_INVALID_MESSAGE = "train_id is invalid; rerun search and copy a fresh train_id"
TRAIN_ID_STALE_MESSAGE = "train_id no longer matches any current search result; rerun search and choose a fresh train_id"
TRAIN_ID_FIELDS = (
    "train_no",
    "dep_date",
    "dep_time",
    "arr_date",
    "arr_time",
    "run_date",
    "train_group",
    "dep_code",
    "arr_code",
)


class DynaPathMasterEngine:
    APP_ID = "com.korail.talk"
    AS_VALUE = "%5B38ff229cb34c7dda8e28220a2d750cce%5D"
    DEVICE_MODEL = "SM-S928N"
    OS_TYPE = "Android"
    SDK_VERSION = "v1"

    def __init__(self) -> None:
        self.table = "3FE9jgRD4KdCyuawklqGJYmvfMn15P7US8XbxeLQtWT6OicBAopINs2Vh0HZrz"
        self.i8 = 161
        self.i9 = 30
        self.i10 = 2
        self.app_start_ts = str(int(time.time() * 1000))

    def string2xa1s(self, data: str) -> list[int]:
        result: list[int] = []
        idx = 0
        while idx < len(data):
            codepoint = ord(data[idx])
            idx += 1
            if codepoint < 128:
                result.append(codepoint)
            elif codepoint < 2048:
                result.append(128 | ((codepoint >> 7) & 15))
                result.append(codepoint & 127)
            elif codepoint >= 262144:
                result.append(160)
                result.append((codepoint >> 14) & 127)
                result.append((codepoint >> 7) & 127)
                result.append(codepoint & 127)
            elif (63488 & codepoint) != 55296:
                result.append(((codepoint >> 14) & 15) | 144)
                result.append((codepoint >> 7) & 127)
                result.append(codepoint & 127)
        return result

    def make_key(self, key: str) -> int:
        total = 0
        for char in key:
            codepoint = ord(char)
            bit = 32768
            for _ in range(16):
                if bit & codepoint:
                    break
                bit >>= 1
            total = (total * (bit << 1)) + codepoint
        return total

    def internal_char(self, base_table: str, remainder: int, current: str) -> str:
        seen = 0
        for char in base_table:
            if char in current:
                continue
            if seen == remainder:
                return char
            seen += 1
        return " "

    def make_encode_table(self, number: int, encode_size: int, base_table: str) -> str:
        chars = ""
        temp = number
        for index in range(encode_size):
            divisor = encode_size - index
            remainder = temp % divisor
            chars += self.internal_char(base_table, remainder, chars)
            temp //= divisor
        return chars

    def encode_normal_be(self, data: str, table: str) -> str:
        values = self.string2xa1s(data)
        output: list[str] = []
        digits = [0] * (self.i10 + 1)
        idx = 0
        tail = len(values) % self.i10
        body_size = len(values) - tail
        while idx < body_size:
            value = 0
            for _ in range(self.i10):
                value = (value * self.i8) + values[idx]
                idx += 1
            for digit_index in range(self.i10 + 1):
                digits[digit_index] = value % self.i9
                value //= self.i9
            for digit_index in range(self.i10, -1, -1):
                output.append(table[digits[digit_index]])
        if tail > 0:
            value = 0
            for _ in range(tail):
                value = (value * self.i8) + values[idx]
                idx += 1
            for digit_index in range(tail + 1):
                digits[digit_index] = value % self.i9
                value //= self.i9
            while tail >= 0:
                output.append(table[digits[tail]])
                tail -= 1
        return "".join(output)

    def generate_token(self, device_id: str, timestamp_ms: int, nonce: str) -> str:
        plaintext = (
            f"ai={self.APP_ID}&di={device_id}&as={self.AS_VALUE}&su=false&dbg=false&emu=false&hk=false"
            f"&it={self.app_start_ts}&ts={timestamp_ms}&rt=0&os=13&dm={self.DEVICE_MODEL}&st={self.OS_TYPE}&sv={self.SDK_VERSION}"
        )
        dyn_key = f"v1+{nonce}+{timestamp_ms}"
        key_encoded = self.encode_normal_be(dyn_key, self.table)
        table = self.make_encode_table(self.make_key(dyn_key), self.i9, self.table)
        body_encoded = self.encode_normal_be(plaintext, table)
        return f"bEeEP{self.table[len(key_encoded)]}{key_encoded}{body_encoded}"


class PatchedKorail(Korail):
    _device = "AD"
    _version = "250601002"
    _sid_key = b"2485dd54d9deaa36"
    _device_id = "558a4f02041657ea"

    def __init__(self, korail_id: str, korail_pw: str, auto_login: bool = True, want_feedback: bool = False):
        self._session = requests.session()
        self._session.headers.update({"User-Agent": DEFAULT_USER_AGENT})
        self._engine = DynaPathMasterEngine()
        super().__init__(korail_id, korail_pw, auto_login=False, want_feedback=want_feedback)
        self._session.headers.update({"User-Agent": DEFAULT_USER_AGENT})
        if auto_login:
            self.login(korail_id, korail_pw)

    def _generate_sid(self, timestamp_ms: int) -> str:
        plaintext = f"{self._device}{timestamp_ms}".encode("utf-8")
        cipher = AES.new(self._sid_key, AES.MODE_CBC, iv=self._sid_key)
        return base64.b64encode(cipher.encrypt(pad(plaintext, 16))).decode("utf-8") + "\n"

    def _auth_headers_and_sid(self, url: str) -> tuple[dict[str, str], str | None]:
        headers: dict[str, str] = {}
        sid = None
        if any(path in url for path in DYNAPATH_PATHS):
            timestamp_ms = int(time.time() * 1000)
            nonce = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
            headers["x-dynapath-m-token"] = self._engine.generate_token(self._device_id, timestamp_ms, nonce)
            sid = self._generate_sid(timestamp_ms)
        return headers, sid

    def login(self, korail_id: str | None = None, korail_pw: str | None = None) -> bool:
        if korail_id is None:
            korail_id = self.korail_id
        else:
            self.korail_id = korail_id

        if korail_pw is None:
            korail_pw = self.korail_pw
        else:
            self.korail_pw = korail_pw

        if korail_mod.EMAIL_REGEX.match(korail_id):
            input_flag = "5"
        elif korail_mod.PHONE_NUMBER_REGEX.match(korail_id):
            input_flag = "4"
        else:
            input_flag = "2"

        headers, sid = self._auth_headers_and_sid(korail_mod.KORAIL_LOGIN)
        payload = {
            "Device": self._device,
            "Version": self._version,
            "txtInputFlg": input_flag,
            "txtMemberNo": korail_id,
            "txtPwd": self._Korail__enc_password(korail_pw),
            "idx": self._idx,
        }
        if sid:
            payload["Sid"] = sid

        response = self._session.post(korail_mod.KORAIL_LOGIN, data=payload, headers=headers)
        data = json.loads(response.text)
        if data["strResult"] == "SUCC" and data.get("strMbCrdNo") is not None:
            self._key = data["Key"]
            self.membership_number = data["strMbCrdNo"]
            self.name = data["strCustNm"]
            self.email = data["strEmailAdr"]
            self.logined = True
            return True

        self.logined = False
        return False

    def search_train(
        self,
        dep: str,
        arr: str,
        date: str | None = None,
        time_value: str | None = None,
        train_type: str = TrainType.ALL,
        passengers: list[Passenger] | None = None,
        include_no_seats: bool = False,
        include_waiting_list: bool = False,
    ):
        kst_now = korail_mod.datetime.now(korail_mod.timezone.utc) + korail_mod.timedelta(hours=9)
        if date is None:
            date = kst_now.strftime("%Y%m%d")
        if time_value is None:
            time_value = kst_now.strftime("%H%M%S")
        if passengers is None:
            passengers = [AdultPassenger()]

        passengers = Passenger.reduce(passengers)
        adult_count = reduce(lambda total, passenger: total + passenger.count, [p for p in passengers if isinstance(p, AdultPassenger)], 0)
        child_count = reduce(lambda total, passenger: total + passenger.count, [p for p in passengers if isinstance(p, ChildPassenger)], 0)
        toddler_count = reduce(
            lambda total, passenger: total + passenger.count,
            [p for p in passengers if isinstance(p, ToddlerPassenger)],
            0,
        )
        senior_count = reduce(lambda total, passenger: total + passenger.count, [p for p in passengers if isinstance(p, SeniorPassenger)], 0)

        headers, sid = self._auth_headers_and_sid(korail_mod.KORAIL_SEARCH_SCHEDULE)
        payload = {
            "Device": self._device,
            "radJobId": "1",
            "selGoTrain": train_type,
            "txtCardPsgCnt": "0",
            "txtGdNo": "",
            "txtGoAbrdDt": date,
            "txtGoEnd": arr,
            "txtGoHour": time_value,
            "txtGoStart": dep,
            "txtJobDv": "",
            "txtMenuId": "11",
            "txtPsgFlg_1": adult_count,
            "txtPsgFlg_2": child_count,
            "txtPsgFlg_8": toddler_count,
            "txtPsgFlg_3": senior_count,
            "txtPsgFlg_4": "0",
            "txtPsgFlg_5": "0",
            "txtSeatAttCd_2": "000",
            "txtSeatAttCd_3": "000",
            "txtSeatAttCd_4": "015",
            "txtTrnGpCd": train_type,
            "Version": self._version,
        }
        if sid:
            payload["Sid"] = sid

        response = self._session.post(korail_mod.KORAIL_SEARCH_SCHEDULE, params=payload, headers=headers)
        data = json.loads(response.text)
        if self._result_check(data):
            trains = [korail_mod.Train(info) for info in data["trn_infos"]["trn_info"]]
            trains = [train for train in trains if train.dep_name == dep and train.arr_name == arr]
            filters = [lambda train: train.has_seat()]
            if include_no_seats:
                filters.append(lambda train: not train.has_seat())
            if include_waiting_list:
                filters.append(lambda train: train.has_waiting_list())
            trains = [train for train in trains if any(check(train) for check in filters)]
            if not trains:
                raise NoResultsError()
            return trains

    def reserve(self, train, passengers=None, option=ReserveOption.GENERAL_FIRST, try_waiting=False):
        reserving_seat = True
        try:
            if not train.has_seat():
                raise SoldOutError()
            if option == ReserveOption.GENERAL_ONLY:
                if train.has_general_seat():
                    seat_type = "1"
                else:
                    raise SoldOutError()
            elif option == ReserveOption.SPECIAL_ONLY:
                if train.has_special_seat():
                    seat_type = "2"
                else:
                    raise SoldOutError()
            elif option == ReserveOption.GENERAL_FIRST:
                seat_type = "1" if train.has_general_seat() else "2"
            elif option == ReserveOption.SPECIAL_FIRST:
                seat_type = "2" if train.has_special_seat() else "1"
            else:
                raise ValueError(f"unsupported reserve option: {option}")
        except SoldOutError:
            if try_waiting and option != ReserveOption.SPECIAL_ONLY and train.has_general_waiting_list():
                reserving_seat = False
                seat_type = "1"
            else:
                raise

        if passengers is None:
            passengers = [AdultPassenger()]

        passengers = Passenger.reduce(passengers)
        passenger_count = reduce(lambda total, passenger: total + passenger.count, passengers, 0)
        headers, sid = self._auth_headers_and_sid(korail_mod.KORAIL_TICKETRESERVATION)
        payload = {
            "Device": self._device,
            "Version": self._version,
            "Key": self._key,
            "txtGdNo": "",
            "txtJobId": "1101" if reserving_seat else "1102",
            "txtTotPsgCnt": passenger_count,
            "txtSeatAttCd1": "000",
            "txtSeatAttCd2": "000",
            "txtSeatAttCd3": "000",
            "txtSeatAttCd4": "015",
            "txtSeatAttCd5": "000",
            "hidFreeFlg": "N",
            "txtStndFlg": "N",
            "txtMenuId": "11",
            "txtSrcarCnt": "0",
            "txtJrnyCnt": "1",
            "txtJrnySqno1": "001",
            "txtJrnyTpCd1": "11",
            "txtDptDt1": train.dep_date,
            "txtDptRsStnCd1": train.dep_code,
            "txtDptTm1": train.dep_time,
            "txtArvRsStnCd1": train.arr_code,
            "txtTrnNo1": train.train_no,
            "txtRunDt1": train.run_date,
            "txtTrnClsfCd1": train.train_type,
            "txtPsrmClCd1": seat_type,
            "txtTrnGpCd1": train.train_group,
            "txtChgFlg1": "",
            "txtJrnySqno2": "",
            "txtJrnyTpCd2": "",
            "txtDptDt2": "",
            "txtDptRsStnCd2": "",
            "txtDptTm2": "",
            "txtArvRsStnCd2": "",
            "txtTrnNo2": "",
            "txtRunDt2": "",
            "txtTrnClsfCd2": "",
            "txtPsrmClCd2": "",
            "txtChgFlg2": "",
        }
        if sid:
            payload["Sid"] = sid

        for index, passenger in enumerate(passengers, start=1):
            payload.update(passenger.get_dict(index))

        response = self._session.get(korail_mod.KORAIL_TICKETRESERVATION, params=payload, headers=headers)
        data = json.loads(response.text)
        if self._result_check(data):
            reservation_id = data["h_pnr_no"]
            matches = [reservation for reservation in self.reservations() if reservation.rsv_id == reservation_id]
            if len(matches) == 1:
                return matches[0]
            raise KorailError(f"reservation {reservation_id} was created but could not be reloaded")

    def reservations(self):
        payload = {"Device": self._device, "Version": self._version, "Key": self._key}
        response = self._session.get(korail_mod.KORAIL_MYRESERVATIONLIST, params=payload)
        data = json.loads(response.text)
        try:
            if self._result_check(data):
                return [
                    korail_mod.Reservation(train_info)
                    for journey in data["jrny_infos"]["jrny_info"]
                    for train_info in journey["train_infos"]["train_info"]
                ]
        except NoResultsError:
            return []
        return []

    def cancel(self, reservation):
        assert isinstance(reservation, korail_mod.Reservation)
        payload = {
            "Device": self._device,
            "Version": self._version,
            "Key": self._key,
            "txtPnrNo": reservation.rsv_id,
            "txtJrnySqno": reservation.journey_no,
            "txtJrnyCnt": reservation.journey_cnt,
            "hidRsvChgNo": reservation.rsv_chg_no,
        }
        response = self._session.get(korail_mod.KORAIL_CANCEL, params=payload)
        data = json.loads(response.text)
        if self._result_check(data):
            return True
        return False


def parse_passengers(args: argparse.Namespace) -> list[Passenger]:
    passengers: list[Passenger] = []
    if args.adults:
        passengers.append(AdultPassenger(args.adults))
    if args.children:
        passengers.append(ChildPassenger(args.children))
    if args.toddlers:
        passengers.append(ToddlerPassenger(args.toddlers))
    if args.seniors:
        passengers.append(SeniorPassenger(args.seniors))
    if not passengers:
        passengers.append(AdultPassenger())
    return passengers


def build_train_id_payload(train) -> dict[str, str]:
    return {field: getattr(train, field) for field in TRAIN_ID_FIELDS}


def build_train_id(train) -> str:
    payload = json.dumps(build_train_id_payload(train), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    return f"{TRAIN_ID_PREFIX}{encoded}"


def parse_train_id(train_id: str) -> dict[str, str]:
    if not train_id.startswith(TRAIN_ID_PREFIX):
        raise SystemExit("train_id must start with ktx:v1:")
    encoded = train_id.removeprefix(TRAIN_ID_PREFIX)
    padded = encoded + ("=" * ((4 - len(encoded) % 4) % 4))
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise SystemExit(TRAIN_ID_INVALID_MESSAGE) from exc
    if not isinstance(payload, dict):
        raise SystemExit(TRAIN_ID_INVALID_MESSAGE)
    invalid_fields = [field for field in TRAIN_ID_FIELDS if not isinstance(payload.get(field), str) or not payload[field]]
    if invalid_fields:
        raise SystemExit(TRAIN_ID_INVALID_MESSAGE)
    return {field: payload[field] for field in TRAIN_ID_FIELDS}


def find_train_by_id(trains, train_id: str):
    expected = parse_train_id(train_id)
    for train in trains:
        if build_train_id_payload(train) == expected:
            return train
    return None


def normalize_train(train, index: int) -> dict[str, object]:
    return {
        "index": index,
        "train_id": build_train_id(train),
        "train_no": train.train_no,
        "train_type": train.train_type_name,
        "dep_name": train.dep_name,
        "dep_date": train.dep_date,
        "dep_time": train.dep_time,
        "arr_name": train.arr_name,
        "arr_date": train.arr_date,
        "arr_time": train.arr_time,
        "has_general_seat": train.has_general_seat(),
        "has_special_seat": train.has_special_seat(),
        "has_waiting_list": train.has_waiting_list(),
        "description": str(train),
    }


def normalize_reservation(reservation) -> dict[str, object]:
    return {
        "reservation_id": reservation.rsv_id,
        "train_no": reservation.train_no,
        "train_type": reservation.train_type_name,
        "dep_name": reservation.dep_name,
        "dep_date": reservation.dep_date,
        "dep_time": reservation.dep_time,
        "arr_name": reservation.arr_name,
        "arr_date": reservation.arr_date,
        "arr_time": reservation.arr_time,
        "seat_count": reservation.seat_no_count,
        "price": reservation.price,
        "buy_limit_date": reservation.buy_limit_date,
        "buy_limit_time": reservation.buy_limit_time,
        "journey_no": reservation.journey_no,
        "journey_cnt": reservation.journey_cnt,
        "rsv_chg_no": reservation.rsv_chg_no,
        "description": str(reservation),
    }


def print_json(payload: dict[str, object]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def build_client() -> PatchedKorail:
    korail_id = os.environ.get("KSKILL_KTX_ID")
    korail_pw = os.environ.get("KSKILL_KTX_PASSWORD")
    if not korail_id or not korail_pw:
        raise SystemExit(
            "이 작업에는 KSKILL_KTX_ID, KSKILL_KTX_PASSWORD 가 필요합니다. "
            "값을 채팅창에 붙여 넣지 말고 ~/.config/k-skill/secrets.env.plain 에 직접 채운 뒤 "
            "sops 로 ~/.config/k-skill/secrets.env 로 암호화해 주세요."
        )
    client = PatchedKorail(korail_id, korail_pw)
    if not client.logined:
        raise NeedToLoginError()
    return client


def command_search(args: argparse.Namespace) -> None:
    client = build_client()
    passengers = parse_passengers(args)
    trains = client.search_train(
        args.dep,
        args.arr,
        args.date,
        args.time,
        train_type=TrainType.KTX,
        passengers=passengers,
        include_no_seats=args.include_no_seats,
        include_waiting_list=args.include_waiting_list,
    )
    visible_trains = trains[: args.limit]
    print_json({
        "count": len(visible_trains),
        "trains": [normalize_train(train, index) for index, train in enumerate(visible_trains, start=1)],
    })


def command_reserve(args: argparse.Namespace) -> None:
    client = build_client()
    passengers = parse_passengers(args)
    include_waiting_list = args.include_waiting_list or args.try_waiting
    trains = client.search_train(
        args.dep,
        args.arr,
        args.date,
        args.time,
        train_type=TrainType.KTX,
        passengers=passengers,
        include_no_seats=args.include_no_seats,
        include_waiting_list=include_waiting_list,
    )
    selected_train = find_train_by_id(trains, args.train_id)
    if selected_train is None:
        raise SystemExit(TRAIN_ID_STALE_MESSAGE)
    reservation = client.reserve(
        selected_train,
        passengers=passengers,
        option=RESERVE_OPTION_MAP[args.seat_option],
        try_waiting=args.try_waiting,
    )
    print_json({"reservation": normalize_reservation(reservation)})


def command_reservations(_: argparse.Namespace) -> None:
    client = build_client()
    reservations = client.reservations()
    print_json({
        "count": len(reservations),
        "reservations": [normalize_reservation(reservation) for reservation in reservations],
    })


def command_cancel(args: argparse.Namespace) -> None:
    client = build_client()
    reservations = client.reservations()
    match = next((reservation for reservation in reservations if reservation.rsv_id == args.reservation_id), None)
    if match is None:
        raise SystemExit(f"reservation {args.reservation_id} not found")
    client.cancel(match)
    print_json({"cancelled": True, "reservation_id": args.reservation_id})


def add_common_trip_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("dep", help="출발역")
    parser.add_argument("arr", help="도착역")
    parser.add_argument("date", help="출발일 YYYYMMDD")
    parser.add_argument("time", help="희망 시작 시각 HHMMSS")
    parser.add_argument("--adults", type=int, default=1, help="성인 수")
    parser.add_argument("--children", type=int, default=0, help="어린이 수")
    parser.add_argument("--toddlers", type=int, default=0, help="유아 수")
    parser.add_argument("--seniors", type=int, default=0, help="경로 수")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Patched KTX/Korail booking helper for k-skill")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search", help="KTX 열차를 조회합니다")
    add_common_trip_args(search_parser)
    search_parser.add_argument("--limit", type=int, default=5, help="출력할 최대 열차 수")
    search_parser.add_argument("--include-no-seats", action="store_true", help="매진 열차도 포함")
    search_parser.add_argument("--include-waiting-list", action="store_true", help="예약 대기 가능 열차도 포함")
    search_parser.set_defaults(func=command_search)

    reserve_parser = subparsers.add_parser("reserve", help="조회 결과 중 하나를 예약합니다")
    add_common_trip_args(reserve_parser)
    reserve_parser.add_argument("--train-id", required=True, help="search 결과에서 복사한 stable train_id")
    reserve_parser.add_argument("--seat-option", choices=sorted(RESERVE_OPTION_MAP), default="general-first")
    reserve_parser.add_argument("--include-no-seats", action="store_true", help="검색 시 매진 열차도 포함")
    reserve_parser.add_argument("--include-waiting-list", action="store_true", help="검색 시 예약대기 열차도 포함")
    reserve_parser.add_argument(
        "--try-waiting",
        action="store_true",
        help="좌석이 없으면 예약대기를 시도 (reserve 재조회 시 예약대기 열차 자동 포함)",
    )
    reserve_parser.set_defaults(func=command_reserve)

    reservations_parser = subparsers.add_parser("reservations", help="현재 예약 목록을 조회합니다")
    reservations_parser.set_defaults(func=command_reservations)

    cancel_parser = subparsers.add_parser("cancel", help="예약번호로 예약을 취소합니다")
    cancel_parser.add_argument("reservation_id", help="취소할 예약번호")
    cancel_parser.set_defaults(func=command_cancel)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except (KorailError, NeedToLoginError, NoResultsError, SoldOutError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
