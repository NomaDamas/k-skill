#!/usr/bin/env python3
"""Read-only Fair Trade Commission (공정거래위원회) franchise lookup helper.

Site-dependent access path (discovered 2026-09-26 from the public FairData
`개방 데이터 > 오픈API` listing and the data.go.kr OpenAPI swagger for each
dataset below):

    https://fairdata.go.kr/ext/data/useGuidance.do   (portal entry point)
      -> 오픈API이용안내: 인증키는 공공데이터포털(data.go.kr)에서 발급
    https://fairdata.go.kr/ext/data/selectOpenDtls.do (POST JSON) lists the
      franchise OpenAPIs; each item points at a data.go.kr dataset id.
    GET https://apis.data.go.kr/1130000/<Service>/<operation>
        ?serviceKey=<data.go.kr 인증키>
        &pageNo=<n>
        &numOfRows=<n>
        &resultType=json
        &jngBizCrtraYr=<가맹사업기준년도>   # 목록/상세 계열
        &brandMnno=<브랜드관리번호>          # 브랜드 상세 계열
        &jnghdqrtrsMnno=<가맹본부관리번호>   # 가맹본부 상세 계열

Datasets used (dataset id -> gateway service):

    15125467 FftcBrandRlsInfo2_Service/getBrandinfo
             브랜드 목록 (브랜드명 검색의 진입점; 기준년도만 받고 필터 파라미터가
             없어 브랜드명 필터는 이 helper가 페이지를 넘기며 클라이언트에서 한다)
    15125441 FftcJnghdqrtrsRgsInfo2_Service/getjnghdqrtrsListinfo
             가맹본부 등록 목록 (가맹본부 상호명 검색)
    15125450 FftcJnghdqrtrsGnrlDtl3_Service/getjnghdqrtrsGnlinfo2
             가맹본부 일반 정보 상세 (대표자·주소·기업규모·브랜드수 등)
    15125490 FftcBrandFrcsDropInfo3_Service/getbrandFrcsDmsstus2
             브랜드 지역별 가맹점수·직영점수
    15125491 FftcBrandFrcsChghst2_Service/getbrandFrcsFlctnstus
             브랜드 가맹점 변경현황 (연초/신규/계약종료/계약해지/연말 등)
    15125494 FftcBrandFrcsUnitAvrSalInfo3_Service/getbrandFrcsBzmnAvrgsls2
             브랜드 가맹점 연간/면적당 평균매출 범위값
    15125517 FftcBrandCompInfo2_Service/getbrandCompListinfo
             브랜드 비교 목록 (예치금/가맹금/보증금/계약년수 등 범위값)

The upstream gateway requires a public-data-portal `serviceKey`; the key is
read only from the environment or from a local dotenv file. It is never
written to source, URLs printed to logs, or cache files. This helper is
lookup-only and never performs a side effect.

Credential resolution order (matches the repo `vault` fallback):

    KSKILL_FAIRDATA_API_KEY -> DATA_GO_KR_API_KEY
    -> `${KSKILL_SECRETS_PATH:-~/.config/k-skill/secrets.env}` same keys

Use the data.go.kr **Decoding (일반) 인증키**; this helper URL-encodes it.
"""

from __future__ import annotations

import argparse
import datetime as _datetime
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

DEFAULT_API_BASE = "https://apis.data.go.kr/1130000"
API_KEY_ENV_PRIMARY = "KSKILL_FAIRDATA_API_KEY"
API_KEY_ENV_FALLBACK = "DATA_GO_KR_API_KEY"
DEFAULT_SECRETS_PATH = "~/.config/k-skill/secrets.env"
SECRETS_PATH_ENV = "KSKILL_SECRETS_PATH"
USER_AGENT = "k-skill-franchise-fairdata-search/0.1 (+https://github.com/NomaDamas/k-skill)"
SOURCE = "공정거래위원회 가맹정보 OpenAPI (apis.data.go.kr)"
DEFAULT_NUM_OF_ROWS = 100
DEFAULT_MAX_PAGES = 30
DEFAULT_TIMEOUT = 30
# How many name matches to collect when resolving a single brand/HQ for a
# detail lookup. Two is enough to detect that a partial match is ambiguous
# without paying for a full result list.
AMBIGUITY_PROBE_LIMIT = 2

# fetch_pages stop reasons. `exhausted` means the whole dataset was scanned, so
# a client-side name match set is definitive. `limit`/`max_pages` mean the scan
# was cut short and may be incomplete.
STOP_EXHAUSTED = "exhausted"
STOP_LIMIT = "limit"
STOP_MAX_PAGES = "max_pages"

MISSING_KEY_MSG = (
    f"{API_KEY_ENV_PRIMARY} (또는 {API_KEY_ENV_FALLBACK}) 가 없습니다. "
    "공공데이터포털(data.go.kr)에서 인증키를 발급받아 환경변수 또는 "
    "~/.config/k-skill/secrets.env 에 설정하세요."
)
INVALID_JSON_MSG = "공정위 가맹정보 API 응답이 JSON이 아닙니다 (점검/차단/게이트웨이 오류 가능성)."
NETWORK_DOWN_MSG = "공정위 가맹정보 API에 연결하지 못했습니다. 네트워크 또는 data.go.kr 상태를 확인하세요."
DRY_RUN_NOTICE = "dry-run: 실제 호출 없이 요청 URL만 출력했습니다 (serviceKey는 REDACTED)."

