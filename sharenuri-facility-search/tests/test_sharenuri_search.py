import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
HELPER_PATH = SCRIPT_DIR.parent / "scripts" / "sharenuri_search.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("sharenuri_search", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load helper from {HELPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["sharenuri_search"] = module
    spec.loader.exec_module(module)
    return module


helper = load_helper()

SEARCH_FRAGMENT_HTML = '<script type="text/javascript">\n$(document).ready(function() {\n        advJqPagination("divPagenationrsrc", 10, 5828, 0, function(pageIdx){ fnExcuteUnifiedSearch(pageIdx-1);});\n});\n</script>\n<div class="tabWrap">\n    <p class="num">\n        총 <span>5,828</span>건\n    </p>\n    <div id="resource_cate1">\n        <ul class="srchList imgList v2">\n            <!--목록이 없는경우-->\n            <!--목록이 있는 경우-->\n            <li>\n                <!--  이미지영역 [s]  -->\n\t\t\t    <p class="thumbImg"><img src="/UserPortal/Upv/195815/fileDetail.do?file_sn=1" alt="충남문화관광재단 2층 중회의실" /></p>\n                <!-- 이미지 영역 [e] -->\n                <div class="info">\n\t\t\t\t\t<strong>\n\t\t\t\t\t<a class="sbj_txt" href="#none" onclick="fnNewPageResourceDetail(\'CPS001.002\', \'FF20O3200420\'); " title="충남문화관광재단 2층 중<!HS>회의실<!HE> 새창열림">충남문화관광재단 2층 중<span class=\'s_keyword\'>회의실</span></a>\n\t\t\t\t\t</strong>\n                    <div class="box">\n                    <ul class="infoList">\n                        <li>\n                            <strong>자원 분류</strong>\n                            <span class="c1">시설·공간(대관) > <span class=\'s_keyword\'>회의실</span> > <span class=\'s_keyword\'>회의실</span></span>\n                        </li>\n                        <li>\n                            <strong>위치 정보</strong>\n                            <span class="c1">충남 예산군 삽교읍 예학로 10-22</span>\n                        </li>\n                        <li>\n                            <strong>이용 요금</strong>\n                            <span>무료</span>\n                        </li>\n                    </ul>\n                    <div class="btnWrap">\n                        <a href="#none" class="btn green" onclick="fnNewPageResourceDetail(\'CPS001.002\',\'FF20O3200420\');" title="충남문화관광재단 2층 중<!HS>회의실<!HE> 새창열림">\n                            <i class="pc_txt"><span class="sr-only">충남문화관광재단 2층 중<!HS>회의실<!HE></span>예약·문의하기</i>\n                        </a>\n                        <a href="#" class="iconBtn mapView" onclick="javascript:fnRsrcMapSearch(\'FF20O3200420\'); return false;" title="충남문화관광재단 2층 중<!HS>회의실<!HE> 새창열림">\n                            <span class="sr-only">충남문화관광재단 2층 중<!HS>회의실<!HE></span>지도 보기\n                        </a>\n                    </div>\n                    </div>\n                </div>\n            </li>\n            <li>\n                <!--  이미지영역 [s]  -->\n\t\t\t    <p class="thumbImg"><img src="/UserPortal/Upv/195815/fileDetail.do?file_sn=1" alt="인천삼산월드체육관(1층 회의실)" /></p>\n                <!-- 이미지 영역 [e] -->\n                <div class="info">\n\t\t\t\t\t<strong>\n\t\t\t\t\t<a class="sbj_txt" href="#none" onclick="fnNewPageResourceDetail(\'CPS001.002\', \'BA10A0011303\'); " title="인천삼산월드체육관(1층 <!HS>회의실<!HE>) 새창열림">인천삼산월드체육관(1층 <span class=\'s_keyword\'>회의실</span>)</a>\n\t\t\t\t\t</strong>\n                    <div class="box">\n                    <ul class="infoList">\n                        <li>\n                            <strong>자원 분류</strong>\n                            <span class="c1">시설·공간(대관) > <span class=\'s_keyword\'>회의실</span> > <span class=\'s_keyword\'>회의실</span></span>\n                        </li>\n                        <li>\n                            <strong>위치 정보</strong>\n                            <span class="c1">인천 부평구 체육관로 60 (삼산동)</span>\n                        </li>\n                        <li>\n                            <strong>이용 요금</strong>\n                            <span>20,000 원</span>\n                        </li>\n                    </ul>\n                    <div class="btnWrap">\n                        <a href="#none" class="btn green" onclick="fnNewPageResourceDetail(\'CPS001.002\',\'BA10A0011303\');" title="인천삼산월드체육관(1층 <!HS>회의실<!HE>) 새창열림">\n                            <i class="pc_txt"><span class="sr-only">인천삼산월드체육관(1층 <!HS>회의실<!HE>)</span>예약·문의하기</i>\n                        </a>\n                    </div>\n                    </div>\n                </div>\n            </li>\n        </ul>\n    </div>\n</div>\n'

