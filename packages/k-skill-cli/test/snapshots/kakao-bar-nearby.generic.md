# kakao-bar-nearby — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Use `k-skill-browser-runtime` (provider `auto`) for logged-in or rendered-page automation. On macOS it tries Aside Browser first, then BrowserOS CDP, then user-launched Chrome/Chromium CDP; on other platforms it tries BrowserOS CDP, then Aside Browser, then user-launched Chrome/Chromium CDP. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.
- Complete search and reversible reservation steps that the documented portable workflow supports, then report the confirmation, purchase deadline, and the exact official surface where the user finishes payment. Do not automate payment here.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec kakao-bar-nearby scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path kakao-bar-nearby <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read kakao-bar-nearby references/<file>`.

# Kakao Bar Nearby

## What this skill does

유저가 알려준 현재 위치를 기준으로 **카카오맵 공식 API에서 근처 술집 후보를 찾고**, 후보별 카카오맵 상세 링크로 핸드오프해 영업 상태·메뉴·좌석 정보를 확인한다.

- 위치는 자동으로 추정하지 않는다.
- **반드시 먼저 현재 위치를 질문**한다.
- `서울역`, `강남`, `사당`, `신논현`, `논현` 같은 역명/동네/랜드마크 질의를 그대로 받을 수 있다.
- 장소 후보 검색과 거리 계산은 `k-skill-proxy`의 Kakao Local REST API를 우선 사용한다.
- 공식 API에 없는 현재 영업 상태, 대표 메뉴, 좌석 옵션은 반환된 카카오맵 장소 상세 링크에서 확인한다.

## When to use

- "서울역 근처 술집 찾아줘"
- "강남에서 지금 영업중인 와인바 뭐 있어?"
- "논현 근처 4명 갈만한 술집 알려줘"
- "사당에서 전화번호 있는 이자카야 몇 군데만 보여줘"

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

- 권장 질문: `현재 위치를 알려주세요. 서울역/강남/사당 같은 역명이나 동네명으로 보내주시면 카카오맵 기준 근처 술집을 찾아볼게요.`
- 위치가 애매하면: `가까운 역명이나 동 이름으로 한 번만 더 알려주세요.`

## Access path

### Primary: official Kakao Local API

- hosted proxy: `https://k-skill-proxy.nomadamas.org`
- anchor and bar search: `GET /v1/kakao-map/search/keyword`
- user API key: 필요 없음
- package function: `searchNearbyBarsByLocationQuery(locationQuery, options?)`

패키지는 기준 장소를 공식 API로 찾은 뒤 같은 좌표를 중심으로 `<location> 술집`을 거리순 검색한다. 결과의 `sourceUrl`과 `detailLookup.url`은 Kakao Local 응답의 `place_url`을 사용하며, 누락 시 공식 장소 ID로 `https://place.map.kakao.com/<id>`를 구성한다.

### Detail handoff: official Kakao Map place page

- place detail: `https://place.map.kakao.com/<id>`
- detail fields: `openStatus`, `menuSamples`, `seatingKeywords`, `capacityHint`

내부 `place-api.map.kakao.com/places/panel3` JSON이나 모바일 검색 HTML을 기본 검색 경로로 사용하지 않는다. 장소 상세 정보가 필요할 때만 반환된 공식 장소 페이지를 브라우저로 연다.

## Workflow

1. 유저에게 반드시 현재 위치를 묻는다.
2. `searchNearbyBarsByLocationQuery`로 공식 Kakao Local API 기반 후보를 가져온다.
3. `items[]`에서 이름, 카테고리, 주소, 전화번호, 거리, `detailLookup.url`을 확인한다.
4. 상위 3~5개 후보의 `detailLookup.url`을 브라우저로 열고 장소명이 후보와 일치하는지 먼저 확인한다.
5. 상세 페이지에서 보이는 정보만 사용해 다음 필드를 보강한다.
   - 현재 영업 상태와 오늘 영업시간
   - 대표 메뉴 2~3개
   - 단체석, 룸, 바테이블, 혼술 등 좌석/인원 힌트
6. 상세 확인이 끝난 후보는 영업 중 우선, 그다음 거리순으로 정리한다.
7. 상세 페이지가 차단되거나 해당 필드가 없으면 추정하지 않는다. 공식 API 결과와 장소 링크를 제공하고 `상세 정보 미확인`으로 표시한다.

## Package output contract

```js
const { searchNearbyBarsByLocationQuery } = require("kakao-bar-nearby");

const result = await searchNearbyBarsByLocationQuery("서울역", {
  limit: 5,
  radius: 3000
});
```

주요 반환 필드:

- `anchor`: 공식 API에서 선택한 기준 장소
- `items[].name`, `category`, `address`, `phone`
- `items[].distanceMeters`
- `items[].sourceUrl`
- `items[].detailLookup.status`: 상세 페이지 확인 전에는 `required`
- `items[].detailLookup.url`: 영업·메뉴·좌석 확인에 사용할 카카오맵 장소 링크
- `items[].detailLookup.fields`: 상세 페이지에서 확인할 필드 목록
- `meta.source`: `kakao-local-rest-api`
- `meta.detailLookupRequiredCount`

공식 API 단계에서는 상세 필드를 임의로 채우지 않는다.

- `isOpenNow`: `null`
- `openStatus`: `null`
- `menuSamples`: `[]`
- `seatingKeywords`: `[]`
- `capacityHint`: `null`

## Responding

보통 3~5개만 짧게 정리한다.

- 술집명
- 카테고리
- 영업 상태 (`영업 중`, `영업 전`, `휴무일`, `상세 정보 미확인`)
- 대표 메뉴 2~3개
- 좌석/인원 수용 힌트 (`단체석`, `바테이블` 등)
- 전화번호
- 거리
- 카카오맵 상세 링크

공식 API에서 확인한 값과 상세 페이지에서 확인한 값을 혼동하지 않는다. 메뉴·영업·좌석 정보는 상세 페이지에서 실제로 확인한 후보에만 표시한다.

## Failure modes

- `429 rate_limited`: 잠시 후 재시도가 필요함을 알리고 반복 호출하지 않는다.
- `502 upstream_error` / `503 upstream_not_configured`: 공식 Kakao API 경로가 현재 사용 불가하므로 원인을 그대로 설명한다.
- 기준 장소가 모호함: 가까운 역명이나 동 이름을 한 번 더 묻는다.
- 술집 후보 없음: 반경을 넓히거나 `와인바`, `이자카야`, `호프`처럼 키워드를 구체화한다.
- 장소 상세 페이지 차단, CAPTCHA, 빈 화면, 구조 변경: 우회하지 않고 공식 API 후보와 링크까지만 제공한다.
- 메뉴·좌석·영업 정보가 페이지에 없음: 추정하지 않고 `상세 정보 미확인`으로 표시한다.

## Done when

- 유저의 현재 위치를 먼저 확인했다.
- 공식 Kakao Local API로 술집 후보를 최소 1개 이상 찾았거나 실패 이유를 설명했다.
- 각 후보의 카카오맵 상세 링크를 확보했다.
- 상위 후보의 상세 링크에서 영업 상태·메뉴·좌석 정보를 확인했거나, 확인하지 못한 이유를 명시했다.
