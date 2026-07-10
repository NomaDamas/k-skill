#!/usr/bin/env python3
"""Read-only KOSIS (kosis.kr) Open API helper.

The script wraps four KOSIS endpoints needed to answer everyday Korean
official-statistics questions:

    - statisticsSearch.do        : keyword search of statistical tables
    - statisticsData.do?getMeta  : table metadata (dimensions, units)
    - statisticsParameterData.do : actual data cells filtered by classifier
    - statisticsBigData.do       : large datasets (requires userStatsId)

It only reads. It never registers user statistics, edits anything, or
performs aggressive polling.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SEARCH_URL = "https://kosis.kr/openapi/statisticsSearch.do"
META_URL = "https://kosis.kr/openapi/statisticsData.do"
DATA_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
BIGDATA_URL = "https://kosis.kr/openapi/statisticsBigData.do"
LIST_URL = "https://kosis.kr/openapi/statisticsList.do"
EXPLAIN_URL = "https://kosis.kr/openapi/statisticsExplData.do"
INDICATOR_URL = "https://kosis.kr/openapi/pkNumberService.do"
PROXY_BASE_URL_ENV_VAR = "KSKILL_PROXY_BASE_URL"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"

DEFAULT_TIMEOUT = 30
PRD_SE_VALUES = {"M", "Q", "S", "Y", "F", "IR"}
# `xls` is intentionally omitted: KOSIS returns it as a binary Excel payload,
# but the helper streams text-only output. Use bigdata json/sdmx/csv (text)
# for now; download xls files manually from the KOSIS web UI if you need them.
BIGDATA_FORMATS = {"json", "sdmx", "csv"}

# statisticsList.do service view codes
VIEW_CODES = {
    "MT_ZTITLE", "MT_OTITLE", "MT_GTITLE01", "MT_GTITLE02",
    "MT_CHOSUN_TITLE", "MT_HANKUK_TITLE", "MT_STOP_TITLE",
    "MT_RTITLE", "MT_BUKHAN", "MT_TM1_TITLE", "MT_TM2_TITLE", "MT_ETITLE",
}

# pkNumberService.do sub-services
INDICATOR_SERVICES = {"1", "2", "3"}

ERROR_CODE_HINTS: dict[str, str] = {
    "10": "인증키가 누락되었습니다. KSKILL_KOSIS_API_KEY 환경변수를 확인하세요.",
    "11": "인증키가 만료되었거나 해당 endpoint에서 무효입니다. https://kosis.kr/openapi/ 에서 갱신하거나, bigdata는 본인이 등록한 userStatsId 인지 확인하세요.",
    "20": "필수 요청 변수가 누락되었습니다. `meta --table-id <ID> --meta-type ITM --json` 으로 ITM 안에 들어 있는 OBJ_ID(분류 차원)와 코드를 확인하세요(많은 표가 OBJ 메타는 비어 있고 분류가 ITM 안에 들어 있음). 그 뒤 `--obj-l 1=<코드> --obj-l 2=<코드>` 형태로 필요한 차원을 모두 지정해 재호출하세요. 별도 OBJ 메타가 있는 표는 `--meta-type OBJ` 로도 확인 가능합니다.",
    "21": "잘못된 요청 변수입니다. orgId/tblId/기간 형식을 재확인하세요. tblId가 의심되면 `search --query <키워드>` 로 정확한 ID를 다시 찾으세요.",
    "30": "조회 결과가 없습니다. 키워드를 더 짧게(예: '1인 가구' → '가구') 또는 다른 표현으로 재검색하거나, 기간/분류 필터를 완화하세요. meta 호출에서 이 에러가 나면 해당 메타 타입을 표가 지원하지 않는 경우이므로 다른 `--meta-type` 을 시도하세요.",
    "31": "조회 결과가 한도(40,000셀)를 초과했습니다. 기간을 좁히거나(예: 5년→1년) 분류 필터의 ALL 을 특정 코드로 바꾸세요(예: `--obj-l 1=ALL` → `--obj-l 1=11` 서울만). 그래도 부족하면 `bigdata` 서브커맨드 + 사전 등록한 userStatsId 를 사용하세요.",
    "40": "분당 호출 한도(1,000건)를 초과했습니다. 잠시 대기 후 재시도하거나 호출 간 sleep 을 두세요.",
    "41": "1회 호출 ROW 한도를 초과했습니다. 기간이나 분류를 좁혀 쿼리를 분할하세요.",
    "42": "사용자별 이용이 제한되었습니다. KOSIS 운영팀에 문의하세요.",
    "50": "KOSIS 서버 오류입니다. 1~2초 대기 후 재시도하세요.",
}


@dataclass
class KosisConfig:
    api_key: str
    timeout: int = DEFAULT_TIMEOUT


class KosisError(RuntimeError):
    def __init__(self, code: str | None, message: str) -> None:
        self.code = code or ""
        super().__init__(message)


def parse_resultcount(value: str) -> int:
    try:
        result = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if not 1 <= result <= 5000:
        raise argparse.ArgumentTypeError("must be between 1 and 5000")
    return result


def parse_prd_se(value: str) -> str:
    upper = value.strip().upper()
    if upper not in PRD_SE_VALUES:
        raise argparse.ArgumentTypeError(
            "must be one of: " + ", ".join(sorted(PRD_SE_VALUES))
        )
    return upper


def parse_bigdata_format(value: str) -> str:
    lower = value.strip().lower()
    if lower not in BIGDATA_FORMATS:
        raise argparse.ArgumentTypeError(
            "must be one of: " + ", ".join(sorted(BIGDATA_FORMATS))
        )
    return lower


def parse_view_code(value: str) -> str:
    upper = value.strip().upper()
    if upper not in VIEW_CODES:
        raise argparse.ArgumentTypeError(
            "must be one of: " + ", ".join(sorted(VIEW_CODES))
        )
    return upper


def parse_indicator_service(value: str) -> str:
    if value not in INDICATOR_SERVICES:
        raise argparse.ArgumentTypeError(
            "must be one of: " + ", ".join(sorted(INDICATOR_SERVICES))
        )
    return value


def _add_common_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default {DEFAULT_TIMEOUT}).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the request URL and parameters without calling KOSIS.",
    )
    parser.add_argument(
        "--proxy-base-url",
        help=(
            "k-skill-proxy base URL for search/meta/data "
            f"(default {DEFAULT_PROXY_BASE_URL}; override with {PROXY_BASE_URL_ENV_VAR})."
        ),
    )
    parser.add_argument(
        "--direct",
        action="store_true",
        help="Call KOSIS directly with KSKILL_KOSIS_API_KEY instead of k-skill-proxy.",
    )
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true", help="Print JSON output.")
    output.add_argument("--text", action="store_true", help="Print human-readable output.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only KOSIS Open API helper. "
        "Place output flags (--json/--text/--dry-run/--timeout) AFTER the subcommand.",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="Search statistical tables by keyword.")
    _add_common_flags(search)
    search.add_argument("--query", required=True, help="Korean keyword (e.g. '1인 가구').")
    search.add_argument(
        "--result-count",
        type=parse_resultcount,
        default=20,
        help="Result count, 1-5000 (default 20).",
    )
    search.add_argument(
        "--start-count",
        type=int,
        default=1,
        help="Result offset for pagination (default 1).",
    )

    meta = sub.add_parser("meta", help="Fetch table metadata (dimensions, units).")
    _add_common_flags(meta)
    meta.add_argument("--org-id", default="101", help="Organization ID (default 101).")
    meta.add_argument("--table-id", required=True, help="KOSIS table ID, e.g. DT_1IN0001.")
    meta.add_argument(
        "--meta-type",
        default="TBL",
        choices=["TBL", "ITM", "OBJ"],
        help="Meta type (default TBL).",
    )

    data = sub.add_parser("data", help="Fetch table data filtered by classifiers.")
    _add_common_flags(data)
    data.add_argument("--org-id", default="101", help="Organization ID (default 101).")
    data.add_argument("--table-id", required=True, help="KOSIS table ID.")
    data.add_argument(
        "--prd-se",
        type=parse_prd_se,
        required=True,
        help="Period frequency: M Q S Y F IR.",
    )
    data.add_argument("--start", required=True, help="Start period (format depends on --prd-se).")
    data.add_argument("--end", required=True, help="End period.")
    data.add_argument("--itm-id", default="ALL", help="Item ID filter (default ALL).")
    data.add_argument(
        "--obj-l",
        action="append",
        default=[],
        metavar="N=VALUE",
        help="Classifier filter, e.g. --obj-l 1=ALL --obj-l 2=00. Repeatable. "
        "If omitted, --obj-l 1=ALL is used.",
    )

    bigdata = sub.add_parser(
        "bigdata",
        help="Fetch large datasets via statisticsBigData (requires userStatsId).",
    )
    _add_common_flags(bigdata)
    bigdata.add_argument(
        "--user-stats-id",
        required=True,
        help="userStatsId pre-registered on KOSIS (개발가이드 > 대용량 통계자료 > URL생성).",
    )
    bigdata.add_argument(
        "--format",
        dest="bigdata_format",
        type=parse_bigdata_format,
        default="json",
        help="Output format: json sdmx csv xls (default json).",
    )
    bigdata.add_argument(
        "--prd-se",
        type=parse_prd_se,
        help="Period frequency override.",
    )
    bigdata.add_argument(
        "--new-est-prd-cnt",
        type=int,
        help="Count of latest periods to fetch (alternative to start/end).",
    )

    list_cmd = sub.add_parser(
        "list",
        help="Browse statistical table categories (statisticsList.do).",
    )
    _add_common_flags(list_cmd)
    list_cmd.add_argument(
        "--vw-cd",
        type=parse_view_code,
        required=True,
        help="Service view code: MT_ZTITLE(국내통계주제별) MT_OTITLE(기관별) "
        "MT_GTITLE01/02(e-지방지표) MT_RTITLE(국제통계) MT_BUKHAN(북한통계) etc.",
    )
    list_cmd.add_argument(
        "--parent-id",
        default="",
        help="Parent list ID for sub-categories. Empty string = top-level.",
    )

    explain = sub.add_parser(
        "explain",
        help="Fetch statistical survey description (statisticsExplData.do).",
    )
    _add_common_flags(explain)
    explain.add_argument(
        "--stat-id",
        help="Statistics survey ID (alternative to --org-id/--table-id).",
    )
    explain.add_argument("--org-id", help="Organization ID (with --table-id).")
    explain.add_argument("--table-id", help="KOSIS table ID (with --org-id).")
    explain.add_argument(
        "--meta-itm",
        default="All",
        help="Requested field(s): All(전체) or comma-separated list "
        "(statsNm,statsKind,writingPurps,...). Default All.",
    )

    indicator = sub.add_parser(
        "indicator",
        help="Fetch key indicator metadata (pkNumberService.do).",
    )
    _add_common_flags(indicator)
    indicator.add_argument(
        "--service",
        type=parse_indicator_service,
        default="1",
        help="Sub-service: 1(개념) 2(산정방법·출처) 3(전체설명). Default 1.",
    )
    indicator.add_argument(
        "--jipyo-id",
        required=True,
        help="Indicator ID (e.g. 160).",
    )
    indicator.add_argument(
        "--page-no",
        type=int,
        default=1,
        help="Page number (default 1).",
    )
    indicator.add_argument(
        "--num-of-rows",
        type=int,
        default=10,
        help="Rows per page (default 10).",
    )

    return parser.parse_args(argv)


def load_secrets_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    secrets: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        secrets[key.strip()] = value.strip().strip('"').strip("'")
    return secrets


def resolve_api_key(
    *,
    env: dict[str, str] | None = None,
    secrets_path: Path | None = None,
) -> str:
    env_map = env if env is not None else os.environ
    direct = env_map.get("KSKILL_KOSIS_API_KEY")
    if direct:
        return direct.strip()

    candidate = secrets_path or Path("~/.config/k-skill/secrets.env").expanduser()
    secrets = load_secrets_env(candidate)
    fallback = secrets.get("KSKILL_KOSIS_API_KEY")
    if fallback:
        return fallback.strip()

    raise SystemExit(
        "missing required environment variable: KSKILL_KOSIS_API_KEY\n"
        "발급: https://kosis.kr/openapi/ (무료, KOSIS 회원가입 후 활용신청)\n"
        "참조: kosis-stats/references/kosis-openapi-guide.md"
    )


def resolve_proxy_base_url(
    explicit_base_url: str | None = None,
    env: dict[str, str] | None = None,
) -> str:
    env_map = env if env is not None else os.environ
    candidate = (explicit_base_url or env_map.get(PROXY_BASE_URL_ENV_VAR) or "").strip()
    if candidate.casefold() in {"off", "false", "0", "disable", "disabled", "none"}:
        raise SystemExit(f"{PROXY_BASE_URL_ENV_VAR} is disabled; pass --direct to use KSKILL_KOSIS_API_KEY.")
    if candidate and candidate != "replace-me":
        return candidate.rstrip("/")
    return DEFAULT_PROXY_BASE_URL


def parse_obj_l(values: list[str]) -> dict[str, str]:
    objs: dict[str, str] = {}
    for raw in values:
        if "=" not in raw:
            raise SystemExit(f"--obj-l must be N=VALUE, got: {raw}")
        key, _, value = raw.partition("=")
        key = key.strip()
        if not key.isdigit() or not 1 <= int(key) <= 8:
            raise SystemExit(f"--obj-l index must be 1..8, got: {key}")
        objs[f"objL{key}"] = value.strip() or "ALL"
    if not objs:
        objs["objL1"] = "ALL"
    return objs


def build_search_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    return {
        "method": "getList",
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "searchNm": args.query,
        "resultCount": str(args.result_count),
        "startCount": str(args.start_count),
    }


def build_meta_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    return {
        "method": "getMeta",
        "type": args.meta_type,
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "orgId": args.org_id,
        "tblId": args.table_id,
    }


def build_data_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    params: dict[str, str] = {
        "method": "getList",
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "orgId": args.org_id,
        "tblId": args.table_id,
        "itmId": args.itm_id,
        "prdSe": args.prd_se,
        "startPrdDe": args.start,
        "endPrdDe": args.end,
    }
    params.update(parse_obj_l(args.obj_l))
    return params


def build_bigdata_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    params: dict[str, str] = {
        "method": "getList",
        "apiKey": api_key,
        "format": args.bigdata_format,
        "jsonVD": "Y",
        "userStatsId": args.user_stats_id,
    }
    if args.prd_se:
        params["prdSe"] = args.prd_se
    if args.new_est_prd_cnt is not None:
        params["newEstPrdCnt"] = str(args.new_est_prd_cnt)
    return params


def build_list_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    return {
        "method": "getList",
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "vwCd": args.vw_cd,
        "parentId": args.parent_id,
    }


def build_explain_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    params: dict[str, str] = {
        "method": "getList",
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "metaItm": args.meta_itm,
    }
    if args.stat_id:
        params["statId"] = args.stat_id
    elif args.org_id and args.table_id:
        params["orgId"] = args.org_id
        params["tblId"] = args.table_id
    else:
        raise SystemExit(
            "explain requires either --stat-id or both --org-id and --table-id."
        )
    return params


def build_indicator_params(api_key: str, args: argparse.Namespace) -> dict[str, str]:
    return {
        "method": "getList",
        "apiKey": api_key,
        "format": "json",
        "jsonVD": "Y",
        "service": args.service,
        "serviceDetail": "pkNotion" if args.service == "1" else "pkCalcSource"
        if args.service == "2" else "pkAll",
        "jipyoId": args.jipyo_id,
        "pageNo": str(args.page_no),
        "numOfRows": str(args.num_of_rows),
    }


def build_url(base: str, params: dict[str, str]) -> str:
    query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return f"{base}?{query}"


def fetch_text(url: str, timeout: int) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "k-skill/kosis-stats"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise KosisError(str(exc.code), f"HTTP {exc.code}: {body[:200]}") from exc
    except urllib.error.URLError as exc:
        raise KosisError(None, f"network error: {exc.reason}") from exc


def fix_unquoted_keys(text: str) -> str:
    """KOSIS sometimes returns JSON with unquoted keys."""
    return re.sub(r'([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', text)


def parse_kosis_json(text: str) -> Any:
    body = text.strip()
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return json.loads(fix_unquoted_keys(body))


_XML_ERROR_RE = re.compile(
    r"<error>\s*<err>([^<]*)</err>\s*<errMsg>([^<]*)</errMsg>", re.IGNORECASE
)


def detect_xml_error(text: str) -> KosisError | None:
    match = _XML_ERROR_RE.search(text)
    if not match:
        return None
    code = match.group(1).strip()
    message = match.group(2).strip()
    hint = ERROR_CODE_HINTS.get(code, "")
    full = f"KOSIS error {code or '?'}: {message}"
    if hint:
        full += f" ({hint})"
    return KosisError(code, full)


def detect_kosis_error(payload: Any) -> KosisError | None:
    if isinstance(payload, dict):
        message = payload.get("errMsg")
        if message:
            code = str(payload.get("err") or payload.get("errCode") or "").strip()
            hint = ERROR_CODE_HINTS.get(code, "")
            full = f"KOSIS error {code or '?'}: {message}"
            if hint:
                full += f" ({hint})"
            return KosisError(code, full)
    return None


def call_kosis(url: str, timeout: int, *, format_hint: str = "json") -> Any:
    text = fetch_text(url, timeout)
    xml_err = detect_xml_error(text)
    if xml_err is not None:
        raise xml_err
    if format_hint != "json":
        stripped = text.lstrip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                payload = parse_kosis_json(text)
            except json.JSONDecodeError:
                return text
            err = detect_kosis_error(payload)
            if err is not None:
                raise err
        return text
    payload = parse_kosis_json(text)
    err = detect_kosis_error(payload)
    if err is not None:
        raise err
    return payload


def render_search_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return (
            "조회 결과가 없습니다. 키워드를 더 짧게(예: '1인 가구' → '가구') "
            "또는 다른 표현으로 재검색해 보세요. "
            "`--result-count` 와 `--start-count` 로 더 많은 후보를 페이징할 수도 있습니다."
        )
    lines = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        org = entry.get("ORG_NM", "?")
        tbl = entry.get("TBL_NM", "?")
        org_id = entry.get("ORG_ID", "?")
        tbl_id = entry.get("TBL_ID", "?")
        prd = f"{entry.get('STRT_PRD_DE', '?')}~{entry.get('END_PRD_DE', '?')}"
        lines.append(f"- [{org_id}/{tbl_id}] {org} / {tbl} ({prd})")
    lines.append(
        "\nNext: `meta --table-id <ID>` 로 분류·항목·단위 확인 → "
        "`data --table-id <ID> --prd-se <Y|M|Q|...> --start ... --end ...` 로 작은 슬라이스부터 받기."
    )
    return "\n".join(lines)


def render_meta_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return (
            "메타 정보가 없습니다. 표가 해당 메타 타입을 지원하지 않을 수 있습니다. "
            "다른 `--meta-type` (TBL/ITM/OBJ) 을 시도해 보세요."
        )
    lines = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        kr = entry.get("TBL_NM") or entry.get("ITM_NM") or entry.get("C_NM") or "?"
        en = entry.get("TBL_NM_ENG") or entry.get("ITM_NM_ENG") or entry.get("C_NM_ENG") or ""
        suffix = f" / {en}" if en else ""
        lines.append(f"- {kr}{suffix}")
    return "\n".join(lines)


def render_data_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return (
            "데이터가 없습니다. 기간(`--start`/`--end`), 항목(`--itm-id`), "
            "분류(`--obj-l`) 필터를 완화하거나 `meta` 로 표 구조를 다시 확인하세요."
        )
    lines = []
    units: set[str] = set()
    periods: set[str] = set()
    for entry in payload[:50]:
        if not isinstance(entry, dict):
            continue
        prd = str(entry.get("PRD_DE", "?"))
        unit = str(entry.get("UNIT_NM", "")).strip()
        item = entry.get("ITM_NM", "?")
        c1 = entry.get("C1_NM", "")
        value = entry.get("DT", "?")
        suffix = f" ({c1})" if c1 else ""
        unit_suffix = f" {unit}" if unit else ""
        lines.append(f"- {prd} | {item}{suffix} = {value}{unit_suffix}".rstrip())
        if unit:
            units.add(unit)
        periods.add(prd)
    if len(payload) > 50:
        lines.append(f"... ({len(payload) - 50} rows omitted; --json 으로 전체 받기)")
    summary_parts = [f"rows={len(payload)}"]
    if periods:
        period_list = sorted(p for p in periods if p and p != "?")
        if period_list:
            summary_parts.append(
                f"period={period_list[0]}~{period_list[-1]}"
                if len(period_list) > 1 else f"period={period_list[0]}"
            )
    if units:
        summary_parts.append("unit=" + ",".join(sorted(units)))
    else:
        summary_parts.append("unit=(KOSIS 응답에 UNIT_NM 미포함)")
    lines.append("\n[summary] " + ", ".join(summary_parts))
    return "\n".join(lines)


_EXPLAIN_FIELD_LABELS: dict[str, str] = {
    "statsNm": "조사명",
    "statsKind": "작성유형",
    "statsEnd": "통계종류",
    "statsContinue": "계속여부",
    "basisLaw": "법적근거",
    "writingPurps": "조사목적",
    "examinPd": "조사기간",
    "statsPeriod": "조사주기",
    "writingSystem": "조사체계",
    "writingTel": "연락처",
    "statsField": "통계분야·실태",
    "examinObjrange": "조사대상범위",
    "examinObjArea": "조사대상지역",
    "josaUnit": "조사단위·규모",
    "applyGroup": "적용분류",
    "josaItm": "조사항목",
    "pubPeriod": "공표주기",
    "pubExtent": "공표범위",
    "pubDate": "공표시기",
    "publictMth": "공표방법/URL",
    "examinTrgetPd": "조사대상기간/기준시점",
    "dataUserNote": "자료이용시 유의사항",
    "mainTermExpl": "주요 용어해설",
    "dataCollectMth": "자료 수집방법",
    "examinHistory": "조사연혁",
    "confmNo": "승인번호",
    "confmDt": "승인일자",
}


def render_list_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return (
            "조회 결과가 없습니다. --parent-id 를 비워 최상위 카테고리를 보거나, "
            "다른 --vw-cd (서비스뷰 코드)를 시도하세요."
        )
    lines: list[str] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        list_id = entry.get("LIST_ID", "")
        list_nm = entry.get("LIST_NM", "?")
        org_id = entry.get("ORG_ID", "")
        tbl_id = entry.get("TBL_ID", "")
        tbl_nm = entry.get("TBL_NM", "")
        send_de = entry.get("SEND_DE", "")
        if tbl_id:
            lines.append(f"- [{list_id}] {list_nm} → [{org_id}/{tbl_id}] {tbl_nm} (갱신: {send_de})")
        else:
            lines.append(f"- [{list_id}] {list_nm}")
    lines.append(
        "\nNext: 하위 카테고리는 `list --vw-cd <코드> --parent-id <LIST_ID>`. "
        "통계표는 `meta --table-id <TBL_ID>` 또는 `data --table-id <TBL_ID> ...`."
    )
    return "\n".join(lines)


def render_explain_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return (
            "설명 정보가 없습니다. statId 또는 orgId+tblId 를 재확인하세요. "
            "`search --query <키워드>` 로 정확한 ID를 찾을 수 있습니다."
        )
    lines: list[str] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        lines.append("---")
        for field, label in _EXPLAIN_FIELD_LABELS.items():
            value = entry.get(field, "")
            if value:
                lines.append(f"{label}: {value}")
    if len(lines) == 1 and lines[0] == "---":
        return "설명 정보 필드가 모두 비어 있습니다. 다른 --meta-itm 을 시도하세요."
    return "\n".join(lines)


def render_indicator_text(payload: Any) -> str:
    if not isinstance(payload, list) or not payload:
        return (
            "지표 정보가 없습니다. --jipyo-id 를 확인하세요. "
            "KOSIS 개발가이드에서 사용 가능한 지표ID 목록을 볼 수 있습니다."
        )
    lines: list[str] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        jipyo_id = entry.get("statJipyoId", entry.get("jipyoId", "?"))
        jipyo_nm = entry.get("statJipyoNm", entry.get("jipyoNm", "?"))
        title = entry.get("jipyoExplan", "")
        concept = entry.get("jipyoExplan1", entry.get("jipyoCalc", ""))
        lines.append(f"- [{jipyo_id}] {jipyo_nm}")
        if title:
            lines.append(f"  제목: {title}")
        if concept:
            # Truncate long text fields
            display = concept[:500] if len(concept) > 500 else concept
            lines.append(f"  내용: {display}")
            if len(concept) > 500:
                lines.append(f"  ... ({len(concept) - 500}자 생략, --json으로 전체)")
    return "\n".join(lines)


def render_text(command: str, payload: Any) -> str:
    if command == "search":
        return render_search_text(payload)
    if command == "meta":
        return render_meta_text(payload)
    if command == "data":
        return render_data_text(payload)
    if command == "list":
        return render_list_text(payload)
    if command == "explain":
        return render_explain_text(payload)
    if command == "indicator":
        return render_indicator_text(payload)
    return json.dumps(payload, ensure_ascii=False, indent=2)


def cite_endpoint(command: str) -> str:
    return {
        "search": SEARCH_URL,
        "meta": META_URL,
        "data": DATA_URL,
        "bigdata": BIGDATA_URL,
        "list": LIST_URL,
        "explain": EXPLAIN_URL,
        "indicator": INDICATOR_URL,
    }[command]


def should_use_proxy(args: argparse.Namespace) -> bool:
    return args.command in {"search", "meta", "data", "list", "explain", "indicator"} and not args.direct


def proxy_endpoint(command: str, base_url: str) -> str:
    path = {
        "search": "/v1/kosis/search",
        "meta": "/v1/kosis/meta",
        "data": "/v1/kosis/data",
        "list": "/v1/kosis/list",
        "explain": "/v1/kosis/explain",
        "indicator": "/v1/kosis/indicator",
    }[command]
    return f"{base_url.rstrip('/')}{path}"


def params_without_api_key(params: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in params.items() if key != "apiKey"}


def run(args: argparse.Namespace) -> int:
    use_json = args.json or not args.text

    use_proxy = should_use_proxy(args)

    if use_proxy or args.dry_run:
        api_key = "<PROXY>" if use_proxy else "<DRY-RUN>"
    else:
        api_key = resolve_api_key()

    builder = {
        "search": build_search_params,
        "meta": build_meta_params,
        "data": build_data_params,
        "bigdata": build_bigdata_params,
        "list": build_list_params,
        "explain": build_explain_params,
        "indicator": build_indicator_params,
    }[args.command]
    base = cite_endpoint(args.command)
    params = builder(api_key, args)
    if use_proxy:
        call_base = proxy_endpoint(args.command, resolve_proxy_base_url(args.proxy_base_url))
        call_params = params_without_api_key(params)
    else:
        call_base = base
        call_params = params
    url = build_url(call_base, call_params)

    if args.dry_run:
        redacted = dict(call_params)
        if not use_proxy and "apiKey" in redacted:
            redacted["apiKey"] = "<DRY-RUN>"
        if use_json:
            print(json.dumps({
                "endpoint": call_base,
                "upstream_endpoint": base,
                "via_proxy": use_proxy,
                "params": redacted,
                "url": build_url(call_base, redacted)
            }, ensure_ascii=False, indent=2))
        else:
            print(f"endpoint: {call_base}")
            print(f"upstream_endpoint: {base}")
            print(f"via_proxy: {str(use_proxy).lower()}")
            print(f"url: {build_url(call_base, redacted)}")
            for key, value in redacted.items():
                print(f"  {key}={value}")
        return 0

    format_hint = params.get("format", "json")
    try:
        payload = call_kosis(url, args.timeout, format_hint=format_hint)
    except KosisError as exc:
        sys.stderr.write(f"{exc}\n")
        return 2

    if use_json:
        if isinstance(payload, str):
            sys.stdout.write(payload)
            if not payload.endswith("\n"):
                sys.stdout.write("\n")
        else:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(render_text(args.command, payload))
        print(f"\nsource: {base}")
        if use_proxy:
            print(f"via: {call_base}")

    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
