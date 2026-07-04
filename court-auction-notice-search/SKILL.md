---
name: court-auction-notice-search
description: Browse 대법원경매정보(courtauction.go.kr) 부동산 매각공고 by 매각기일·법원·기일/기간 입찰, expand each notice into 사건번호·용도·주소·감정평가액·최저매각가, search property items by free conditions(지역·용도·가격·면적·유찰횟수), and look up a case directly by 법원+사건번호. Read-only, slow-by-design (~2s/call) to avoid IP blocks.
license: MIT
metadata:
  category: real-estate
  locale: ko-KR
  phase: v1
---

# Court Auction Notice Search

## What this skill does

대한민국 법원이 운영하는 공식 **법원경매정보** 사이트(`courtauction.go.kr`) 의 매각공고와 사건정보를 에이전트가 활용할 수 있는 JSON 형태로 변환해서 돌려준다.

- 공식 OPEN API가 없어 사이트 내부의 WebSquare JSON XHR endpoint를 그대로 호출한다.
- 1차 transport 는 직접 HTTP다. Workflow C 자유검색에서 raw-HTTP WAF성 HTTP 400이 날 때만 Playwright fallback 으로 전환하며, 명시적 차단(`BLOCKED`/`ipcheck=false`)은 기본적으로 중단한다 (`rebrowser-playwright` 또는 `playwright-core` 가 있을 때만).
- **기본 조회는 실제 브라우저 없이 동작한다.** 매각공고/사건/물건 조회의 정상 경로는 직접 HTTP다. 브라우저는 Workflow C 자유검색이 WAF성 HTTP 400을 낼 때만 fallback으로 쓰이고, 그때 권장 순서는 사용자가 띄운 BrowserOS/runtime CDP → (닿지 않으면) Chrome CDP → 로컬 Playwright launch다.
- 사이트는 **IP 단위 봇 차단** 이 매우 공격적이다 (16회/30초 정도면 1시간 차단). 이 패키지는 호출 간 최소 2초 jitter, 세션당 호출 budget(기본 10회), `data.ipcheck === false` 즉시 throw 로 보수적으로 동작한다.
- **참고용 도구**다. 실제 입찰 전에는 반드시 법원 원문 매각공고를 다시 확인해야 한다.

## When to use

- "오늘/내일 어디서 부동산 경매 열려?"
- "서울중앙지방법원 2026-04-27 매각공고 보여줘"
- "기일입찰 vs 기간입찰만 나눠서 보여줘"
- "이 매각공고 안의 사건번호/용도/주소/감정평가액 다 보여줘"
- "사건번호 2024타경100001 진행 상황 알려줘"
- "서울 강남구 아파트 최저가 5억 이하 유찰 1회 이상 물건 찾아줘"
- "법원사무소 코드 표 줘"

## When not to use

- 동산(자동차·중기) 경매 (이번 v1 범위 밖)
- 특정 매각기일 날짜의 모든 법원 일정을 한 번에 (Workflow D 별도 follow-up 이슈)
- 매각물건 사진(전경/개황/내부) URL 노출 (별도 follow-up 이슈)
- 매각물건명세서 / 현황조사서 / 감정평가서 PDF 다운로드 (별도 follow-up 이슈)
- 입찰서 자동 작성·자동 제출 (지원하지 않는다, 입찰은 반드시 법원에서 사람이 직접)

## Inputs

- `date` — 매각기일 월(YYYY-MM 또는 YYYYMM) 또는 특정일(YYYY-MM-DD 또는 YYYYMMDD). 필수. 실제 사이트 검색 버튼은 월(YYYYMM) 단위로 조회하므로 특정일 입력은 월 조회 후 해당 일자만 필터링한다.
- `courtCode` — 법원사무소코드 (예: `B000210` = 서울중앙지방법원). 비우면 전체. `getCourtCodes()` 또는 `codes courts` 로 받아온다.
- `bidType` — `date` (= 기일입찰, code 000331) 또는 `period` (= 기간입찰, code 000332). 빈값이면 둘 다.
- `caseNumber` — 사건번호. `2024타경100001` 형식 권장. `2024-100001` 도 받아서 `2024타경100001` 로 정규화한다.

## Mandatory honest framing

이 스킬은 사용자에게 다음 사실을 항상 알려야 한다.

