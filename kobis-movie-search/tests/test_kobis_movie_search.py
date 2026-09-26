import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
import urllib.parse
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "kobis-movie-search" / "scripts" / "kobis_movie_search.py"
SPEC = importlib.util.spec_from_file_location("kobis_movie_search", MODULE_PATH)
kobis = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(kobis)


DAILY_PAYLOAD = {
    "boxOfficeResult": {
        "boxofficeType": "일별 박스오피스",
        "showRange": "20260801~20260801",
        "dailyBoxOfficeList": [
            {
                "rnum": "1",
                "rank": "1",
                "rankInten": "0",
                "rankOldAndNew": "OLD",
                "movieCd": "20241001",
                "movieNm": "테스트영화",
                "openDt": "2026-07-20",
                "salesAmt": "1234567890",
                "salesShare": "35.1",
                "salesAcc": "9876543210",
                "audiCnt": "120000",
                "audiAcc": "1500000",
                "scrnCnt": "812",
                "showCnt": "3450",
            }
        ],
    }
}

WEEKLY_PAYLOAD = {
    "boxOfficeResult": {
        "boxofficeType": "주간 박스오피스",
        "showRange": "20260727~20260802",
        "yearWeekTime": "202631",
        "weeklyBoxOfficeList": [
            {
                "rank": "1",
                "rankInten": "1",
                "rankOldAndNew": "OLD",
                "movieCd": "20241001",
                "movieNm": "테스트영화",
                "openDt": "2026-07-20",
                "salesAmt": "5000000000",
                "salesShare": "40.0",
                "salesAcc": "15000000000",
                "audiCnt": "500000",
                "audiAcc": "2500000",
                "scrnCnt": "900",
                "showCnt": "12000",
            }
        ],
    }
}

MOVIES_PAYLOAD = {
    "movieListResult": {
        "totCnt": 1,
        "source": "KOBIS",
        "movieList": [
            {
                "movieCd": "20124079",
                "movieNm": "광해, 왕이 된 남자",
                "movieNmEn": "Masquerade",
                "prdtYear": "2012",
                "openDt": "2012-09-13",
                "typeNm": "장편",
                "prdtStatNm": "개봉",
                "nationAlt": "한국",
                "genreAlt": "사극,드라마",
                "repNationNm": "한국",
                "repGenreNm": "사극",
                "directors": [{"peopleNm": "추창민"}],
                "companys": [{"companyCd": "20100517", "companyNm": "리얼라이즈픽쳐스"}],
            }
        ],
    }
}

MOVIE_PAYLOAD = {
    "movieInfoResult": {
        "movieInfo": {
            "movieCd": "20124079",
            "movieNm": "광해, 왕이 된 남자",
            "movieNmEn": "Masquerade",
            "showTm": "131",
            "prdtYear": "2012",
            "openDt": "20120913",
            "prdtStatNm": "개봉",
            "typeNm": "장편",
            "nations": [{"nationNm": "한국"}],
            "genres": [{"genreNm": "사극"}],
            "directors": [{"peopleNm": "추창민", "peopleNmEn": "CHOO Chang-min"}],
            "actors": [{"peopleNm": "이병헌", "peopleNmEn": "LEE Byung-hun", "cast": "광해"}],
            "audits": [{"auditNo": "2012-F593", "watchGradeNm": "15세이상관람가"}],
            "companys": [
                {"companyCd": "20100517", "companyNm": "리얼라이즈픽쳐스", "companyPartNm": "제작사"}
            ],
        },
        "source": "영화진흥위원회",
    }
}

PEOPLE_PAYLOAD = {
    "peopleListResult": {
        "totCnt": 1,
        "peopleList": [
            {
                "peopleCd": "10000001",
                "peopleNm": "이병헌",
                "peopleNmEn": "LEE Byung-hun",
                "repRoleNm": "배우",
                "filmoNames": "광해, 왕이 된 남자|내부자들",
            }
        ],
    }
}

