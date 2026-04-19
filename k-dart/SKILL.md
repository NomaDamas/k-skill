---
name: k-dart
description: 금융감독원 전자공시시스템(DART) OpenAPI로 공시검색, 기업개황, 재무제표, 주요사항보고서를 조회한다. 사용자의 API_K_DART 환경변수를 직접 사용한다.
license: MIT
metadata:
  category: finance
  locale: ko-KR
  phase: v1
---

# k-dart — 금감원 DART 전자공시 조회

## What this skill does

`API_K_DART` 환경변수에 담긴 인증키로 DART OpenAPI(`https://opendart.fss.or.kr/api/`)를 직접 호출해 공시·재무·주요사항 정보를 조회한다. 프록시를 거치지 않는다.

## When to use

- "삼성전자 최근 공시 보여줘"
- "카카오 기업개황 알려줘"
- "LG에너지솔루션 2024년 연간 재무제표"
- "네이버 배당 현황"
- "하이브 전환사채 발행 이력"
- "셀트리온 소송 현황"
- "SK하이닉스 감사의견"
- "현대차 증자/감자 이력"
- "삼성바이오 자기주식 취득/처분"

## When not to use

- 실시간 주가/호가/체결 조회 → `korean-stock-search` 스킬
- 해외 기업 공시
- 투자 자문/매수 추천

## Prerequisites

`API_K_DART` 환경변수가 설정되어 있어야 한다. 키 발급: <https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do>

## corp_code 확보 절차

DART API 대부분은 `corp_code`(8자리 고유번호)를 요구한다. 사용자가 종목명이나 종목코드(6자리)만 제공하면:

1. **고유번호 전체 목록(`corpCode.xml`)을 다운로드**해 회사명 또는 종목코드로 `corp_code`를 조회한다:

**macOS / Linux (bash):**

```bash
# ZIP 다운로드 → 압축 해제 (이미 있으면 생략)
[ -f /tmp/dart_corp/CORPCODE.xml ] || {
  curl -fsS -o /tmp/dart_corp.zip \
    "https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=$API_K_DART"
  mkdir -p /tmp/dart_corp && unzip -o /tmp/dart_corp.zip -d /tmp/dart_corp
}

# 회사명 또는 종목코드로 corp_code 검색 (상장사만)
grep -B2 -A3 '삼성전자' /tmp/dart_corp/CORPCODE.xml | awk '
/<corp_code>/{code=$0; gsub(/.*<corp_code>|<\/corp_code>.*/,"",code)}
/<corp_name>/{name=$0; gsub(/.*<corp_name>|<\/corp_name>.*/,"",name)}
/<stock_code>[0-9]/{stock=$0; gsub(/.*<stock_code>|<\/stock_code>.*/,"",stock); print code, stock, name}
'
# 출력: 00126380 005930 삼성전자
```

**Windows (PowerShell):**

```powershell
# ZIP 다운로드 → 압축 해제 (이미 있으면 생략)
$dartDir = "$env:TEMP\dart_corp"
if (-not (Test-Path "$dartDir\CORPCODE.xml")) {
  Invoke-WebRequest "https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=$env:API_K_DART" -OutFile "$dartDir.zip"
  New-Item -ItemType Directory -Path $dartDir -Force | Out-Null
  Expand-Archive "$dartDir.zip" -DestinationPath $dartDir -Force
}

# 회사명 또는 종목코드로 corp_code 검색 (상장사만)
[xml]$xml = Get-Content "$dartDir\CORPCODE.xml"
$xml.result.list | Where-Object { $_.corp_name -like '*삼성전자*' -and $_.stock_code.Trim() -ne '' } |
  Select-Object corp_code, stock_code, corp_name
# 출력: 00126380  005930  삼성전자
```

2. 획득한 `corp_code`로 나머지 API 호출

