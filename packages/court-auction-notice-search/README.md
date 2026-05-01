# court-auction-notice-search

대한민국 법원경매정보(`courtauction.go.kr`) 의 **부동산 매각공고**·**사건 정보**를 에이전트가 활용할 수 있는 JSON 형태로 변환해서 돌려주는 read-only 클라이언트.

## What this is (and isn't)

- ✅ Workflow A — 매각공고 목록 + 매각공고 상세(사건/물건 펼치기)
- ✅ Workflow B — 사건번호로 직접 조회 (사건정보·물건내역·매각기일내역·배당요구종기)
- ✅ 코드테이블 — 법원사무소(60+개) + 입찰구분(기일/기간) 코드 매핑
- ✅ 2-tier transport — direct HTTP 1차, Playwright fallback (`rebrowser-playwright` / `playwright-core`)
- ✅ 안티봇 가드 — 호출 간 ≥2초 jitter, 세션당 호출 budget(기본 10회), `data.ipcheck === false` 즉시 throw
- ❌ Workflow C 자유 조건검색(지역/용도/가격대/면적/유찰횟수) — 별도 follow-up 이슈
- ❌ Workflow D 일별/월별 캘린더 — 별도 follow-up 이슈
- ❌ 매각물건 사진 / 매각물건명세서 PDF / 감정평가서 PDF — 별도 follow-up 이슈
- ❌ 동산(자동차·중기) 경매 — 본 패키지 범위 밖
- ❌ 입찰서 자동 작성·자동 제출 — 지원하지 않음 (read-only 정책)

> **참고용**입니다. 실제 입찰 전에는 반드시 해당 법원의 원문 매각공고와 매각물건명세서를 직접 확인하세요. 가격(감정·최저), 매각기일, 매각장소는 정정·취하·연기로 변경될 수 있습니다.

## Install

```bash
npm install court-auction-notice-search
```

Playwright fallback 을 쓰려면 다음 중 하나를 함께 설치 (선택):

```bash
npm install rebrowser-playwright   # 봇 차단 우회 친화 브라우저 자동화 (권장)
# 또는
npm install playwright-core
```

## Quickstart

```js
const {
  searchSaleNotices,
  getSaleNoticeDetail,
  getCaseByCaseNumber,
  getCourtCodes,
  getBidTypes
} = require("court-auction-notice-search");

const courts = await getCourtCodes();
console.log(courts.items.find((c) => c.name === "서울중앙지방법원"));
// { code: "B000210", name: "서울중앙지방법원", branchName: "서울중앙지방법원" }

const notices = await searchSaleNotices({
  date: "2026-04", // 월 전체 조회. "2026-04-27"처럼 일자를 주면 같은 월을 조회한 뒤 해당 일자만 필터링
  courtCode: "B000210",
  bidType: "date" // "기일입찰" / "000331" 도 모두 받음
});
console.log(`매각공고 ${notices.count}건`);

if (notices.items.length > 0) {
  const detail = await getSaleNoticeDetail(notices.items[0]);
  for (const item of detail.items) {
    console.log(item.caseNumber, item.usage, item.address);
    console.log("  감정 ", item.appraisedPrice, "최저 ", item.minimumSalePrice);
  }
}

const caseInfo = await getCaseByCaseNumber({
  courtCode: "B000210",
  caseNumber: "2024타경100001"
});
if (caseInfo.found) {
  console.log(caseInfo.caseInfo.caseName, caseInfo.schedule.length);
}
```

## CLI

```bash
court-auction-notice-search -h
court-auction-notice-search codes courts --pretty
court-auction-notice-search codes bid-types --pretty
court-auction-notice-search notices --date 2026-04 --court-code B000210 --bid-type date --pretty
court-auction-notice-search case --court-code B000210 --case-number "2024타경100001" --pretty
```

## Public API

- `searchSaleNotices({ date, courtCode?, bidType?, includeRaw?, client? })`
  - `date`: `"YYYY-MM"`/`"YYYYMM"` 또는 `"YYYY-MM-DD"`/`"YYYYMMDD"` (필수). 실제 사이트 검색 버튼은 월(`YYYYMM`) 단위로 조회하므로, 일자를 주면 같은 월을 조회한 뒤 해당 매각기일만 필터링한다
  - `courtCode`: `"B000210"` 형식 또는 `""`(전체)
  - `bidType`: `"date"` / `"period"` / `"기일입찰"` / `"기간입찰"` / `"000331"` / `"000332"` / `""`
  - returns `{ requestedDate, requestedCourtCode, requestedBidType, count, items[] }`
