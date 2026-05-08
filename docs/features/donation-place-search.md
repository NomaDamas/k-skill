# 기부처 조회 가이드

`donation-place-search`는 사용자가 제공한 지역과 관심 분야를 기준으로 한국 기부처 후보를 추천하는 조회형 스킬이다.

- 자동 후원 신청, 결제, 개인정보 입력은 하지 않는다.
- 1365 기부포털 공식 진입점(`https://www.1365.go.kr/dntn/main.do`)과 각 단체 공식 홈페이지에서 최신 등록 상태, 모금 기간, 기부금영수증 가능 여부를 확인하도록 안내한다.
- 공개 페이지와 로컬 후보 랭킹만 사용하므로 `k-skill-proxy`나 API key가 필요 없다.

## 사용 예

```js
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
```

## 입력

- `location`: `서울 마포구`, `부산 해운대구`, `제주`, `온라인` 같은 위치 힌트
- `category`: `아동`, `동물보호`, `환경`, `재난`, `장애`, `노인`, `의료`, `생계`, `해외구호`
- `limit`: 기본 5, 최대 20

## 검증 표면

`nanumkorea.go.kr`는 1365 자원봉사/기부 통합 안내를 반환하므로, 스킬은 `www.1365.go.kr/dntn/main.do`를 최신 공식 확인 진입점의 기준으로 사용한다. 1365 페이지가 headless HTTP에서 느리거나 빈 응답을 줄 수 있어 화면 스크래핑 대신 best-effort 확인 보조 링크와 후보 공식 홈페이지를 함께 제시하며, 후보별 등록 검증이 이미 완료됐다고 표현하지 않는다.
