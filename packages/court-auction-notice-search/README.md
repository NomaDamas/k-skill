# court-auction-notice-search

대한민국 법원경매정보(`courtauction.go.kr`) 의 **부동산 매각공고**·**사건 정보**를 에이전트가 활용할 수 있는 JSON 형태로 변환해서 돌려주는 read-only 클라이언트.

## What this is (and isn't)

- ✅ Workflow A — 매각공고 목록 + 매각공고 상세(사건/물건 펼치기)
- ✅ Workflow B — 사건번호로 직접 조회 (사건정보·물건내역·매각기일내역·배당요구종기)
- ✅ Workflow C — 자유 조건검색(지역·용도·가격대·면적·유찰횟수·매각기일)
- ✅ 코드테이블 — 법원사무소(60+개) + 입찰구분(기일/기간) + Workflow C용 용도/지역 대표 코드 매핑
- ✅ 3-tier transport — direct HTTP 1차, runtime browser fallback(BrowserOS → Aside Browser → Chrome CDP), 그리고 로컬 Playwright(`rebrowser-playwright`/`playwright-core`) launch fallback
- ✅ 안티봇 가드 — 호출 간 ≥2초 jitter, 세션당 호출 budget(기본 10회), `data.ipcheck === false` 즉시 throw
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
npm install rebrowser-playwright   # 로컬 브라우저 fallback (선택)
# 또는
npm install playwright-core
```

`k-skill-browser-runtime`는 본 패키지의 regular dependency 로 자동 설치되며, BrowserOS/Aside/Chrome runtime fallback 경로를 제공한다. Playwright 모듈(`rebrowser-playwright`/`playwright-core`)은 CDP 구동과 로컬 launch fallback 모두에 필요한 optional dependency 다.

## Quickstart

```js
const {
  searchSaleNotices,
  getSaleNoticeDetail,
  getCaseByCaseNumber,
  searchProperties,
  getCourtCodes,
  getBidTypes,
  getUsageCodes,
  getRegionCodes
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

const properties = await searchProperties({
  region: { sido: "서울특별시", sigungu: "11680" },
  usage: { large: "건물", medium: "21200", small: "21201" },
  priceRange: { min: 100000000, max: 500000000 },
  appraisedPriceRange: { min: 150000000, max: 800000000 },
  saleDate: { from: "2026-05-01", to: "2026-05-20" },
  flbdCount: { min: 1, max: 3 },
  area: { min: 30, max: 85.5 },
  bidType: "date",
  page: 1,
  pageSize: 20
});
console.log(properties.items[0]);
```

## CLI

```bash
court-auction-notice-search -h
court-auction-notice-search codes courts --pretty
court-auction-notice-search codes bid-types --pretty
court-auction-notice-search codes usages --pretty
court-auction-notice-search codes regions --pretty
court-auction-notice-search notices --date 2026-04 --court-code B000210 --bid-type date --pretty
court-auction-notice-search search --sido 서울특별시 --sigungu 11680 --usage-large 건물 --usage-medium 21200 \
  --price-min 100000000 --price-max 500000000 --sale-from 2026-05-01 --sale-to 2026-05-20 --pretty
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
- `searchProperties({ region?, usage?, priceRange?, appraisedPriceRange?, saleDate?, flbdCount?, area?, bidType?, courtCode?, page?, pageSize?, includeRaw?, client?, fallback?, fallbackOnBlocked? })`
  - `region`: `{ sido, sigungu, dong }` — sido는 코드(`"11"`) 또는 한국어명(`"서울특별시"`). 시군구/읍면동은 raw 코드(예: `"11680"`/`"11680101"`)로 전달. 입력하면 `cortStDvs:"2"` 지번주소 검색.
  - `usage`: `{ large, medium, small }` — 5자리 upstream 코드(`"20000"`=건물) 또는 대분류 한국어명(`"건물"`/`"토지"`/`"차량및운송장비"`/`"기타"`).
  - `priceRange`: 최저매각가격 원 단위 `{ min, max }` (실수 허용)
  - `appraisedPriceRange`: 감정평가액 원 단위 `{ min, max }` (실수 허용)
  - `saleDate`: `{ from, to }` (`YYYY-MM-DD`/`YYYYMMDD`)
  - `flbdCount`: 유찰횟수 `{ min, max }` **정수만**
  - `area`: 면적(㎡) `{ min, max }` (실수 허용)
  - `pageSize`: upstream PGJ151 드롭다운에서 확인된 `10`, `20`, `50`, `100` 중 하나(기본 10). `1` 등 임의 값은 live endpoint 가 HTTP 400을 반환하므로 로컬에서 거부한다.
  - `fallback`: `false` 면 browser auto-fallback 비활성. 기본 true. Workflow C raw-HTTP WAF의 HTTP 400 시, 또는 `BLOCKED`(`ipcheck=false`)에 명시적으로 `fallbackOnBlocked:true` 를 준 경우에만 browser fallback 이 동작한다. fallback 은 (1) runtime auto 세션(BrowserOS CDP → Aside Browser REPL → Chrome CDP) 을 우선 사용하고, (2) runtime provider 가 모두 닿지 않으면 로컬 `chromium.launch`(`rebrowser-playwright`/`playwright-core`) fallback 으로 이어진다. Playwright 모듈 미설치 시 자동 무시. `provider`/`cdpUrl` 옵션이나 `KSKILL_BROWSER_PROVIDER`/`KSKILL_BROWSEROS_CDP_URL`/`KSKILL_ASIDE_COMMAND` 환경변수로 runtime provider/URL 을 선택할 수 있다.
  - returns `{ requestedFilters, page, count, items[] }` — `items[i]` 가 `{ caseNumber, displayCaseNumber, itemNumber, address, appraisedPrice, minimumSalePrice, flbdCount, statusCode, progressStatusCode, courtCode, courtName, judgeDeptCode, judgeDeptName, documentId, saleDate, salePlace, bidTypeCode, usageCodes, regionCodes, coordinates, coordinatesWgs84, buildingList, areaList, landCategoryList, propertyDescription, areaRange, remarks, raw }`
- `getCourtCodes({ client? })` — 법원사무소 코드표 동적 로드
- `getBidTypes()` — 입찰구분 정적 코드표 (기일입찰=`000331`, 기간입찰=`000332`)
- `getUsageCodes()` — Workflow C용 정적 코드표. **upstream `selectLclLst.on` 캡처에서 가져온 4개 대분류(`10000=토지`, `20000=건물`, `30000=차량및운송장비`, `40000=기타`)** 와 대표 중/소분류 일부. 알 수 없는 값은 fail-open.
- `getRegionCodes()` — Workflow C용 정적 시도 코드표(19행). upstream `selectAdongSdLst.on` 캡처. 시군구/읍면동은 cascade XHR이 안정적으로 노출되지 않아 정적 표에 미포함; raw 코드(`"11680"` 등)를 그대로 전달.
- `resolveBidTypeCode(input)`, `describeBidTypeCode(code)` — 코드 변환 헬퍼
- `CourtAuctionHttpClient` — direct HTTP 클라이언트. fetchImpl, timeoutMs, minDelayMs, jitterMs, maxCallsPerSession 모두 override 가능.
- `CourtAuctionPlaywrightClient` — browser fallback 클라이언트. `postJson(endpointKey, body)` 시그니처는 direct HTTP 와 동일. 기본적으로 runtime auto 세션(BrowserOS → Aside Browser → Chrome CDP)을 우선 사용(`provider`/`cdpUrl`/`probe`/`connectLoader`/`preferRuntime` 옵션으로 제어)하고, runtime provider 가 닿지 않으면 로컬 `chromium.launch`(`headless` 옵션) fallback 으로 동작. `playwright-core`/`rebrowser-playwright` 필요.
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
| 물건 자유 조건검색 | `POST /pgj/pgjsearch/searchControllerMain.on` | canonical body shape: `dma_pageInfo.{pageNo:Number, pageSize:Number, bfPageNo, startRowNo, totalCnt, totalYn:"Y", groupTotalCount}` + `dma_srchGdsDtlSrchInfo.{rletDspslSpcCondCd, bidDvsCd, mvprpRletDvsCd:"00031R", cortAuctnSrchCondCd:"0004601", rprsAdong*Cd, rdnm*, mvprpDspslPlcAdong*Cd, rdDspslPlcAdong*Cd, cortOfcCd, jdbnCd, execrOfcDvsCd, lcl/mcl/sclDspslGdsLstUsgCd, cortAuctnMbrsId, aeeEvlAmt*, lwsDspslPrcRate*, flbdNcnt*, objctArDts*, mvprpArtclKndCd, mvprpArtclNm, mvprpAtchmPlcTypCd, notifyLoc:"off", lafjOrderBy, pgmId:"PGJ151F01", csNo, cortStDvs:"1"or"2", statNum:1, bidBgngYmd, bidEndYmd, dspslDxdyYmd, fst/scnd/thrd/foth DspslHm, dspslPlcNm, lwsDspslPrc*, grbxTypCd, gdsVendNm, fuelKndCd, carMd*, sideDvsCd}`. Captured 2026-05-08 from a real browser submission via `scripts/capture-pgj151-submit.cjs`; canonical fixture at `test/fixtures/canonical-search-body.json`. |
| 법원사무소 | `POST /pgj/pgjComm/selectCortOfcCdLst.on` | `{}` |

## Browser fallback tiers

Workflow C(`searchProperties`)는 direct HTTP 를 1차로 사용한다. browser fallback 은 다음 조건에서만 동작한다:

1. WAF-style HTTP 400(`UPSTREAM_ERROR` + `statusCode === 400`), 또는
2. `BLOCKED`(`ipcheck=false`) 응답에 **명시적으로** `fallbackOnBlocked:true` 를 준 경우.

fallback 이 동작할 때의 browser-runtime 우선순위:

1. **Runtime browser (preferred)** — `k-skill-browser-runtime` auto 순서로 사용자가 미리 띄운 BrowserOS GUI CDP 세션, Aside Browser REPL, Chrome/Chromium CDP 세션을 시도한다. `provider`(`"browseros"`/`"aside"`/`"chrome-cdp"`)·`cdpUrl` 옵션이나 `KSKILL_BROWSER_PROVIDER` 환경변수로 선택.
2. **Local Playwright launch fallback** — runtime provider 가 모두 닿지 않으면(`UNAVAILABLE`/probe 실패) 기존처럼 `chromium.launch({ headless })` 로 로컬 브라우저를 직접 띄운다. `rebrowser-playwright`/`playwright-core` 필요.

정리(safety):

- Runtime 으로 연결한 브라우저는 **사용자 소유**다. fallback 종료 시 adapter 가 만든 page/context/tab 만 정리하고 `runtime.disconnectBrowser` 로 automation client 만 끊는다. **절대 BrowserOS/Aside/Chrome profile 을 close 하지 않는다.**
- 로컬 launch fallback 은 이 패키지가 직접 띄운 브라우저이므로 page/context/browser 를 모두 close 한다.
- `PLAYWRIGHT_UNAVAILABLE`(모듈 미설치), `UNKNOWN_PROVIDER`(잘못된 provider)는 fail-closed 로 즉시 throw 한다. `UNAVAILABLE`/probe 실패는 자동으로 로컬 launch 로 이어진다.
- login/CAPTCHA/payment/전자서명/irreversible 액션을 자동으로 우회하지 않는다.

## Verification

```bash
npm run lint
npm run test
```

## License

MIT. Read-only client. 사이트 운영 정책을 준수해 주세요.