COMPANY_PAYLOAD = {
    "companyListResult": {
        "totCnt": 1,
        "companyList": [
            {
                "companyCd": "20100517",
                "companyNm": "리얼라이즈픽쳐스",
                "companyNmEn": "Realize Pictures",
                "companyPartNames": "제작사",
                "ceoNm": "홍길동",
                "filmoNames": "광해, 왕이 된 남자",
            }
        ],
    }
}

EMPTY_MOVIES_PAYLOAD = {"movieListResult": {"totCnt": 0}}

BAD_KEY_PAYLOAD = {"faultInfo": {"message": "검증되지 않은 KEY 값입니다.", "errorCode": "KEY_ERROR"}}

QUOTA_PAYLOAD = {"faultInfo": {"message": "일일 사용량을 초과했습니다.", "errorCode": "QUOTA"}}

MISSING_INFO_PAYLOAD = {"movieInfoResult": {"source": "영화진흥위원회"}}


class KeyResolutionTests(unittest.TestCase):
    def test_env_key_takes_precedence(self):
        with mock.patch.dict("os.environ", {kobis.API_KEY_ENV: "ENVKEY"}, clear=False):
            self.assertEqual(kobis.resolve_api_key(str(pathlib.Path("/nonexistent"))), "ENVKEY")

    def test_secrets_file_key_is_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            secrets = pathlib.Path(tmp) / "secrets.env"
            secrets.write_text(f"# comment\n{kobis.API_KEY_ENV}=FILEKEY\n", encoding="utf-8")
            with mock.patch.dict("os.environ", {}, clear=True):
                self.assertEqual(kobis.resolve_api_key(str(secrets)), "FILEKEY")

    def test_missing_key_returns_none(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertIsNone(kobis.resolve_api_key(str(pathlib.Path("/nonexistent"))))

    def test_base_url_prefers_argument_then_env(self):
        args = kobis.parse_args(["daily", "--target-dt", "20260801"])
        with mock.patch.dict("os.environ", {"KSKILL_KOBIS_BASE_URL": "http://env.test/"}, clear=False):
            self.assertEqual(kobis.resolve_base_url(args), "http://env.test")
        args.base_url = "http://arg.test/"
        self.assertEqual(kobis.resolve_base_url(args), "http://arg.test")


class UrlBuildTests(unittest.TestCase):
    def test_daily_url_uses_key_and_target(self):
        args = kobis.parse_args(["daily", "--target-dt", "20260801"])
        url = kobis.build_url(args, api_key="MYKEY")
        self.assertTrue(url.startswith(kobis.KOBIS_BASE_URL))
        self.assertIn("boxoffice/searchDailyBoxOfficeList.json", url)
        self.assertIn("key=MYKEY", url)
        self.assertIn("targetDt=20260801", url)

    def test_weekly_url_includes_week_gb(self):
        args = kobis.parse_args(["weekly", "--target-dt", "20260801", "--week-gb", "1"])
        url = kobis.build_url(args, api_key="MYKEY")
        self.assertIn("weekGb=1", url)
        self.assertIn("searchWeeklyBoxOfficeList.json", url)

    def test_movies_url_encodes_korean_query(self):
        args = kobis.parse_args(["movies", "--query", "광해", "--limit", "5"])
        url = kobis.build_url(args, api_key="MYKEY")
        self.assertIn("movieNm=" + urllib.parse.quote("광해"), url)
        self.assertNotIn("광해", url)
        self.assertIn("itemPerPage=5", url)

    def test_movie_url_uses_movie_code(self):
        args = kobis.parse_args(["movie", "--movie-code", "20124079"])
        url = kobis.build_url(args, api_key="MYKEY")
        self.assertIn("searchMovieInfo.json", url)
        self.assertIn("movieCd=20124079", url)

    def test_people_and_company_urls(self):
        people = kobis.parse_args(["people", "--query", "이병헌"])
        url = kobis.build_url(people, api_key="MYKEY")
        self.assertIn("people/searchPeopleList.json", url)
        self.assertIn("peopleNm=" + urllib.parse.quote("이병헌"), url)

        company = kobis.parse_args(["company", "--query", "CJ"])
        url = kobis.build_url(company, api_key="MYKEY")
        self.assertIn("company/searchCompanyList.json", url)
        self.assertIn("companyNm=CJ", url)

    def test_missing_key_on_upstream_raises(self):
        args = kobis.parse_args(["daily", "--target-dt", "20260801"])
        with self.assertRaisesRegex(kobis.HelperError, "KOBIS API 키"):
            kobis.build_url(args, api_key=None)

    def test_proxy_base_needs_no_key(self):
        args = kobis.parse_args(["daily", "--target-dt", "20260801"])
        url = kobis.build_url(args, api_key=None, base_url="http://proxy.test/v1/kobis")
        self.assertIn("http://proxy.test/v1/kobis/boxoffice/searchDailyBoxOfficeList.json", url)
        self.assertNotIn("key=", url)

    def test_invalid_target_date_rejected(self):
        args = kobis.parse_args(["daily", "--target-dt", "2026-08-01"])
        with self.assertRaisesRegex(kobis.HelperError, "YYYYMMDD"):
            kobis.build_url(args, api_key="MYKEY")

    def test_invalid_week_gb_rejected(self):
        args = kobis.parse_args(["weekly", "--target-dt", "20260801", "--week-gb", "9"])
        with self.assertRaisesRegex(kobis.HelperError, "week-gb"):
            kobis.build_url(args, api_key="MYKEY")

    def test_invalid_movie_code_rejected(self):
        args = kobis.parse_args(["movie", "--movie-code", "abc"])
        with self.assertRaisesRegex(kobis.HelperError, "movie-code"):
            kobis.build_url(args, api_key="MYKEY")

    def test_movies_requires_a_filter(self):
        args = kobis.parse_args(["movies"])
        with self.assertRaisesRegex(kobis.HelperError, "검색 조건"):
            kobis.build_url(args, api_key="MYKEY")


class NormalizeTests(unittest.TestCase):
    def test_normalize_daily_rows(self):
        rows = kobis.normalize_payload(DAILY_PAYLOAD, "daily")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["movieNm"], "테스트영화")

    def test_normalize_weekly_rows(self):
        rows = kobis.normalize_payload(WEEKLY_PAYLOAD, "weekly")
        self.assertEqual(rows[0]["rank"], "1")

    def test_normalize_empty_list_key_absent(self):
        self.assertEqual(kobis.normalize_payload(EMPTY_MOVIES_PAYLOAD, "movies"), [])

    def test_normalize_movie_detail_single_object(self):
        rows = kobis.normalize_payload(MOVIE_PAYLOAD, "movie")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["movieCd"], "20124079")

    def test_normalize_bad_key_raises_with_hint(self):
        with self.assertRaises(kobis.HelperError) as ctx:
            kobis.normalize_payload(BAD_KEY_PAYLOAD, "daily")
        self.assertIn("KOBIS API 키", str(ctx.exception))

    def test_normalize_quota_raises(self):
        with self.assertRaises(kobis.HelperError) as ctx:
            kobis.normalize_payload(QUOTA_PAYLOAD, "daily")
        self.assertIn("초과", str(ctx.exception))

    def test_normalize_missing_movie_info_raises(self):
        with self.assertRaisesRegex(kobis.HelperError, "movieInfo"):
            kobis.normalize_payload(MISSING_INFO_PAYLOAD, "movie")

    def test_normalize_unexpected_shape_raises(self):
        with self.assertRaises(kobis.HelperError):
            kobis.normalize_payload({"weird": True}, "daily")
        with self.assertRaises(kobis.HelperError):
            kobis.normalize_payload(["not", "a", "dict"], "daily")