1. 데이터는 법원경매정보 사이트의 공개 정보를 그대로 옮긴 것이며 **실제 입찰 전에 법원 원문을 재확인**해야 한다.
2. 사이트는 자동화 호출에 매우 민감해서 **빠른 연속 조회 시 IP가 1시간 차단**될 수 있다. 차단되면 같은 IP에서는 약 1시간을 기다려야 한다.
3. 가격(감정평가액·최저매각가격)·매각기일·매각장소는 **공고 시점 기준** 이며 정정·취하·연기로 변경될 수 있다 (`correctionCount`, `cancellationCount` 필드를 참고).
4. 본 스킬은 **read-only**다. 입찰 자체는 자동화하지 않는다.

## Official surfaces

- 법원경매정보 메인: `https://www.courtauction.go.kr`
- 부동산매각공고 진입: `https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ143M01.xml&pgjId=143M01`
- 경매사건검색 진입: `https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159M00.xml&pgjId=159M00`
- 직접 호출 endpoint (이 스킬이 사용하는 것):
  - `POST /pgj/pgj143/selectRletDspslPbanc.on` — 매각공고 목록
  - `POST /pgj/pgj143/selectRletDspslPbancDtl.on` — 매각공고 상세 (사건/물건 펼치기)
  - `POST /pgj/pgj15A/selectAuctnCsSrchRslt.on` — 사건 단건 조회
  - `POST /pgj/pgjsearch/searchControllerMain.on` — 물건 자유 조건검색 (PGJ151F00 → PGJ151M01)
  - `POST /pgj/pgjComm/selectCortOfcCdLst.on` — 법원사무소코드 전체

## Workflow A — 매각공고 → 사건/물건 펼치기

1. 사용자에게 **매각기일(YYYY-MM-DD)** 과 (선택) 법원·입찰구분을 받는다.
2. `searchSaleNotices({ date, courtCode, bidType })` 호출 → 그 날·그 법원의 매각공고 카드 목록.
3. 사용자가 카드를 고르면 카드 객체(또는 `raw`)를 그대로 `getSaleNoticeDetail(notice)` 에 넘긴다.
4. 응답의 `items[]` 가 `caseNumber`, `usage`, `address`, `appraisedPrice`, `minimumSalePrice`, `remarks` 를 가진다 (이슈 본문이 명시한 4필드 모두 포함).
5. 가격은 원 단위 정수다. 사용자에게 보여줄 때는 한국식 천단위 콤마 + 억/만 단위 환산을 같이 제시한다.

## Workflow B — 사건번호 직접 조회

1. 사용자에게 **법원사무소코드** + **사건번호(2024타경100001)** 를 받는다.
2. `getCaseByCaseNumber({ courtCode, caseNumber })` 호출.
3. `found:false / status:204` 면 사건이 존재하지 않거나 비공개. 사건번호 형식·법원이 맞는지 사용자에게 다시 확인한다.
4. `found:true` 면 `caseInfo`(사건명·접수일·청구액·재판부·진행상태), `items[]`(매각목적물 — 주소/배당요구종기), `schedule[]`(매각기일별 최저가/감정가/결과), `claimDeadline`, `relatedCases`, `stakeholders` 가 채워진다.

## Workflow C — 부동산 물건 자유 조건검색

1. 사용자의 조건을 `searchProperties()` 입력으로 매핑한다.
   - `region: { sido, sigungu, dong }` — 코드 또는 대표 정적 sido 코드테이블의 한국어명. 지역을 주면 지번주소 검색(`cortStDvs:"2"`)으로, 지역이 없으면 매각공고 모드(`cortStDvs:"1"`)로 조회한다. 시군구/읍면동은 정적 표가 없으므로 코드로 직접 전달(예: `{ sido:"11", sigungu:"11680", dong:"11680101" }`)한다.
   - `usage: { large, medium, small }` — 용도 대/중/소분류 코드(5자리, 예: 건물=`20000`) 또는 대분류 한국어명(`토지`/`건물`/`차량및운송장비`/`기타`).
   - `priceRange` — 최저매각가격 원 단위 `{ min, max }` (실수 허용)
   - `appraisedPriceRange` — 감정평가액 원 단위 `{ min, max }` (실수 허용)
   - `saleDate` — `{ from, to }`
   - `flbdCount` — 유찰횟수 `{ min, max }` **정수만**
   - `area` — 면적(㎡) `{ min, max }` (실수 허용)
   - `pageSize` — 페이지당 결과 수, upstream PGJ151 드롭다운에서 확인된 `10`/`20`/`50`/`100` 중 하나(기본 10). `1` 등 임의 값은 live endpoint 가 HTTP 400을 반환하므로 로컬에서 거부한다.
