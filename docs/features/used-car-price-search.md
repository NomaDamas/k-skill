# 중고차 가격 조회 가이드

## 이 기능으로 할 수 있는 일

- 주요 한국 렌터카 업체를 먼저 비교한 뒤 v1 공급자를 선택하기
- `SK렌터카 다이렉트 타고BUY` inventory snapshot 에서 차종별 중고차 가격 조회
- `인수가`, `월 렌트료`, `연식`, `주행거리`, `연료`, `변속기` 정리
- 같은 구조의 조회를 **최소 10회 이상** 반복해도 안정적으로 응답하는지 검증

## 먼저 알아둘 점

### 현재 공급자 선정 결과

이 저장소와 현재 세션에는 중고차 가격 조회용 전용 **MCP** 나 **Skill** 이 없어서, 먼저 대표 렌터카 업체의 공개 표면을 비교했다.

| 업체 | 점검한 공개 표면 | API / 크롤링 판단 | 선택 여부 |
| --- | --- | --- | --- |
| SK렌터카 | `https://www.skdirect.co.kr/tb` | 별도 공개 API 문서는 못 찾았지만, 공개 HTML 안 `__NEXT_DATA__` 에 `carListProd` inventory snapshot 이 들어 있다. 로그인 없이 반복 조회가 가능해 가장 구현이 쉽다. | 선택 |
| 롯데렌탈(롯데오토옥션) | `https://www.lotteautoauction.net/hp/pub/cmm/viewMain.do` | 공개 진입점은 열리지만 legacy `.do` 화면 중심이고, 공개 일반 매물 목록 계약을 안정적으로 고정하기 어려웠다. | 보류 |
| 레드캡렌터카 | `https://biz.redcap.co.kr/rent/` | business portal 만 확인되었고 공개 중고차 inventory 검색/API 표면을 찾지 못했다. | 보류 |

즉, v1 은 **SK렌터카 다이렉트 타고BUY** 를 사용한다.

## 입력값

- 차종/모델 키워드
  - 예: `아반떼`
  - 예: `현대 아반떼`
  - 예: `K3`
  - 예: `캐스퍼`

차종 키워드가 없으면 먼저 물어본다.

## 공식 표면

- SK direct 타고BUY inventory page: `https://www.skdirect.co.kr/tb`

## 기본 흐름

1. 차종 키워드를 받는다.
2. `https://www.skdirect.co.kr/tb` HTML 을 가져온다.
3. HTML 안의 `__NEXT_DATA__` JSON 에서 `carListProd` 를 읽는다.
4. 차종 키워드와 `maker/model/grade` 조합으로 필터링한다.
5. `인수가`, `월 렌트료`, `연식`, `주행거리`, `연료`, `변속기`를 정리한다.
6. 같은 차종이라도 재고가 변할 수 있으므로 snapshot 시점 기준 결과라고 답한다.

## Node.js 예시

```js
const { lookupUsedCarPrices } = require("used-car-price-search")

async function main() {
  const result = await lookupUsedCarPrices("K3", { limit: 3 })

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

## 응답 예시 포맷

- 공급자: `SK렌터카 다이렉트 타고BUY`
- 검색어: `아반떼`
- 매칭 수: `N대`
- 인수가 범위: `1,290만원 ~ 1,590만원`
- 월 렌트료 범위: `39.2만원 ~ 44.1만원`
- 대표 매물: 연식 / 주행거리 / 연료 / 변속기 순으로 2~5대

## 구현 메모

- 별도의 공개 REST API 문서는 확인하지 못했다.
- 대신 공개 HTML 에 들어 있는 `__NEXT_DATA__` inventory snapshot 을 읽는 방식이라 anti-bot 우회나 로그인 세션 없이도 동작한다.
- v1 은 차종 검색과 가격 요약에 집중하고, 계약/상담/결제 자동화는 하지 않는다.

## 라이브 검증 메모

2026-04-02 기준 `https://www.skdirect.co.kr/tb` 는 실제 inventory snapshot 총 `333대`를 반환했고, `캐스퍼`, `K3`, `티볼리`, `아반떼`, `쏘나타`, `투싼`, `싼타페`, `QM6`, `그랜저`, `스포티지` 순으로 **10회** 차종 조회를 반복해도 구조화된 결과를 계속 얻을 수 있었다.

