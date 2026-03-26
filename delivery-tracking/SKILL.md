---
name: delivery-tracking
description: Track CJ대한통운 and 우체국 parcels by invoice number with official carrier endpoints, and structure the workflow around a carrier adapter that can grow to more couriers later.
license: MIT
metadata:
  category: logistics
  locale: ko-KR
  phase: v1
---

# Delivery Tracking

## What this skill does

CJ대한통운과 우체국 공식 조회 표면을 사용해 송장 번호로 현재 배송 상태를 조회한다.

- **CJ대한통운**: 공식 배송조회 페이지가 노출하는 JSON endpoint 사용
- **우체국**: 공식 배송조회 페이지가 사용하는 HTML endpoint 사용
- 결과는 공통 포맷(택배사 / 송장번호 / 현재 상태 / 최근 이벤트들)으로 짧게 정리

## When to use

- "CJ대한통운 송장 조회해줘"
- "우체국 택배 지금 어디야"
- "이 송장번호 배송완료인지 확인해줘"
- "택배사별 조회 로직을 나중에 더 붙일 수 있게 정리해줘"

## When not to use

- 주문번호만 있고 송장번호가 없는 경우
- 택배 예약/반품 접수까지 바로 해야 하는 경우
- 비공식 통합 배송조회 서비스로 우회하고 싶은 경우

## Prerequisites

- 인터넷 연결
- `python3`
- `curl`
- 선택 사항: `jq`

## Inputs

- 택배사 식별자: `cj` 또는 `epost`
- 송장번호
  - CJ대한통운: 숫자 10자리 또는 12자리
  - 우체국: 숫자 13자리

## Carrier adapter rule

이 스킬은 택배사별 로직을 **carrier adapter** 단위로 나눈다.

새 택배사를 붙일 때는 아래 필드를 먼저 정한다.

- `carrier id`: 예) `cj`, `epost`
- `validator`: 송장번호 자리수/패턴
- `entrypoint`: 공식 조회 진입 URL
- `transport`: JSON API / HTML form / CLI 중 무엇을 쓰는지
- `parser`: 어떤 필드나 테이블에서 상태를 뽑는지
- `status map`: 각 택배사의 원본 상태 코드를 공통 상태로 어떻게 줄일지
- `retry policy`: timeout/retry 규칙

현재 어댑터는 아래 둘이다.

| carrier adapter | official entry | transport | validator | parser focus |
| --- | --- | --- | --- | --- |
| `cj` | `https://www.cjlogistics.com/ko/tool/parcel/tracking` | page GET + `tracking-detail` POST JSON | 10자리 또는 12자리 숫자 | `parcelDetailResultMap.resultList` |
| `epost` | `https://service.epost.go.kr/trace.RetrieveRegiPrclDeliv.postal?sid1=` | form POST HTML | 13자리 숫자 | 기본정보 `table_col` + 상세 `processTable` |

## Workflow

### 0. Normalize the input first

- 택배사 이름을 `cj` / `epost` 둘 중 하나로 정규화한다.
- 송장번호에서 공백과 `-` 를 제거한다.
- 자리수 검증이 먼저 실패하면 조회를 보내지 않는다.

### 1. CJ대한통운: official JSON flow

공식 진입 페이지에서 `_csrf` 를 읽고, 그 값을 `tracking-detail` POST에 같이 보낸다.

- 진입 페이지: `https://www.cjlogistics.com/ko/tool/parcel/tracking`
- 상세 endpoint: `https://www.cjlogistics.com/ko/tool/parcel/tracking-detail`
- 필수 필드: `_csrf`, `paramInvcNo`

기본 예시는 `curl` 로 `_csrf` 와 cookie를 유지하고, Python은 JSON 정리에만 쓴다.

```bash
tmp_body="$(mktemp)"
tmp_cookie="$(mktemp)"
tmp_json="$(mktemp)"
invoice="1234567890"  # 공식 페이지 placeholder 성격의 smoke-test 값

curl -sS -L -c "$tmp_cookie" \
  "https://www.cjlogistics.com/ko/tool/parcel/tracking" \
  -o "$tmp_body"

csrf="$(python3 - <<'PY' "$tmp_body"
import re
import sys

text = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
print(re.search(r'name="_csrf" value="([^"]+)"', text).group(1))
PY
)"

curl -sS -L -b "$tmp_cookie" \
  -H "Content-Type: application/x-www-form-urlencoded; charset=UTF-8" \
  --data-urlencode "_csrf=$csrf" \
  --data-urlencode "paramInvcNo=$invoice" \
  "https://www.cjlogistics.com/ko/tool/parcel/tracking-detail" \
  -o "$tmp_json"

python3 - <<'PY' "$tmp_json"
import json
import sys

payload = json.load(open(sys.argv[1], encoding="utf-8"))
events = payload["parcelDetailResultMap"]["resultList"]
if not events:
    raise SystemExit("조회 결과가 없습니다.")

status_map = {
    "11": "상품인수",
    "21": "상품이동중",
    "41": "상품이동중",
    "42": "배송지도착",
    "44": "상품이동중",
    "82": "배송출발",
    "91": "배달완료",
}

latest = events[-1]
print(json.dumps({
    "carrier": "cj",
    "invoice": payload["parcelDetailResultMap"]["paramInvcNo"],
    "status_code": latest.get("crgSt"),
    "status": status_map.get(latest.get("crgSt"), latest.get("scanNm") or "알수없음"),
    "timestamp": latest.get("dTime"),
    "location": latest.get("regBranNm"),
    "event_count": len(events),
}, ensure_ascii=False, indent=2))
PY

rm -f "$tmp_body" "$tmp_cookie" "$tmp_json"
```

