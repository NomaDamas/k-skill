# 우편번호 + 영문주소 검색 가이드

## 이 기능으로 할 수 있는 일

- 주소 키워드로 공식 우체국 우편번호 조회
- 같은 후보의 국문 도로명/지번 주소와 공식 영문 주소를 함께 비교
- 검색 결과가 없을 때 바로 재검색 키워드 조정

## 먼저 필요한 것

- 인터넷 연결
- `curl`
- `python3`

## 입력값

- 주소 키워드
  - 예: `서울특별시 강남구 테헤란로 123`
  - 예: `역삼동 648-23`

## 기본 흐름

1. 비공식 변환기나 블로그 표기로 우회하지 말고 우체국 공식 통합 검색 페이지를 먼저 조회합니다.
2. 주소 키워드를 `keyword` 파라미터로 넘겨 HTML 결과를 받습니다.
3. 결과에서 `viewDetail(zip, roadAddress, englishAddress, jibunAddress, rowIndex)` 패턴을 추출합니다.
4. 후보가 여러 개면 상위 3~5개만 간단히 비교해 줍니다.
5. 전송 timeout/reset이 나면 `curl` 재시도 옵션을 유지한 채 한 번 더 돌리고, 그래도 실패하면 `테헤란로 123` 같은 짧은 도로명 + 건물번호 → `서울 강남구 테헤란로 123` 같은 시/군/구 포함 전체 주소 → 동/리 + 지번 순으로 재시도합니다.

## 공식 endpoint

```text
https://www.epost.kr/search.RetrieveIntegrationNewZipCdList.comm
```

검색 결과 표에는 `English/집배코드` 열이 있고, 실제 값은 `viewDetail(...)` 인자와 상세 행에 함께 들어 있습니다.

## 예시

```bash
python3 scripts/zipcode_search.py "서울특별시 강남구 테헤란로 123"
```

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

## raw HTML 추출 예시

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

for zip_code, road_address, english_address, jibun_address in matches[:5]:
    print(zip_code)
    print(html.unescape(road_address))
    print(html.unescape(english_address))
    print(html.unescape(jibun_address))
    print("---")
PY
```

## 실전 운영 팁

- 쉘 래퍼나 에이전트 환경에서는 here-doc + Python one-liner보다 `mktemp` 같은 임시 파일에 HTML을 저장한 뒤 파싱하는 쪽이 더 안전합니다.
- 응답 일부만 빨리 보려고 `curl ... | head` 를 붙이면 다운스트림이 먼저 닫히면서 `curl: (23)` 이 보일 수 있습니다. 이때는 전체 응답을 임시 파일에 저장한 뒤 확인합니다.
- 기본은 우체국 공식 영문 주소를 그대로 유지하고, 외부 서비스가 국가명 축약을 싫어할 때만 후처리를 따로 합니다.

## 프로토콜/클라이언트 제약

- 현재 ePost 통합 검색 엔드포인트는 같은 curl 플래그여도 간헐적인 timeout/reset이 있을 수 있으므로 기본 예시는 `--retry 3 --retry-all-errors --retry-delay 1`을 포함합니다.
- 문서 기본 예시는 `curl --http1.1 --tls-max 1.2` 전송을 사용하고, Python은 응답 파싱/정리에만 사용합니다.
- 바깥쪽 Python `timeout`은 두지 않고 `curl` 자체 제한(`--max-time` + `--retry`)으로 전체 전송 시간을 제어합니다.
- 다른 클라이언트를 쓰더라도 최소한 HTTP/1.1 + TLS 1.2 경로에서 실제 응답을 먼저 확인한 뒤 `viewDetail(...)` 추출을 붙입니다.

## 주의할 점

- 같은 번지라도 건물명에 따라 여러 행이 나올 수 있으니 첫 결과만 바로 확정하지 않습니다.
- 결과가 너무 많으면 시/군/구를 포함해 검색어를 더 구체화합니다.
- 조회형 스킬이므로 개인정보를 저장하지 않습니다.
