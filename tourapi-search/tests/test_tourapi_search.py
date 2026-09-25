import importlib.util
import io
import json
import pathlib
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "tourapi-search" / "scripts" / "tourapi_search.py"
SPEC = importlib.util.spec_from_file_location("tourapi_search", MODULE_PATH)
tourapi_search = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(tourapi_search)


class FakeResponse:
    """urlopen이 돌려주는 응답 객체를 흉내낸다."""

    def __init__(self, payload):
        if isinstance(payload, (bytes, bytearray)):
            self._data = bytes(payload)
        else:
            self._data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class FakeUrlopen:
    """요청 URL을 기록하고 responder(url)의 payload를 돌려준다."""

    def __init__(self, responder):
        self.responder = responder
        self.urls = []

    def __call__(self, request, timeout=None):
        self.urls.append(request.full_url)
        return FakeResponse(self.responder(request.full_url))


def success_payload(items, total=None, page=1, num_of_rows=10):
    if isinstance(items, dict):
        items_block = {"item": items}
    elif items:
        items_block = {"item": items}
    else:
        items_block = ""
    return {
        "response": {
            "header": {"resultCode": "0000", "resultMsg": "OK"},
            "body": {
                "items": items_block,
                "numOfRows": num_of_rows,
                "pageNo": page,
                "totalCount": len(items) if total is None else total,
            },
        }
    }


def list_item(content_id="126508", title="불국사", content_type_id="12"):
    return {
        "contentid": content_id,
        "contenttypeid": content_type_id,
        "title": title,
        "addr1": "경북 경주시 불국로 385",
        "addr2": "",
        "zipcode": "38127",
        "tel": "054-746-9913",
        "mapx": "129.3321",
        "mapy": "35.7901",
        "areacode": "35",
        "sigungucode": "2",
        "firstimage": "https://example.com/big.jpg",
        "firstimage2": "https://example.com/small.jpg",
        "modifiedtime": "20260101120000",
    }


def gateway_error_payload(code, message="오류"):
    return {
        "OpenAPI_ServiceResponse": {
            "cmmMsgHeader": {"errMsg": message, "returnAuthMsg": message, "returnReasonCode": code}
        }
    }


class ServiceKeyTest(unittest.TestCase):
    def test_reads_skill_env_key(self):
        self.assertEqual(
            tourapi_search.service_key_from_env({"KSKILL_TOURAPI_KEY": "abc"}),
            "abc",
        )

    def test_falls_back_to_data_go_kr_key(self):
        self.assertEqual(
            tourapi_search.service_key_from_env({"DATA_GO_KR_API_KEY": "xyz"}),
            "xyz",
        )

    def test_returns_none_without_any_key(self):
        self.assertIsNone(tourapi_search.service_key_from_env({}))

    def test_does_not_read_local_secret_files(self):
        # helper 소스에 dotenv/시크릿 파일 접근이 없어야 한다(환경변수 전용).
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertNotIn("expanduser", source)
        self.assertNotIn("read_text", source)
        self.assertNotIn("import pathlib", source)
        self.assertNotIn("load_dotenv", source)

    def test_normalizes_decoding_key(self):
        self.assertEqual(
            tourapi_search.normalize_service_key("a+b/c="),
            "a%2Bb%2Fc%3D",
        )

    def test_keeps_already_encoded_key(self):
        self.assertEqual(
            tourapi_search.normalize_service_key("a%2Bb%2Fc%3D"),
            "a%2Bb%2Fc%3D",
        )

    def test_empty_key_raises(self):
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.normalize_service_key("  ")


class BuildUrlTest(unittest.TestCase):
    def test_puts_service_key_and_common_params(self):
        url = tourapi_search.build_url(
            "searchKeyword2",
            {"keyword": "불국사", "numOfRows": "5", "MobileOS": "ETC", "_type": "json"},
            "TESTKEY",
        )
        self.assertTrue(url.startswith("https://apis.data.go.kr/B551011/KorService2/searchKeyword2?"))
        self.assertIn("serviceKey=TESTKEY", url)
        self.assertIn("MobileOS=ETC", url)
        self.assertIn("_type=json", url)
        self.assertIn("keyword=%EB%B6%88%EA%B5%AD%EC%82%AC", url)

    def test_skips_none_params(self):
        url = tourapi_search.build_url("areaBasedList2", {"areaCode": None, "pageNo": "1"}, "K")
        self.assertNotIn("areaCode", url)
        self.assertIn("pageNo=1", url)