추가 smoke test 로는 `000000000000` 도 사용할 수 있다.

CJ 응답은 `parcelResultMap.resultList` 가 비어 있어도 `parcelDetailResultMap.resultList` 쪽에 이벤트가 들어올 수 있으므로, 상세 이벤트 배열을 우선 본다. 예시 출력은 `crgSt` / `scanNm` / `dTime` / `regBranNm` / 이벤트 수처럼 비식별 필드만 요약하고, 담당자 이름·연락처가 섞일 수 있는 `crgNm` 원문은 그대로 보여주지 않는다.

### 2. 우체국: official HTML flow

우체국은 공식 entry page가 다시 `trace.RetrieveDomRigiTraceList.comm` 으로 `sid1` 을 POST하는 구조다.

- 진입 페이지: `https://service.epost.go.kr/trace.RetrieveRegiPrclDeliv.postal?sid1=`
- 실제 조회 endpoint: `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm`
- 필수 필드: `sid1`

우체국은 로컬 Python HTTP client보다 `curl --http1.1 --tls-max 1.2` 경로가 더 안정적이므로 그 조합을 기본 예시로 쓴다.

```bash
tmp_html="$(mktemp)"
python3 - <<'PY' "$tmp_html"
import html
import re
import subprocess
import sys

tracking_no = "1234567890123"  # 공식 페이지 placeholder 성격의 smoke-test 값
output_path = sys.argv[1]

cmd = [
    "curl",
    "--http1.1",
    "--tls-max",
    "1.2",
    "--silent",
    "--show-error",
    "--location",
    "--retry",
    "3",
    "--retry-all-errors",
    "--retry-delay",
    "1",
    "--max-time",
    "30",
    "-o",
    output_path,
    "-d",
    f"sid1={tracking_no}",
    "https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm",
]
subprocess.run(cmd, check=True)

page = open(output_path, encoding="utf-8", errors="ignore").read()

summary = re.search(
    r"<th scope=\"row\">(?P<tracking>[^<]+)</th>.*?"
    r"<td>(?P<sender>.*?)</td>.*?"
    r"<td>(?P<receiver>.*?)</td>.*?"
    r"<td>(?P<delivered_to>.*?)</td>.*?"
    r"<td>(?P<kind>.*?)</td>.*?"
    r"<td>(?P<result>.*?)</td>",
    page,
    re.S,
)
if not summary:
    raise SystemExit("기본정보 테이블을 찾지 못했습니다.")

def clean(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw)
    return " ".join(html.unescape(text).split())

events = re.findall(
    r"<tr>\s*<td>(\d{4}\.\d{2}\.\d{2})</td>\s*"
    r"<td>(\d{2}:\d{2})</td>\s*"
    r"<td>(.*?)</td>\s*"
    r"<td>\s*<span class=\"evtnm\">(.*?)</span>(.*?)</td>\s*</tr>",
    page,
    re.S,
)

normalized_events = [
    {
        "date": day,
        "time": time_,
        "location": clean(location),
        "status": clean(status),
        "detail": clean(detail),
    }
    for day, time_, location, status, detail in events
]

print({
    "carrier": "epost",
    "tracking_no": clean(summary.group("tracking")),
    "delivery_result": clean(summary.group("result")),
    "delivered_to": clean(summary.group("delivered_to")),
    "event_count": len(normalized_events),
    "latest_event": normalized_events[-1] if normalized_events else None,
})
PY
rm -f "$tmp_html"
```

우체국 기본정보 테이블은 `등기번호`, `보내는 분/접수일자`, `받는 분`, `수령인/배달일자`, `취급구분`, `배달결과` 순서를 사용하고, 상세 이벤트는 `processTable` 아래 `날짜 / 시간 / 발생국 / 처리현황` 행을 읽으면 된다.

### 3. Normalize for humans

응답 원문을 그대로 붙이지 말고 아래 순서로 요약한다.

- 택배사
- 송장번호
- 현재 상태
- 마지막 이벤트 시각
- 마지막 이벤트 위치
- 최근 3~5개 이벤트

### 4. Retry and fallback policy

- 자리수 오류면 바로 멈추고 올바른 형식을 다시 받는다.
- CJ는 `_csrf` 재취득 후 한 번 더 시도한다.
- 우체국은 `curl --retry 3 --retry-all-errors --retry-delay 1` 을 유지한다.
- 다른 택배사로 우회하지 않는다.

## Done when

- 택배사와 송장번호가 올바르게 식별되어 있다
- 현재 상태와 최근 이벤트가 정리되어 있다
- 어느 official surface를 썼는지 설명할 수 있다
- 다른 택배사 확장 시 어떤 carrier adapter 필드를 추가해야 하는지 남아 있다

## Failure modes

- CJ: `_csrf` 추출 실패 또는 `tracking-detail` 응답 스키마 변경
- CJ: 송장번호 길이가 10자리 또는 12자리가 아님
- 우체국: `sid1` 이 13자리가 아님
- 우체국: HTML 마크업 변경으로 테이블 추출 규칙이 깨짐
- 우체국: `curl` 없이 다른 client로 붙다가 timeout/reset 발생

## Notes

- 조회형 스킬이다.
- 기본 표면은 공식 carrier endpoint만 사용한다.
- 다른 택배사 추가는 새 carrier adapter 1개를 같은 포맷으로 붙이는 방식으로 확장한다.
