import json
import unittest
from unittest import mock

from scripts.ticket_availability import (
    HEADERS_INTERPARK,
    HEADERS_YES24,
    INTERPARK_BASE,
    YES24_BASE,
    InterparkClient,
    Yes24Client,
    _fmt_date,
    _fmt_time,
    parse_url,
)


class ParseUrlTest(unittest.TestCase):
    def test_yes24_full_url(self):
        self.assertEqual(
            parse_url("https://ticket.yes24.com/Perf/58026"),
            ("yes24", "58026"),
        )

    def test_yes24_detail_view_url(self):
        self.assertEqual(
            parse_url("https://ticket.yes24.com/New/Perf/Detail/View/58026"),
            ("yes24", "58026"),
        )

    def test_yes24_shorthand(self):
        self.assertEqual(parse_url("yes24:58026"), ("yes24", "58026"))

    def test_interpark_full_url(self):
        self.assertEqual(
            parse_url("https://tickets.interpark.com/goods/26000541"),
            ("interpark", "26000541"),
        )

    def test_interpark_shorthand(self):
        self.assertEqual(
            parse_url("interpark:26000541"), ("interpark", "26000541")
        )

    def test_bare_digits_requires_platform_prefix(self):
        with self.assertRaisesRegex(ValueError, "플랫폼"):
            parse_url("26000541")

    def test_unrecognized_url_raises(self):
        with self.assertRaisesRegex(ValueError, "인식할 수 없습니다"):
            parse_url("https://example.com/foo")


class FormatHelpersTest(unittest.TestCase):
    def test_fmt_date_yyyymmdd(self):
        self.assertEqual(_fmt_date("20260513"), "2026-05-13")

    def test_fmt_date_passes_through_non_yyyymmdd(self):
        self.assertEqual(_fmt_date("2026-05-13"), "2026-05-13")
        self.assertEqual(_fmt_date(""), "")

    def test_fmt_time_hhmm(self):
        self.assertEqual(_fmt_time("1430"), "14:30")

    def test_fmt_time_passes_through_non_hhmm(self):
        self.assertEqual(_fmt_time("14:30"), "14:30")
        self.assertEqual(_fmt_time(""), "")


class Yes24ClientTest(unittest.TestCase):
    def test_get_dates_normalizes_dashed_response_and_filters_past(self):
        client = Yes24Client.__new__(Yes24Client)
        client.http = mock.Mock()
        client.http.post.return_value = mock.Mock(
            text="2099-12-16,2099-12-17,",
            raise_for_status=lambda: None,
        )

        dates = client._dates("58026", month_count=1)

        self.assertEqual(dates, ["20991216", "20991217"])
        called_url = client.http.post.call_args.args[0]
        self.assertIn("axPerfDay.aspx", called_url)

    def test_get_dates_filters_dates_before_today(self):
        client = Yes24Client.__new__(Yes24Client)
        client.http = mock.Mock()
        client.http.post.return_value = mock.Mock(
            text="1999-01-01,2099-12-16,",
            raise_for_status=lambda: None,
        )

        dates = client._dates("58026", month_count=1)

        self.assertEqual(dates, ["20991216"])

    def test_get_seats_parses_remain_count(self):
        client = Yes24Client.__new__(Yes24Client)
        client.http = mock.Mock()
        client.http.post.return_value = mock.Mock(
            text='<dt>R석</dt><dd>110,000원<span class="">(잔여:5석)</span></dd>'
                 '<dt>S석</dt><dd>80,000원<span>(잔여:12석)</span></dd>',
            raise_for_status=lambda: None,
        )

        seats = client.get_seats("1432397")

        self.assertEqual(
            seats,
            [
                {"grade": "R석", "price": "110,000원", "remain": 5},
                {"grade": "S석", "price": "80,000원", "remain": 12},
            ],
        )

    def test_get_seats_fallback_when_no_dt_dd_structure(self):
        client = Yes24Client.__new__(Yes24Client)
        client.http = mock.Mock()
        client.http.post.return_value = mock.Mock(
            text="<span>(잔여:2석)</span>",
            raise_for_status=lambda: None,
        )

        seats = client.get_seats("1432397")

        self.assertEqual(seats, [{"grade": "좌석1", "price": "", "remain": 2}])


class InterparkClientTest(unittest.TestCase):
    def test_get_schedule_returns_data_field(self):
        client = InterparkClient.__new__(InterparkClient)
        client.http = mock.Mock()
        client.http.get.return_value = mock.Mock(
            json=lambda: {
                "common": {"message": "success"},
                "data": [
                    {"playDate": "20260513", "playTime": "1430", "playSeq": "055"}
                ],
            },
            raise_for_status=lambda: None,
        )

        result = client.get_schedule("26000541")

        self.assertEqual(
            result,
            [{"playDate": "20260513", "playTime": "1430", "playSeq": "055"}],
        )
        called_url = client.http.get.call_args.args[0]
        self.assertIn("/v1/goods/26000541/playSeq", called_url)

    def test_get_seats_extracts_remain_seat(self):
        client = InterparkClient.__new__(InterparkClient)
        client.http = mock.Mock()
        client.http.get.return_value = mock.Mock(
            json=lambda: {
                "data": {
                    "remainSeat": [
                        {"seatGradeName": "VIP석", "remainCnt": 150},
                        {"seatGradeName": "R석", "remainCnt": 36},
                    ]
                }
            },
            raise_for_status=lambda: None,
        )

        seats = client.get_seats("26000541", "055")

        self.assertEqual(
            seats,
            [
                {"seatGradeName": "VIP석", "remainCnt": 150},
                {"seatGradeName": "R석", "remainCnt": 36},
            ],
        )

    def test_schedule_normalizes_date_and_time_format(self):
        client = InterparkClient.__new__(InterparkClient)
        client.http = mock.Mock()
        client.http.get.return_value = mock.Mock(
            json=lambda: {
                "data": [
                    {"playDate": "20260513", "playTime": "1430", "playSeq": "055"}
                ],
            },
            raise_for_status=lambda: None,
        )

        out = client.schedule("26000541")

        self.assertEqual(
            out,
            [{"date": "2026-05-13", "time": "14:30", "play_seq": "055"}],
        )


class EndpointSafetyTest(unittest.TestCase):
    def test_no_login_or_auth_headers(self):
        for hdr in (HEADERS_YES24, HEADERS_INTERPARK):
            self.assertNotIn("Cookie", hdr)
            self.assertNotIn("Authorization", hdr)
            self.assertNotIn("X-Auth-Token", hdr)

    def test_bases_are_known_public_hosts(self):
        self.assertEqual(YES24_BASE, "https://ticket.yes24.com")
        self.assertEqual(INTERPARK_BASE, "https://api-ticketfront.interpark.com")


if __name__ == "__main__":
    unittest.main()
