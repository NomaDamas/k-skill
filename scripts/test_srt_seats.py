from __future__ import annotations

import unittest

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

MISSING_DETAIL_HTML = "\n".join([
    '<a href="#none" onclick="selectSeatInfo(this, \'41\', \'9A\'); return false;">9A<strong><em>()</em></strong></a>',
])


class SrtSeatParserTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