2. `searchProperties({ ... })` 호출 → `POST /pgj/pgjsearch/searchControllerMain.on`.
   - 1차로 direct HTTP 시도. Workflow C raw-HTTP WAF의 HTTP 400을 만나면 자동으로 Playwright fallback 으로 재시도한다. fallback 을 끄려면 `{ fallback: false }`. `BLOCKED`(`ipcheck=false`)는 사이트의 명시적 차단 신호이므로 기본적으로 즉시 중단하며, 사용자가 위험을 이해하고 명시적으로 `{ fallbackOnBlocked: true }` 를 준 경우에만 재시도한다.
3. 응답의 `items[]` 는 핵심 raw 컬럼을 영문 키로 정규화한다:
   - `saNo` → `caseNumber`, `srnSaNo`/`printCsNo` → `displayCaseNumber`
   - `mokmulSer`/`maemulSer` → `itemNumber`
   - `hjguSido + hjguSigu + hjguDong + daepyoLotno + buldNm` → `address`
   - `gamevalAmt` → `appraisedPrice`, `minmaePrice` → `minimumSalePrice`
   - `yuchalCnt` → `flbdCount`, `mulStatcd` → `statusCode`, `jinstatCd` → `progressStatusCode`
   - `boCd` → `courtCode`, `jiwonNm` → `courtName`, `jpDeptNm` → `judgeDeptName`
   - `lclsUtilCd/mclsUtilCd/sclsUtilCd` → `usageCodes.{large,medium,small}`
   - `srchHjguSidoCd/SiguCd/DongCd` → `regionCodes.{sido,sigungu,dong}`
   - `xCordi/yCordi` → `coordinates`, `wgs84Xcordi/Ycordi` → `coordinatesWgs84`
   - `buldList/areaList/jimokList` → `buildingList/areaList/landCategoryList`
   - `pjbBuldList` → `propertyDescription`, `mulBigo` → `remarks`
4. `getUsageCodes()` 는 4개 대분류(`10000=토지`, `20000=건물`, `30000=차량및운송장비`, `40000=기타`)와 일부 대표 중/소분류를 정적으로 반환한다. `getRegionCodes()` 는 19개 시도 + 코드만 반환한다. 시군구/읍면동은 upstream cascade XHR이 안정적이지 않아 정적 표에 포함하지 않으며 raw 코드를 그대로 전달하면 된다. 알 수 없는 값은 fail-open으로 통과한다.
5. **Same-name usage codes 보호**: `resolveUsageCode("아파트", "large")` 처럼 입력 이름이 다른 level 에만 존재하면, 같은 이름의 medium/small 코드를 잘못 리턴하지 않고 fail-open(원문 통과)한다.

## Throttling and call-budget rules

- 호출 간 최소 2초 (기본). 더 늘리려면 `--min-delay-ms 3000`.
- 기본 세션 budget 은 **10회**. 더 많은 조회가 필요하면 새 세션을 열거나 (`new CourtAuctionHttpClient`) `maxCallsPerSession` 을 명시적으로 늘린다.
- 차단(`data.ipcheck === false`)을 만나면 `BLOCKED` 에러를 즉시 throw 하고 멈춘다. 자동 retry 하지 않는다 (차단 연장 위험).
- 차단된 IP는 **약 1시간** 후 자연 복구된다. 그 사이에는 다른 IP/네트워크에서 작업하거나 사람이 브라우저로 사이트에 접속해서 차단 해제 화면을 거친다.
- **Workflow C 자유검색은 사이트 WAF 가 raw HTTP 호출을 더 엄격하게 차단**한다. `searchProperties()` 는 1차 direct HTTP에서 WAF성 HTTP 400을 만났을 때만 Playwright fallback 으로 재시도한다. 명시적 차단(`BLOCKED`/`ipcheck=false`)은 기본적으로 즉시 중단하며, 사용자가 위험을 이해하고 `fallbackOnBlocked:true` 를 준 경우에만 재시도한다. Playwright fallback 모듈(`rebrowser-playwright` 또는 `playwright-core`)이 없으면 첫 HTTP 400 실패가 그대로 throw 된다.
- searchProperties 는 같은 Playwright 클라이언트로 연속 호출하면 **10~15회 간격 호출에서 안정**하다. 그 이상 burst 호출이 필요하면 호출 사이 3~5초 sleep 을 두고 새 클라이언트를 열어라.

