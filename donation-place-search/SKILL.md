---
name: donation-place-search
description: Use when the user asks where to donate, 기부처 조회, or donation place recommendations by Korean location and category. Recommend recipients with best-effort 1365 verification-assist links and never execute donations.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# 기부처 조회 / Donation Place Search

## What this skill does

사용자가 “어디에 기부하면 좋을지”, “서울 아동 기부처”, “동물보호 기부처 추천”처럼 묻는 경우 **장소와 카테고리 기준으로 기부처 후보를 추천**한다.

- 기부를 대신 실행하지 않는다.
- 결제, 개인정보 입력, 자동 후원 신청은 하지 않는다.
- 추천은 의사결정 보조이며, 최종 기부 전 공식 페이지와 1365 기부포털에서 최신 등록·모금기간·기부금영수증 가능 여부를 확인한다.
- 위치는 사용자가 제공한 행정구역/동네/랜드마크 텍스트만 사용한다. 자동 위치 추적을 하지 않는다.

## When to use

- “기부처 조회해줘”
- “서울 마포구에서 동물보호 기부할 만한 곳 추천해줘”
- “부산 노인 복지 기부처 알려줘”
- “아동/재난 분야 기부처 비교해줘”
- “어디에 기부하는 곳이 좋을지 장소와 카테고리별로 추천해줘”

## Inputs

- `location`: 선택. 예: `서울 마포구`, `부산 해운대구`, `제주`, `온라인`
- `category`: 선택. 예: `아동`, `동물보호`, `환경`, `재난 구호`, `장애`, `노인`, `생계`, `의료`, `해외구호`
- `limit`: 선택. 기본 5개

위치나 카테고리가 없으면 보수적으로 `전국`·`일반/종합` 후보와 1365 공식 확인 보조 링크를 제공한다. 비대화형 자동화에서는 임의로 좁히지 말고 “입력 없음”을 명시한다.

## Public access path discovered

### Primary official verification surface

- Legacy `https://www.nanumkorea.go.kr/` currently returns a notice that 1365 기부포털 has moved/integrated into 1365 자원봉사.
- The notice links to `https://www.1365.go.kr/dntn/main.do`.
- The skill therefore uses `https://www.1365.go.kr/dntn/main.do` as the official public verification entry point.

### Search-link strategy

1365 pages can be slow or unavailable to headless HTTP clients, so the package does not depend on brittle screen scraping. It builds a best-effort official-entry/search-assist link with the user’s location/category keywords, then ranks a curated fallback list locally. The package does not assert that 1365 has already verified each returned candidate:

```js
const { recommendDonationPlaces } = require("donation-place-search");

const result = recommendDonationPlaces({
  location: "서울 마포구",
  category: "동물",
  limit: 3
});

console.log(result.items);
console.log(result.officialSearchUrl);
```

The returned `officialSearchUrl` is a best-effort verification assist: open it as an official 1365 entry point, then confirm current registration and campaign status before giving the final answer.

## Workflow

1. Extract `location`, `category`, and optional `limit` from the user request.
2. Run the helper:

```bash
node - <<'NODE'
const {
  recommendDonationPlaces,
  formatDonationRecommendationReport
} = require("donation-place-search");

const result = recommendDonationPlaces({
  location: "서울 마포구",
  category: "동물",
  limit: 3
});

console.log(formatDonationRecommendationReport(result));
NODE
```

3. Open or cite the returned best-effort 1365 verification-assist URL for latest verification when fresh browsing is available.
4. Summarize 3–5 candidates, including:
   - 기부처명
   - 분야/카테고리
   - 지역 일치 여부 또는 전국 단위 여부
   - 왜 맞는지 한 줄
   - 공식 홈페이지
   - 1365 확인 보조 링크
5. Add a caution that campaign status, donation receipt eligibility, and designated-use options must be checked on official pages before donating.

## Output fields

The npm helper returns:

```json
{
  "location": { "raw": "서울 마포구", "province": "서울", "district": "마포구" },
  "category": "animals",
  "items": [
    {
      "name": "동물권행동 카라",
      "categories": ["animals"],
      "coverage": "local",
      "homepageUrl": "https://www.ekara.org/",
      "officialSearchUrl": "https://www.1365.go.kr/dntn/main.do?...",
      "match": { "category": true, "local": true, "nationwide": false }
    }
  ],
  "officialSearchUrl": "https://www.1365.go.kr/dntn/main.do?...",
  "meta": { "source": "curated-fallback-plus-1365-search-assist" }
}
```

## Done when

- 장소/카테고리 조건을 반영해 후보를 3–5개 이내로 정리했다.
- 각 후보마다 공식 홈페이지 또는 1365 확인 보조 링크를 제공했다.
- 최종 기부 전 등록 상태, 모금 기간, 기부금영수증 가능 여부를 확인하라고 안내했다.
- 자동 결제/후원 신청을 시도하지 않았다.

## Failure modes

- 1365 사이트가 느리거나 headless HTTP에서 timeout/empty page를 반환할 수 있다. 이 경우 확인 보조 URL과 후보 홈페이지를 제공하고 “최신 상태는 직접 확인 필요”라고 명시한다.
- 위치 문자열이 행정구역으로 파싱되지 않으면 전국 후보 위주로 제안한다.
- 지역·카테고리 모두 정확히 맞는 후보가 없으면 전국 단위 후보를 fallback으로 보여준다.
- 특정 단체의 모금 캠페인, 지정기부 가능 여부, 기부금영수증 처리는 수시로 바뀌므로 package 내 curated 설명만으로 확정하지 않는다.
- 로그인, 결제, CAPTCHA, 후원 신청서 제출은 자동화하지 않는다.

## Notes

- 이 스킬은 read-only 추천/조회 스킬이다.
- 기부는 금전 의사결정이므로 최신 공식 근거를 우선한다.
- 공개 표면만 사용하므로 `k-skill-proxy`와 API key가 필요 없다.
