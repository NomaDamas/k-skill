# KOSIS Open API 가이드

이 문서는 **국가데이터처**(구 통계청)가 운영하는 **KOSIS(국가통계포털, https://kosis.kr)** Open API의 인증키 발급 절차, 호출 한도, 주요 endpoint 사용법, 응답 포맷, 에러 코드를 한국어로 정리한 reference이다. 영문 명칭은 기존 KOSIS / Statistics Korea 그대로 사용된다.

출처:

- KOSIS Open API 공식 진입: https://kosis.kr/openapi/
  - 회원가입·활용신청·개발 가이드·내 신청 현황은 사이트 좌측 메뉴에서 진입한다.
  - deep-link(`devGuide/...`, `serviceUse/...`)는 SSO/SPA 라우팅에 따라 직접 접근 시 빈 화면이 뜰 수 있으니, 위 진입 URL에서 메뉴를 따라간다.
- KOSIS 공식 공지(2026-03-05 시행, HTTPS 전용·rate limit) — 활용신청 페이지 공지사항에서 확인.
- 본 가이드는 `kosis-mcp` 프로젝트의 `KOSIS_API_REFERENCE.md` 문서를 참고했다.

---

## 1. 인증키 발급 절차

KOSIS Open API는 무료다. 발급 단계:

1. **KOSIS 회원가입** — https://kosis.kr/ 우측 상단 "회원가입"
2. **활용신청** — https://kosis.kr/openapi/serviceUse/serviceUseUnityReg_01Detail.do
   - 활용 목적, 호출 빈도, 사용 서비스 종류를 입력한다
   - 신청 후 인증키가 즉시 발급된다 (관리자 승인 불필요)
3. **인증키 확인** — https://kosis.kr/openapi/serviceUse/myMain_01List.do
4. **`KSKILL_KOSIS_API_KEY` 환경변수에 저장**
5. (선택) 활용 사례 등록 — 작성한 어플리케이션 정보를 등록할 수 있다

발급된 키는 `apiKey=<KEY>` 형태로 모든 endpoint 호출에 포함한다.

---

## 2. 호출 한도와 프로토콜 (2026-03-05 적용)

| 항목 | 제한 | 비고 |
|------|------|------|
| Rate limit | 분당 1,000건 / 키 | 초과 시 에러 코드 `40` |
| 1회 호출당 최대 결과 | 40,000셀 | 초과 시 에러 코드 `31` 또는 `41` |
| 대용량 SDMX | 40,000셀 초과 시 SDMX 불가 → XLS 사용 | `statisticsBigData.do` |
| 대용량 XLS | 200,000셀 초과 시 XLS 불가 → 쿼리 분할 | |
| 프로토콜 | **HTTPS 전용** (HTTP 차단) | 모든 URL은 `https://` |

40,000셀이란 1회 응답에 포함되는 데이터 셀(수치 값) 수다. 예를 들어 100개 지역 × 10개 항목 × 50년 = 50,000셀 → 1회 호출 불가 → 기간/지역/항목으로 분할.

---

## 3. 주요 Endpoint

### 3.1 통계 검색 (`statisticsSearch.do`)

키워드로 통계표를 검색한다.

```
GET https://kosis.kr/openapi/statisticsSearch.do
  ?method=getList&apiKey={KEY}&format=json&jsonVD=Y
  &searchNm=인구&resultCount=20&startCount=1
```

응답 필드(주요): `ORG_ID`, `ORG_NM`, `TBL_ID`, `TBL_NM`, `STAT_ID`, `STAT_NM`, `VW_CD`, `MT_ATITLE`, `STRT_PRD_DE`, `END_PRD_DE`, `LINK_URL`.

데이터 조회는 `ORG_ID` + `TBL_ID` 조합을 다음 단계에서 사용한다.

### 3.2 통계표 메타데이터 (`statisticsData.do?method=getMeta`)

통계표의 분류·항목·단위·국문/영문명 등을 조회한다.

```
GET https://kosis.kr/openapi/statisticsData.do
  ?method=getMeta&type=TBL&apiKey={KEY}&format=json
  &orgId=101&tblId=DT_1IN0001
```

`type` 값:

- `TBL` — 통계표 명칭(국/영문)
- `ITM` — 항목(item) 메타
- `OBJ` — 분류(classifier) 메타

### 3.3 통계 데이터 조회 (`statisticsParameterData.do`)

실제 통계 데이터 셀을 조회한다. 가장 많이 쓰는 endpoint다.

```
GET https://kosis.kr/openapi/Param/statisticsParameterData.do
  ?method=getList&apiKey={KEY}&format=json&jsonVD=Y
  &orgId=101&tblId=DT_1YL20631
  &objL1=ALL&itmId=ALL
  &prdSe=Y&startPrdDe=2020&endPrdDe=2024
```

수록주기(`prdSe`)와 기간 형식:

| 코드 | 설명 | 기간 형식 |
|------|------|----------|
| `M` | 월간/격월 | `YYYYMM` (202401) |
| `Q` | 분기 | `YYYYQQ` (202401 = 1분기) |
| `S` | 반기 | `YYYYHH` (202401 = 상반기) |
| `Y` | 연간 | `YYYY` (2024) |
| `F` | 다년(2,3,4,5,10년) | `YYYY` |
| `IR` | 부정기 | `YYYY` 또는 `YYYYMMDD` |

분류 파라미터는 `objL1` ~ `objL8` (필요한 만큼만), 항목은 `itmId` (`ALL` 또는 특정 ID).

응답 셀 필드: `PRD_DE` (기간), `ITM_NM` (항목), `UNIT_NM` (단위), `DT` (값), `C1_NM`~`C8_NM` (분류명).

### 3.4 대용량 통계자료 (`statisticsBigData.do`)

40,000셀 초과 데이터를 한 번에 받기 위한 endpoint. **`userStatsId` 사전 등록 필요**.

```
GET https://kosis.kr/openapi/statisticsBigData.do
  ?method=getList&apiKey={KEY}&format=sdmx
  &userStatsId=openapisample/101/DT_1IN1502/2/1/20191106094026_1
  &prdSe=Y&newEstPrdCnt=5
```

`userStatsId` 발급:

1. KOSIS 로그인 → "개발 가이드 > 대용량 통계자료 > URL생성"
2. 통계표 ID, 항목, 분류, 기간을 선택해 자료 등록
3. 발급된 `userStatsId` 를 위 URL에 사용

응답 형식: `json`, `sdmx` (DSD/Generic/StructureSpecific), `csv`, `xls`.

> `run_kosis_stats.py bigdata --format` 은 텍스트 응답인 `json`, `sdmx`, `csv` 만 지원한다. `xls` 는 KOSIS가 바이너리 Excel 파일로 응답하므로 helper의 텍스트 출력 경로로 다루지 않는다. xls가 필요하면 KOSIS 웹 화면에서 직접 다운로드하거나, 추후 `--output PATH` 바이너리 모드가 추가되면 그때 사용한다.

---

## 4. 응답 포맷 주의

KOSIS API는 가끔 **비표준 JSON**을 반환한다. 키에 따옴표가 없는 경우가 있다.

```javascript
// 비표준 (KOSIS 원본)
{ORG_ID:"101", TBL_ID:"DT_1YL20631"}

// 표준 JSON으로 보정
{"ORG_ID":"101", "TBL_ID":"DT_1YL20631"}
```

`run_kosis_stats.py` 의 `fix_unquoted_keys()` 가 자동으로 보정한다.

`format=json&jsonVD=Y` 조합을 권장한다 (`jsonVD=Y` 는 verbatim 응답).

---

## 5. 에러 코드

KOSIS는 에러 시 `{"err": "<코드>", "errMsg": "<메시지>"}` 또는 `{"errCode": "<코드>", "errMsg": "<메시지>"}` 형태로 응답한다.

| 코드 | KOSIS 메시지 | 카테고리 | 권장 액션 |
|------|---|---|---|
| 10 | 인증키 누락 | auth | URL의 `?apiKey=` 확인 |
| 11 | 인증키 기간만료 | auth | https://kosis.kr/openapi/ 에서 갱신 |
| 20 | 필수요청변수 누락 | input | 필수 파라미터 확인 |
| 21 | 잘못된 요청변수 | input | `orgId`/`tblId`/기간 형식 재확인 |
| 30 | 조회결과 없음 | query | 키워드/기간/분류 완화 |
| 31 | 조회결과 초과 | query | 기간·지역·항목을 분할 |
| 40 | 호출가능건수 제한 | rate_limit | 분당 1,000건 한도 — 잠시 대기 |
| 41 | 호출가능ROW수 제한 | rate_limit | 1회 40,000셀 한도 — 쿼리 분할 |
| 42 | 사용자별 이용 제한 | rate_limit | KOSIS 운영팀 문의 |
| 50 | 서버오류 | server | 1~2초 대기 후 재시도 |

`run_kosis_stats.py` 는 위 코드를 감지해 사람용 힌트와 함께 stderr로 출력하고 exit 2 로 종료한다.

---

## 6. 안전 사용 가이드

- 인증키는 절대 저장소에 커밋하지 않는다. `examples/secrets.env.example` 참고.
- 호출은 분당 1,000건 한도 안에서 한다. 반복 폴링이 필요한 경우 호출 간 sleep을 둔다.
- 대용량 자료를 받을 때는 `userStatsId` 등록부터 사용자에게 안내한다. 자동 등록·웹 자동화는 하지 않는다.
- 응답에 개인식별정보가 포함될 일은 없지만, 비공개 검토 자료에 인증키가 echo되지 않도록 `--dry-run` 출력에서도 키는 `<DRY-RUN>` 으로 대체한다.