class CheckResponseTest(unittest.TestCase):
    def test_gateway_error_raises_with_code(self):
        with self.assertRaises(tourapi_search.TourApiError) as ctx:
            tourapi_search.check_response(gateway_error_payload("30"))
        self.assertEqual(ctx.exception.code, "30")
        self.assertIn("등록되지 않은 인증키", str(ctx.exception))

    def test_quota_error_is_explicit(self):
        with self.assertRaises(tourapi_search.TourApiError) as ctx:
            tourapi_search.check_response(gateway_error_payload("22"))
        self.assertIn("호출 허용량", str(ctx.exception))

    def test_non_zero_result_code_raises(self):
        payload = {"response": {"header": {"resultCode": "22", "resultMsg": "LIMIT"}, "body": {}}}
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.check_response(payload)

    def test_ok_response_returned(self):
        payload = success_payload([list_item()])
        self.assertIs(tourapi_search.check_response(payload), payload["response"])

    def test_missing_response_body_raises(self):
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.check_response({"unexpected": True})


class ExtractItemsTest(unittest.TestCase):
    def test_list_of_items(self):
        response = success_payload([list_item("1"), list_item("2")])
        items, total = tourapi_search.extract_items(response["response"])
        self.assertEqual([i["contentid"] for i in items], ["1", "2"])
        self.assertEqual(total, 2)

    def test_single_item_object(self):
        response = success_payload(list_item("9"))
        items, total = tourapi_search.extract_items(response["response"])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["contentid"], "9")

    def test_empty_items_string(self):
        response = success_payload([])
        items, total = tourapi_search.extract_items(response["response"])
        self.assertEqual(items, [])
        self.assertEqual(total, 0)


class NormalizeItemTest(unittest.TestCase):
    def test_joins_address_and_maps_coordinates(self):
        item = tourapi_search.normalize_item(list_item())
        self.assertEqual(item["address"], "경북 경주시 불국로 385")
        self.assertAlmostEqual(item["lat"], 35.7901)
        self.assertAlmostEqual(item["lon"], 129.3321)
        self.assertEqual(item["content_type"], "관광지")
        self.assertEqual(item["title"], "불국사")

    def test_zero_coordinates_become_none(self):
        raw = list_item()
        raw["mapx"] = "0"
        raw["mapy"] = ""
        item = tourapi_search.normalize_item(raw)
        self.assertIsNone(item["lat"])
        self.assertIsNone(item["lon"])

    def test_addr2_is_appended(self):
        raw = list_item()
        raw["addr1"] = "경북 경주시"
        raw["addr2"] = "불국로 385"
        self.assertEqual(tourapi_search.normalize_item(raw)["address"], "경북 경주시 불국로 385")


class ResolveCodesTest(unittest.TestCase):
    def test_content_type_names_and_ids(self):
        self.assertEqual(tourapi_search.resolve_content_type("관광지"), "12")
        self.assertEqual(tourapi_search.resolve_content_type("축제"), "15")
        self.assertEqual(tourapi_search.resolve_content_type("39"), "39")

    def test_unknown_content_type_raises(self):
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.resolve_content_type("우주정거장")

    def test_area_code_names_and_ids(self):
        self.assertEqual(tourapi_search.resolve_area_code("제주"), "39")
        self.assertEqual(tourapi_search.resolve_area_code("1"), "1")

    def test_unknown_area_raises(self):
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.resolve_area_code("화성")

    def test_normalize_date(self):
        self.assertEqual(tourapi_search.normalize_date("20261001", "--start-date"), "20261001")
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.normalize_date("2026-10-01", "--start-date")


class KeywordRunTest(unittest.TestCase):
    def test_sends_keyword_and_filters(self):
        fake = FakeUrlopen(lambda url: success_payload([list_item(), list_item("2", "석굴암")]))
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(
                ["keyword", "불국사", "--content-type", "관광지", "--area-code", "제주", "--limit", "5"]
            )
            result = tourapi_search.execute(args, "TESTKEY")

        self.assertEqual(len(fake.urls), 1)
        url = fake.urls[0]
        self.assertIn("searchKeyword2", url)
        self.assertIn("keyword=%EB%B6%88%EA%B5%AD%EC%82%AC", url)
        self.assertIn("contentTypeId=12", url)
        self.assertIn("areaCode=39", url)
        self.assertIn("numOfRows=5", url)
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["items"][0]["title"], "불국사")

    def test_limit_above_cap_raises(self):
        args = tourapi_search.parse_args(["keyword", "불국사", "--limit", "101"])
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.run_list("keyword", args, "TESTKEY", 20)

    def test_bad_arrange_raises(self):
        args = tourapi_search.parse_args(["area", "--arrange", "Z"])
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.run_list("area", args, "TESTKEY", 20)


