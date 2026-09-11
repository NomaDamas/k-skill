import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "religious-facility-search" / "scripts" / "religious_facility_search.py"
SPEC = importlib.util.spec_from_file_location("religious_facility_search", MODULE_PATH)
religious_facility_search = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(religious_facility_search)


def document(place_id, name, category_name, x="127.03798269392448", y="37.49635271552635",
             distance="", road="", jibun="", phone="", place_url=None):
    return {
        "id": place_id,
        "place_name": name,
        "category_name": category_name,
        "category_group_code": "",
        "category_group_name": "",
        "x": x,
        "y": y,
        "distance": distance,
        "road_address_name": road,
        "address_name": jibun,
        "phone": phone,
        "place_url": place_url or f"https://place.map.kakao.com/{place_id}",
    }


ANCHOR_RESPONSE = {
    "documents": [
        document("16343529", "강남역 2호선", "교통,수송 > 지하철,전철 > 수도권2호선",
                 x="127.02800140627488", y="37.49808633653005"),
    ],
    "meta": {"total_count": 1, "is_end": True, "pageable_count": 1},
}

CHURCH_DOC = document(
    "85095074", "강남성서침례교회", "문화,예술 > 종교 > 기독교 > 교회",
    distance="313", road="서울 서초구 강남대로55길 9-11", jibun="서울 서초구 서초동 1327-28",
    phone="02-3474-3609",
)
SECOND_CHURCH_DOC = document(
    "26994829", "소망잇는교회", "문화,예술 > 종교 > 기독교 > 교회",
    distance="372", road="서울 강남구 강남대로78길 24", jibun="서울 강남구 역삼동 824-22",
)
CATHEDRAL_DOC = document(
    "10327558", "명동대성당 파밀리아채플", "문화,예술 > 종교 > 천주교 > 성당",
    distance="31", road="서울 중구 명동길 74", phone="",
)
SUBWAY_NOISE_DOC = document(
    "1834060109", "써브웨이 명동성당점", "음식점 > 패스트푸드 > 샌드위치 > 써브웨이",
    distance="14", road="서울 중구 명동길 55",
)
GENERIC_RELIGION_DOC = document(
    "771227219", "명동성당 꼬스트홀", "문화,예술 > 종교 > 종교시설",
    distance="57", road="서울 중구 명동길 74",
)
MISSION_DOC = document(
    "1260008236", "KAM선교회", "문화,예술 > 종교 > 기독교 > 선교회",
    distance="294", road="서울 강남구 강남대로98길 16",
)


class SearchEndpointTest(unittest.TestCase):
    """proxy keyword 검색 호출이 올바른 파라미터로 나가는지 고정한다."""

    def test_search_places_uses_distance_sort_and_radius(self):
        captured = {}

        def fake_fetch(url, as_json=True):
            captured["url"] = url
            return ANCHOR_RESPONSE

        with mock.patch.object(religious_facility_search, "fetch_json", side_effect=fake_fetch):
            religious_facility_search.search_places("교회", x=127.0, y=37.5, radius=500)

        self.assertIn("/v1/kakao-map/search/keyword", captured["url"])
        self.assertIn("sort=distance", captured["url"])
        self.assertIn("radius=500", captured["url"])
        self.assertIn("size=15", captured["url"])

    def test_search_places_without_anchor_sends_accuracy_sort(self):
        captured = {}

        def fake_fetch(url, as_json=True):
            captured["url"] = url
            return ANCHOR_RESPONSE

        with mock.patch.object(religious_facility_search, "fetch_json", side_effect=fake_fetch):
            religious_facility_search.search_places("온누리교회")

        self.assertNotIn("sort=distance", captured["url"])
        self.assertNotIn("radius=", captured["url"])

    def test_search_places_pages_until_is_end(self):
        pages = {
            1: {"documents": [CHURCH_DOC], "meta": {"is_end": False, "total_count": 2}},
            2: {"documents": [SECOND_CHURCH_DOC], "meta": {"is_end": True, "total_count": 2}},
        }

        def fake_fetch(url, as_json=True):
            page = int(next(p.split("=")[1] for p in url.split("&") if p.startswith("page=")))
            return pages[page]

        with mock.patch.object(religious_facility_search, "fetch_json", side_effect=fake_fetch):
            docs, meta = religious_facility_search.search_places("교회", x=127.0, y=37.5, radius=2000)

        self.assertEqual([d["place_name"] for d in docs], ["강남성서침례교회", "소망잇는교회"])

    def test_empty_search_raises_explicit_failure(self):
        with mock.patch.object(religious_facility_search, "fetch_json",
                               return_value={"documents": [], "meta": {"is_end": True, "total_count": 0}}):
            with self.assertRaises(religious_facility_search.LookupError_):
                religious_facility_search.search_places("없는검색어")


