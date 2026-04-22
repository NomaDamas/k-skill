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
GET /api/list.json?crtfc_key={key}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
     [&corp_code={code}]
     [&last_reprt_at=Y|N] [&pblntf_ty=A..J] [&pblntf_detail_ty=...]
     [&corp_cls=Y|K|N|E] [&sort=date|crp|rpt] [&sort_mth=asc|desc]
     [&page_no=1] [&page_count=10]
```

공식 가이드(DS001/2019001) 요청 인자 정리 (필수여부·기본값·허용값은 공식 표 기준, 식별자는 코드 폰트로 표기):

| 요청키 | 명칭 | 타입 | 필수여부 | 값설명 |
|---|---|---|---|---|
| `crtfc_key` | API 인증키 | STRING(40) | Y | 발급받은 인증키(40자리) |
| `corp_code` | 고유번호 | STRING(8) | N | 공시대상회사의 고유번호(8자리). ※ 개발가이드 > 공시정보 > 고유번호 참고 |
| `bgn_de` | 시작일 | STRING(8) | Y | 검색시작 접수일자(YYYYMMDD). 1) 기본값: 종료일(`end_de`). 2) **고유번호(`corp_code`)가 없는 경우 검색기간은 3개월로 제한** |
| `end_de` | 종료일 | STRING(8) | Y | 검색종료 접수일자(YYYYMMDD). 1) 기본값: 당일 |
| `last_reprt_at` | 최종보고서 검색여부 | STRING(1) | N | 최종보고서만 검색여부(Y or N). 1) 기본값: N (정정이 있는 경우 최종정정만 검색) |
| `pblntf_ty` | 공시유형 | STRING(1) | N | A=정기공시, B=주요사항보고, C=발행공시, D=지분공시, E=기타공시, F=외부감사관련, G=펀드공시, H=자산유동화, I=거래소공시, J=공정위공시 |
| `pblntf_detail_ty` | 공시상세유형 | STRING(4) | N | (※ 상세 유형 참조: `pblntf_detail_ty`) |
| `corp_cls` | 법인구분 | STRING(1) | N | Y(유가), K(코스닥), N(코넥스), E(기타). ※ 없으면 전체조회, **복수조건 불가** |
| `sort` | 정렬 | STRING(4) | N | 접수일자: `date` / 회사명: `crp` / 보고서명: `rpt`. ※ 기본값: `date` |
| `sort_mth` | 정렬방법 | STRING(4) | N | 오름차순(`asc`), 내림차순(`desc`). ※ 기본값: `desc` |
| `page_no` | 페이지 번호 | STRING(5) | N | 페이지 번호 (1~n). 기본값: 1 |
| `page_count` | 페이지 별 건수 | STRING(3) | N | 페이지당 건수 (1~100). 기본값: 10, 최대값: 100 |

`pblntf_detail_ty` 자주 쓰는 코드 예시: A001=사업보고서, A002=반기보고서, A003=분기보고서, B001=주요사항보고서, F001=감사보고서, F002=연결감사보고서, D001=주식등의대량보유상황보고서.

> **주의:** DART OpenAPI `list.json` 의 공식 요청 파라미터 표에 `corp_name` 은 존재하지 않는다. 회사명을 기준으로 특정 기업 공시만 좁혀 보려면 위 "corp_code 확보 절차"로 먼저 `corp_code`(8자리 고유번호)를 얻은 뒤 호출한다.

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

### 8. 직원 현황

```http
GET /api/empSttus.json?crtfc_key={key}&corp_code={code}&bsns_year={YYYY}&reprt_code={code}
```

부문별·성별 정규직/계약직 인원수, 평균 근속연수, 1인 평균 급여 등을 반환한다.

### 9. 유무상증자 결정

```http
GET /api/pifricDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

> **주의:** `pifricDecsn.json` 은 **유무상증자 결정** 전용 endpoint다. 유상증자만 따로 조회하려면 `piicDecsn.json` (유상증자 결정), 무상증자만 따로 조회하려면 `fricDecsn.json` (무상증자 결정)을 호출한다.

### 10. 소송 등의 제기

```http
GET /api/lwstLg.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 11. 해외 증권시장 주권등 상장 결정

```http
GET /api/ovLstDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 12. 해외 증권시장 주권등 상장폐지 결정