class AreaAndStayTest(unittest.TestCase):
    def test_area_uses_area_based_list(self):
        fake = FakeUrlopen(lambda url: success_payload([list_item()], total=1))
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(["area", "--area-code", "제주", "--content-type", "39"])
            result = tourapi_search.execute(args, "TESTKEY")

        self.assertIn("areaBasedList2", fake.urls[0])
        self.assertIn("areaCode=39", fake.urls[0])
        self.assertIn("contentTypeId=39", fake.urls[0])
        self.assertEqual(result["items"][0]["title"], "불국사")

    def test_unknown_area_name_raises(self):
        args = tourapi_search.parse_args(["area", "--area-code", "경주"])
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.execute(args, "TESTKEY")

    def test_stay_uses_search_stay(self):
        fake = FakeUrlopen(lambda url: success_payload([list_item("7", "호텔", "32")], total=1))
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(["stay", "--area-code", "경북"])
            result = tourapi_search.execute(args, "TESTKEY")

        self.assertIn("searchStay2", fake.urls[0])
        self.assertIn("areaCode=35", fake.urls[0])
        self.assertEqual(result["items"][0]["content_type"], "숙박")


class FestivalRunTest(unittest.TestCase):
    def test_festival_sends_event_dates(self):
        fake = FakeUrlopen(lambda url: success_payload([list_item()], total=1))
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(
                ["festival", "--start-date", "20261001", "--end-date", "20261031", "--area-code", "서울"]
            )
            tourapi_search.execute(args, "TESTKEY")

        url = fake.urls[0]
        self.assertIn("searchFestival2", url)
        self.assertIn("eventStartDate=20261001", url)
        self.assertIn("eventEndDate=20261031", url)
        self.assertIn("areaCode=1", url)

    def test_bad_start_date_raises(self):
        args = tourapi_search.parse_args(["festival", "--start-date", "2026/10/01"])
        with self.assertRaises(tourapi_search.TourApiError):
            tourapi_search.execute(args, "TESTKEY")

    def test_start_date_is_required(self):
        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                tourapi_search.parse_args(["festival"])


class DetailRunTest(unittest.TestCase):
    def _responder(self, url):
        if "detailCommon2" in url:
            common = list_item()
            common["overview"] = "불국사는 신라 시대의 사찰이다."
            return success_payload(common)
        if "detailIntro2" in url:
            return success_payload({"contentid": "126508", "contenttypeid": "12", "usetime": "09:00~18:00", "restdate": "연중무휴"})
        if "detailImage2" in url:
            return success_payload(
                [
                    {"originimgurl": "https://example.com/1.jpg", "smallimageurl": "https://example.com/1s.jpg", "imgname": "대웅전"},
                    {"originimgurl": "https://example.com/2.jpg", "smallimageurl": "https://example.com/2s.jpg", "imgname": "석탑"},
                ]
            )
        raise AssertionError(f"unexpected url: {url}")

    def test_detail_merges_operations(self):
        fake = FakeUrlopen(self._responder)
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(["detail", "126508", "--images", "2"])
            result = tourapi_search.execute(args, "TESTKEY")

        operations = [url.split("/KorService2/")[1].split("?")[0] for url in fake.urls]
        self.assertEqual(operations, ["detailCommon2", "detailIntro2", "detailImage2"])
        self.assertIn("contentTypeId=12", fake.urls[1])
        item = result["item"]
        self.assertEqual(item["title"], "불국사")
        self.assertEqual(item["overview"], "불국사는 신라 시대의 사찰이다.")
        self.assertEqual(item["intro"]["usetime"], "09:00~18:00")
        self.assertNotIn("contentid", item["intro"])
        self.assertEqual(len(item["images"]), 2)
        self.assertEqual(item["images"][0]["name"], "대웅전")

    def test_detail_missing_common_raises(self):
        fake = FakeUrlopen(lambda url: success_payload([]))
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(["detail", "404"])
            with self.assertRaises(tourapi_search.TourApiError):
                tourapi_search.execute(args, "TESTKEY")


