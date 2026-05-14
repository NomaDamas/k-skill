---
name: gangnamunni-clinic-search
description: 강남언니 공개 검색 페이지에서 성형외과·피부과 병원 후보, 평점, 리뷰 수, 지원 언어, 공개 병원 링크를 조회한다.
license: MIT
metadata:
  category: beauty
  locale: ko-KR
  phase: v1
---

# Gangnam Unni Clinic Search

## What this skill does

강남언니(Gangnam Unni) 웹 검색 페이지의 **비로그인 공개 Next.js payload**를 읽어 병원 후보를 조회한다.

- 키워드로 병원 후보를 검색한다.
- 공개 검색 결과에 포함된 평점, 평점 수, 리뷰 수, 지원 언어, 공개 이미지, 병원 링크를 정리한다.
- 예약, 상담, 결제, 리뷰 작성, 앱 로그인 등 사용자 계정이 필요한 액션은 하지 않는다.

## When to use

- "강남언니에서 강남 성형외과 찾아줘"
- "강남언니 병원 평점이랑 리뷰 수 봐줘"
- "코성형 병원 후보를 강남언니 기준으로 몇 개만 보여줘"
- "성형외과/피부과 병원 공개 링크를 찾아줘"

## When not to use

- 상담 신청, 예약, 결제, 병원 채팅, 찜 같은 계정 기반 액션이 필요한 경우
- 로그인 사용자에게만 보이는 이벤트, 가격, 개인화 추천을 확정해야 하는 경우
- 의료적 판단, 시술 적합성, 안전성 보증을 대신해야 하는 경우

## Prerequisites

- 인터넷 연결
- Node.js 18+
- 이 저장소의 `gangnamunni-clinic-search` package 또는 동일 로직

## Required inputs

### 1. Ask for a search keyword if it is missing

검색어가 없으면 먼저 확인한다.

- 권장 질문: `강남언니에서 찾을 병원/시술/지역 키워드를 알려주세요. 예: 강남 성형외과, 코성형, 피부과`
- 너무 넓으면: `검색어가 넓어요. 지역이나 시술명을 같이 주시면 후보를 더 좁힐 수 있어요.`

### 2. Keep the answer conservative

강남언니 공개 페이지 기준으로 확인한 후보임을 분명히 말한다. 병원 선택, 의료 조언, 수술 권유처럼 해석될 수 있는 표현은 피한다.

## Public Gangnam Unni surface

- search list: `https://www.gangnamunni.com/search?q=<keyword>`
- parsed payload: `<script id="__NEXT_DATA__" type="application/json">...props.pageProps.hospitals...</script>`
- public hospital URL: `https://www.gangnamunni.com/hospitals/<id>`

Discovery result: `curl`/Node fetch로 비로그인 검색 HTML이 200으로 응답하고, 병원 후보는 server-rendered `__NEXT_DATA__`의 `props.pageProps.hospitals` 배열에 포함된다. 이 경로는 공개 read-only endpoint이므로 `k-skill-proxy`를 사용하지 않는다.

## Workflow

### 1. Search by keyword

```js
const { searchClinics } = require("gangnamunni-clinic-search")

const result = await searchClinics({ query: "강남 성형외과", limit: 5 })
console.log(result.items)
```

CLI:

```bash
npx gangnamunni-clinic-search "강남 성형외과" --limit 5
```

### 2. Interpret returned fields

우선 아래 필드를 본다.

- `name`: 병원명
- `rating`, `ratingCount`, `reviewCount`: 공개 검색 페이지에 포함된 평점/리뷰 지표
- `languages`: 공개 지원 언어
- `url`: 강남언니 공개 병원 페이지
- `profileImage`, `mainImage`: 공개 이미지 URL

### 3. Fallback order

1. 기본: `https://www.gangnamunni.com/search?q=<keyword>`의 `__NEXT_DATA__` payload를 파싱한다.
2. payload가 없으면 로그인벽, CAPTCHA, 차단, 빈 shell 페이지를 실패 모드로 분류한다.
3. 검색 결과가 너무 적거나 앱 전용 정보가 필요하면 자동화를 멈추고 사용자가 공식 앱/웹에서 직접 확인하도록 안내한다.

### 4. Respond safely

응답은 짧고 보수적으로 정리한다.

- 병원명
- 공개 평점/리뷰 수
- 지원 언어
- 강남언니 공개 링크
- `조회 시점 공개 검색 결과 기준이며, 의료 판단이나 실제 예약 가능 여부는 병원/공식 앱에서 확인해야 합니다.` 라고 명시한다.

## Done when

- 검색 키워드를 확인했다.
- 공개 검색 결과에서 병원 후보를 반환했거나, 실패 모드를 명확히 설명했다.
- 계정 기반 액션과 의료 판단은 하지 않았다.

## Failure modes

- 검색어가 너무 넓거나 강남언니가 병원 후보를 공개 payload에 일부만 넣을 수 있다.
- 강남언니 웹 구조가 바뀌면 `__NEXT_DATA__` 경로가 깨질 수 있다.
- 로그인 필요, CAPTCHA, 접근 차단, 빈 HTML shell은 자동 우회하지 않고 실패로 보고한다.
- 평점, 리뷰 수, 노출 순서는 시점에 따라 달라진다.
- 앱 전용/로그인 전용 정보는 비로그인 공개 조회만으로 확정할 수 없다.

## Notes

- 조회형 스킬이다.
- 비로그인 공개 표면 우선 원칙을 유지한다.
- 프록시와 API key는 사용하지 않는다.
- 의료 조언이나 병원 추천 보증이 아니라 공개 후보 정리로만 답한다.
