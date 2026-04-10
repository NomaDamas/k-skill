---
name: zipcode-search
description: Look up a Korean postcode and official English address from a known address with the official ePost integrated search page.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v2
---

# Zipcode Search

## What this skill does

우체국 공식 통합 우편번호 검색 페이지를 조회해서 주소 키워드에 맞는 우편번호와 공식 영문 주소를 함께 찾는다.

## When to use

- "이 주소 우편번호랑 영문 주소 같이 알려줘"
- "서울특별시 강남구 테헤란로 123 영문 주소로 바꿔줘"
- "해외 결제용으로 한국 주소 영문 표기 필요해"

## Prerequisites

- 인터넷 연결
- `curl`
- `python3`

## Inputs

- 주소 키워드
  - 도로명 + 건물번호
  - 시/군/구 + 도로명
  - 동/리 + 지번

## Workflow

### 1. Query the official integrated ePost page first

비공식 영문주소 변환기나 블로그 표기를 쓰지 말고 아래 우체국 공식 통합 검색 페이지를 먼저 조회한다.

```text
https://www.epost.kr/search.RetrieveIntegrationNewZipCdList.comm
```

이 페이지는 `keyword` 파라미터로 우편번호, 국문 주소, `English/집배코드` 열의 공식 영문 주소를 함께 돌려준다.

### 2. Fetch the HTML with curl and extract the `viewDetail(...)` rows

현재 ePost 엔드포인트는 응답이 간헐적으로 reset/timeout 될 수 있으므로, 로컬 `urllib` 대신 `curl --http1.1 --tls-max 1.2` + 재시도 경로를 기본 예시로 사용한다.

```bash
python3 - <<'PY'
import html
import re
import subprocess

query = "서울특별시 강남구 테헤란로 123"
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
    "20",
    "--get",
    "--data-urlencode",
    f"keyword={query}",
    "https://www.epost.kr/search.RetrieveIntegrationNewZipCdList.comm",
]
page = subprocess.run(
    cmd,
    check=True,
    capture_output=True,
    text=True,
    encoding="utf-8",
).stdout

matches = re.findall(
    r"viewDetail\('([^']*)','([^']*)','([^']*)','([^']*)',\s*'[^']*'\)",
    page,
)

if not matches:
    raise SystemExit("검색 결과가 없습니다.")

for zip_code, road_address, english_address, jibun_address in matches[:5]:
    print(zip_code)
    print(html.unescape(road_address))
    print(html.unescape(english_address))
    print(html.unescape(jibun_address))
    print("---")
PY
```

핵심 값은 `viewDetail(zip, roadAddress, englishAddress, jibunAddress, rowIndex)` 인자다. 공식 출력은 보통 `123, Teheran-ro, Gangnam-gu, Seoul, 06133, Rep. of KOREA` 같은 형식을 그대로 준다.

### 3. Prefer the shipped helper for repeatable execution

저장소에는 같은 흐름을 감싼 실행 가능한 helper가 포함되어 있다.

```bash
python3 scripts/zipcode_search.py "서울특별시 강남구 테헤란로 123"
```

예시 출력:

```json
{
  "query": "서울특별시 강남구 테헤란로 123",
  "results": [
    {
      "zip_code": "06133",
      "road_address": "서울특별시 강남구 테헤란로 123 (역삼동, 여삼빌딩)",
      "english_address": "123, Teheran-ro, Gangnam-gu, Seoul, 06133, Rep. of KOREA",
      "jibun_address": "서울특별시 강남구 역삼동 648-23 (여삼빌딩)"
    }
  ]
}
```

### 4. Normalize for humans

응답은 raw HTML이므로 그대로 붙이지 말고 아래처럼 정리한다.

- 우편번호
- 도로명 국문 주소
- 공식 영문 주소
- 필요하면 지번 주소
- 후보가 여러 개면 상위 3~5개만 보여주고 어느 항목이 가장 근접한지 짚기

### 5. Retry with tighter and fuller keywords when needed

검색 결과가 없거나 timeout/reset이 반복되면 아래 순서로 재시도한다.

- 짧은 도로명 + 건물번호: `테헤란로 123`
- 시/군/구 포함 전체 주소: `서울 강남구 테헤란로 123`
- 동/리 + 지번 또는 대체 표기: `역삼동 648-23`

### 6. Prefer temp files in wrapped shells

CLI 래퍼나 에이전트 쉘에서는 here-doc + Python one-liner가 깨질 수 있으므로, 실전에서는 `mktemp` 같은 임시 파일에 HTML을 저장한 뒤 그 파일을 파싱하는 경로를 우선한다. 응답 일부만 보려고 `| head` 를 붙이면 다운스트림이 먼저 닫히면서 `curl: (23)` 이 보일 수 있으니, 이 경우도 전체 응답을 임시 파일에 저장한 뒤 확인한다.

## Done when

- 적어도 한 개의 우편번호 후보와 공식 영문 주소가 정리되어 있다
- 다중 후보일 때 사용자가 고를 수 있게 국문/영문 주소 차이가 보인다
- 검색 결과가 없으면 재검색 키워드 방향을 제안했다

## Failure modes

- 우체국 검색 페이지 마크업이 바뀌면 `viewDetail(...)` 추출 규칙이 깨질 수 있다
- 주소 키워드가 너무 넓으면 결과가 과하게 많아질 수 있다
- 재시도 없이 한 번만 호출하면 timeout/reset 같은 일시 오류가 날 수 있다
- `curl` 없이 다른 클라이언트로 바로 붙으면 협상/전송 오류가 날 수 있다

## Notes

- 공식 표기 그대로 유지하는 조회형 스킬이다
- 상대 날짜/실시간 개념은 없으므로 주소 문자열 정제에 집중한다
