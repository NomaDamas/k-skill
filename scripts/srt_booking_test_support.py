from __future__ import annotations


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