# gateway service + operation for each dataset, plus the parameter that scopes
# a detail call. `extra_params` are the required detail parameters in order.
SERVICES: Dict[str, Dict[str, Any]] = {
    "brand_list": {
        "service": "FftcBrandRlsInfo2_Service",
        "operation": "getBrandinfo",
        "year_param": "jngBizCrtraYr",
        "extra_params": (),
        "dataset_id": "15125467",
        "title": "가맹정보_브랜드 목록",
        "legacy_url": "http://openapi.ftc.go.kr/FftcBrandRlsInfo2_Service/getBrandinfo",
        "result_key": "item",
    },
    "hq_list": {
        "service": "FftcJnghdqrtrsRgsInfo2_Service",
        "operation": "getjnghdqrtrsListinfo",
        "year_param": "jngBizCrtraYr",
        "extra_params": (),
        "dataset_id": "15125441",
        "title": "가맹정보_가맹본부 등록 목록",
        "legacy_url": "http://openapi.ftc.go.kr/FftcJnghdqrtrsRgsInfo2_Service/getjnghdqrtrsListinfo",
        "result_key": "item",
    },
    "hq_detail": {
        "service": "FftcJnghdqrtrsGnrlDtl3_Service",
        "operation": "getjnghdqrtrsGnlinfo2",
        "year_param": "jngBizCrtraYr",
        "extra_params": ("jnghdqrtrsMnno",),
        "dataset_id": "15125450",
        "title": "가맹정보_가맹본부 일반 정보 상세",
        "legacy_url": "http://openapi.ftc.go.kr/FftcJnghdqrtrsGnrlDtl2_Service/getjnghdqrtrsGnlinfo",
        "result_key": "item",
    },
    "stores": {
        "service": "FftcBrandFrcsDropInfo3_Service",
        "operation": "getbrandFrcsDmsstus2",
        "year_param": "jngBizCrtraYr",
        "extra_params": ("brandMnno",),
        "dataset_id": "15125490",
        "title": "가맹정보_브랜드 가맹점 및 직영점",
        "legacy_url": "http://openapi.ftc.go.kr/FftcBrandFrcsDropInfo2_Service/getbrandFrcsDmsstus",
        "result_key": "item",
    },
    "changes": {
        "service": "FftcBrandFrcsChghst2_Service",
        "operation": "getbrandFrcsFlctnstus",
        "year_param": "jngBizCrtraYr",
        "extra_params": ("brandMnno",),
        "dataset_id": "15125491",
        "title": "가맹정보_브랜드 가맹점 변경현황",
        "legacy_url": "http://openapi.ftc.go.kr/FftcBrandFrcsChghst2_Service/getbrandFrcsFlctnstus",
        "result_key": "item",
    },
    "sales": {
        "service": "FftcBrandFrcsUnitAvrSalInfo3_Service",
        "operation": "getbrandFrcsBzmnAvrgsls2",
        "year_param": "jngBizCrtraYr",
        "extra_params": ("brandMnno",),
        "dataset_id": "15125494",
        "title": "가맹정보_브랜드 가맹점 단위면적당 평균 매출액",
        "legacy_url": "http://openapi.ftc.go.kr/FftcBrandFrcsUnitAvrSalInfo2_Service/getbrandFrcsBzmnAvrgsls",
        "result_key": "item",
    },
    "brand_compare": {
        "service": "FftcBrandCompInfo2_Service",
        "operation": "getbrandCompListinfo",
        "year_param": "jngBizCrtraYr",
        "extra_params": ("brandMnno",),
        "dataset_id": "15125517",
        "title": "가맹정보_브랜드 비교 목록",
        "legacy_url": "http://openapi.ftc.go.kr/FftcBrandCompInfo2_Service/getbrandCompListinfo",
        "result_key": "item",
    },
}

# Human labels for the upstream field names that this helper surfaces. Keeping
# the upstream codes as keys avoids silently mis-mapping an upstream rename.
FIELD_LABELS: Dict[str, str] = {
    # brand / hq lists
    "jngBizCrtraYr": "가맹사업기준년도",
    "jngBizStrtDate": "가맹사업개시일자",
    "brandMnno": "브랜드관리번호",
    "jnghdqrtrsMnno": "가맹본부관리번호",
    "brandNm": "브랜드명",
    "jnghdqrtrsConmNm": "가맹본부 상호명",
    "jnghdqrtrsRprsvNm": "가맹본부대표자명",
    "brno": "사업자등록번호",
    "crno": "법인등록번호",
    "indvdlCorpSeCd": "개인법인구분코드 (10 개인, 11 법인)",
    "indutyLclasNm": "업종대분류명",
    "indutyMlsfcNm": "업종중분류명",
    "indutySclasNm": "업종소분류명",
    "majrGdsNm": "주요상품명",
    # hq detail
    "hmpgUrladr": "홈페이지주소",
    "areaNm": "지역명",
    "bzmnRgsDate": "사업자등록일자",
    "corpRgDate": "법인등기일자",
    "jnghdqrtrsRprsTelno": "가맹본부대표전화번호",
    "jnghdqrtrsRprsFxno": "가맹본부대표팩스번호",
    "jnghdqrtrsOzip": "가맹본부구우편번호",
    "lctnAddr": "소재지주소",
    "lctnDaddr": "소재지상세주소",
    "brandCnt": "브랜드수",
    "affltsCnt": "계열회사수",
    "jngInstNm": "가맹기관명",
    "entScaleNm": "기업규모명",
    # stores
    "allFrcsDmsCnt": "전체가맹점직영점수",
    "acntgYr": "회계년도",
    "frcsCnt": "가맹점수",
    "dmsCnt": "직영점수",
    # changes
    "frcsAvrgBsnDycnt": "가맹점평균영업일수",
    "ystFrcsCnt": "연초가맹점수",
    "newFrcsCnt": "신규가맹점수",
    "ctrtEndFrcsCnt": "계약종료가맹점수",
    "ctrtCncltnFrcsCnt": "계약해지가맹점수",
    "cntrrChgCnt": "계약자변경수",
    "yndFrcsCnt": "연말가맹점수",
    "bsnProgrsFrcsCnt": "영업진행가맹점수",
    # sales
    "fyerAvrgSlsAmtScopeVal": "연간평균매출금액범위값 (편차 5%)",
    "arFyerAvrgSlsAmtScopeVal": "면적연간평균매출금액범위값 (편차 5%)",
    # brand compare
    "crrncyUnitCdNm": "화폐단위코드명",
    "depoAmtScopeVal": "예치금액범위값",
    "depoSystemYn": "예치제도여부",
    "insrncYn": "보험여부",
    "cprscYn": "공제조합여부",
    "detAssrncCtrtYn": "채무보증계약여부",
    "rlvtNthgYn": "해당없음여부",
    "jngAmtScopeVal": "가맹금액범위값",
    "eduAmtScopeVal": "교육금액범위값",
    "assrncAmtScopeVal": "보증금액범위값",
    "etcAmtScopeVal": "기타금액범위값",
    "smtnAmtScopeVal": "합계금액범위값",
    "storCrtraAr": "점포기준면적",
    "intrrAmtScopeVal": "인테리어금액범위값",
    "unitArIntrrAmtScopeVal": "단위면적인테리어금액범위값",
    "frstCtrtYycnt": "최초계약년수",
    "etCtrtYycnt": "연장계약년수",
}