- `getSaleNoticeDetail(noticeOrKeys, options?)`
  - 입력은 `searchSaleNotices` 결과의 `items[i]` 그대로 넘기는 것이 가장 쉽다 (raw 필드를 자동 추출).
  - 또는 `{ courtCode, saleDate, judgeDeptCode, bidStartDate?, bidEndDate?, ... }` 형태로 키만 넣어도 된다.
  - returns `{ notice, count, items[] }` — `items[i]` 가 `{ caseNumber, itemSeq, usage, address, appraisedPrice, minimumSalePrice, remarks, raw }`
- `getCaseByCaseNumber({ courtCode, caseNumber, includeRaw?, client? })`
  - `caseNumber`: `"2024타경100001"` 권장. `"2024-100001"`, `"2024_100001"` 등은 자동 정규화.
  - returns `{ found, status, message, caseInfo, items[], schedule[], claimDeadline, relatedCases[], appeals[], stakeholders[], raw? }`
- `getCourtCodes({ client? })` — 법원사무소 코드표 동적 로드
- `getBidTypes()` — 입찰구분 정적 코드표 (기일입찰=`000331`, 기간입찰=`000332`)
- `resolveBidTypeCode(input)`, `describeBidTypeCode(code)` — 코드 변환 헬퍼
- `CourtAuctionHttpClient` — direct HTTP 클라이언트. fetchImpl, timeoutMs, minDelayMs, jitterMs, maxCallsPerSession 모두 override 가능.
- `CourtAuctionPlaywrightClient` — `playwright-core` / `rebrowser-playwright` 가 있을 때만 사용. `postJson(endpointKey, body)` 시그니처는 동일.
- `isPlaywrightFallbackAvailable()` — fallback 모듈 설치 여부.
- 에러 헬퍼: `createBlockedError`, `createUpstreamError`, `createNetworkError`.

## Error model

- `error.code === "BLOCKED"` — `data.ipcheck === false`. **1시간 대기** 후 재시도. 자동 재시도 안 함.
- `error.code === "BUDGET_EXCEEDED"` — 세션당 호출 budget 초과. 새 클라이언트를 만들거나 `maxCallsPerSession` 을 명시적으로 늘릴 것.
- `error.code === "UPSTREAM_ERROR"` — 사이트가 generic error 를 돌려준 경우. `error.upstreamMessage` 확인.
- `error.code === "NETWORK_ERROR"` — 타임아웃/연결 실패. `error.cause` 에 원본 에러.
- `error.code === "PLAYWRIGHT_UNAVAILABLE"` — Playwright fallback 모듈이 없음.

## Throttling defaults

- 호출 간 최소 2000ms + jitter 0~1000ms
- 세션당 10 호출 budget
- 타임아웃 15s

```js
const { CourtAuctionHttpClient } = require("court-auction-notice-search");
const client = new CourtAuctionHttpClient({
  minDelayMs: 3000,           // 더 느리게
  jitterMs: 2000,
  maxCallsPerSession: 5,      // 더 보수적으로
  timeoutMs: 30_000
});
const notices = await searchSaleNotices({ date: "2026-04-27", client });
```

## Endpoints used

discovery 시 직접 캡처한 사이트 내부 endpoint:

| 목적 | 메소드 + 경로 | request body 핵심 키 |
| --- | --- | --- |
| 매각공고 목록 | `POST /pgj/pgj143/selectRletDspslPbanc.on` | `dma_srchDspslPbanc.{srchYmd, cortOfcCd, bidDvsCd, srchBtnYn:"Y"}` — `srchYmd`는 사이트 검색 버튼과 동일하게 `YYYYMM` 월 단위 |
| 매각공고 상세 | `POST /pgj/pgj143/selectRletDspslPbancDtl.on` | `dma_srchGnrlPbanc.{cortOfcCd, dspslDxdyYmd, jdbnCd, ...}` |
| 사건 단건 | `POST /pgj/pgj15A/selectAuctnCsSrchRslt.on` | `dma_srchCsDtlInf.{cortOfcCd, csNo}` |
| 법원사무소 | `POST /pgj/pgjComm/selectCortOfcCdLst.on` | `{}` |

## Verification

```bash
npm run lint
npm run test
```

## License

MIT. Read-only client. 사이트 운영 정책을 준수해 주세요.