```http
GET /api/ovDlstDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 13. 전환사채권 발행결정

```http
GET /api/cvbdIsDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 14. 교환사채권 발행결정

```http
GET /api/exbdIsDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

### 15. 회사분할합병 결정

```http
GET /api/cmpDvmgDecsn.json?crtfc_key={key}&corp_code={code}&bgn_de={YYYYMMDD}&end_de={YYYYMMDD}
```

## Example requests

공시검색 (특정 기업, 삼성전자):

```bash
# 1. 먼저 위 "corp_code 확보 절차"로 corp_code(예: 삼성전자=00126380) 획득
# 2. corp_code로 기간 내 공시 조회
curl -fsS --get 'https://opendart.fss.or.kr/api/list.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bgn_de=20260101' \
  --data-urlencode 'end_de=20260419' \
  --data-urlencode 'page_count=5'
```

공시검색 (전체 시장 최근 공시, corp_code 미지정 — 공식 spec상 검색 기간 ≤ 3개월):

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/list.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'bgn_de=20260301' \
  --data-urlencode 'end_de=20260419' \
  --data-urlencode 'pblntf_ty=A' \
  --data-urlencode 'corp_cls=Y' \
  --data-urlencode 'page_count=10'
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

직원 현황 (사업보고서 기준):

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/empSttus.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bsns_year=2024' \
  --data-urlencode 'reprt_code=11011'
```

유무상증자 결정 (`pifricDecsn.json` — 유상증자만 보려면 `piicDecsn.json`):

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/pifricDecsn.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bgn_de=20200101' \
  --data-urlencode 'end_de=20260419'
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
| 012 | 접근할 수 없는 IP |
| 013 | 조회된 데이터 없음 |
| 014 | 파일이 존재하지 않음 |
| 020 | 요청 제한 초과 (공식 가이드: 일반적으로 20,000건 이상 요청 시 발생. 키별 별도 한도가 설정된 경우에도 동일 코드가 반환될 수 있음) |
| 021 | 조회 가능한 회사 개수 초과 (최대 100개) |
| 100 | 필드 오류 (필드의 부적절한 값) |
| 800 | 원천 시스템 점검 중 |
| 900 | 정의되지 않은 오류 |

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
- `status: "013"` (조회된 데이터 없음) 이면 기간/보고서 종류/`corp_code` 를 재확인하도록 안내한다.
- `status: "020"` (요청 제한 초과)이면 호출 한도 도달 가능성을 안내한다. 공식 가이드는 "일반적으로 20,000건 이상 요청 시" 발생한다고만 명시하며, 키별로 별도 한도가 설정되어 있으면 다른 임계치에서도 발생할 수 있음을 함께 알린다. 잠시 후 재시도를 권한다.
- 종목명만 알고 있다면 위 "corp_code 확보 절차"의 `corpCode.xml` 파싱으로 먼저 `corp_code`를 확보한 뒤 후속 API를 호출한다 (DART OpenAPI `list.json` 의 공식 요청 파라미터 표에 `corp_name` 은 존재하지 않는다).
- 재무제표 조회 시 `reprt_code` 를 사용자가 지정하지 않으면 사업보고서(11011)를 기본값으로 사용한다.
- `fs_div`를 지정하지 않으면 연결(CFS)을 기본값으로 사용한다.
- 주요사항보고서(9~15번)는 날짜 범위가 필요하다. 사용자가 기간을 지정하지 않으면 최근 1년을 기본으로 한다.
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
- DART API 요청 한도: 공식 가이드(`020` 메시지 설명)는 "**일반적으로 20,000건 이상의 요청** 에 대해 `020` (요청 제한 초과)이 발생하며, **키별로 별도 한도가 설정된 경우** 다른 임계치에서도 동일 코드가 반환될 수 있다"고 명시한다. 분당 throttle 등 세부 제약 수치는 공개 가이드에 별도로 게시되어 있지 않다. 본인 키의 정확한 사용 현황은 로그인 후 [OpenDART 이용현황](https://opendart.fss.or.kr/mng/apiUsageStatusView.do) 페이지에서 확인할 수 있다.