class ProjectionTests(unittest.TestCase):
    def test_project_daily_row(self):
        row = kobis.project_row("daily", DAILY_PAYLOAD["boxOfficeResult"]["dailyBoxOfficeList"][0])
        self.assertEqual(row["rank"], "1")
        self.assertEqual(row["audi_cnt"], "120000")
        self.assertEqual(row["scrn_cnt"], "812")

    def test_project_movies_row_flattens_directors_and_companys(self):
        row = kobis.project_row("movies", MOVIES_PAYLOAD["movieListResult"]["movieList"][0])
        self.assertEqual(row["directors"], ["추창민"])
        self.assertEqual(row["companys"][0]["company_nm"], "리얼라이즈픽쳐스")

    def test_project_movie_detail_lists(self):
        row = kobis.project_row("movie", MOVIE_PAYLOAD["movieInfoResult"]["movieInfo"])
        self.assertEqual(row["genres"], ["사극"])
        self.assertEqual(row["actors"][0]["cast"], "광해")
        self.assertEqual(row["audits"][0]["watch_grade_nm"], "15세이상관람가")

    def test_project_people_and_company(self):
        person = kobis.project_row("people", PEOPLE_PAYLOAD["peopleListResult"]["peopleList"][0])
        self.assertEqual(person["rep_role_nm"], "배우")
        comp = kobis.project_row("company", COMPANY_PAYLOAD["companyListResult"]["companyList"][0])
        self.assertEqual(comp["company_nm_en"], "Realize Pictures")

    def test_render_text_empty_message(self):
        self.assertIn("없습니다", kobis.render_text("daily", []))