> **참고:** `/tmp/dart_corp/CORPCODE.xml`이 이미 있으면 재다운로드 없이 재사용한다. 파일은 약 30MB이며 전체 법인 목록(상장+비상장)을 포함한다. `corpCode.xml`에 회사명·종목코드·고유번호가 모두 포함되어 있으므로 별도 스킬 연계 없이 단독으로 corp_code를 확보할 수 있다.

## Supported endpoints

모든 요청은 `GET https://opendart.fss.or.kr/api/{endpoint}.json?crtfc_key=$API_K_DART&...` 형식이다.

### 1. 공시검색

```http
GET /api/list.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}&page_no=1&page_count=10
```

선택 파라미터: `corp_name`, `pblntf_ty`(공시유형), `pblntf_detail_ty`, `corp_cls`(Y:유가, K:코스닥, N:코넥스, E:기타), `sort`(date|crp|rpt), `sort_mth`(asc|desc)

`corp_code` 없이 `corp_name`으로도 검색 가능하다.

### 2. 기업개황

```http
GET /api/company.json?crtfc_key={key}&corp_code={code}
```

### 3. 재무제표 (단일회사 전체 재무제표)

```http
GET /api/fnlttSinglAcntAll.json?crtfc_key={key}&corp_code={code}&bsns_year={YYYY}&reprt_code={code}&fs_div={OFS|CFS}
```

`reprt_code`: 11013(1분기), 11012(반기), 11014(3분기), 11011(사업보고서)
`fs_div`: OFS(개별), CFS(연결)

### 4. 증자(감자) 현황

```http
GET /api/irdsSttus.json?crtfc_key={key}&corp_code={code}&bsns_year={YYYY}&reprt_code={code}
```

### 5. 배당에 관한 사항

```http
GET /api/alotMatter.json?crtfc_key={key}&corp_code={code}&bsns_year={YYYY}&reprt_code={code}
```

### 6. 자기주식 취득 및 처분 현황

```http
GET /api/tesstkAcqsDspsSttus.json?crtfc_key={key}&corp_code={code}&bsns_year={YYYY}&reprt_code={code}
```

### 7. 회계감사인의 명칭 및 감사의견

```http
GET /api/accnutAdtorNmNdAdtOpinion.json?crtfc_key={key}&corp_code={code}&bsns_year={YYYY}&reprt_code={code}
```

### 8. 유무상증자 결정

```http
GET /api/piicDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 9. 소송 등의 제기

```http
GET /api/lwstLg.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 10. 해외 증권시장 주권등 상장 결정

```http
GET /api/ovLstDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 11. 해외 증권시장 주권등 상장폐지 결정

```http
GET /api/ovDlstDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 12. 전환사채권 발행결정

```http
GET /api/cvbdIsDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 13. 교환사채권 발행결정

```http
GET /api/exbdIsDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 14. 회사분할합병 결정

```http
GET /api/cmpDvmgDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

## Example requests

공시검색 (회사명):

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/list.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_name=삼성전자' \
  --data-urlencode 'bgn_de=20260101' \
  --data-urlencode 'end_de=20260419' \
  --data-urlencode 'page_count=5'
```

기업개황:

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/company.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380'
```

재무제표 (연결, 사업보고서):

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bsns_year=2024' \
  --data-urlencode 'reprt_code=11011' \
  --data-urlencode 'fs_div=CFS'
```

배당 현황:

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/alotMatter.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bsns_year=2024' \
  --data-urlencode 'reprt_code=11011'
```

전환사채 발행결정:

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/cvbdIsDecsn.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bgn_de=20200101' \
  --data-urlencode 'end_de=20260419'
```

## Response shape

### DART 공통 응답 구조

모든 응답은 `status`와 `message` 필드를 포함한다:

```json
{
  "status": "000",
  "message": "정상",
  "list": [ ... ]
}
```

### 상태코드

