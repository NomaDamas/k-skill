---
name: court-auction-notice-search
description: Browse 대법원경매정보(courtauction.go.kr) 부동산 매각공고 by 매각기일·법원·기일/기간 입찰, expand each notice into 사건번호·용도·주소·감정평가액·최저매각가, and look up a case directly by 법원+사건번호. Read-only, slow-by-design (~2s/call) to avoid IP blocks. Use when the user asks "오늘 어디서 부동산 경매가 열려?" "이 사건번호 정보 알려줘" or wants 매각공고 데이터를 에이전트가 다룰 수 있는 JSON으로.
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
- 1차 transport 는 직접 HTTP, 차단되거나 5xx 가 떨어질 때만 Playwright fallback 으로 전환한다 (`rebrowser-playwright` 또는 `playwright-core` 가 있을 때만).
- 사이트는 **IP 단위 봇 차단** 이 매우 공격적이다 (16회/30초 정도면 1시간 차단). 이 패키지는 호출 간 최소 2초 jitter, 세션당 호출 budget(기본 10회), `data.ipcheck === false` 즉시 throw 로 보수적으로 동작한다.
- **참고용 도구**다. 실제 입찰 전에는 반드시 법원 원문 매각공고를 다시 확인해야 한다.

## When to use

- "오늘/내일 어디서 부동산 경매 열려?"
- "서울중앙지방법원 2026-04-27 매각공고 보여줘"
- "기일입찰 vs 기간입찰만 나눠서 보여줘"
- "이 매각공고 안의 사건번호/용도/주소/감정평가액 다 보여줘"
- "사건번호 2024타경100001 진행 상황 알려줘"
- "법원사무소 코드 표 줘"

## When not to use

- 동산(자동차·중기) 경매 (이번 v1 범위 밖)
- 자유 조건검색(지역·용도·가격대·면적·유찰횟수) — Workflow C 별도 follow-up 이슈에서 다룬다
- 특정 매각기일 날짜의 모든 법원 일정을 한 번에 (Workflow D 별도 follow-up 이슈)
- 매각물건 사진(전경/개황/내부) URL 노출 (별도 follow-up 이슈)
- 매각물건명세서 / 현황조사서 / 감정평가서 PDF 다운로드 (별도 follow-up 이슈)
- 입찰서 자동 작성·자동 제출 (지원하지 않는다, 입찰은 반드시 법원에서 사람이 직접)

## Inputs

- `date` — 매각기일 (YYYY-MM-DD 또는 YYYYMMDD). 필수.
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

## Throttling and call-budget rules

- 호출 간 최소 2초 (기본). 더 늘리려면 `--min-delay-ms 3000`.
- 기본 세션 budget 은 **10회**. 더 많은 조회가 필요하면 새 세션을 열거나 (`new CourtAuctionHttpClient`) `maxCallsPerSession` 을 명시적으로 늘린다.
- 차단(`data.ipcheck === false`)을 만나면 `BLOCKED` 에러를 즉시 throw 하고 멈춘다. 자동 retry 하지 않는다 (차단 연장 위험).
- 차단된 IP는 **약 1시간** 후 자연 복구된다. 그 사이에는 다른 IP/네트워크에서 작업하거나 사람이 브라우저로 사이트에 접속해서 차단 해제 화면을 거친다.

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

# 3. 매각공고 목록
court-auction-notice-search notices --date 2026-04-27 --court-code B000210 --bid-type date --pretty

# 4. 매각공고 상세 — list 응답의 row 의 raw 필드를 그대로 detail 호출에 사용한다.
#    (CLI 단발 호출에서는 list -> detail 으로 결과를 파이프할 수 있도록 jq 등을 함께 사용)

# 5. 사건번호 직접 조회
court-auction-notice-search case --court-code B000210 --case-number "2024타경100001" --pretty
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
