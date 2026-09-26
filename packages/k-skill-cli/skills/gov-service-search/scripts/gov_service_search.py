#!/usr/bin/env python3
"""정부24 공공서비스(혜택) 정보 OpenAPI 조회 helper (조회 전용).

data.go.kr dataset 15113968 (행정안전부_대한민국 공공서비스(혜택) 정보)의
odcloud gateway endpoint 세 개를 조회한다.

- serviceList       공공서비스 목록 (키워드/소관기관/분야/수정일시 필터)
- serviceDetail     개별 서비스 상세 (신청방법/온라인신청사이트URL/구비서류)
- supportConditions 개별 서비스 지원조건 (성별/연령/소득/생애주기 코드)

기본 경로는 BYOK 직접 호출(`--via-proxy` 없이)이고, `KSKILL_GOV24_API_KEY`
또는 `~/.config/k-skill/secrets.env`의 키를 `Authorization: Infuser <key>`
헤더로만 보낸다. 키는 URL/표준출력/에러 메시지에 남기지 않는다.

stdlib only (urllib, json, argparse, ssl, re, datetime).
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

UPSTREAM_BASE_URL = "https://api.odcloud.kr/api/gov24/v3"
DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org"
PROXY_BASE_PATH = "/v1/gov24"
DEFAULT_SECRETS_PATH = os.path.expanduser("~/.config/k-skill/secrets.env")
API_KEY_ENV_VARS = ("KSKILL_GOV24_API_KEY", "DATA_GO_KR_API_KEY")
USER_AGENT = "k-skill/gov-service-search"
MAX_PER_PAGE = 100

OPERATIONS: Dict[str, Dict[str, str]] = {
    "list": {
        "upstream": "serviceList",
        "proxy": "service-list",
        "label": "공공서비스 목록",
    },
    "detail": {
        "upstream": "serviceDetail",
        "proxy": "service-detail",
        "label": "공공서비스 상세",
    },
    "conditions": {
        "upstream": "supportConditions",
        "proxy": "support-conditions",
        "label": "공공서비스 지원조건",
    },
}

# CLI attr -> odcloud cond[] query key
LIST_COND_FIELDS = (
    ("keyword", "cond[서비스명::LIKE]"),
    ("org", "cond[소관기관명::LIKE]"),
    ("org_type", "cond[소관기관유형::LIKE]"),
    ("user_type", "cond[사용자구분::LIKE]"),
    ("field", "cond[서비스분야::LIKE]"),
)
LIST_DATE_FIELDS = (
    ("updated_since", "cond[수정일시::GTE]"),
    ("updated_until", "cond[수정일시::LTE]"),
)

# Client-side text filters for `list`. The upstream has no region/lifecycle
# filter on serviceList, so the helper re-scans the row text after the call.
REGION_FIELDS = ("지원대상", "선정기준", "서비스목적요약", "서비스명", "소관기관명")
TARGET_FIELDS = ("지원대상", "선정기준", "서비스목적요약", "서비스명")

PROXY_DOWN_MSG = (
    "k-skill-proxy에 연결하지 못했습니다. 잠시 후 재시도하거나 `--via-proxy` 없이 "
    "KSKILL_GOV24_API_KEY로 직접 호출하세요."
)
PROXY_NOT_CONFIGURED_MSG = (
    "k-skill-proxy에 정부24 upstream 키가 설정되어 있지 않습니다. 운영자에게 문의하거나 "
    "`--via-proxy` 없이 KSKILL_GOV24_API_KEY로 직접 호출하세요."
)
AUTH_ERROR_MSG = (
    "정부24/data.go.kr 인증키가 거부되었습니다. 공공데이터포털 15113968 "
    "(행정안전부_대한민국 공공서비스(혜택) 정보) 활용신청이 승인됐는지, "
    "Encoding이 아닌 Decoding(원문) 키를 썼는지 확인하세요."
)
MISSING_KEY_MSG = (
    "KSKILL_GOV24_API_KEY (또는 DATA_GO_KR_API_KEY) 가 없습니다. 공공데이터포털 "
    "https://www.data.go.kr/data/15113968/openapi.do 에서 활용신청(무료, 자동승인) 후 "
    "발급키를 환경변수나 ~/.config/k-skill/secrets.env (0600)에 두세요."
)
QUOTA_MSG = (
    "호출 한도를 초과했습니다. 개발계정 기본 한도(일 10,000건) 또는 초당 한도이므로 "
    "잠시 후 재시도하거나 공공데이터포털에서 트래픽 증설을 신청하세요."
)
UPSTREAM_DOWN_MSG = "upstream(api.odcloud.kr)이 응답하지 않거나 점검 중입니다. 잠시 후 재시도하세요."
DRY_RUN_PLACEHOLDER = "<REDACTED>"


class HelperError(RuntimeError):
    """User-facing CLI error."""


# ---------------------------------------------------------------------------
# credential handling
# ---------------------------------------------------------------------------

def load_secrets(path: str = DEFAULT_SECRETS_PATH) -> Dict[str, str]:
    """Read a dotenv-like secrets file. Returns {} when missing/unreadable."""
    data: Dict[str, str] = {}
    if not os.path.exists(path):
        return data
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw_line in fh:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                    value = value[1:-1]
                if key:
                    data[key] = value
    except OSError:
        return data
    return data


def resolve_api_key(secrets_path: Optional[str] = None) -> Optional[str]:
    """Resolution order: injected env vars, then secrets file."""
    for name in API_KEY_ENV_VARS:
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    secrets = load_secrets(secrets_path or DEFAULT_SECRETS_PATH)
    for name in API_KEY_ENV_VARS:
        value = secrets.get(name)
        if value and value.strip():
            return value.strip()
    return None


def redact_secret(text: str, secret: Optional[str]) -> str:
    """Replace any occurrence of the key before it reaches stdout/stderr."""
    if not secret:
        return text
    return text.replace(secret, DRY_RUN_PLACEHOLDER)


# ---------------------------------------------------------------------------
# query building
# ---------------------------------------------------------------------------

def _clean(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalise_date(value: str, field: str) -> str:
    """Accept YYYYMMDD / YYYY-MM-DD / YYYY/MM/DD and return YYYY-MM-DD."""
    digits = re.sub(r"\D", "", str(value))
    if len(digits) != 8:
        raise HelperError(f"{field} must be a date (YYYY-MM-DD or YYYYMMDD), got: {value!r}")
    year, month, day = int(digits[0:4]), int(digits[4:6]), int(digits[6:8])
    try:
        datetime.date(year, month, day)
    except ValueError as exc:
        raise HelperError(f"{field} must be a valid calendar date, got: {value!r}") from exc
    return f"{year:04d}-{month:02d}-{day:02d}"


def build_query(args: argparse.Namespace, operation: str) -> Dict[str, Any]:
    if operation not in OPERATIONS:
        raise HelperError(f"Unknown operation: {operation}")
    if args.page < 1:
        raise HelperError("--page must be >= 1")
    if not (1 <= args.per_page <= MAX_PER_PAGE):
        raise HelperError(f"--per-page must be in [1, {MAX_PER_PAGE}]")

    query: Dict[str, Any] = {
        "page": args.page,
        "perPage": args.per_page,
        "returnType": "json",
    }

    if operation == "list":
        for attr, cond_key in LIST_COND_FIELDS:
            value = _clean(getattr(args, attr, None))
            if value:
                query[cond_key] = value
        for attr, cond_key in LIST_DATE_FIELDS:
            value = _clean(getattr(args, attr, None))
            if value:
                query[cond_key] = normalise_date(value, attr)
        if (
            query.get("cond[수정일시::GTE]")
            and query.get("cond[수정일시::LTE]")
            and query["cond[수정일시::GTE]"] > query["cond[수정일시::LTE]"]
        ):
            raise HelperError("--updated-since must be <= --updated-until")
    else:
        service_id = _clean(getattr(args, "service_id", None))
        if not service_id:
            raise HelperError("--service-id is required for detail/conditions")
        query["cond[서비스ID::EQ]"] = service_id

    return query


def encode_query(query: Dict[str, Any]) -> str:
    pairs: List[Tuple[str, str]] = [(key, str(value)) for key, value in query.items()]
    return urllib.parse.urlencode(pairs, doseq=False, safe="")


def build_url(operation: str, query: Dict[str, Any], *, via_proxy: bool, proxy_base_url: str) -> str:
    if via_proxy:
        base = (proxy_base_url or DEFAULT_PROXY_BASE_URL).rstrip("/") + PROXY_BASE_PATH
        path = OPERATIONS[operation]["proxy"]
    else:
        base = UPSTREAM_BASE_URL.rstrip("/")
        path = OPERATIONS[operation]["upstream"]
    return f"{base}/{path}?{encode_query(query)}"


def build_headers(api_key: Optional[str]) -> Dict[str, str]:
    """Direct calls carry the key in the Authorization header only."""
    headers = {"accept": "application/json", "user-agent": USER_AGENT}
    if api_key:
        headers["authorization"] = f"Infuser {api_key}"
    return headers


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def http_get(
    url: str,
    *,
    headers: Dict[str, str],
    timeout: int,
    opener: Any = None,
) -> Tuple[int, str, str]:
    request = urllib.request.Request(url, headers=headers, method="GET")
    context = ssl.create_default_context()
    call = opener or urllib.request.urlopen
    try:
        with call(request, timeout=timeout, context=context) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, response.headers.get("content-type", ""), body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        content_type = exc.headers.get("content-type", "") if exc.headers else ""
        return exc.code, content_type, body
    except urllib.error.URLError as exc:
        raise HelperError(f"network error: {exc.reason}") from exc
    except TimeoutError as exc:
        raise HelperError(f"network timeout after {timeout}s") from exc


def is_proxy_not_configured_body(body: str) -> bool:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return False
    return isinstance(payload, dict) and payload.get("error") == "upstream_not_configured"


AUTH_PATTERNS = (
    "service_key_is_null",
    "service_key_is_not_registered",
    "service_access_denied",
    "deadline_has_expired",
    "권한",
    "인증키",
    "활용신청",
    "등록되지 않은",
    "만료",
)
QUOTA_PATTERNS = (
    "limited_number_of_service_requests_exceeds",
    "일일",
    "호출량",
    "quota",
    "한도",
)
RATE_PATTERNS = (
    "per_second",
    "초당",
    "too many requests",
    "rate limit",
)


def _message_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    parts = []
    for key in ("msg", "message", "returnAuthMsg", "error_description"):
        value = payload.get(key)
        if value:
            parts.append(str(value))
    return " ".join(parts)


def _matches(text: str, patterns: Tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(pattern in lowered for pattern in patterns)


def is_error_envelope(payload: Any) -> bool:
    """odcloud 오류 봉투: `code`가 0/None이 아닌 JSON 객체."""
    return isinstance(payload, dict) and payload.get("code") not in (None, 0, "0")


def has_data_envelope(payload: Any) -> bool:
    """문서화된 성공 응답 계약: JSON 객체이며 `data`가 배열이어야 한다."""
    return isinstance(payload, dict) and isinstance(payload.get("data"), list)


def describe_upstream_error(
    status: int,
    content_type: str,
    body: str,
) -> Optional[str]:
    """Return a user-facing error message, or None when the response is OK."""
    payload: Any = None
    if body.strip():
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None

    if status < 400:
        if payload is None:
            return (
                f"upstream이 JSON이 아닌 응답을 반환했습니다 "
                f"(status={status}, content-type={content_type!r}). 본문 앞부분: {body[:300]!r}"
            )
        if is_error_envelope(payload):
            code = payload.get("code")
            text = _message_text(payload) or str(payload.get("code"))
            return _describe_code(code, text)
        if not has_data_envelope(payload):
            return (
                f"upstream이 문서화된 JSON 응답 봉투(객체 + `data` 배열)를 반환하지 않았습니다 "
                f"(status={status}, content-type={content_type!r}). 본문 앞부분: {body[:300]!r}"
            )
        return None

    # HTTP >= 400
    text = _message_text(payload)
    code = payload.get("code") if isinstance(payload, dict) else None
    # Status-specific guidance wins over the generic message path: a 401/403 with a
    # message must still tell the user to check key approval/registration, and a 429
    # must still point at the quota, instead of collapsing into a generic upstream error.
    if status in (401, 403):
        return f"{AUTH_ERROR_MSG} (upstream: {text})" if text else AUTH_ERROR_MSG
    if status == 429 or (status == 400 and _matches(body, RATE_PATTERNS)):
        return f"{QUOTA_MSG} (upstream: {text})" if text else QUOTA_MSG
    if text:
        return _describe_code(code, text)
    if status >= 500:
        return f"{UPSTREAM_DOWN_MSG} (HTTP {status})"
    return (
        f"upstream HTTP {status} 오류가 발생했습니다 "
        f"(content-type={content_type!r}). 본문 앞부분: {body[:300]!r}"
    )


def _describe_code(code: Any, text: str) -> str:
    combined = f"{text} {code if code is not None else ''}"
    if _matches(combined, AUTH_PATTERNS) or code in (-401, -403, 20, 30, 31, "20", "30", "31"):
        return f"{AUTH_ERROR_MSG} (upstream: {text})"
    if _matches(combined, RATE_PATTERNS) or code in (23, "23"):
        return f"{QUOTA_MSG} (upstream: {text})"
    if _matches(combined, QUOTA_PATTERNS) or code in (22, "22"):
        return f"{QUOTA_MSG} (upstream: {text})"
    return f"upstream 오류: {text} (code={code!r})"


# ---------------------------------------------------------------------------
# client-side filters and disambiguation
# ---------------------------------------------------------------------------

def _row_matches_token(row: Dict[str, Any], fields: Tuple[str, ...], token: str) -> bool:
    for field in fields:
        value = row.get(field)
        if value is None:
            continue
        if token in str(value):
            return True
    return False


def _row_matches_filter(row: Dict[str, Any], fields: Tuple[str, ...], requested: str) -> bool:
    tokens = [token.strip() for token in requested.split(",") if token.strip()]
    if not tokens:
        return True
    return all(_row_matches_token(row, fields, token) for token in tokens)


def apply_client_filters(
    payload: Dict[str, Any],
    args: argparse.Namespace,
    operation: str,
) -> Dict[str, Any]:
    if operation != "list":
        return payload

    requested: Dict[str, str] = {}
    region = _clean(getattr(args, "region", None))
    target = _clean(getattr(args, "target", None))
    if region:
        requested["region"] = region
    if target:
        requested["target"] = target
    if not requested:
        return payload

    data = payload.get("data")
    if not isinstance(data, list):
        return payload

    field_map = {"region": REGION_FIELDS, "target": TARGET_FIELDS}
    upstream_count = len(data)
    filtered = [
        row
        for row in data
        if isinstance(row, dict)
        and all(
            _row_matches_filter(row, field_map[name], value)
            for name, value in requested.items()
        )
    ]
    payload["data"] = filtered
    payload["client_filter"] = {
        "fields": requested,
        "upstream_returned": upstream_count,
        "after_filter": len(filtered),
        "note": (
            "지역·대상은 upstream에 필터 필드가 없어 응답 본문 텍스트로 클라이언트에서 적용했다. "
            "본문에 지역명이 없는 전국 서비스는 --region 결과에서 빠질 수 있다."
        ),
    }
    return payload


def normalise_service_name(name: Any) -> str:
    text = re.sub(r"[\s()\[\]{}·・,./\\\-_~]+", "", str(name or ""))
    return text.lower()


def disambiguate(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data")
    if not isinstance(data, list):
        return payload

    groups: Dict[str, List[Dict[str, Any]]] = {}
    order: List[str] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        key = normalise_service_name(row.get("서비스명"))
        if not key:
            continue
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(row)

    duplicate_groups = []
    duplicate_rows = 0
    for key in order:
        rows = groups[key]
        if len(rows) < 2:
            continue
        duplicate_rows += len(rows)
        duplicate_groups.append(
            {
                "normalised_name": key,
                "count": len(rows),
                "candidates": [
                    {
                        "서비스ID": row.get("서비스ID"),
                        "서비스명": row.get("서비스명"),
                        "소관기관명": row.get("소관기관명"),
                        "서비스분야": row.get("서비스분야"),
                        "상세조회URL": row.get("상세조회URL"),
                    }
                    for row in rows
                ],
            }
        )

    if duplicate_groups:
        payload["disambiguation"] = {
            "duplicate_groups": duplicate_groups,
            "duplicate_rows": duplicate_rows,
            "note": (
                "서비스명이 정규화 기준으로 같은 후보가 여러 건이다. 소관기관명·서비스ID·"
                "상세조회URL을 비교해 사용자 의도에 맞는 후보를 고르고, 필요하면 detail로 확인한다."
            ),
        }
    return payload


# ---------------------------------------------------------------------------
# support-condition decoding
# ---------------------------------------------------------------------------

GENDER_CODES = {"JA0101": "남성", "JA0102": "여성"}
AGE_START_CODE = "JA0110"
AGE_END_CODE = "JA0111"
INCOME_CODES = {
    "JA0201": "중위소득 0~50%",
    "JA0202": "중위소득 51~75%",
    "JA0203": "중위소득 76~100%",
    "JA0204": "중위소득 101~200%",
    "JA0205": "중위소득 200% 초과",
}
LIFECYCLE_CODES = {
    "JA0301": "예비부모/난임",
    "JA0302": "임산부",
    "JA0303": "출산/입양",
    "JA0313": "농업인",
    "JA0314": "어업인",
    "JA0315": "축산업인",
    "JA0316": "임업인",
    "JA0317": "초등학생",
    "JA0318": "중학생",
    "JA0319": "고등학생",
    "JA0320": "대학생/대학원생",
    "JA0322": "해당사항없음",
    "JA0326": "근로자/직장인",
    "JA0327": "구직자/실업자",
    "JA0328": "장애인",
    "JA0329": "국가보훈대상자",
    "JA0330": "질병/질환자",
}
HOUSEHOLD_CODES = {
    "JA0401": "다문화가족",
    "JA0402": "북한이탈주민",
    "JA0403": "한부모가정/조손가정",
    "JA0404": "1인가구",
    "JA0410": "해당사항없음",
    "JA0411": "다자녀가구",
    "JA0412": "무주택세대",
    "JA0413": "신규전입",
    "JA0414": "확대가족",
}
BUSINESS_CODES = {
    "JA1101": "예비창업자",
    "JA1102": "영업중",
    "JA1103": "생계곤란/폐업예정자",
    "JA1201": "음식업",
    "JA1202": "제조업",
    "JA1299": "기타업종",
    "JA2101": "중소기업",
    "JA2102": "사회복지시설",
    "JA2103": "기관/단체",
    "JA2201": "제조업",
    "JA2202": "농업,임업 및 어업",
    "JA2203": "정보통신업",
    "JA2299": "기타업종",
}
CONDITION_LABELS: Dict[str, str] = {}
CONDITION_LABELS.update(GENDER_CODES)
CONDITION_LABELS.update(INCOME_CODES)
CONDITION_LABELS.update(LIFECYCLE_CODES)
CONDITION_LABELS.update(HOUSEHOLD_CODES)
CONDITION_LABELS.update(BUSINESS_CODES)

GENDER_INPUTS = {"남": "JA0101", "남성": "JA0101", "male": "JA0101", "m": "JA0101",
                 "여": "JA0102", "여성": "JA0102", "female": "JA0102", "f": "JA0102"}
INCOME_INPUTS = {
    "0~50%": "JA0201",
    "51~75%": "JA0202",
    "76~100%": "JA0203",
    "101~200%": "JA0204",
    "200%초과": "JA0205",
}


_FALSE_STRINGS = {"", "0", "n", "no", "false", "f", "해당없음", "-"}


def _is_set(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() not in _FALSE_STRINGS


def _as_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip()
    if not re.fullmatch(r"-?\d+", text):
        return None
    return int(text)


def normalise_gender(value: Optional[str]) -> Optional[str]:
    text = _clean(value)
    if text is None:
        return None
    code = GENDER_INPUTS.get(text.lower()) or GENDER_INPUTS.get(text)
    if not code:
        raise HelperError("--gender must be 남/여 (or 남성/여성)")
    return code


def normalise_income(value: Optional[str]) -> Optional[str]:
    text = _clean(value)
    if text is None:
        return None
    compact = text.replace("중위소득", "").replace(" ", "")
    code = INCOME_INPUTS.get(compact)
    if not code:
        raise HelperError(
            "--income must be one of 중위소득 0~50%, 51~75%, 76~100%, 101~200%, 200% 초과"
        )
    return code


def decode_conditions(row: Dict[str, Any]) -> List[str]:
    labels = [label for code, label in CONDITION_LABELS.items() if _is_set(row.get(code))]
    if _is_set(row.get(AGE_START_CODE)) or _is_set(row.get(AGE_END_CODE)):
        start = _as_int(row.get(AGE_START_CODE)) or 0
        end = _as_int(row.get(AGE_END_CODE))
        if end:
            labels.append(f"대상연령 {start}~{end}세")
        else:
            labels.append(f"대상연령 {start}세 이상")
    return labels


def evaluate_condition_match(
    row: Dict[str, Any],
    *,
    age: Optional[int] = None,
    gender_code: Optional[str] = None,
    income_code: Optional[str] = None,
) -> Dict[str, Any]:
    checks: Dict[str, Any] = {}

    if gender_code:
        present = [code for code in GENDER_CODES if _is_set(row.get(code))]
        checks["gender"] = gender_code in present if present else True

    if age is not None:
        start = _as_int(row.get(AGE_START_CODE)) or 0
        end = _as_int(row.get(AGE_END_CODE))
        lower_ok = age >= start
        upper_ok = (not end) or age <= end
        checks["age"] = lower_ok and upper_ok

    if income_code:
        present = [code for code in INCOME_CODES if _is_set(row.get(code))]
        checks["income"] = income_code in present if present else True

    checks["matched"] = all(
        checks[key] for key in ("age", "gender", "income") if key in checks
    )
    return checks


# ---------------------------------------------------------------------------
# output formatting
# ---------------------------------------------------------------------------

def _first(row: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def summarise(operation: str, payload: Dict[str, Any]) -> str:
    data = payload.get("data")
    items = [row for row in data if isinstance(row, dict)] if isinstance(data, list) else []

    if operation == "conditions":
        return _summarise_conditions(items, payload)
    if operation == "detail":
        return _summarise_detail(items, payload)

    lines = [
        f"[summary] operation=list count={len(items)} "
        f"(page={payload.get('page')} perPage={payload.get('perPage')} "
        f"totalCount={payload.get('totalCount')})"
    ]
    if not items:
        lines.append("  조건에 맞는 항목이 없습니다. 필터를 완화하거나 --page를 늘리세요.")
        client_filter = payload.get("client_filter")
        if isinstance(client_filter, dict) and client_filter.get("upstream_returned"):
            lines.append(
                f"  upstream은 {client_filter['upstream_returned']}건을 반환했지만 "
                "client filter(--region/--target)에서 모두 제외됐습니다."
            )
        return "\n".join(lines)

    for index, row in enumerate(items, start=1):
        title = _first(row, "서비스명") or "(서비스명 없음)"
        org = _first(row, "소관기관명")
        field = _first(row, "서비스분야")
        deadline = _first(row, "신청기한")
        target = _first(row, "지원대상")
        detail_url = _first(row, "상세조회URL")
        lines.append(f"  {index:>2}. {title} | 소관: {org} | 분야: {field} | ID: {_first(row, '서비스ID')}")
        meta = " | ".join(part for part in (f"기한: {deadline}", f"대상: {target}") if not part.endswith(": "))
        if meta:
            lines.append(f"      {meta}")
        if detail_url:
            lines.append(f"      → {detail_url}")

    disambiguation = payload.get("disambiguation")
    if isinstance(disambiguation, dict):
        for group in disambiguation.get("duplicate_groups", []):
            lines.append(f"  [중복 후보] {group.get('normalised_name')} ({group.get('count')}건)")
            for candidate in group.get("candidates", []):
                lines.append(
                    f"      - {candidate.get('서비스ID')} | {candidate.get('소관기관명')} | "
                    f"{candidate.get('상세조회URL')}"
                )
    return "\n".join(lines)


def _summarise_detail(items: List[Dict[str, Any]], payload: Dict[str, Any]) -> str:
    if not items:
        return (
            "[summary] operation=detail 결과가 없습니다. --service-id가 정확한지, "
            "해당 서비스가 공개 상태인지 확인하세요."
        )
    row = items[0]
    lines = [
        f"[detail] {_first(row, '서비스명')} (ID: {_first(row, '서비스ID')})",
        f"  소관기관: {_first(row, '소관기관명')} / 접수기관: {_first(row, '접수기관명')}",
        f"  신청기한: {_first(row, '신청기한')}",
        f"  지원유형: {_first(row, '지원유형')}",
        f"  지원대상: {_first(row, '지원대상')}",
        f"  신청방법: {_first(row, '신청방법')}",
    ]
    online = _first(row, "온라인신청사이트URL")
    if online:
        lines.append(f"  온라인신청: {online}")
    documents = _first(row, "구비서류")
    if documents:
        lines.append(f"  구비서류: {documents[:300]}")
    contact = _first(row, "문의처")
    if contact:
        lines.append(f"  문의처: {contact}")
    purpose = _first(row, "서비스목적")
    if purpose:
        lines.append(f"  목적: {purpose[:300]}")
    for key in ("행정규칙", "자치법규", "법령"):
        value = _first(row, key)
        if value:
            lines.append(f"  {key}: {value[:200]}")
    lines.append(f"  수정일시: {_first(row, '수정일시')}")
    return "\n".join(lines)


def _summarise_conditions(items: List[Dict[str, Any]], payload: Dict[str, Any]) -> str:
    if not items:
        return (
            "[summary] operation=conditions 결과가 없습니다. --service-id가 정확한지 확인하세요."
        )
    lines: List[str] = []
    for row in items:
        lines.append(f"[conditions] {_first(row, '서비스명')} (ID: {_first(row, '서비스ID')})")
        start = _as_int(row.get(AGE_START_CODE))
        end = _as_int(row.get(AGE_END_CODE))
        lines.append(
            f"  대상연령: {AGE_START_CODE}={start if start is not None else ''} "
            f"{AGE_END_CODE}={end if end is not None else ''} (0/빈 값은 해당 방향 제한 없음)"
        )
        genders = [label for code, label in GENDER_CODES.items() if _is_set(row.get(code))]
        if genders:
            lines.append(f"  성별: {', '.join(genders)}")
        incomes = [label for code, label in INCOME_CODES.items() if _is_set(row.get(code))]
        if incomes:
            lines.append(f"  소득: {', '.join(incomes)}")
        labels = decode_conditions(row)
        if labels:
            lines.append(f"  지원조건: {', '.join(labels)}")
        match = row.get("match")
        if isinstance(match, dict):
            lines.append(f"  match: {json.dumps(match, ensure_ascii=False)}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--per-page", dest="per_page", type=int, default=10)
    format_group = parser.add_mutually_exclusive_group()
    format_group.add_argument("--text", action="store_true", help="사람용 요약")
    format_group.add_argument("--json", action="store_true", help="구조화 JSON 출력 (기본)")
    parser.add_argument(
        "--dry-run", action="store_true", dest="dry_run",
        help="요청 URL/파라미터만 출력, 네트워크 호출 없음",
    )
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument(
        "--via-proxy", action="store_true", dest="via_proxy",
        help="k-skill-proxy 경유 (upstream 키 불필요, route 배포 후)",
    )
    parser.add_argument(
        "--proxy-base-url",
        default=os.environ.get("KSKILL_PROXY_BASE_URL", DEFAULT_PROXY_BASE_URL),
    )
    parser.add_argument("--secrets-path", default=DEFAULT_SECRETS_PATH)


def _add_list_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--keyword", default=None, help="서비스명 LIKE 검색")
    parser.add_argument("--org", default=None, help="소관기관명 LIKE 검색")
    parser.add_argument("--org-type", dest="org_type", default=None, help="소관기관유형 LIKE 검색")
    parser.add_argument("--user-type", dest="user_type", default=None, help="사용자구분 LIKE 검색")
    parser.add_argument("--field", default=None, help="서비스분야 LIKE 검색")
    parser.add_argument("--updated-since", dest="updated_since", default=None, help="수정일시 GTE")
    parser.add_argument("--updated-until", dest="updated_until", default=None, help="수정일시 LTE")
    parser.add_argument("--region", default=None, help="client-side 지역 필터 (쉼표 AND)")
    parser.add_argument("--target", default=None, help="client-side 대상/생애주기 필터 (쉼표 AND)")
    parser.add_argument("--disambiguate", action="store_true", help="중복 서비스명 후보 묶기")


def _add_service_id_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--service-id", dest="service_id", required=True, help="서비스ID (EQ)")


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gov_service_search.py",
        description="정부24 공공서비스(혜택) 정보 OpenAPI (data.go.kr 15113968) 조회 helper",
    )
    subparsers = parser.add_subparsers(dest="operation", required=True)

    list_parser = subparsers.add_parser("list", help="공공서비스 목록 (serviceList)")
    _add_common_args(list_parser)
    _add_list_args(list_parser)

    detail_parser = subparsers.add_parser("detail", help="공공서비스 상세 (serviceDetail)")
    _add_common_args(detail_parser)
    _add_service_id_arg(detail_parser)

    conditions_parser = subparsers.add_parser("conditions", help="지원조건 (supportConditions)")
    _add_common_args(conditions_parser)
    _add_service_id_arg(conditions_parser)
    conditions_parser.add_argument("--age", type=int, default=None)
    conditions_parser.add_argument("--gender", default=None)
    conditions_parser.add_argument("--income", default=None)

    return parser


def _dry_run_payload(
    operation: str,
    query: Dict[str, Any],
    args: argparse.Namespace,
    api_key: Optional[str],
) -> Dict[str, Any]:
    url = build_url(
        operation, query,
        via_proxy=bool(args.via_proxy),
        proxy_base_url=args.proxy_base_url,
    )
    result: Dict[str, Any] = {
        "operation": operation,
        "url": redact_secret(url, api_key),
        "query": query,
        "via_proxy": bool(args.via_proxy),
    }
    if not args.via_proxy:
        result["auth"] = "Authorization: Infuser " + (
            DRY_RUN_PLACEHOLDER if api_key else "(missing)"
        )
    return result


def _enrich_conditions(payload: Dict[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    data = payload.get("data")
    if not isinstance(data, list):
        return payload
    age = args.age
    if age is not None and not (0 <= age <= 120):
        raise HelperError("--age must be in [0, 120]")
    gender_code = normalise_gender(args.gender)
    income_code = normalise_income(args.income)
    has_match_inputs = age is not None or gender_code is not None or income_code is not None
    for row in data:
        if isinstance(row, dict):
            row["labels"] = decode_conditions(row)
            if has_match_inputs:
                row["match"] = evaluate_condition_match(
                    row, age=age, gender_code=gender_code, income_code=income_code
                )
    return payload


def run(argv: Optional[List[str]] = None, opener: Any = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    operation = args.operation

    try:
        query = build_query(args, operation)
        if operation == "conditions":
            _enrich_conditions({"data": []}, args)  # validate match inputs early
    except HelperError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 2

    api_key: Optional[str] = None
    if not args.via_proxy:
        api_key = resolve_api_key(args.secrets_path)

    if args.dry_run:
        print(json.dumps(
            _dry_run_payload(operation, query, args, api_key),
            ensure_ascii=False, indent=2,
        ))
        return 0

    if not args.via_proxy and not api_key:
        print(f"[error] {MISSING_KEY_MSG}", file=sys.stderr)
        return 3

    try:
        url = build_url(
            operation, query,
            via_proxy=bool(args.via_proxy),
            proxy_base_url=args.proxy_base_url,
        )
    except HelperError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 2

    try:
        status, content_type, body = http_get(
            url,
            headers=build_headers(api_key),
            timeout=args.timeout,
            opener=opener,
        )
    except HelperError as exc:
        message = str(exc)
        if args.via_proxy:
            message = f"{PROXY_DOWN_MSG} (상세: {message})"
        print(f"[error] {redact_secret(message, api_key)}", file=sys.stderr)
        return 4

    if args.via_proxy and status == 503 and is_proxy_not_configured_body(body):
        print(f"[error] {PROXY_NOT_CONFIGURED_MSG}", file=sys.stderr)
        return 6

    try:
        payload = json.loads(body) if body.strip() else None
    except json.JSONDecodeError:
        payload = None

    error_message = describe_upstream_error(status, content_type, body)
    if error_message:
        if status < 400 and not is_error_envelope(payload):
            exit_code = 5
        else:
            exit_code = 6
        print(f"[error] {redact_secret(error_message, api_key)}", file=sys.stderr)
        return exit_code

    payload["operation"] = operation
    payload["query"] = query
    payload["checked_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    payload = apply_client_filters(payload, args, operation)
    if operation == "list" and getattr(args, "disambiguate", False):
        payload = disambiguate(payload)
    if operation == "conditions":
        payload = _enrich_conditions(payload, args)

    if args.text:
        print(summarise(operation, payload))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(run())