SEARCH_EMPTY_HTML = '<div class="tabWrap">\n    <p class="num">\n        총 <span>0</span>건\n    </p>\n    <div id="resource_cate1">\n        <ul class="srchList imgList v2">\n            <!--목록이 없는경우-->\n            <li class="noData">검색 결과가 없습니다.</li>\n        </ul>\n    </div>\n</div>\n'

DETAIL_PAGE_HTML = '<html><body>\n<div class="info_box clearfix" style="margin-top:15px;">\n   <div class="inner">\n\t\t<div class="form_table smMultiColBreak">\n\t\t\t<table>\n\t\t\t\t<tbody>\n\t\t\t\t\t<tr>\n\t\t\t\t\t\t<th scope="row">자원 분류</th>\n\t\t\t\t\t\t<td data-cell-header="자원 분류">\n\t\t\t\t\t\t\t시설·공간(대관) > 회의실 > 회의실\n\t\t\t\t\t\t\t&nbsp;\n\t\t\t\t\t\t</td>\n\t\t\t\t\t\t<th scope="row">자원 명칭</th>\n\t\t\t\t\t\t<td data-cell-header="자원 명칭">\n\t\t\t\t\t\t\t충남문화관광재단 2층 중회의실\n\t\t\t\t\t\t\t&nbsp;\n\t\t\t\t\t\t</td>\n\t\t\t\t\t</tr>\n\t\t\t\t\t<tr>\n\t\t\t\t\t\t<th scope="row">장소/위치</th>\n\t\t\t\t\t\t<td data-cell-header="장소/위치">\n\t\t\t\t\t\t\t충남 예산군 삽교읍 예학로 10-22 2층 충남문화관광재단\n                            <button type="button" class="btn xsm bg_blue02" title="지도보기">지도보기</button>\n\t\t\t\t\t\t</td>\n\t\t\t\t\t\t<th scope="row">제공 기관</th>\n\t\t\t\t\t\t<td data-cell-header="제공 기관">\n\t\t\t\t\t\t\t재단법인충남문화관광재단\n\t\t\t\t\t\t\t&nbsp;\n\t\t\t\t\t\t</td>\n\t\t\t\t\t</tr>\n\t\t\t\t\t<tr>\n\t\t\t\t\t\t<th scope="row">예약 방법</th>\n\t\t\t\t\t\t<td data-cell-header="예약 방법">온라인 직접 예약</td>\n\t\t\t\t\t\t<th scope="row">예약 문의</th>\n\t\t\t\t\t\t<td data-cell-header="예약 문의">041-630-2956 &nbsp;</td>\n\t\t\t\t\t</tr>\n\t\t\t\t\t<tr>\n\t\t\t\t\t\t<th scope="row">이용 요금</th>\n\t\t\t\t\t\t<td data-cell-header="이용 요금">무료</td>\n\t\t\t\t\t\t<th scope="row">미니 홈페이지</th>\n\t\t\t\t\t\t<td data-cell-header="미니 홈페이지">--> 방문하기</td>\n\t\t\t\t\t</tr>\n\t\t\t\t</tbody>\n\t\t\t</table>\n\t\t</div>\n   </div>\n</div>\n</body></html>\n'


class ParseSearchFragmentTest(unittest.TestCase):
    def test_parses_total_and_items(self):
        parsed = helper.parse_search_fragment(SEARCH_FRAGMENT_HTML)
        self.assertEqual(parsed["total_count"], 5828)
        self.assertEqual(len(parsed["items"]), 2)

    def test_item_fields(self):
        item = helper.parse_search_fragment(SEARCH_FRAGMENT_HTML)["items"][0]
        self.assertEqual(item["rsrc_dcd"], "CPS001.002")
        self.assertEqual(item["rsrc_no"], "FF20O3200420")
        self.assertEqual(item["title"], "충남문화관광재단 2층 중 회의실")
        self.assertEqual(item["category"], "시설·공간(대관) > 회의실 > 회의실")
        self.assertEqual(item["location"], "충남 예산군 삽교읍 예학로 10-22")
        self.assertEqual(item["fee"], "무료")
        self.assertEqual(
            item["detail_url"],
            "https://www.eshare.go.kr/UserPortal/Upv/UprResrcFacl/index.do"
            "?rsrc_no=FF20O3200420&rsrc_dcd=CPS001.002",
        )

    def test_paid_item_fee(self):
        item = helper.parse_search_fragment(SEARCH_FRAGMENT_HTML)["items"][1]
        self.assertEqual(item["fee"], "20,000 원")
        self.assertEqual(item["title"], "인천삼산월드체육관(1층 회의실 )")

    def test_empty_result(self):
        parsed = helper.parse_search_fragment(SEARCH_EMPTY_HTML)
        self.assertEqual(parsed["total_count"], 0)
        self.assertEqual(parsed["items"], [])


