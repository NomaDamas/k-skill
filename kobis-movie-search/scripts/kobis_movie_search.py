#!/usr/bin/env python3
"""Read-only KOBIS (영화진흥위원회) movie information / box office helper.

Site-dependent access path (KOBIS OpenAPI, documented at
https://www.kobis.or.kr/kobisopenapi/homepg/main/main.do):

    GET https://www.kobis.or.kr/kobisopenapi/webservice/rest/<service>.json?key=<key>&<params>

Services used:

- boxoffice/searchDailyBoxOfficeList.json   — 일별 박스오피스
- boxoffice/searchWeeklyBoxOfficeList.json  — 주간 박스오피스 (weekGb)
- movie/searchMovieList.json                — 영화 목록 검색 (영화명/감독명 등)
- movie/searchMovieInfo.json                — 영화 상세 메타데이터
- people/searchPeopleList.json              — 영화인 검색
- company/searchCompanyList.json            — 영화사 검색

Auth (BYOK): the upstream API requires a KOBIS API key. This helper reads it from
``KSKILL_KOBIS_API_KEY`` or ``~/.config/k-skill/secrets.env`` and never stores or
prints it. A ``k-skill-proxy`` route is a candidate per the repository free API
proxy policy, but it is NOT added by this skill; if one exists later, point
``KSKILL_KOBIS_BASE_URL`` / ``--base-url`` at the proxy base and the helper will
call it without sending a key (the proxy injects the upstream key).

This helper only performs read-only lookups. It never books, pays, submits or
cancels anything.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

KOBIS_BASE_URL = "https://www.kobis.or.kr/kobisopenapi/webservice/rest"
# Some deployments still serve the API only over plain HTTP; --base-url lets a
# user switch without editing code.
KOBIS_HTTP_BASE_URL = "http://www.kobis.or.kr/kobisopenapi/webservice/rest"
UPSTREAM_BASES = {KOBIS_BASE_URL, KOBIS_HTTP_BASE_URL}

DEFAULT_SECRETS_PATH = pathlib.Path("~/.config/k-skill/secrets.env").expanduser()
USER_AGENT = "k-skill-kobis-movie-search/0.1 (+https://github.com/NomaDamas/k-skill)"
API_KEY_ENV = "KSKILL_KOBIS_API_KEY"

# command -> (path relative to base, parent key, item key)
# item key None means the payload holds a single object (movie detail).
SERVICE_MAP: Dict[str, Tuple[str, str, Optional[str]]] = {
    "daily": ("boxoffice/searchDailyBoxOfficeList.json", "boxOfficeResult", "dailyBoxOfficeList"),
    "weekly": ("boxoffice/searchWeeklyBoxOfficeList.json", "boxOfficeResult", "weeklyBoxOfficeList"),
    "movies": ("movie/searchMovieList.json", "movieListResult", "movieList"),
    "movie": ("movie/searchMovieInfo.json", "movieInfoResult", None),
    "people": ("people/searchPeopleList.json", "peopleListResult", "peopleList"),
    "company": ("company/searchCompanyList.json", "companyListResult", "companyList"),
}

DATE_PATTERN = re.compile(r"^\d{8}$")
MOVIE_CODE_PATTERN = re.compile(r"^\d{4,12}$")
WEEK_GB_VALUES = {"0", "1", "2"}

KEY_HINT = (
    "KOBIS API 키가 유효하지 않거나 누락되었습니다. "
    "https://www.kobis.or.kr/kobisopenapi 회원가입 후 키 발급/관리에서 키를 발급받아 "
    f"환경변수 {API_KEY_ENV} 또는 ~/.config/k-skill/secrets.env 에 설정하세요."
)


class HelperError(RuntimeError):
    pass


def load_secrets(path: pathlib.Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return values
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_api_key(secrets_path: str) -> Optional[str]:
    env_value = os.environ.get(API_KEY_ENV)
    if env_value and env_value.strip():
        return env_value.strip()
    secrets = load_secrets(pathlib.Path(secrets_path).expanduser())
    value = secrets.get(API_KEY_ENV)
    return value.strip() if value and value.strip() else None


def resolve_base_url(args: argparse.Namespace) -> str:
    value = (
        getattr(args, "base_url", None)
        or os.environ.get("KSKILL_KOBIS_BASE_URL")
        or KOBIS_BASE_URL
    )
    return value.rstrip("/")


def _check_date(value: str, label: str) -> str:
    if not DATE_PATTERN.match((value or "").strip()):
        raise HelperError(f"{label}는 YYYYMMDD 8자리 형식이어야 합니다: {value!r}")
    return value.strip()


def _check_week_gb(value: str) -> str:
    text = str(value).strip()
    if text not in WEEK_GB_VALUES:
        raise HelperError("week-gb는 0(월~일)/1(금~일)/2(월~목) 중 하나여야 합니다.")
    return text


def _check_movie_code(value: str) -> str:
    if not MOVIE_CODE_PATTERN.match((value or "").strip()):
        raise HelperError(f"movie-code는 숫자로 된 KOBIS 영화코드여야 합니다: {value!r}")
    return value.strip()


def _require_query(value: Optional[str], label: str) -> str:
    text = (value or "").strip()
    if not text:
        raise HelperError(f"{label} 검색어가 필요합니다.")
    return text


def _params_for(args: argparse.Namespace) -> Dict[str, str]:
    command = args.command
    if command == "daily":
        return {"targetDt": _check_date(args.target_dt, "target-dt")}
    if command == "weekly":
        return {
            "targetDt": _check_date(args.target_dt, "target-dt"),
            "weekGb": _check_week_gb(args.week_gb),
        }
    if command == "movies":
        params: Dict[str, str] = {
            "curPage": str(max(1, args.page)),
            "itemPerPage": str(max(1, args.limit)),
        }
        optional = {
            "movieNm": args.query,
            "directorNm": args.director,
            "openStartDt": args.open_start_dt,
            "openEndDt": args.open_end_dt,
            "prdtStartYear": args.prdt_start_year,
            "prdtEndYear": args.prdt_end_year,
            "repNationCd": args.rep_nation_cd,
            "movieTypeCd": args.movie_type_cd,
        }
        provided = False
        for key, value in optional.items():
            if value not in (None, ""):
                params[key] = str(value).strip()
                provided = True
        if not provided:
            raise HelperError(
                "영화 검색에는 --query(영화명) 또는 --director(감독명) 등 "
                "최소 하나의 검색 조건이 필요합니다."
            )
        return params
    if command == "movie":
        return {"movieCd": _check_movie_code(args.movie_code)}
    if command == "people":
        return {
            "curPage": str(max(1, args.page)),
            "itemPerPage": str(max(1, args.limit)),
            "peopleNm": _require_query(args.query, "peopleNm"),
        }
    if command == "company":
        return {
            "curPage": str(max(1, args.page)),
            "itemPerPage": str(max(1, args.limit)),
            "companyNm": _require_query(args.query, "companyNm"),
        }
    raise HelperError(f"알 수 없는 명령입니다: {command!r}")


def build_url(args: argparse.Namespace, api_key: Optional[str], base_url: Optional[str] = None) -> str:
    base = (base_url or KOBIS_BASE_URL).rstrip("/")
    service_path, _, _ = SERVICE_MAP[args.command]
    params = _params_for(args)
    if api_key:
        params = {"key": api_key, **params}
    elif base in UPSTREAM_BASES:
        raise HelperError(KEY_HINT)
    # Otherwise a proxy base is assumed to inject the upstream key.
    query = urllib.parse.urlencode(params)
    return f"{base}/{service_path}?{query}"


def http_get_json(url: str, timeout: int) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise HelperError(KEY_HINT) from exc
        raise HelperError(f"KOBIS HTTP 오류: {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise HelperError(f"KOBIS 접속 실패: {exc.reason}") from exc
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise HelperError(
            "KOBIS 응답이 JSON이 아닙니다 (차단·점검 또는 잘못된 endpoint 가능성)."
        ) from exc


def _fault_message(fault: Dict[str, Any]) -> str:
    message = str(fault.get("message") or fault.get("errorMessage") or "KOBIS 오류")
    code = fault.get("errorCode") or fault.get("code")
    hint = ""
    lowered = message.lower()
    if "key" in lowered or "인증" in message or "키" in message:
        hint = " " + KEY_HINT
    elif "초과" in message or "limit" in lowered or "quota" in lowered:
        hint = " 일일 호출 한도를 초과했을 수 있습니다. 잠시 후 다시 시도하세요."
    return f"KOBIS 오류: {message}" + (f" [{code}]" if code else "") + hint


def normalize_payload(payload: Dict[str, Any], command: str) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        raise HelperError("KOBIS 응답 형식이 올바르지 않습니다.")
    fault = payload.get("faultInfo")
    if isinstance(fault, dict):
        raise HelperError(_fault_message(fault))
    for error_key in ("errorMessage", "error_message"):
        if payload.get(error_key):
            raise HelperError(f"KOBIS 오류: {payload[error_key]}")

    _, parent_key, item_key = SERVICE_MAP[command]
    body = payload.get(parent_key)
    if not isinstance(body, dict):
        raise HelperError(
            "KOBIS 응답에서 결과 본문을 찾지 못했습니다 (endpoint/파라미터를 확인하세요)."
        )
    if item_key is None:
        info = body.get("movieInfo")
        if not isinstance(info, dict):
            raise HelperError("KOBIS 영화 상세 응답에 movieInfo가 없습니다.")
        return [info]
    rows = body.get(item_key)
    if rows is None:
        # KOBIS omits the list key entirely when there are no matches.
        return []
    if not isinstance(rows, list):
        raise HelperError("KOBIS 응답의 목록 형식이 올바르지 않습니다.")
    return [row for row in rows if isinstance(row, dict)]


def _names(items: Any, field: str) -> List[str]:
    if not isinstance(items, list):
        return []
    result = []
    for item in items:
        if isinstance(item, dict) and item.get(field):
            result.append(item[field])
    return result


def _people(items: Any, en: bool = False) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        row = {"people_nm": item.get("peopleNm"), "people_nm_en": item.get("peopleNmEn")}
        if en:
            row["cast"] = item.get("cast")
        result.append(row)
    return result


def _companys(items: Any) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        result.append(
            {"company_cd": item.get("companyCd"), "company_nm": item.get("companyNm")}
        )
    return result


def project_row(command: str, row: Dict[str, Any]) -> Dict[str, Any]:
    get = row.get
    if command in ("daily", "weekly"):
        return {
            "rank": get("rank"),
            "rank_inten": get("rankInten"),
            "rank_old_and_new": get("rankOldAndNew"),
            "movie_cd": get("movieCd"),
            "movie_nm": get("movieNm"),
            "open_dt": get("openDt"),
            "sales_amt": get("salesAmt"),
            "sales_share": get("salesShare"),
            "sales_acc": get("salesAcc"),
            "audi_cnt": get("audiCnt"),
            "audi_acc": get("audiAcc"),
            "scrn_cnt": get("scrnCnt"),
            "show_cnt": get("showCnt"),
        }
    if command == "movies":
        return {
            "movie_cd": get("movieCd"),
            "movie_nm": get("movieNm"),
            "movie_nm_en": get("movieNmEn"),
            "prdt_year": get("prdtYear"),
            "open_dt": get("openDt"),
            "type_nm": get("typeNm"),
            "prdt_stat_nm": get("prdtStatNm"),
            "nation_alt": get("nationAlt"),
            "genre_alt": get("genreAlt"),
            "rep_nation_nm": get("repNationNm"),
            "rep_genre_nm": get("repGenreNm"),
            "directors": _names(row.get("directors"), "peopleNm"),
            "companys": _companys(row.get("companys")),
        }
    if command == "movie":
        return {
            "movie_cd": get("movieCd"),
            "movie_nm": get("movieNm"),
            "movie_nm_en": get("movieNmEn"),
            "show_tm": get("showTm"),
            "prdt_year": get("prdtYear"),
            "open_dt": get("openDt"),
            "prdt_stat_nm": get("prdtStatNm"),
            "type_nm": get("typeNm"),
            "nations": _names(row.get("nations"), "nationNm"),
            "genres": _names(row.get("genres"), "genreNm"),
            "directors": _people(row.get("directors")),
            "actors": _people(row.get("actors"), en=True),
            "audits": [
                {"audit_no": item.get("auditNo"), "watch_grade_nm": item.get("watchGradeNm")}
                for item in row.get("audits", [])
                if isinstance(item, dict)
            ],
            "companys": [
                {
                    "company_cd": item.get("companyCd"),
                    "company_nm": item.get("companyNm"),
                    "company_part_nm": item.get("companyPartNm"),
                }
                for item in row.get("companys", [])
                if isinstance(item, dict)
            ],
        }
    if command == "people":
        return {
            "people_cd": get("peopleCd"),
            "people_nm": get("peopleNm"),
            "people_nm_en": get("peopleNmEn"),
            "rep_role_nm": get("repRoleNm"),
            "filmo_names": get("filmoNames"),
        }
    # company
    return {
        "company_cd": get("companyCd"),
        "company_nm": get("companyNm"),
        "company_nm_en": get("companyNmEn"),
        "company_part_names": get("companyPartNames"),
        "ceo_nm": get("ceoNm"),
        "filmo_names": get("filmoNames"),
    }


def render_text(command: str, rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return "조건에 맞는 영화/박스오피스 데이터가 없습니다."
    lines = []
    for row in rows:
        if command in ("daily", "weekly"):
            lines.append(
                f"{row['rank']}위 {row['movie_nm']} ({row['open_dt']}) · "
                f"관객 {row['audi_cnt']}명 (누적 {row['audi_acc']}) · "
                f"매출 {row['sales_amt']}원 · 스크린 {row['scrn_cnt']}"
            )
        elif command == "movies":
            directors = ", ".join(row["directors"]) or "-"
            lines.append(
                f"{row['movie_cd']} · {row['movie_nm']} ({row['prdt_year'] or '-'}, "
                f"{row['open_dt'] or '-'}) · {row['genre_alt'] or '-'} · 감독 {directors}"
            )
        elif command == "movie":
            directors = ", ".join(d["people_nm"] for d in row["directors"] if d.get("people_nm")) or "-"
            genres = ", ".join(row["genres"]) or "-"
            lines.append(
                f"{row['movie_nm']} ({row['movie_nm_en'] or '-'}, {row['open_dt'] or '-'}) · "
                f"{row['show_tm'] or '-'}분 · {genres} · 감독 {directors}"
            )
        elif command == "people":
            lines.append(
                f"{row['people_cd']} · {row['people_nm']} ({row['people_nm_en'] or '-'}) · "
                f"{row['rep_role_nm'] or '-'} · {row['filmo_names'] or '-'}"
            )
        else:
            lines.append(
                f"{row['company_cd']} · {row['company_nm']} ({row['company_nm_en'] or '-'}) · "
                f"{row['company_part_names'] or '-'} · {row['filmo_names'] or '-'}"
            )
    return "\n".join(lines)


def parse_args(argv: List[str]) -> argparse.Namespace:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--secrets-path", default=str(DEFAULT_SECRETS_PATH))
    common.add_argument("--timeout", type=int, default=30)
    common.add_argument("--base-url", default=None, help="upstream 또는 k-skill-proxy base URL")
    common.add_argument("--page", type=int, default=1, help="목록 검색 페이지 (curPage)")
    common.add_argument("--limit", type=int, default=10, help="목록 검색 페이지당 건수 (itemPerPage)")
    common.add_argument("--text", action="store_true", help="사람용 요약 출력")

    parser = argparse.ArgumentParser(description="KOBIS 영화정보·박스오피스 조회 (조회 전용)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    daily = subparsers.add_parser("daily", parents=[common], help="일별 박스오피스")
    daily.add_argument("--target-dt", required=True, help="기준일 YYYYMMDD")

    weekly = subparsers.add_parser("weekly", parents=[common], help="주간 박스오피스")
    weekly.add_argument("--target-dt", required=True, help="주간 기준일 YYYYMMDD")
    weekly.add_argument("--week-gb", default="0", help="0:월~일, 1:금~일, 2:월~목 (기본 0)")

    movies = subparsers.add_parser("movies", parents=[common], help="영화 목록 검색")
    movies.add_argument("--query", help="영화명 (movieNm)")
    movies.add_argument("--director", help="감독명 (directorNm)")
    movies.add_argument("--open-start-dt", help="개봉 시작일 YYYYMMDD")
    movies.add_argument("--open-end-dt", help="개봉 종료일 YYYYMMDD")
    movies.add_argument("--prdt-start-year", help="제작 시작연도")
    movies.add_argument("--prdt-end-year", help="제작 종료연도")
    movies.add_argument("--rep-nation-cd", help="대표 제작국가 코드")
    movies.add_argument("--movie-type-cd", help="영화 유형 코드")

    movie = subparsers.add_parser("movie", parents=[common], help="영화 상세정보")
    movie.add_argument("--movie-code", required=True, help="KOBIS 영화코드 (예: 20124079)")

    people = subparsers.add_parser("people", parents=[common], help="영화인 검색")
    people.add_argument("--query", required=True, help="영화인명 (peopleNm)")

    company = subparsers.add_parser("company", parents=[common], help="영화사 검색")
    company.add_argument("--query", required=True, help="영화사명 (companyNm)")

    return parser.parse_args(argv)


def run(argv: List[str]) -> int:
    args = parse_args(argv)
    try:
        base_url = resolve_base_url(args)
        api_key = resolve_api_key(args.secrets_path)
        url = build_url(args, api_key, base_url)
        payload = http_get_json(url, args.timeout)
        raw_rows = normalize_payload(payload, args.command)
        rows = [project_row(args.command, row) for row in raw_rows]
        if args.text:
            print(render_text(args.command, rows))
        else:
            print(
                json.dumps(
                    {
                        "result": "ok" if rows else "empty",
                        "command": args.command,
                        "rows": rows,
                        "source": "KOBIS OpenAPI (영화진흥위원회)",
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        return 0
    except HelperError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:]))
