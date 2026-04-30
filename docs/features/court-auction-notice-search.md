# 법원 경매 부동산 매각공고 조회

대한민국 법원이 운영하는 공식 **법원경매정보** 사이트(`courtauction.go.kr`) 의 매각공고와 사건정보를 에이전트가 활용할 수 있는 JSON 형태로 변환해서 돌려준다.

> **참고용입니다.** 실제 입찰 전에는 반드시 해당 법원의 원문 매각공고와 매각물건명세서를 직접 확인하세요. 본 스킬은 read-only이며, 입찰서 자동 작성·자동 제출은 지원하지 않습니다.

## 무엇을 할 수 있나

- ✅ Workflow A — **매각공고 브라우징**: 매각기일·법원·기일/기간 입찰을 조건으로 매각공고 목록 → 그 공고 안의 사건번호·용도·주소·감정평가액·최저매각가격 펼치기
- ✅ Workflow B — **사건번호 직접 조회**: 법원사무소코드 + 사건번호(`2024타경100001`) → 사건정보·물건내역·매각기일별 이력·배당요구종기
- ✅ 법원사무소 코드(60+개) + 입찰구분 코드(기일입찰=`000331`, 기간입찰=`000332`) 변환
- ✅ 2-tier transport — direct HTTP 1차, Playwright fallback 옵션
- ✅ 안티봇 가드 — 호출 간 ≥2초 jitter, 세션당 호출 budget, `data.ipcheck === false` 즉시 `BLOCKED` throw

## 무엇을 할 수 없나 (별도 follow-up 이슈)

- ❌ Workflow C 자유 조건검색 (지역·용도·가격대·면적·유찰횟수)
- ❌ Workflow D 일별/월별 캘린더
- ❌ 매각물건 사진(전경/개황/내부) URL 노출
- ❌ 매각물건명세서·현황조사서·감정평가서 PDF 다운로드
- ❌ 동산(자동차·중기) 경매

## 차단(BLOCKED) 정책

`courtauction.go.kr` 은 자동화 호출에 매우 민감해서 빠른 연속 조회 시 IP가 약 1시간 차단됩니다. 본 스킬은 다음과 같이 보수적으로 동작합니다.

- 호출 간 최소 2초 + jitter 0~1초 대기 (override: `--min-delay-ms 3000`)
- 세션당 호출 budget 10회 (override: `--max-calls 5`)
- `data.ipcheck === false` 또는 응답 메시지에 "차단" 포함 시 → `BLOCKED` 에러를 즉시 throw, **자동 재시도 금지** (차단 연장 위험)

차단되면 같은 IP에서 약 1시간을 기다려야 합니다. 그 사이에는 다른 IP 또는 사람이 직접 사이트에 접속해서 차단 해제 화면을 거칩니다.

## CLI 사용

```bash
court-auction-notice-search -h
court-auction-notice-search codes courts --pretty | head -40
court-auction-notice-search codes bid-types --pretty
court-auction-notice-search notices --date 2026-04-27 --court-code B000210 --bid-type date --pretty
court-auction-notice-search case --court-code B000210 --case-number "2024타경100001" --pretty
```

## Node.js 사용

```js
const {
  searchSaleNotices,
  getSaleNoticeDetail,
  getCaseByCaseNumber
} = require("court-auction-notice-search");

const notices = await searchSaleNotices({
  date: "2026-04-27",
  courtCode: "B000210",
  bidType: "date"
});

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
```

## 사이트 내부 endpoint (직접 캡처한 것)

| 목적 | 메소드 + 경로 | request body |
| --- | --- | --- |
| 매각공고 목록 | `POST /pgj/pgj143/selectRletDspslPbanc.on` | `{"dma_srchDspslPbanc":{"srchYmd","cortOfcCd","bidDvsCd","srchBtnYn":"Y"}}` |
| 매각공고 상세 | `POST /pgj/pgj143/selectRletDspslPbancDtl.on` | `{"dma_srchGnrlPbanc":{"cortOfcCd","dspslDxdyYmd","jdbnCd",...}}` |
| 사건 단건 | `POST /pgj/pgj15A/selectAuctnCsSrchRslt.on` | `{"dma_srchCsDtlInf":{"cortOfcCd","csNo"}}` |
| 법원사무소 코드 | `POST /pgj/pgjComm/selectCortOfcCdLst.on` | `{}` |

세션 cookie(`JSESSIONID`, `WMONID`)는 `GET /pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ143M01.xml&pgjId=143M01` 으로 사전에 한 번 받아둡니다.

## 설치

```bash
npm install court-auction-notice-search
# Playwright fallback 을 쓰려면 (선택)
npm install rebrowser-playwright   # 권장
# 또는
npm install playwright-core
```

## 관련 이슈

- 이 패키지는 [Issue #167](https://github.com/NomaDamas/k-skill/issues/167) 에서 출발했고, A/B 워크플로 + 코드테이블 MVP만 포함합니다.
- 자유 조건검색·캘린더·물건 사진·PDF·동산 경매는 별도 follow-up 이슈로 분리되어 추적됩니다.