| status | 의미 |
|--------|------|
| 000 | 정상 |
| 010 | 등록되지 않은 키 |
| 011 | 사용할 수 없는 키 |
| 013 | 접근 권한 없음 |
| 020 | 요청 제한 초과 |
| 100 | 필드 오류 |
| 800 | 원천 시스템 오류 |
| 900 | 미정의 오류 |

### 공시검색 응답 예시

```json
{
  "status": "000",
  "message": "정상",
  "page_no": 1,
  "page_count": 5,
  "total_count": 142,
  "total_page": 29,
  "list": [
    {
      "corp_code": "00126380",
      "corp_name": "삼성전자",
      "stock_code": "005930",
      "corp_cls": "Y",
      "report_nm": "[기재정정]사업보고서 (2024.12)",
      "rcept_no": "20250401000123",
      "flr_nm": "삼성전자",
      "rcept_dt": "20250401",
      "rm": ""
    }
  ]
}
```

### 기업개황 응답 예시

```json
{
  "status": "000",
  "message": "정상",
  "corp_code": "00126380",
  "corp_name": "삼성전자",
  "corp_name_eng": "SAMSUNG ELECTRONICS CO.,LTD",
  "stock_name": "삼성전자",
  "stock_code": "005930",
  "ceo_nm": "한종희, 경계현",
  "corp_cls": "Y",
  "jurir_no": "1301110006246",
  "bizr_no": "1248100998",
  "adres": "경기도 수원시 영통구 삼성로 129",
  "hm_url": "www.samsung.com",
  "ir_url": "",
  "phn_no": "031-200-1114",
  "induty_code": "264",
  "est_dt": "19690113",
  "acc_mt": "12"
}
```

## Response policy

- `status`가 `"000"`이 아니면 에러 메시지를 사용자에게 안내한다.
- `status: "020"` (요청 제한 초과)이면 잠시 후 재시도를 안내한다.
- 종목명이 모호하면 먼저 `list.json`의 `corp_name`으로 검색해 `corp_code`를 확보한 뒤 후속 API를 호출한다.
- 재무제표 조회 시 `reprt_code` 를 사용자가 지정하지 않으면 사업보고서(11011)를 기본값으로 사용한다.
- `fs_div`를 지정하지 않으면 연결(CFS)을 기본값으로 사용한다.
- 주요사항보고서(8~14번)는 날짜 범위가 필요하다. 사용자가 기간을 지정하지 않으면 최근 1년을 기본으로 한다.
- 숫자는 읽기 쉬운 단위(억, 조, 주)로 풀어주되 원본 수치도 유지한다.
- 답변 말미에 "금감원 DART 공시 데이터 기준 / 투자 조언 아님" 을 짧게 남긴다.

## Keep the answer compact

- 공시검색: 공시명 / 접수일 / 제출인 위주로 최근 5~10건
- 기업개황: 회사명 / 대표자 / 업종 / 주소 / 결산월
- 재무제표: 매출액 / 영업이익 / 당기순이익 / 자산총계 / 부채총계 / 자본총계 핵심 항목
- 주요사항보고서: 핵심 결정 내용과 일자를 요약

## Failure modes

- `API_K_DART` 환경변수 미설정 → 키 발급 안내 후 중단
- `status` ≠ `"000"` → 상태코드표 참고해 에러 안내
- `corp_code`를 찾을 수 없음 → 회사명 재확인 요청
- 해당 기간/보고서에 데이터 없음 → 기간 또는 `reprt_code` 변경 안내

## Done when

- `API_K_DART` 존재를 확인했다.
- 사용자 요청에 맞는 endpoint를 호출해 결과를 정리했다.
- 필요 시 `corp_code`를 먼저 확보한 뒤 후속 조회를 수행했다.
- 금감원 DART 공시 데이터 기준임을 짧게 남겼다.

## Notes

- 공식 데이터 출처: [DART OpenAPI](https://opendart.fss.or.kr/intro/main.do)
- 이 스킬은 read-only 조회 전용이다.
- DART API 일일 요청 한도는 키당 10,000건이다.
