from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://api.searchad.naver.com"
API_KEY_ENV = "NAVER_AD_API_KEY"
SECRET_KEY_ENV = "NAVER_AD_SECRET_KEY"
CUSTOMER_ID_ENV = "NAVER_AD_CUSTOMER_ID"
DEFAULT_TIMEOUT = 20

STATS_FIELDS = ["impCnt", "clkCnt", "salesAmt", "ctr", "cpc", "avgRnk", "ccnt"]
STATS_LABELS = {
    "impCnt": "노출수",
    "clkCnt": "클릭수",
    "salesAmt": "광고비",
    "ctr": "CTR",
    "cpc": "CPC",
    "avgRnk": "평균노출순위",
    "ccnt": "전환수",
}
KEYWORDTOOL_LABELS = {
    "relKeyword": "연관키워드",
    "monthlyPcQcCnt": "월간PC조회수",
    "monthlyMobileQcCnt": "월간모바일조회수",
    "monthlyAvePcClkCnt": "월평균PC클릭수",
    "monthlyAveMobileClkCnt": "월평균모바일클릭수",
    "compIdx": "경쟁정도",
}

# 이 스킬은 읽기 전용이다. 캠페인/그룹/키워드/입찰가를 바꾸는 write 엔드포인트는
# 의도적으로 구현하지 않는다 (docs 참고: naver-ad-performance/SKILL.md의 "쓰기 금지").


class CredentialError(RuntimeError):
    pass


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


def resolve_credentials() -> tuple[str, str, str]:
    api_key = os.getenv(API_KEY_ENV)
    secret_key = os.getenv(SECRET_KEY_ENV)
    customer_id = os.getenv(CUSTOMER_ID_ENV)
    missing = [
        name
        for name, value in (
            (API_KEY_ENV, api_key),
            (SECRET_KEY_ENV, secret_key),
            (CUSTOMER_ID_ENV, customer_id),
        )
        if not value
    ]
    if missing:
        raise CredentialError(
            "missing required env var(s): " + ", ".join(missing) + ". "
            "발급: 네이버 검색광고 > 도구 > API 사용 관리."
        )
    return api_key, secret_key, customer_id