class MapPlaceTest(unittest.TestCase):
    def test_maps_document_fields(self):
        place = religious_facility_search.map_place(CHURCH_DOC)

        self.assertEqual(place["id"], "85095074")
        self.assertEqual(place["name"], "강남성서침례교회")
        self.assertEqual(place["category"], "교회")
        self.assertEqual(place["denomination"], "기독교")
        self.assertEqual(place["category_group"], "종교")
        self.assertEqual(place["lat"], 37.49635271552635)
        self.assertEqual(place["lon"], 127.03798269392448)
        self.assertEqual(place["address"], "서울 서초구 강남대로55길 9-11")
        self.assertEqual(place["phone"], "02-3474-3609")
        self.assertEqual(place["distance_m"], 313)
        self.assertIsNone(place["homepage"])

    def test_falls_back_to_jibun_address(self):
        doc = document("1", "산속기도원", "문화,예술 > 종교 > 기독교 > 기도원",
                       road="", jibun="경기 어딘가 산 1-1")
        self.assertEqual(religious_facility_search.map_place(doc)["address"], "경기 어딘가 산 1-1")

    def test_missing_distance_stays_none(self):
        doc = document("1", "온누리교회", "문화,예술 > 종교 > 기독교 > 교회", distance="")
        self.assertIsNone(religious_facility_search.map_place(doc)["distance_m"])


class MatchesTypeTest(unittest.TestCase):
    def test_rejects_non_religion_category(self):
        place = religious_facility_search.map_place(SUBWAY_NOISE_DOC)
        self.assertFalse(religious_facility_search.matches_type(place, "교회"))
        self.assertFalse(religious_facility_search.matches_type(place, "전체"))

    def test_accepts_church_for_church_type(self):
        place = religious_facility_search.map_place(CHURCH_DOC)
        self.assertTrue(religious_facility_search.matches_type(place, "교회"))

    def test_rejects_cathedral_for_church_type(self):
        place = religious_facility_search.map_place(CATHEDRAL_DOC)
        self.assertFalse(religious_facility_search.matches_type(place, "교회"))

    def test_temple_aliases_share_results(self):
        temple = religious_facility_search.map_place(
            document("2", "법장사", "문화,예술 > 종교 > 불교 > 절,사찰"))
        self.assertTrue(religious_facility_search.matches_type(temple, "절"))
        self.assertTrue(religious_facility_search.matches_type(temple, "사찰"))

    def test_all_type_accepts_any_religion_facility(self):
        self.assertTrue(religious_facility_search.matches_type(
            religious_facility_search.map_place(CATHEDRAL_DOC), "전체"))
        self.assertTrue(religious_facility_search.matches_type(
            religious_facility_search.map_place(GENERIC_RELIGION_DOC), "전체"))

    def test_generic_religion_facility_not_in_specific_types(self):
        place = religious_facility_search.map_place(GENERIC_RELIGION_DOC)
        self.assertFalse(religious_facility_search.matches_type(place, "교회"))
        self.assertFalse(religious_facility_search.matches_type(place, "성당"))

    def test_mission_org_is_not_a_church(self):
        place = religious_facility_search.map_place(MISSION_DOC)
        self.assertEqual(place["category"], "선교회")
        self.assertFalse(religious_facility_search.matches_type(place, "교회"))
        self.assertTrue(religious_facility_search.matches_type(place, "전체"))


class ResolveAnchorTest(unittest.TestCase):
    def test_uses_first_keyword_result_as_anchor(self):
        with mock.patch.object(religious_facility_search, "search_places",
                               return_value=(ANCHOR_RESPONSE["documents"], ANCHOR_RESPONSE["meta"])):
            anchor = religious_facility_search.resolve_anchor("강남역")

        self.assertEqual(anchor["name"], "강남역 2호선")
        self.assertAlmostEqual(anchor["lat"], 37.49808633653005)
        self.assertAlmostEqual(anchor["lon"], 127.02800140627488)

    def test_returns_none_when_location_not_found(self):
        with mock.patch.object(religious_facility_search, "search_places",
                               side_effect=religious_facility_search.LookupError_("빈 결과")):
            self.assertIsNone(religious_facility_search.resolve_anchor("없는동네"))