## Node.js example

```js
const {
  searchSaleNotices,
  getSaleNoticeDetail,
  getCaseByCaseNumber,
  getCourtCodes
} = require("court-auction-notice-search");

async function main() {
  const courts = await getCourtCodes();
  console.log(`법원사무소 ${courts.count}개 로드됨`);

  const notices = await searchSaleNotices({
    date: "2026-04-27",
    courtCode: "B000210",
    bidType: "date"
  });
  console.log(`서울중앙지방법원 매각공고 ${notices.count}건`);

  if (notices.items.length > 0) {
    const detail = await getSaleNoticeDetail(notices.items[0]);
    for (const item of detail.items) {
      console.log(
        `${item.caseNumber} (${item.usage}) — 감정 ${item.appraisedPrice}원 / 최저 ${item.minimumSalePrice}원`
      );
      console.log(`  주소: ${item.address}`);
    }
  }

  const caseInfo = await getCaseByCaseNumber({
    courtCode: "B000210",
    caseNumber: "2024타경100001"
  });
  if (caseInfo.found) {
    console.log(`사건명: ${caseInfo.caseInfo.caseName}`);
    console.log(`매각기일 횟수: ${caseInfo.schedule.length}`);
  }
}

main().catch((error) => {
  if (error.code === "BLOCKED") {
    console.error("[BLOCKED] 사이트가 1시간 차단했습니다. 다른 IP에서 다시 시도하거나 1시간 뒤 재시도하세요.");
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
```

## CLI example

```bash
# 1. 법원사무소 코드표
court-auction-notice-search codes courts --pretty | head -40

# 2. 입찰구분 (정적 코드)
court-auction-notice-search codes bid-types --pretty
court-auction-notice-search codes usages --pretty
court-auction-notice-search codes regions --pretty

# 3. 매각공고 목록
court-auction-notice-search notices --date 2026-04 --court-code B000210 --bid-type date --pretty

# 4. 매각공고 상세 — list 응답의 row 의 raw 필드를 그대로 detail 호출에 사용한다.
#    (CLI 단발 호출에서는 list -> detail 으로 결과를 파이프할 수 있도록 jq 등을 함께 사용)

# 5. 사건번호 직접 조회
court-auction-notice-search case --court-code B000210 --case-number "2024타경100001" --pretty

# 6. 자유 조건검색
court-auction-notice-search search --sido 서울특별시 --sigungu 11680 --usage-large 건물 --usage-medium 21200 \
  --price-min 100000000 --price-max 500000000 --sale-from 2026-05-01 --sale-to 2026-05-20 --pretty
```

## Block / Error handling

- `error.code === "BLOCKED"` — `data.ipcheck === false`. 1시간 대기 후 다른 IP에서 재시도. 사용자에게 차단 사실과 대기 안내를 그대로 전달한다.
- `error.code === "BUDGET_EXCEEDED"` — 세션 budget 초과. 의도적인 안전장치다. 정말 필요하면 `--max-calls 20` 같이 늘리지만 차단 위험을 함께 안내한다.
- `error.code === "UPSTREAM_ERROR"` — 사이트가 일반적인 에러를 돌려준 경우. 세션 만료 또는 잘못된 jdbnCd 가 가장 흔한 원인. warmup 부터 다시.
- `error.code === "NETWORK_ERROR"` — 타임아웃/연결 실패.
- `error.code === "PLAYWRIGHT_UNAVAILABLE"` — Playwright fallback 을 명시적으로 쓰려는데 모듈이 깔려있지 않음. `npm i rebrowser-playwright` 또는 `npm i playwright-core` 로 해결.

## Done when

- 사용자에게 IP 차단 위험과 "참고용·실제 입찰 전 법원 원문 재확인" 고지를 했다.
- 매각공고를 펼쳐서 `caseNumber/usage/address/appraisedPrice/minimumSalePrice` 가 채워진 JSON을 돌려줬다.
- 사건번호로 직접 조회한 경우, `found:false` 일 때 사용자가 후속 조치를 알 수 있도록 안내했다.
- 차단 발생 시 자동 재시도하지 않고 즉시 멈췄다.
- 작업 후 호출 budget 이 남아있는지 사용자에게 알려서 추가 호출 여지를 명시했다.