class HttpErrorTest(unittest.TestCase):
    def test_gateway_error_propagates(self):
        fake = FakeUrlopen(lambda url: gateway_error_payload("30"))
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(["keyword", "불국사"])
            with self.assertRaises(tourapi_search.TourApiError) as ctx:
                tourapi_search.execute(args, "TESTKEY")
        self.assertEqual(ctx.exception.code, "30")

    def test_non_json_response_raises(self):
        fake = FakeUrlopen(lambda url: b"<OpenAPI_ServiceResponse>...</OpenAPI_ServiceResponse>")
        with mock.patch("urllib.request.urlopen", fake):
            args = tourapi_search.parse_args(["keyword", "불국사"])
            with self.assertRaises(tourapi_search.TourApiError):
                tourapi_search.execute(args, "TESTKEY")

    def test_http_error_with_gateway_body_maps_reason(self):
        # 실제 게이트웨이는 잘못된 키에 HTTP 403 + GW 오류 JSON을 함께 돌려준다.
        error = urllib.error.HTTPError(
            "https://apis.data.go.kr",
            403,
            "Forbidden",
            {},
            io.BytesIO(json.dumps(gateway_error_payload("30")).encode("utf-8")),
        )
        with mock.patch("urllib.request.urlopen", mock.Mock(side_effect=error)):
            args = tourapi_search.parse_args(["keyword", "불국사"])
            with self.assertRaises(tourapi_search.TourApiError) as ctx:
                tourapi_search.execute(args, "TESTKEY")
        self.assertEqual(ctx.exception.code, "30")
        self.assertIn("등록되지 않은 인증키", str(ctx.exception))

    def test_http_error_without_gateway_body_is_generic(self):
        error = urllib.error.HTTPError(
            "https://apis.data.go.kr", 500, "Server Error", {}, io.BytesIO(b"upstream down")
        )
        with mock.patch("urllib.request.urlopen", mock.Mock(side_effect=error)):
            args = tourapi_search.parse_args(["keyword", "불국사"])
            with self.assertRaises(tourapi_search.TourApiError) as ctx:
                tourapi_search.execute(args, "TESTKEY")
        self.assertIn("HTTP 500", str(ctx.exception))


class MainCliTest(unittest.TestCase):
    def test_missing_key_fails_with_message(self):
        with mock.patch.object(tourapi_search, "service_key_from_env", return_value=None):
            stderr = io.StringIO()
            with redirect_stderr(stderr):
                code = tourapi_search.main(["keyword", "불국사"])
        self.assertEqual(code, 1)
        self.assertIn("TourAPI 서비스키", stderr.getvalue())

    def test_json_output_is_parseable(self):
        fake = FakeUrlopen(lambda url: success_payload([list_item()], total=1))
        stdout = io.StringIO()
        with mock.patch("urllib.request.urlopen", fake), \
                mock.patch.object(tourapi_search, "service_key_from_env", return_value="TESTKEY"):
            with redirect_stdout(stdout):
                code = tourapi_search.main(["keyword", "불국사", "--json"])

        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["items"][0]["title"], "불국사")
        self.assertNotIn("TESTKEY", stdout.getvalue())

    def test_dry_run_redacts_key_and_skips_network(self):
        def explode(url):
            raise AssertionError("dry-run must not call the network")

        with mock.patch("urllib.request.urlopen", FakeUrlopen(explode)), \
                mock.patch.object(tourapi_search, "service_key_from_env", return_value="SUPERSECRET"):
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                code = tourapi_search.main(["keyword", "불국사", "--dry-run"])

        self.assertEqual(code, 0)
        output = stdout.getvalue()
        self.assertIn("REDACTED", output)
        self.assertNotIn("SUPERSECRET", output)
        self.assertIn("searchKeyword2", output)


class FormatOutputTest(unittest.TestCase):
    def test_list_format_reports_source_and_items(self):
        result = {
            "command": "keyword",
            "operation": "searchKeyword2",
            "total": 1,
            "page": 1,
            "limit": 10,
            "items": [tourapi_search.normalize_item(list_item())],
        }
        text = tourapi_search.format_output(result)
        self.assertIn("불국사", text)
        self.assertIn("TourAPI", text)
        self.assertIn("여행 추천이 아니다", text)

    def test_empty_list_does_not_invent_places(self):
        result = {
            "command": "keyword",
            "operation": "searchKeyword2",
            "total": 0,
            "page": 1,
            "limit": 10,
            "items": [],
        }
        text = tourapi_search.format_output(result)
        self.assertIn("없다", text)


if __name__ == "__main__":
    unittest.main()