class CollectTest(unittest.TestCase):
    def test_filters_noise_and_keeps_distance_order(self):
        docs = [SUBWAY_NOISE_DOC, CATHEDRAL_DOC, GENERIC_RELIGION_DOC]
        with mock.patch.object(religious_facility_search, "search_places",
                               return_value=(docs, {"is_end": True})):
            scanned, matched, places = religious_facility_search.collect("성당", "전체", None, None, 5)

        self.assertEqual(scanned, 3)
        self.assertEqual(matched, 2)
        self.assertEqual([p["name"] for p in places], ["명동대성당 파밀리아채플", "명동성당 꼬스트홀"])

    def test_specific_type_keeps_only_matching_denomination(self):
        docs = [SUBWAY_NOISE_DOC, CATHEDRAL_DOC, GENERIC_RELIGION_DOC]
        with mock.patch.object(religious_facility_search, "search_places",
                               return_value=(docs, {"is_end": True})):
            _, matched, places = religious_facility_search.collect("성당", "성당", None, None, 5)

        self.assertEqual(matched, 1)
        self.assertEqual(places[0]["name"], "명동대성당 파밀리아채플")

    def test_reports_matched_count_not_displayed_count(self):
        docs = [CHURCH_DOC, SECOND_CHURCH_DOC]
        with mock.patch.object(religious_facility_search, "search_places",
                               return_value=(docs, {"is_end": True})):
            _, matched, places = religious_facility_search.collect("교회", "교회", None, None, 1)

        self.assertEqual(matched, 2, "필터를 통과한 수는 표시 수에 잘리면 안 된다")
        self.assertEqual(len(places), 1)


class CollectAllTypeTest(unittest.TestCase):
    def test_all_type_merges_queries_and_tolerates_empty_token(self):
        def fake_search(query, **kwargs):
            if query == "성당":
                raise religious_facility_search.LookupError_("빈 결과")
            if query == "교회":
                return [CHURCH_DOC], {"is_end": True}
            return [document("9", "법장사", "문화,예술 > 종교 > 불교 > 절,사찰", distance="500")], {"is_end": True}

        anchor = {"name": "성수역", "lat": 37.5446, "lon": 127.0559}
        with mock.patch.object(religious_facility_search, "search_places", side_effect=fake_search):
            scanned, matched, places = religious_facility_search.collect("전체", "전체", anchor, None, 5)

        self.assertEqual(scanned, 2)
        self.assertEqual(matched, 2)
        self.assertEqual([p["name"] for p in places], ["강남성서침례교회", "법장사"])

    def test_all_type_raises_when_every_token_is_empty(self):
        with mock.patch.object(religious_facility_search, "search_places",
                               side_effect=religious_facility_search.LookupError_("빈 결과")):
            with self.assertRaises(religious_facility_search.LookupError_):
                religious_facility_search.collect("전체", "전체", None, None, 5)

    def test_all_type_dedupes_shared_places(self):
        shared = document("7", "겸임사찰", "문화,예술 > 종교 > 불교 > 절,사찰", distance="100")
        with mock.patch.object(religious_facility_search, "search_places",
                               return_value=([shared], {"is_end": True})):
            scanned, matched, places = religious_facility_search.collect("전체", "전체", None, None, 5)

        self.assertEqual(scanned, 3, "세 쿼리 합산 스캔 수")
        self.assertEqual(matched, 1, "같은 장소는 한 번만 센다")


class FormatReportTest(unittest.TestCase):
    def test_reports_anchor_and_worship_time_caveat(self):
        anchor = {"name": "강남역 2호선", "lat": 37.49809, "lon": 127.02800}
        places = [{
            "name": "강남성서침례교회", "category": "교회", "denomination": "기독교",
            "address": "서울 서초구 강남대로55길 9-11", "distance_m": 313,
            "phone": "02-3474-3609", "homepage": None,
            "place_url": "https://place.map.kakao.com/85095074",
        }]

        report = religious_facility_search.format_report("교회", anchor, 15, 1, places, "교회")

        self.assertIn("강남역 2호선", report)
        self.assertIn("강남성서침례교회", report)
        self.assertIn("약 313m", report)
        self.assertIn("예배", report)

    def test_reports_matched_and_displayed_counts(self):
        places = [{"name": "강남성서침례교회", "category": "교회", "denomination": "기독교",
                   "address": "서울 서초구", "distance_m": 313, "phone": None, "homepage": None,
                   "place_url": "https://place.map.kakao.com/1"}]

        report = religious_facility_search.format_report("교회", None, 15, 9, places, "교회")

        self.assertIn("종교시설 9건", report)
        self.assertIn("가까운 1건 표시", report)

    def test_reports_empty_result_without_inventing_places(self):
        report = religious_facility_search.format_report("교회", None, 15, 0, [], "교회")

        self.assertIn("찾지 못했다", report)
        self.assertNotIn("지도 https://", report)


if __name__ == "__main__":
    unittest.main()