# data.go.kr OpenAPI standard result codes.
OK_CODES = frozenset({"00"})
EMPTY_CODES = frozenset({"03"})
ERROR_HINTS: Dict[str, str] = {
    "01": "공정위 가맹정보 API 내부 오류(01). 잠시 후 재시도하세요.",
    "02": "공정위 가맹정보 API DB 오류(02). 잠시 후 재시도하세요.",
    "04": "허용되지 않은 HTTP 요청(04). endpoint와 파라미터를 확인하세요.",
    "05": "공정위 가맹정보 API 응답 시간 초과(05). 잠시 후 재시도하세요.",
    "10": "요청 파라미터 오류(10). 연도(4자리)와 브랜드/가맹본부 관리번호를 확인하세요.",
    "12": "존재하지 않거나 폐기된 OpenAPI 서비스(12).",
    "20": "활용신청/권한 없음(20). 해당 데이터셋 활용신청과 키 권한을 확인하세요.",
    "21": "활용신청이 일시중지 상태(21)입니다.",
    "22": "일일 호출 한도 초과(22). 트래픽 증설을 신청하거나 다음 날 재시도하세요.",
    "23": "초당 호출 한도 초과(23). 잠시 후 재시도하세요.",
    "29": "차단된 IP에서 호출(29). 호출 IP를 확인하세요.",
    "30": f"등록되지 않은 인증키(30). {API_KEY_ENV_PRIMARY} 값을 확인하세요.",
    "31": "인증키 사용기한 만료(31). 공공데이터포털에서 이용기간을 갱신하세요.",
}

_NAME_SPACE_RE = re.compile(r"\s+")
_YEAR_RE = re.compile(r"^\d{4}$")
_MNNO_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class HelperError(RuntimeError):
    """Usage/validation error raised before or instead of an upstream call."""


