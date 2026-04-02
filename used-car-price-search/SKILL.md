---
name: used-car-price-search
description: 주요 한국 렌터카 업체를 비교한 뒤 SK렌터카 다이렉트 타고BUY inventory snapshot 으로 중고차 가격/인수가를 조회한다.
license: MIT
metadata:
  category: automotive
  locale: ko-KR
  phase: v1
---

# Used Car Price Search

## What this skill does

한국의 대표 렌터카 업체를 먼저 비교하고, 현재는 **가장 기술적으로 구현이 쉬운 공급자**로 확인된 `SK렌터카 다이렉트 타고BUY`를 사용해 중고차 가격을 조회한다.

- 한국의 주요 렌터카 업체로 `SK렌터카`, `롯데렌탈(롯데오토옥션)`, `레드캡렌터카`를 먼저 확인한다.
- 각 업체의 공개 표면에서 **직접 API 제공 여부**, 웹 크롤링 난이도, 기존 **MCP / Skill** 존재 여부를 먼저 점검한다.
- 이 저장소와 현재 세션에는 중고차 가격 조회용 전용 **MCP** 나 **Skill** 이 없으므로 새 스킬이 직접 조회를 담당한다.
- 최종 선택 공급자는 `https://www.skdirect.co.kr/tb` 이다.
- 이 페이지는 로그인 없이 열리고, HTML 안의 `__NEXT_DATA__` 에 현재 inventory snapshot 이 들어 있어 반복 조회가 쉽다.
- 결과는 **월 렌트료**와 **인수가**를 함께 보여 준다.

## Provider survey

| 업체 | 점검 결과 | v1 채택 여부 |
| --- | --- | --- |
| SK렌터카 다이렉트 `타고BUY` | `https://www.skdirect.co.kr/tb` 공개 HTML 에 `__NEXT_DATA__` inventory snapshot 포함. 로그인/세션 없이 반복 조회 가능. 별도 공개 API 문서는 못 찾았지만 SSR 데이터 추출이 가장 단순함. | 채택 |
| 롯데렌탈 / 롯데오토옥션 | `https://www.lotteautoauction.net/hp/pub/cmm/viewMain.do` 공개 진입점은 열리지만, 일반 매물 검색은 legacy `.do` 흐름 중심이고 공개 목록 계약이 불명확했다. 추정 목록 URL은 404/에러 페이지가 섞여 v1 공급자로는 불안정했다. | 미채택 |
| 레드캡렌터카 | 공식 진입점이 `https://biz.redcap.co.kr/rent/` business portal 로 이어졌고, 공개 중고차 inventory 검색 표면이나 직접 API를 확인하지 못했다. | 미채택 |

## When to use

- "아반떼 중고차 가격 봐줘"
- "SK렌터카 타고BUY에 K3 얼마야?"
- "캐스퍼 인수가/월 렌트료 같이 알려줘"
- "중고차 시세를 렌터카 업체 기준으로 보고 싶어"

## When not to use

- 실제 구매/계약/상담 신청까지 자동화해야 하는 경우
- 특정 VIN/성능기록부/사고이력 원문까지 강제해야 하는 경우
- 여러 업체 통합 최저가 비교가 필요한 경우

## Prerequisites

- 인터넷 연결
- `node` 18+
- `used-car-price-search` package 또는 동일 로직

## Required inputs

### 1. Ask the car model/keyword first if it is missing

차종 키워드가 없으면 먼저 물어본다.

- 권장 질문: `어떤 차종을 찾을까요? 예: 아반떼, K3, 캐스퍼`
- 너무 넓으면: `제조사나 차종을 조금 더 구체적으로 알려주세요. 예: 현대 아반떼, 기아 K3`

## Official surface used in v1

- SK direct used-car inventory page: `https://www.skdirect.co.kr/tb`

## Workflow

1. 차종 키워드가 없으면 먼저 질문한다.
2. `SK렌터카`, `롯데렌탈`, `레드캡렌터카` 비교 결과를 짧게 기억하고, 현재 공급자는 `SK렌터카 다이렉트 타고BUY` 임을 유지한다.
3. `https://www.skdirect.co.kr/tb` HTML 을 가져온다.
4. HTML 의 `__NEXT_DATA__` JSON 에서 `carListProd` inventory snapshot 을 읽는다.
5. 차종 키워드로 inventory 를 필터링한다.
6. 상위 결과에서 `인수가`, `월 렌트료`, `연식`, `주행거리`, `연료`, `변속기`를 정리한다.
7. 같은 차종이라도 재고가 수시로 바뀔 수 있으므로 snapshot 기준 응답임을 짧게 알린다.

## Node.js example

```js
const { lookupUsedCarPrices } = require("used-car-price-search")

async function main() {
  const result = await lookupUsedCarPrices("아반떼", { limit: 5 })

  console.log({
    provider: result.provider,
    matchedCount: result.matchedCount,
    summary: result.summary,
    items: result.items
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

## Respond conservatively

응답은 아래 순서로 짧게 정리한다.

- 공급자: `SK렌터카 다이렉트 타고BUY`
- 차종 키워드
- 매칭된 차량 수
- 인수가 범위
- 월 렌트료 범위
- 대표 차량 2~5개
- `공개 inventory snapshot 기준이라 실시간 재고/가격은 바뀔 수 있다`는 안내

## Done when

- 주요 렌터카 업체 비교와 공급자 선택 이유를 설명했다.
- 차종 키워드 기준으로 결과를 최소 1건 이상 또는 보수적 빈 결과로 반환했다.
- 결과에 `인수가` 와 `월 렌트료` 를 함께 담았다.
- 라이브 검증에서 **최소 10회 이상** 반복 조회가 가능함을 확인했다.

## Failure modes

- 공개 inventory snapshot 은 페이지 갱신 타이밍에 따라 달라질 수 있다.
- 별도 공개 API 문서는 찾지 못했으므로 v1 은 HTML 내 `__NEXT_DATA__` 의 안정성에 의존한다.
- 특정 차종 키워드가 너무 넓으면 유사 모델이 함께 섞일 수 있다.