class ParseDetailPageTest(unittest.TestCase):
    def test_fields(self):
        fields = helper.parse_detail_page(DETAIL_PAGE_HTML)
        self.assertEqual(fields["자원 명칭"], "충남문화관광재단 2층 중회의실")
        self.assertEqual(fields["제공 기관"], "재단법인충남문화관광재단")
        self.assertEqual(fields["예약 방법"], "온라인 직접 예약")
        self.assertEqual(fields["예약 문의"], "041-630-2956")
        self.assertEqual(fields["이용 요금"], "무료")
        self.assertNotIn("지도보기", fields["장소/위치"])
        self.assertEqual(fields["미니 홈페이지"], "방문하기")


class DetailUrlTest(unittest.TestCase):
    def test_dcd_mapping(self):
        self.assertEqual(helper.detail_path_for("CPS001.002"), "Upv/UprResrcFacl")
        self.assertEqual(helper.detail_path_for("CPS001.003"), "Upv/UprResrcCamp")

    def test_unknown_dcd(self):
        with self.assertRaises(helper.SharenuriError):
            helper.detail_path_for("CPS999.999")


class CommandFlowTest(unittest.TestCase):
    def _args(self, **overrides):
        import argparse

        base = dict(
            query="회의실", sido=None, ctrd=None, sigg=None, major_code=None,
            free=False, reservable=False, page=1, limit=10,
        )
        base.update(overrides)
        return argparse.Namespace(**base)

    def test_search_uses_fixture_and_stops_after_short_page(self):
        fragment = SEARCH_FRAGMENT_HTML
        with mock.patch.object(helper, "_bootstrap", lambda opener: None), mock.patch.object(
            helper, "_request", return_value=fragment
        ) as req:
            result = helper.cmd_search(object(), self._args(limit=30))
        # fixture 페이지는 2건뿐이라 한 번만 호출하고 멈춘다
        self.assertEqual(req.call_count, 1)
        self.assertEqual(result["total_count"], 5828)
        self.assertEqual(len(result["items"]), 2)

    def test_search_maps_sido_name(self):
        fragment = SEARCH_FRAGMENT_HTML
        seen = {}

        def fake_request(opener, url, data=None, referer=None):
            seen.update(data or {})
            return fragment

        with mock.patch.object(helper, "_bootstrap", lambda opener: None), mock.patch.object(
            helper, "_request", side_effect=fake_request
        ):
            helper.cmd_search(object(), self._args(sido="서울특별시", free=True))
        self.assertEqual(seen["ctrd"], "11")
        self.assertEqual(seen["free_yn"], "Y")

    def test_search_rejects_unknown_sido(self):
        with mock.patch.object(helper, "_bootstrap", lambda opener: None):
            with self.assertRaises(helper.SharenuriError):
                helper.cmd_search(object(), self._args(sido="없는도"))

    def test_sigungu_parses_open_only(self):
        body = json.dumps(
            {
                "signguNmList": [
                    {"gunguCd": "680", "gunguNm": "강남구", "sigunguCd": "11680", "openAt": "Y"},
                    {"gunguCd": "999", "gunguNm": "폐쇄구", "sigunguCd": "11999", "openAt": "N"},
                ]
            }
        )
        import argparse

        with mock.patch.object(helper, "_request", return_value=body):
            result = helper.cmd_sigungu(object(), argparse.Namespace(ctrd="11"))
        self.assertEqual(result["sigungu"], [{"sigunguCd": "11680", "name": "강남구"}])

    def test_categories_parse(self):
        body = json.dumps(
            {"success": True, "rsrcClsList": [{"rsrc_cls_cd": "010000", "rsrc_cls_nm": "시설·공간(대관)"}]}
        )
        import argparse

        with mock.patch.object(helper, "_request", return_value=body):
            result = helper.cmd_categories(object(), argparse.Namespace())
        self.assertEqual(
            result["major_categories"], [{"code": "010000", "name": "시설·공간(대관)"}]
        )


if __name__ == "__main__":
    unittest.main()