class RunTests(unittest.TestCase):
    def _run(self, argv, payload):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.object(kobis, "http_get_json", return_value=payload), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = kobis.run(argv)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_run_daily_outputs_json(self):
        code, out, _ = self._run(
            ["daily", "--target-dt", "20260801", "--base-url", "http://kobis.test"],
            DAILY_PAYLOAD,
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "ok")
        self.assertEqual(payload["command"], "daily")
        self.assertEqual(payload["rows"][0]["movie_nm"], "테스트영화")
        self.assertIn("KOBIS", payload["source"])

    def test_run_daily_text_mode(self):
        code, out, _ = self._run(
            ["daily", "--target-dt", "20260801", "--base-url", "http://kobis.test", "--text"],
            DAILY_PAYLOAD,
        )
        self.assertEqual(code, 0)
        self.assertIn("테스트영화", out)
        self.assertIn("1위", out)

    def test_run_empty_is_explicit(self):
        code, out, _ = self._run(
            ["movies", "--query", "없는영화", "--base-url", "http://kobis.test"],
            EMPTY_MOVIES_PAYLOAD,
        )
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["result"], "empty")
        self.assertEqual(payload["rows"], [])

    def test_run_movie_detail_projection(self):
        code, out, _ = self._run(
            ["movie", "--movie-code", "20124079", "--base-url", "http://kobis.test"],
            MOVIE_PAYLOAD,
        )
        self.assertEqual(code, 0)
        row = json.loads(out)["rows"][0]
        self.assertEqual(row["movie_nm"], "광해, 왕이 된 남자")
        self.assertEqual(row["show_tm"], "131")

    def test_run_reports_key_error_to_stderr(self):
        code, _, err = self._run(
            ["daily", "--target-dt", "20260801", "--base-url", "http://kobis.test"],
            BAD_KEY_PAYLOAD,
        )
        self.assertEqual(code, 1)
        self.assertIn("KOBIS API 키", err)

    def test_run_missing_key_without_proxy_exits_one(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.dict("os.environ", {}, clear=True), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = kobis.run([
                "daily", "--target-dt", "20260801",
                "--secrets-path", "/nonexistent/k-skill-secrets.env",
            ])
        self.assertEqual(code, 1)
        self.assertIn("KOBIS API 키", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