def build_signature(secret_key: str, timestamp: str, method: str, uri: str) -> str:
    message = f"{timestamp}.{method}.{uri}".encode("utf-8")
    digest = hmac.new(secret_key.encode("utf-8"), message, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def request(method: str, uri: str, params: dict | None = None, timeout: int = DEFAULT_TIMEOUT):
    api_key, secret_key, customer_id = resolve_credentials()
    timestamp = str(round(time.time() * 1000))
    signature = build_signature(secret_key, timestamp, method, uri)
    headers = {
        "X-Timestamp": timestamp,
        "X-API-KEY": api_key,
        "X-Customer": customer_id,
        "X-Signature": signature,
        "Accept": "application/json",
    }
    url = BASE_URL + uri
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ApiError(exc.code, body) from exc
    except urllib.error.URLError as exc:
        raise ApiError(0, f"egress unreachable: {exc.reason}") from exc


def with_derived_stats(row: dict) -> dict:
    imp = row.get("impCnt") or 0
    clk = row.get("clkCnt") or 0
    sales = row.get("salesAmt") or 0
    if "ctr" not in row:
        row["ctr"] = round(clk / imp * 100, 2) if imp else 0
    if "cpc" not in row:
        row["cpc"] = round(sales / clk, 2) if clk else 0
    return row


def label_stats(rows: list[dict]) -> list[dict]:
    labeled = []
    for row in rows:
        row = with_derived_stats(dict(row))
        row["labels"] = {field: STATS_LABELS[field] for field in STATS_FIELDS if field in row}
        labeled.append(row)
    return labeled


def label_keywordtool(rows: list[dict]) -> list[dict]:
    labeled = []
    for row in rows:
        row = dict(row)
        row["labels"] = {field: label for field, label in KEYWORDTOOL_LABELS.items() if field in row}
        labeled.append(row)
    return labeled


def cmd_doctor(_args: argparse.Namespace) -> dict:
    result = {"env": {}, "reachable": None}
    for name in (API_KEY_ENV, SECRET_KEY_ENV, CUSTOMER_ID_ENV):
        result["env"][name] = bool(os.getenv(name))
    try:
        req = urllib.request.Request(BASE_URL, method="GET")
        urllib.request.urlopen(req, timeout=8).close()
        result["reachable"] = True
    except urllib.error.HTTPError:
        result["reachable"] = True  # HTTP 응답을 받았다는 것 자체가 egress는 열려있다는 뜻
    except urllib.error.URLError as exc:
        result["reachable"] = False
        result["reachable_error"] = str(exc.reason)
    return result


def cmd_campaigns(_args: argparse.Namespace) -> list[dict]:
    return request("GET", "/ncc/campaigns")


def cmd_adgroups(args: argparse.Namespace) -> list[dict]:
    return request("GET", "/ncc/adgroups", {"nccCampaignId": args.campaign})


def cmd_keywords(args: argparse.Namespace) -> list[dict]:
    return request("GET", "/ncc/keywords", {"nccAdgroupId": args.adgroup})


def cmd_stats(args: argparse.Namespace) -> list[dict]:
    ids = [i.strip() for i in args.ids.split(",") if i.strip()]
    params = {
        "ids": json.dumps(ids),
        "fields": json.dumps(STATS_FIELDS),
    }
    if args.since or args.until:
        if not (args.since and args.until):
            raise CredentialError("--since and --until must be given together")
        params["timeRange"] = json.dumps({"since": args.since, "until": args.until})
    if args.by:
        params["breakdown"] = args.by
    data = request("GET", "/stats", params)
    rows = data.get("data", data) if isinstance(data, dict) else data
    return label_stats(rows)


def cmd_keywordtool(args: argparse.Namespace) -> list[dict]:
    params = {"hintKeywords": args.keywords, "showDetail": 1}
    data = request("GET", "/keywordstool", params)
    rows = data.get("keywordList", data) if isinstance(data, dict) else data
    return label_keywordtool(rows)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="네이버 검색광고 성과 조회 (읽기 전용)")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="키 존재 여부와 네이버 도달성 점검").set_defaults(func=cmd_doctor)
    sub.add_parser("campaigns", help="캠페인 목록").set_defaults(func=cmd_campaigns)

    ag = sub.add_parser("adgroups", help="광고그룹 목록")
    ag.add_argument("--campaign", required=True, help="nccCampaignId")
    ag.set_defaults(func=cmd_adgroups)

    kw = sub.add_parser("keywords", help="키워드 목록")
    kw.add_argument("--adgroup", required=True, help="nccAdgroupId")
    kw.set_defaults(func=cmd_keywords)

    st = sub.add_parser("stats", help="성과 조회 (노출수·클릭수·광고비·CTR·CPC·평균순위·전환수)")
    st.add_argument("--ids", required=True, help="캠페인/그룹/키워드 id, 콤마구분")
    st.add_argument("--since", help="YYYY-MM-DD")
    st.add_argument("--until", help="YYYY-MM-DD")
    st.add_argument("--by", choices=["day"], help="breakdown 단위")
    st.set_defaults(func=cmd_stats)

    kt = sub.add_parser("keywordtool", help="연관키워드·월간 조회수·경쟁정도")
    kt.add_argument("--keywords", required=True, help="힌트 키워드, 콤마구분")
    kt.set_defaults(func=cmd_keywordtool)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = args.func(args)
    except CredentialError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except ApiError as exc:
        hints = {
            401: "서명 실패 — 키가 맞는지 / 시스템 시계가 정확한지 확인",
            403: "권한 없음 — 이 customer_id에 조회 권한이 있는지 확인",
            404: "id를 찾을 수 없음 — campaign/adgroup id 확인",
            429: "호출 한도 초과 — 잠시 후 재시도",
            0: "egress 차단 — 로컬 환경(클로드 코드/코덱스)에서 실행했는지 확인",
        }
        hint = hints.get(exc.status, "")
        print(f"{exc}" + (f" ({hint})" if hint else ""), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
