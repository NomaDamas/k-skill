"""Single-entrypoint CLI for the seoul-density skill.

All skill operations route through `python3 seoul-density/scripts/seoul_density.py <subcommand>`
so users only have to approve one Bash pattern on first use.

Subcommands:
  list                       — print supported area names grouped by category
  match <keyword>            — fuzzy-match a user keyword to a supported area name
  query <area-name> [--json] — fetch and summarize real-time density for the area
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import sys
import urllib.error
import urllib.request
import urllib.parse
from typing import Any

for _stream in (sys.stdout, sys.stderr):
    reconfigure = getattr(_stream, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            pass


AREAS: dict[str, list[str]] = {
    "고궁·문화유산": [
        "경복궁", "광화문·덕수궁", "보신각", "서울 암사동 유적", "창덕궁·종묘",
    ],
    "관광특구": [
        "강남 MICE 관광특구", "동대문 관광특구", "명동 관광특구", "이태원 관광특구",
        "잠실 관광특구", "종로·청계 관광특구", "홍대 관광특구",
    ],
    "공원": [
        "강서한강공원", "고척돔", "광나루한강공원", "광화문광장",
        "국립중앙박물관·용산가족공원", "난지한강공원", "남산공원", "노들섬",
        "뚝섬한강공원", "망원한강공원", "반포한강공원", "보라매공원",
        "북서울꿈의숲", "서대문독립공원", "서리풀공원·몽마르뜨공원", "서울대공원",
        "서울숲공원", "송현녹지광장", "아차산", "안양천", "양화한강공원",
        "어린이대공원", "여의도한강공원", "여의서로", "올림픽공원", "월드컵공원",
        "응봉산", "이촌한강공원", "잠실종합운동장", "잠실한강공원", "잠원한강공원",
        "청계산", "홍제폭포",
    ],
    "발달상권": [
        "가락시장", "가로수길", "광장(전통)시장", "김포공항", "남대문시장", "노량진",
        "덕수궁길·정동길", "북창동 먹자골목", "북촌한옥마을", "서촌", "성수카페거리",
        "송리단길·호수단길", "신촌 스타광장", "압구정로데오거리", "여의도", "연남동",
        "영등포 타임스퀘어", "용리단길", "이태원 앤틱가구거리", "익선동", "인사동",
        "잠실롯데타워·석촌호수", "창동 신경제 중심지", "청담동 명품거리",
        "청량리 제기동 일대 전통시장", "해방촌·경리단길", "DDP(동대문디자인플라자)",
        "DMC(디지털미디어시티)",
    ],
    "인구밀집지역": [
        "가산디지털단지역", "강남역", "건대입구역", "고덕역", "고속터미널역", "교대역",
        "구로디지털단지역", "구로역", "군자역", "대림역", "동대문역", "뚝섬역",
        "미아사거리역", "발산역", "사당역", "삼각지역", "서울대입구역",
        "서울식물원·마곡나루역", "서울역", "성신여대입구역", "선릉역", "시의회 앞",
        "수유역", "신논현역·논현역", "신도림역", "신림역", "신촌·이대역", "쌍문역",
        "신정네거리역", "역삼역", "연신내역", "양재역", "왕십리역", "용산역",
        "오목교역·목동운동장", "잠실새내역", "잠실역", "장지역", "장한평역", "천호역",
        "총신대입구(이수)역", "충정로역", "합정역", "혜화역", "홍대입구역(2호선)",
        "회기역",
    ],
}


TIMEOUT_SEC = 10
PROXY_BASE_URL_NAME = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"


def all_areas() -> list[str]:
    return [name for group in AREAS.values() for name in group]


def cmd_list(args: argparse.Namespace) -> int:
    if args.json:
        json.dump(AREAS, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0
    for category, names in AREAS.items():
        print(f"## {category} ({len(names)}곳)")
        print(", ".join(names))
        print()
    return 0


def _normalize(text: str) -> str:
    """Strip whitespace and common location suffixes for loose matching."""
    cleaned = "".join(ch for ch in text if not ch.isspace())
    for suffix in ("관광특구", "한강공원", "공원", "시장", "역", "거리", "광장"):
        if cleaned.endswith(suffix) and len(cleaned) > len(suffix):
            cleaned = cleaned[: -len(suffix)]
            break
    return cleaned


def fuzzy_match(keyword: str, limit: int = 5) -> list[str]:
    names = all_areas()
    keyword = keyword.strip()
    if not keyword:
        return []

    exact = [n for n in names if keyword in n]
    if exact:
        return exact[:limit]

    contained = [n for n in names if n in keyword]
    if contained:
        return contained[:limit]

    norm_kw = _normalize(keyword)
    if norm_kw:
        loose = [n for n in names if norm_kw and (norm_kw in _normalize(n) or _normalize(n) in norm_kw)]
        if loose:
            return loose[:limit]

    return difflib.get_close_matches(keyword, names, n=limit, cutoff=0.3)


def cmd_match(args: argparse.Namespace) -> int:
    matches = fuzzy_match(args.keyword, limit=args.limit)
    if not matches:
        print(f"'{args.keyword}'와 일치하는 지원 장소가 없습니다.", file=sys.stderr)
        print("'python3 seoul-density/scripts/seoul_density.py list' 로 전체 목록을 확인하세요.", file=sys.stderr)
        return 1
    if args.json:
        json.dump(matches, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
    else:
        for name in matches:
            print(name)
    return 0


def get_proxy_base_url() -> str:
    value = os.environ.get(PROXY_BASE_URL_NAME)
    if value and value != "replace-me":
        return value.rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def fetch_density_via_proxy(area: str) -> dict[str, Any]:
    base_url = get_proxy_base_url()
    query = urllib.parse.urlencode({"area": area})
    url = f"{base_url}/v1/seoul-density/citydata?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "k-skill/seoul-density"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def summarize(payload: dict[str, Any]) -> dict[str, Any]:
    result = payload.get("RESULT") or {}
    code = result.get("RESULT.CODE")
    message = result.get("RESULT.MESSAGE", "")
    if code and code != "INFO-000":
        raise RuntimeError(f"API 오류: {code} {message}".strip())

    rows = payload.get("SeoulRtd.citydata_ppltn") or []
    if not rows:
        raise RuntimeError("인구 데이터가 없습니다. 장소명을 'match' 서브커맨드로 확인하세요.")

    row = rows[0]
    return {
        "area": row.get("AREA_NM"),
        "congestion_level": row.get("AREA_CONGEST_LVL"),
        "population_min": row.get("AREA_PPLTN_MIN"),
        "population_max": row.get("AREA_PPLTN_MAX"),
        "as_of": row.get("PPLTN_TIME"),
        "message": row.get("AREA_CONGEST_MSG"),
    }


def cmd_query(args: argparse.Namespace) -> int:
    area = args.area.strip()
    if area not in all_areas():
        suggestions = fuzzy_match(area, limit=3)
        if len(suggestions) == 1 and getattr(args, "auto", True):
            print(f"'{area}' → '{suggestions[0]}' 로 자동 매칭", file=sys.stderr)
            area = suggestions[0]
        else:
            hint = (
                f" 가까운 후보: {', '.join(suggestions)}" if suggestions else ""
            )
            print(f"지원하지 않는 장소: {area}{hint}", file=sys.stderr)
            return 1

    try:
        payload = fetch_density_via_proxy(area)
        summary = summarize(payload)
    except urllib.error.HTTPError as exc:
        print(f"API HTTP 오류: {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"API 연결 실패: {exc.reason}", file=sys.stderr)
        return 1
    except (RuntimeError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.json:
        json.dump(summary, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    print(f"장소: {summary['area']}")
    print(f"혼잡도: {summary['congestion_level']}")
    print(f"인구 추정: {summary['population_min']}~{summary['population_max']}명")
    print(f"기준 시각: {summary['as_of'] or '알 수 없음'}")
    print(f"상황: {summary['message']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="seoul_density",
        description="서울 실시간 도시데이터(혼잡도/인구) 단일 진입점 CLI",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="지원 장소 목록 출력")
    p_list.add_argument("--json", action="store_true")
    p_list.set_defaults(func=cmd_list)

    p_match = sub.add_parser("match", help="키워드 → 지원 장소명 매칭")
    p_match.add_argument("keyword")
    p_match.add_argument("--limit", type=int, default=5)
    p_match.add_argument("--json", action="store_true")
    p_match.set_defaults(func=cmd_match)

    p_query = sub.add_parser("query", help="장소 혼잡도 조회")
    p_query.add_argument("area", help="지원 장소명 (목록은 'list' 참조)")
    p_query.add_argument("--json", action="store_true")
    p_query.add_argument(
        "--no-auto",
        dest="auto",
        action="store_false",
        help="후보가 1개뿐이어도 자동 매칭하지 않음",
    )
    p_query.set_defaults(func=cmd_query, auto=True)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