class ApiError(RuntimeError):
    """Upstream/gateway error with an optional HTTP status code."""

    def __init__(self, message: str, *, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _text_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_or_zero(value: Any) -> int:
    text = _text_or_none(value)
    if text is None:
        return 0
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return 0


# --------------------------------------------------------------------------
# credential handling
# --------------------------------------------------------------------------
def load_secrets(path: pathlib.Path) -> Dict[str, str]:
    """Parse a `KEY=VALUE` dotenv file. Missing/unreadable files yield {}."""
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


def resolve_secrets_path(env: Optional[Mapping[str, str]] = None) -> pathlib.Path:
    env = os.environ if env is None else env
    explicit = _text_or_none(env.get(SECRETS_PATH_ENV))
    return pathlib.Path(explicit or DEFAULT_SECRETS_PATH).expanduser()


def resolve_api_key(
    env: Optional[Mapping[str, str]] = None,
    secrets_path: Optional[pathlib.Path] = None,
) -> Optional[str]:
    env = os.environ if env is None else env
    for var in (API_KEY_ENV_PRIMARY, API_KEY_ENV_FALLBACK):
        value = _text_or_none(env.get(var))
        if value and value != "replace-me":
            return value
    secrets = load_secrets(secrets_path or resolve_secrets_path(env))
    for var in (API_KEY_ENV_PRIMARY, API_KEY_ENV_FALLBACK):
        value = _text_or_none(secrets.get(var))
        if value and value != "replace-me":
            return value
    return None


# --------------------------------------------------------------------------
# input normalization
# --------------------------------------------------------------------------
def normalize_year(value: Any, *, default: Optional[str] = None) -> str:
    text = _text_or_none(value)
    if text is None:
        if default is None:
            raise HelperError("가맹사업기준년도(--year, 4자리)를 입력하세요.")
        return default
    if not _YEAR_RE.match(text):
        raise HelperError(f"연도는 4자리 숫자여야 합니다: {text!r}")
    year = int(text)
    if not 2000 <= year <= _datetime.date.today().year + 1:
        raise HelperError(f"연도 범위가 올바르지 않습니다: {text!r}")
    return text


def default_year(today: Optional[_datetime.date] = None) -> str:
    today = today or _datetime.date.today()
    return str(today.year - 1)


def normalize_mnno(value: Any, label: str) -> str:
    text = _text_or_none(value)
    if text is None:
        raise HelperError(f"{label}를 입력하세요.")
    if not _MNNO_RE.match(text):
        raise HelperError(f"{label} 형식이 올바르지 않습니다: {text!r}")
    return text


def normalize_brand_mnno(value: Any) -> str:
    return normalize_mnno(value, "브랜드관리번호(brandMnno)")


def normalize_hq_mnno(value: Any) -> str:
    return normalize_mnno(value, "가맹본부관리번호(jnghdqrtrsMnno)")


def normalize_name(value: Any, label: str) -> str:
    text = _text_or_none(value)
    if text is None:
        raise HelperError(f"{label}를 입력하세요.")
    return text


def name_key(value: Any) -> str:
    """Normalize a brand/HQ name for whitespace- and case-insensitive matching."""
    text = _text_or_none(value) or ""
    return _NAME_SPACE_RE.sub("", text).casefold()


def name_matches(candidate: Any, query: str) -> bool:
    needle = name_key(query)
    return bool(needle) and needle in name_key(candidate)


# --------------------------------------------------------------------------
# request building
# --------------------------------------------------------------------------
def build_url(
    service_key: str,
    api_key: str,
    *,
    year: str,
    extra: Optional[Mapping[str, str]] = None,
    api_base: Optional[str] = None,
    page: int = 1,
    num_of_rows: int = DEFAULT_NUM_OF_ROWS,
    result_type: str = "json",
) -> str:
    spec = SERVICES[service_key]
    base = (api_base or DEFAULT_API_BASE).rstrip("/")
    params: List[Tuple[str, str]] = [
        ("serviceKey", api_key),
        ("pageNo", str(page)),
        ("numOfRows", str(num_of_rows)),
        ("resultType", result_type),
        (spec["year_param"], str(year)),
    ]
    for name in spec["extra_params"]:
        value = _text_or_none((extra or {}).get(name))
        if value is None:
            raise HelperError(f"{spec['title']} 조회에 {name} 값이 필요합니다.")
        params.append((name, value))
    query = urllib.parse.urlencode(params)
    return f"{base}/{spec['service']}/{spec['operation']}?{query}"


def redact_url(url: str) -> str:
    """Replace the serviceKey value so a URL can be printed without leaking it."""
    return re.sub(r"(serviceKey=)[^&]*", r"\1REDACTED", url)


# --------------------------------------------------------------------------
# response parsing
# --------------------------------------------------------------------------
def _gateway_header(payload: Mapping[str, Any]) -> Optional[Mapping[str, Any]]:
    header = payload.get("cmmMsgHeader")
    return header if isinstance(header, dict) else None


def _split_envelope(payload: Mapping[str, Any]) -> Tuple[Mapping[str, Any], Mapping[str, Any]]:
    envelope = payload.get("response")
    if isinstance(envelope, dict):
        header = envelope.get("header")
        body = envelope.get("body")
        return (
            header if isinstance(header, dict) else {},
            body if isinstance(body, dict) else {},
        )
    return payload, payload


def _extract_items(body: Mapping[str, Any]) -> List[Dict[str, Any]]:
    items = body.get("items")
    if isinstance(items, str):
        return []
    if isinstance(items, list):
        return [row for row in items if isinstance(row, dict)]
    if isinstance(items, dict):
        item = items.get("item")
        if isinstance(item, list):
            return [row for row in item if isinstance(row, dict)]
        if isinstance(item, dict):
            return [item]
        if isinstance(item, str):
            return []
    return []


def _error_message(code: str, upstream_message: str) -> str:
    hint = ERROR_HINTS.get(code)
    if hint and upstream_message:
        return f"{hint} (upstream: {upstream_message})"
    if hint:
        return hint
    suffix = f": {upstream_message}" if upstream_message else ""
    return f"공정위 가맹정보 API 오류 [{code or 'unknown'}]{suffix}"


def normalize_payload(payload: Any) -> Tuple[Optional[int], List[Dict[str, Any]]]:
    """Return (total_count, items) or raise ApiError for non-OK result codes."""
    if not isinstance(payload, dict):
        raise ApiError(INVALID_JSON_MSG)
    gateway = _gateway_header(payload)
    if gateway is not None:
        code = str(
            _text_or_none(gateway.get("returnReasonCode"))
            or _text_or_none(gateway.get("returnReasonCode2"))
            or ""
        )
        message = str(
            _text_or_none(gateway.get("returnAuthMsg"))
            or _text_or_none(gateway.get("errMsg"))
            or ""
        )
        raise ApiError(_error_message(code, message))
    header, body = _split_envelope(payload)
    code = str(
        _text_or_none(header.get("resultCode")) or _text_or_none(payload.get("resultCode")) or ""
    )
    message = str(
        _text_or_none(header.get("resultMsg")) or _text_or_none(payload.get("resultMsg")) or ""
    )
    if code in EMPTY_CODES:
        return 0, []
    if code and code not in OK_CODES:
        raise ApiError(_error_message(code, message))
    total = _int_or_zero(body.get("totalCount"))
    return total, _extract_items(body)


def http_get_json(url: str, timeout: int = DEFAULT_TIMEOUT) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            payload = json.loads(error.read().decode("utf-8", "replace"))
            header, _ = _split_envelope(payload)
            detail = str(_text_or_none(header.get("resultCode")) or "")
        except (json.JSONDecodeError, UnicodeDecodeError):
            detail = ""
        if detail:
            raise ApiError(_error_message(detail, ""), status_code=error.code) from None
        raise ApiError(
            f"공정위 가맹정보 API HTTP {error.code} 오류. "
            "인증키/활용신청/호출량을 확인하세요.",
            status_code=error.code,
        ) from error
    except urllib.error.URLError as error:
        raise ApiError(NETWORK_DOWN_MSG) from error
    try:
        return json.loads(body)
    except json.JSONDecodeError as error:
        raise ApiError(INVALID_JSON_MSG) from error


# --------------------------------------------------------------------------
# fetch/paging
# --------------------------------------------------------------------------
class QueryContext:
    def __init__(
        self,
        *,
        api_key: str,
        api_base: str,
        fetch: Callable[[str, int], Any],
        timeout: int,
        num_of_rows: int,
        max_pages: int,
    ) -> None:
        self.api_key = api_key
        self.api_base = api_base
        self.fetch = fetch
        self.timeout = timeout
        self.num_of_rows = num_of_rows
        self.max_pages = max_pages

    def url(self, service_key: str, *, year: str, extra: Optional[Mapping[str, str]], page: int) -> str:
        return build_url(
            service_key,
            self.api_key,
            year=year,
            extra=extra,
            api_base=self.api_base,
            page=page,
            num_of_rows=self.num_of_rows,
        )


def fetch_pages(
    ctx: QueryContext,
    service_key: str,
    *,
    year: str,
    extra: Optional[Mapping[str, str]] = None,
    matcher: Optional[Callable[[Mapping[str, Any]], bool]] = None,
    limit: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Page through one dataset, optionally filtering rows client-side.

    The returned meta always states whether the scan finished (`complete`),
    why it stopped (`stop_reason`), and how many rows were scanned, so callers
    never have to guess whether a client-side match set is exhaustive.
    """
    collected: List[Dict[str, Any]] = []
    total: Optional[int] = None
    pages = 0
    scanned = 0
    stop_reason = STOP_EXHAUSTED
    max_pages = max(1, ctx.max_pages)
    for page in range(1, max_pages + 1):
        payload = ctx.fetch(ctx.url(service_key, year=year, extra=extra, page=page), ctx.timeout)
        page_total, rows = normalize_payload(payload)
        total = page_total if page_total is not None else total
        pages = page
        scanned += len(rows)
        hit_limit = False
        for row in rows:
            if matcher is None or matcher(row):
                collected.append(row)
                if limit is not None and len(collected) >= limit:
                    hit_limit = True
                    break
        if hit_limit:
            stop_reason = STOP_LIMIT
            break
        if not rows:
            stop_reason = STOP_EXHAUSTED
            break
        if total is not None and page * ctx.num_of_rows >= total:
            stop_reason = STOP_EXHAUSTED
            break
    else:
        # Ran out of page budget before the dataset signalled its end.
        stop_reason = STOP_MAX_PAGES
    meta = {
        "pages_fetched": pages,
        "total_count": total,
        "num_of_rows": ctx.num_of_rows,
        "max_pages": ctx.max_pages,
        "scanned_rows": scanned,
        "matched_count": len(collected),
        "limit": limit,
        "stop_reason": stop_reason,
        "complete": stop_reason == STOP_EXHAUSTED,
    }
    return collected, meta


# --------------------------------------------------------------------------
# higher-level queries
# --------------------------------------------------------------------------
def search_brands(ctx: QueryContext, *, name: str, year: str, limit: int) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    needle = normalize_name(name, "브랜드명(--brand)")
    return fetch_pages(
        ctx,
        "brand_list",
        year=year,
        matcher=lambda row: name_matches(row.get("brandNm"), needle),
        limit=limit,
    )


def search_hq(ctx: QueryContext, *, name: str, year: str, limit: int) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    needle = normalize_name(name, "가맹본부명(--name)")
    return fetch_pages(
        ctx,
        "hq_list",
        year=year,
        matcher=lambda row: name_matches(row.get("jnghdqrtrsConmNm"), needle),
        limit=limit,
    )


def incomplete_warning(meta: Mapping[str, Any], *, subject: str, empty: bool = False) -> Optional[str]:
    """Explain a non-exhaustive client-side name search, or None if complete."""
    if meta.get("complete", True):
        return None
    if meta.get("stop_reason") == STOP_LIMIT:
        return (
            f"{subject} 검색이 limit({meta.get('limit')})에 도달해 일부만 확인했습니다. "
            "--limit/--max-pages/--num-of-rows 를 늘려 다시 확인하세요."
        )
    prefix = (
        f"{subject} 검색에서 일치 항목을 찾지 못했지만"
        if empty
        else f"{subject} 검색이"
    )
    return (
        f"{prefix} --max-pages({meta.get('max_pages')}) 안에서 끝나지 않아 "
        "전체 목록을 확인하지 못했습니다. --max-pages/--num-of-rows 를 늘려 다시 확인하세요."
    )


def search_status(
    rows: Sequence[Mapping[str, Any]], meta: Mapping[str, Any], *, subject: str
) -> Tuple[str, List[str]]:
    """Map a name search to an explicit result value plus incompleteness warnings."""
    if meta.get("complete", True):
        return ("ok" if rows else "empty"), []
    warning = incomplete_warning(meta, subject=subject, empty=not rows)
    return "partial", [warning] if warning else []


def summarize_stores(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    return {
        "franchise_store_count": sum(_int_or_zero(row.get("frcsCnt")) for row in rows),
        "direct_store_count": sum(_int_or_zero(row.get("dmsCnt")) for row in rows),
        "all_store_count": sum(_int_or_zero(row.get("allFrcsDmsCnt")) for row in rows),
        "row_count": len(rows),
        "totals_basis": "합계는 조회된 지역/업종 행의 단순 합이며 upstream 공식 총계가 아니다",
    }


def summarize_changes(rows: Sequence[Mapping[str, Any]]) -> Optional[Dict[str, Any]]:
    if not rows:
        return None
    row = rows[0]
    return {
        "frcsAvrgBsnDycnt": row.get("frcsAvrgBsnDycnt"),
        "ystFrcsCnt": row.get("ystFrcsCnt"),
        "newFrcsCnt": row.get("newFrcsCnt"),
        "ctrtEndFrcsCnt": row.get("ctrtEndFrcsCnt"),
        "ctrtCncltnFrcsCnt": row.get("ctrtCncltnFrcsCnt"),
        "cntrrChgCnt": row.get("cntrrChgCnt"),
        "yndFrcsCnt": row.get("yndFrcsCnt"),
        "bsnProgrsFrcsCnt": row.get("bsnProgrsFrcsCnt"),
        "acntgYr": row.get("acntgYr"),
    }


def summarize_sales(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    return {
        "fyerAvrgSlsAmtScopeVal": sorted(
            {_text_or_none(row.get("fyerAvrgSlsAmtScopeVal")) for row in rows} - {None}
        ),
        "arFyerAvrgSlsAmtScopeVal": sorted(
            {_text_or_none(row.get("arFyerAvrgSlsAmtScopeVal")) for row in rows} - {None}
        ),
        "row_count": len(rows),
        "basis": "범위값은 upstream이 편차 5% 구간으로 제공하는 값이며 정확한 금액이 아니다",
    }


def _section(
    ctx: QueryContext,
    service_key: str,
    *,
    year: str,
    extra: Mapping[str, str],
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    spec = SERVICES[service_key]
    try:
        rows, meta = fetch_pages(ctx, service_key, year=year, extra=extra, limit=limit)
    except (ApiError, HelperError) as error:
        return {
            "status": "error",
            "dataset_id": spec["dataset_id"],
            "title": spec["title"],
            "rows": [],
            "meta": {},
            "error": str(error),
        }
    status, warnings = search_status(rows, meta, subject=spec["title"])
    return {
        "status": status,
        "dataset_id": spec["dataset_id"],
        "title": spec["title"],
        "rows": rows,
        "meta": meta,
        "warnings": warnings,
        "error": None,
    }


def build_report(
    ctx: QueryContext,
    *,
    brand: Mapping[str, Any],
    year: str,
) -> Dict[str, Any]:
    brand_mnno = _text_or_none(brand.get("brandMnno"))
    hq_mnno = _text_or_none(brand.get("jnghdqrtrsMnno"))
    sections: Dict[str, Any] = {}
    if brand_mnno:
        sections["stores"] = _section(ctx, "stores", year=year, extra={"brandMnno": brand_mnno})
        sections["changes"] = _section(ctx, "changes", year=year, extra={"brandMnno": brand_mnno})
        sections["sales"] = _section(ctx, "sales", year=year, extra={"brandMnno": brand_mnno})
        sections["compare"] = _section(ctx, "brand_compare", year=year, extra={"brandMnno": brand_mnno})
    if hq_mnno:
        sections["hq_detail"] = _section(
            ctx, "hq_detail", year=year, extra={"jnghdqrtrsMnno": hq_mnno}
        )
    summary: Dict[str, Any] = {}
    partial_sections = sorted(
        name for name, value in sections.items() if value.get("status") == "partial"
    )
    warnings = [
        warning
        for name in ("stores", "changes", "sales", "compare", "hq_detail")
        for warning in sections.get(name, {}).get("warnings", [])
    ]
    for name, summarize in (
        ("stores", summarize_stores),
        ("changes", summarize_changes),
        ("sales", summarize_sales),
    ):
        section = sections.get(name)
        if section and section.get("status") in {"ok", "partial"}:
            summary[name] = summarize(section["rows"])
            if section.get("status") == "partial":
                # 잘린 페이지 예산으로 만든 합계를 완전한 값처럼 쓰지 않도록 표시한다.
                summary[name]["partial"] = True
                summary[name]["completeness_note"] = section["warnings"][0]
    failures = [
        {"section": name, "error": value["error"]}
        for name, value in sections.items()
        if value.get("status") == "error"
    ]
    return {
        "brand": dict(brand),
        "summary": summary,
        "sections": sections,
        "failures": failures,
        "partial_sections": partial_sections,
        "warnings": warnings,
    }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def _datasets_block() -> Dict[str, Any]:
    return {
        "datasets": {
            key: {
                "dataset_id": spec["dataset_id"],
                "title": spec["title"],
                "service": spec["service"],
                "operation": spec["operation"],
                "year_param": spec["year_param"],
                "extra_params": list(spec["extra_params"]),
            }
            for key, spec in SERVICES.items()
        },
        "notes": [
            "브랜드/가맹본부 이름 검색은 upstream에 필터 파라미터가 없어 기준년도 목록을 페이지로 넘기며 클라이언트에서 부분일치로 찾는다.",
            "기준년도(jngBizCrtraYr)별 공시이며, 최신 공개 연도는 데이터 갱신 주기에 따라 다르다.",
            "금액은 공정위가 편차 5% 구간으로 공개하는 범위값이며 정확한 금액이 아니다.",
            "조회 전용이다. 점수·등급·위험 판정은 이 스킬의 범위가 아니다.",
        ],
    }


def _coverage_block() -> Dict[str, Any]:
    block = _datasets_block()
    block["field_labels"] = FIELD_LABELS
    return block


def _base_payload(command: str, *, year: str, checked_at: str) -> Dict[str, Any]:
    return {
        "command": command,
        "result": "ok",
        "source": SOURCE,
        "year": year,
        "checked_at": checked_at,
        "coverage": _datasets_block(),
    }


def _run_dry_run(command: str, *, url: str, year: str, checked_at: str) -> int:
    payload = _base_payload(command, year=year, checked_at=checked_at)
    payload["result"] = "dry_run"
    payload["dry_run"] = True
    payload["notice"] = DRY_RUN_NOTICE
    payload["request_url"] = redact_url(url)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def _render_brand_text(rows: Sequence[Mapping[str, Any]]) -> str:
    if not rows:
        return "조건에 맞는 브랜드가 없습니다."
    lines = []
    for row in rows:
        lines.append(
            f"{row.get('brandNm')} · {row.get('indutyMlsfcNm') or row.get('indutyLclasNm') or '-'} "
            f"· 브랜드관리번호 {row.get('brandMnno')} · 기준년도 {row.get('jngBizCrtraYr')}"
        )
    return "\n".join(lines)


def _render_hq_text(rows: Sequence[Mapping[str, Any]]) -> str:
    if not rows:
        return "조건에 맞는 가맹본부가 없습니다."
    lines = []
    for row in rows:
        lines.append(
            f"{row.get('jnghdqrtrsConmNm')} · 대표 {row.get('jnghdqrtrsRprsvNm') or '-'} "
            f"· 사업자등록번호 {row.get('brno') or '-'} · 가맹본부관리번호 {row.get('jnghdqrtrsMnno')}"
        )
    return "\n".join(lines)


def _render_hq_detail_text(details: Sequence[Mapping[str, Any]]) -> str:
    if not details:
        return ""
    lines: List[str] = []
    for section in details:
        if section.get("status") == "error":
            lines.append(f"[상세] 조회 실패: {section.get('error')}")
            continue
        rows = section.get("rows") or []
        if not rows:
            lines.append("[상세] 상세 데이터가 없습니다.")
            continue
        for row in rows:
            address = " ".join(
                part
                for part in (
                    _text_or_none(row.get("lctnAddr")),
                    _text_or_none(row.get("lctnDaddr")),
                )
                if part
            )
            lines.append(
                f"[상세] {row.get('jnghdqrtrsConmNm') or '-'} · "
                f"대표 {row.get('jnghdqrtrsRprsvNm') or '-'} · "
                f"기업규모 {row.get('entScaleNm') or '-'} · "
                f"주소 {address or '-'} · "
                f"브랜드수 {row.get('brandCnt') or '-'} · "
                f"가맹본부관리번호 {row.get('jnghdqrtrsMnno') or '-'}"
            )
    return "\n".join(lines)


def _render_stores_text(rows: Sequence[Mapping[str, Any]]) -> str:
    if not rows:
        return "가맹점/직영점 데이터가 없습니다."
    totals = summarize_stores(rows)
    head = (
        f"가맹점 {totals['franchise_store_count']} · 직영점 {totals['direct_store_count']} "
        f"· 전체 {totals['all_store_count']} (지역/업종 {totals['row_count']}행 단순합)"
    )
    body = [
        f"{row.get('areaNm') or '-'} · {row.get('indutyMlsfcNm') or '-'}: "
        f"가맹 {row.get('frcsCnt')} / 직영 {row.get('dmsCnt')}"
        for row in rows
    ]
    return "\n".join([head, *body])


def _render_changes_text(rows: Sequence[Mapping[str, Any]]) -> str:
    if not rows:
        return "가맹점 변경현황 데이터가 없습니다."
    summary = summarize_changes(rows) or {}
    return (
        f"연초 {summary.get('ystFrcsCnt')} · 신규 {summary.get('newFrcsCnt')} "
        f"· 계약종료 {summary.get('ctrtEndFrcsCnt')} · 계약해지 {summary.get('ctrtCncltnFrcsCnt')} "
        f"· 연말 {summary.get('yndFrcsCnt')} (평균영업일수 {summary.get('frcsAvrgBsnDycnt')})"
    )


def _render_sales_text(rows: Sequence[Mapping[str, Any]]) -> str:
    if not rows:
        return "평균매출 데이터가 없습니다."
    summary = summarize_sales(rows)
    return (
        f"연간 평균매출 범위 {summary['fyerAvrgSlsAmtScopeVal'] or '-'} · "
        f"면적연간 평균매출 범위 {summary['arFyerAvrgSlsAmtScopeVal'] or '-'} "
        "(편차 5% 범위값)"
    )


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--year", help="가맹사업기준년도 4자리 (기본: 작년)")
    common.add_argument("--api-base", help=f"게이트웨이 base URL override (기본 {DEFAULT_API_BASE})")
    common.add_argument("--secrets-path", help=f"dotenv 경로 (기본 {DEFAULT_SECRETS_PATH})")
    common.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    common.add_argument(
        "--num-of-rows", type=int, default=DEFAULT_NUM_OF_ROWS, help="페이지당 행 수"
    )
    common.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES, help="최대 페이지 수")
    common.add_argument("--dry-run", action="store_true", help="네트워크 호출 없이 URL만 출력")
    common.add_argument("--text", action="store_true", help="사람용 요약 출력")

    parser = argparse.ArgumentParser(description="공정위 가맹정보(FairData) 조회 (read-only)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("datasets", help="사용하는 데이터셋 endpoint와 필드 라벨 출력")

    brands = sub.add_parser("brands", parents=[common], help="브랜드명으로 브랜드 목록 검색")
    brands.add_argument("--name", required=True, help="브랜드명(부분일치)")
    brands.add_argument("--limit", type=int, default=20)

    hq = sub.add_parser("hq", parents=[common], help="가맹본부명으로 가맹본부 목록 검색")
    hq.add_argument("--name", required=True, help="가맹본부 상호명(부분일치)")
    hq.add_argument("--limit", type=int, default=20)
    hq.add_argument("--detail", action="store_true", help="일치 항목의 가맹본부 상세도 조회")

    for name, help_text in (
        ("stores", "브랜드 가맹점·직영점 수"),
        ("changes", "브랜드 가맹점 변경현황(계약/해지)"),
        ("sales", "브랜드 가맹점 평균매출 범위"),
    ):
        cmd = sub.add_parser(name, parents=[common], help=help_text)
        cmd.add_argument("--brand", help="브랜드명(부분일치)으로 관리번호 자동 해석")
        cmd.add_argument("--brand-mnno", help="브랜드관리번호(예: BRD_20080100006)")

    report = sub.add_parser("report", parents=[common], help="브랜드 창업 검토용 사실 리포트")
    report.add_argument("--brand", help="브랜드명(부분일치)")
    report.add_argument("--brand-mnno", help="브랜드관리번호")
    report.add_argument("--all", action="store_true", help="이름 일치 브랜드 전부 리포트")
    report.add_argument("--limit", type=int, default=5, help="이름 검색 시 최대 브랜드 수")

    return parser


def _resolve_year(args: argparse.Namespace, today: Optional[_datetime.date] = None) -> str:
    return normalize_year(args.year, default=default_year(today))


def _candidate_label(rows: Sequence[Mapping[str, Any]]) -> str:
    return ", ".join(
        f"{_text_or_none(row.get('brandNm')) or '?'}"
        f"({_text_or_none(row.get('brandMnno')) or '?'})"
        for row in rows
    )


def _resolve_brand_mnno(args: argparse.Namespace, ctx: QueryContext, year: str) -> Tuple[str, Dict[str, Any]]:
    explicit = _text_or_none(getattr(args, "brand_mnno", None))
    if explicit:
        return normalize_brand_mnno(explicit), {"matched_by": "brand_mnno", "meta": {}}
    if not getattr(args, "brand", None):
        raise HelperError("--brand 또는 --brand-mnno 중 하나가 필요합니다.")
    rows, meta = search_brands(ctx, name=args.brand, year=year, limit=AMBIGUITY_PROBE_LIMIT)
    if len(rows) > 1:
        raise HelperError(
            f"'{args.brand}' 부분일치 브랜드가 여러 개입니다: {_candidate_label(rows)}. "
            "다른 브랜드의 지표가 섞이지 않도록 --brand-mnno 로 브랜드관리번호를 직접 지정하세요."
        )
    if not rows:
        if not meta.get("complete", True):
            raise HelperError(
                f"{year}년 브랜드 목록에서 '{args.brand}'를 찾지 못했고 "
                f"--max-pages({meta.get('max_pages')}) 안에서 끝까지 확인하지 못했습니다. "
                "--max-pages/--num-of-rows 를 늘리거나 --brand-mnno 를 직접 지정하세요."
            )
        raise HelperError(
            f"{year}년 브랜드 목록에서 '{args.brand}'와 일치하는 브랜드를 찾지 못했습니다. "
            "--year 를 바꾸거나 --brand-mnno 를 직접 지정하세요."
        )
    if not meta.get("complete", True):
        raise HelperError(
            f"'{args.brand}' 브랜드 1건({_candidate_label(rows)})을 찾았지만 "
            f"{year}년 목록을 --max-pages({meta.get('max_pages')}) 안에서 끝까지 확인하지 못해 "
            "다른 일치 항목이 더 있을 수 있습니다. "
            "--max-pages/--num-of-rows 를 늘리거나 --brand-mnno 를 직접 지정하세요."
        )
    return normalize_brand_mnno(rows[0].get("brandMnno")), {"matched_by": "brand_name", "meta": meta}


def run(
    argv: Sequence[str],
    *,
    fetch: Callable[[str, int], Any] = http_get_json,
    env: Optional[Mapping[str, str]] = None,
    today: Optional[_datetime.date] = None,
    checked_at: Optional[str] = None,
) -> int:
    args = build_parser().parse_args(list(argv))
    checked_at = checked_at or _datetime.datetime.now(_datetime.timezone.utc).isoformat()
    env = os.environ if env is None else env

    if args.command == "datasets":
        print(json.dumps(_coverage_block(), ensure_ascii=False, indent=2))
        return 0

    try:
        year = _resolve_year(args, today)
    except HelperError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1

    api_key = resolve_api_key(
        env,
        pathlib.Path(args.secrets_path).expanduser() if args.secrets_path else resolve_secrets_path(env),
    )
    ctx = QueryContext(
        api_key=api_key or "",
        api_base=args.api_base or DEFAULT_API_BASE,
        fetch=fetch,
        timeout=args.timeout,
        num_of_rows=max(1, args.num_of_rows),
        max_pages=max(1, args.max_pages),
    )

    def _need_key() -> Optional[int]:
        if api_key:
            return None
        print(json.dumps({"error": MISSING_KEY_MSG}, ensure_ascii=False), file=sys.stderr)
        return 1

    try:
        if args.command == "brands":
            if args.dry_run:
                return _run_dry_run(
                    "brands",
                    url=ctx.url("brand_list", year=year, extra=None, page=1),
                    year=year,
                    checked_at=checked_at,
                )
            if (code := _need_key()) is not None:
                return code
            rows, meta = search_brands(ctx, name=args.name, year=year, limit=max(1, args.limit))
            result, warnings = search_status(rows, meta, subject="브랜드")
            payload = _base_payload("brands", year=year, checked_at=checked_at)
            payload.update(
                {
                    "result": result,
                    "query": {"name": args.name},
                    "rows": rows,
                    "meta": meta,
                }
            )
            if warnings:
                payload["warnings"] = warnings
            if args.text:
                print(_render_brand_text(rows))
                if warnings:
                    print("\n".join(warnings), file=sys.stderr)
            else:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0

        if args.command == "hq":
            if args.dry_run:
                return _run_dry_run(
                    "hq",
                    url=ctx.url("hq_list", year=year, extra=None, page=1),
                    year=year,
                    checked_at=checked_at,
                )
            if (code := _need_key()) is not None:
                return code
            rows, meta = search_hq(ctx, name=args.name, year=year, limit=max(1, args.limit))
            payload = _base_payload("hq", year=year, checked_at=checked_at)
            details = []
            if args.detail:
                for row in rows[: max(1, args.limit)]:
                    hq_mnno = _text_or_none(row.get("jnghdqrtrsMnno"))
                    if hq_mnno:
                        details.append(
                            _section(ctx, "hq_detail", year=year, extra={"jnghdqrtrsMnno": hq_mnno})
                        )
            result, warnings = search_status(rows, meta, subject="가맹본부")
            for detail in details:
                warnings.extend(detail.get("warnings", []))
            if warnings:
                result = "partial"
            payload.update(
                {
                    "result": result,
                    "query": {"name": args.name},
                    "rows": rows,
                    "meta": meta,
                    "details": details,
                }
            )
            if warnings:
                payload["warnings"] = warnings
            if args.text:
                text = _render_hq_text(rows)
                detail_text = _render_hq_detail_text(details)
                if args.detail and detail_text:
                    text = f"{text}\n{detail_text}"
                print(text)
                if warnings:
                    print("\n".join(warnings), file=sys.stderr)
            else:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0

        if args.command in {"stores", "changes", "sales"}:
            service_key = {"stores": "stores", "changes": "changes", "sales": "sales"}[args.command]
            if args.dry_run:
                explicit = _text_or_none(args.brand_mnno) or "BRD_00000000000"
                return _run_dry_run(
                    args.command,
                    url=ctx.url(service_key, year=year, extra={"brandMnno": explicit}, page=1),
                    year=year,
                    checked_at=checked_at,
                )
            if (code := _need_key()) is not None:
                return code
            brand_mnno, resolution = _resolve_brand_mnno(args, ctx, year)
            section = _section(ctx, service_key, year=year, extra={"brandMnno": brand_mnno})
            payload = _base_payload(args.command, year=year, checked_at=checked_at)
            payload.update(
                {
                    "result": section["status"],
                    "brand_mnno": brand_mnno,
                    "resolution": resolution,
                    "section": section,
                }
            )
            if section.get("warnings"):
                payload["warnings"] = section["warnings"]
            if args.text:
                if section["status"] == "error":
                    print(section["error"], file=sys.stderr)
                    return 1
                renderer = {
                    "stores": _render_stores_text,
                    "changes": _render_changes_text,
                    "sales": _render_sales_text,
                }[args.command]
                print(renderer(section["rows"]))
                if section.get("warnings"):
                    print("\n".join(section["warnings"]), file=sys.stderr)
            else:
                if section["status"] == "error":
                    print(json.dumps(payload, ensure_ascii=False, indent=2))
                    return 1
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0

        # report
        if args.dry_run:
            explicit = _text_or_none(args.brand_mnno) or "BRD_00000000000"
            return _run_dry_run(
                "report",
                url=ctx.url("stores", year=year, extra={"brandMnno": explicit}, page=1),
                year=year,
                checked_at=checked_at,
            )
        if (code := _need_key()) is not None:
            return code

        warnings: List[str] = []
        if _text_or_none(args.brand_mnno):
            candidates = [{"brandMnno": normalize_brand_mnno(args.brand_mnno)}]
            resolution = {"matched_by": "brand_mnno", "meta": {}}
        elif args.brand:
            candidates, meta = search_brands(
                ctx, name=args.brand, year=year, limit=max(1, args.limit)
            )
            resolution = {"matched_by": "brand_name", "meta": meta}
            incomplete = incomplete_warning(meta, subject="브랜드", empty=not candidates)
            if len(candidates) > 1 and not args.all:
                raise HelperError(
                    f"'{args.brand}' 부분일치 브랜드가 여러 개입니다: {_candidate_label(candidates)}. "
                    "--all 로 모두 리포트하거나 --brand-mnno 로 하나를 지정하세요."
                )
            if not args.all and incomplete:
                raise HelperError(incomplete)
            if incomplete:
                warnings.append(incomplete)
        else:
            raise HelperError("report 에는 --brand 또는 --brand-mnno 가 필요합니다.")

        payload = _base_payload("report", year=year, checked_at=checked_at)
        if not candidates:
            payload.update(
                {
                    "result": "partial" if warnings else "empty",
                    "query": {"brand": args.brand, "brand_mnno": args.brand_mnno},
                    "resolution": resolution,
                    "reports": [],
                }
            )
            if warnings:
                payload["warnings"] = warnings
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0

        reports = [build_report(ctx, brand=brand, year=year) for brand in candidates]
        for report in reports:
            warnings.extend(report.get("warnings", []))
        payload.update(
            {
                "result": "partial" if warnings else "ok",
                "query": {"brand": args.brand, "brand_mnno": args.brand_mnno},
                "resolution": resolution,
                "reports": reports,
            }
        )
        if warnings:
            payload["warnings"] = warnings
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    except (HelperError, ApiError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


def main(argv: Optional[Sequence[str]] = None) -> int:
    return run(sys.argv[1:] if argv is None else argv)


if __name__ == "__main__":
    raise SystemExit(main())
