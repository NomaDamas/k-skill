# daangn-realty-search — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- Complete search, comparison, and link preparation that the documented portable workflow supports, then hand off to the official surface for login, cart, and payment. Do not automate purchase here.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path daangn-realty-search <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read daangn-realty-search references/<file>`.

# Daangn Realty Search

## What this skill does

당근부동산 지도 페이지(`realty.daangn.com/map/{name1}/{name2}/{name3}`)의 TanStack Router SSR 스트림(`<script class="$tsr">` 안의 seroval `$R[n]=...`)에서 `loaderData.articles`를 파싱해 매물 후보를 정리한다. 같은 스트림의 `dehydratedData.relayRecords`(Relay 스토어)로 전체 거래·층수·건물명을 보강하고, 제목·주소는 상세 페이지 JSON-LD에서 보강한다. 스트림이 없고 구버전 `window.RELAY_STORE`가 있으면 그것을 파싱한다. 외부 패키지 없이 Python 표준 라이브러리만 사용한다.

## When to use

- "당근부동산 염창동 월세 찾아봐"
- "가양1동 원룸 월세 매물 봐줘" (행정동 → 법정동 자동 변환)
- "수원 팔달구 상가 매물 봐줘" (`--expand`로 인접 동까지)
- "이 당근부동산 URL 상세 요약해줘"

## When not to use

- 당근 계정 로그인이 필요한 작업
- 채팅, 찜, 거래 제안, 문의, 예약, 계약, 구매처럼 상대방/계정에 영향을 주는 작업
- CAPTCHA/봇 차단/로그인벽 우회가 필요한 작업

## Prerequisites

- 인터넷 연결, Python 3.9+

## Data surfaces (2026-11 TanStack SSR 전환 대응)

- Region resolver: `https://www.daangn.com/kr/api/v1/regions/keyword?keyword=<지역명>` → `{"locations":[{id,name1,name2,name3,name*Id,depth}]}`
- 매물 목록: `https://realty.daangn.com/map/{name1}/{name2}/{name3}[/{용도}][/{거래}][/{거래방식}]` 의 `$tsr` 스트림
- 상세: `https://realty.daangn.com/articles/<id>` 의 `application/ld+json`

> ⚠️ **구버전(`www.daangn.com/kr/realty/?_data=routes/kr.realty._index`)은 2026-06부터 HTTP 204(빈 응답)로 폐기됨.** 절대 사용 금지.
> ⚠️ **2026-11부터 지도 페이지에 `window.RELAY_STORE`가 없다.** 스트림 파서가 1순위, RELAY_STORE는 fallback.

## SSR 스트림 파싱 경로 (2026-11-17 검증)

```
<script class="$tsr">$_TSR.router=($R=>$R[0]={manifest:…,matches:[…,{l:$R[75]={
  mode:"dong",city,district,dong,dongRegion,regionId,propertyFilter:{salesTypes:[]},
  articleCount:1000,
  articles:$R[78]=[{originalId:"5060253",salesType:"OPEN_ONE_ROOM",tradeType:"MONTH",
                    tradePrice:300,monthlyPay:61,area:"20",regionName3:"염창동"},…],
  complexes, siblings:[{name3}], subwayStations, neighborhoodSummary}}],
  dehydratedData:{relayRecords:{…Article/ArticleFeedCard/*Trade…}}})($R["tsr"])
```
- JS를 실행하지 않고 객체·배열·문자열(`\xHH`·`\uXXXX`·`\u{…}` 이스케이프)·숫자·`!0/!1`·`void 0`·`$R[n]` 역참조만 해석하는 리터럴 파서(`daangn_tsr_stream.py`)로 `articles:` 배열과 그 loaderData 객체를 꺼낸다.
- `articles`는 URL 당 **최대 20건**이고 **인접 동(`regionName3`) 매물이 섞인다**. `articleCount`는 전체 개수(1000에서 잘림).
- `articles`에는 대표 거래 1건만 있다. `dehydratedData.relayRecords`는 구 RELAY_STORE와 같은 Relay 스토어라서 `ArticleFeedCard → Article → trades`로 **전체 거래(예: 매매+전세)**, `floor/topFloor`, `buildingName`을 얻는다. 같은 매물이 카드 2장으로 중복되므로 `originalId`로 dedupe.
- 구버전 `window.RELAY_STORE`는 JS 문자열 이스케이프 → `json.loads(json.loads('"'+raw+'"'))` 2단 디코드.

## Trade 유형 & 가격 매핑

가격 단위 = **만원**. `tradePrice`의 의미는 `tradeType`에 따라 다르다.

| 거래유형 | tradePrice → | monthlyPay → | 평당 단가 |
|---|---|---|---|
| 월세(MONTH) | `deposit_manwon` | `monthly_manwon` | 월세 / 평 |
| 단기(SHORT) | `deposit_manwon` | `monthly_manwon` | 월세 / 평 |
| 연세(YEAR) | `deposit_manwon` | `yearly_manwon` | 연세 / 평 |
| 전세(BORROW) | `deposit_manwon` | - | 보증금 / 평 |
| 매매(BUY) | `price_manwon` | - | 매매가 / 평 |

평 = ㎡ / 3.305785. `area`는 문자열로 오므로 float 변환.

## 서버 필터 = 경로 slug (쿼리스트링 아님)

`?salesTypes=APART`, `?salesType=`, `?tradeType=` 쿼리스트링은 SSR 목록을 바꾸지 않는다(`mode:"dong"` 그대로). **경로 slug**만 `mode:"dongFilter"`로 서버 필터가 걸리고 `articleCount`도 줄어든다. 순서는 `/{용도}/{거래}/{거래방식}`, 차원당 값 1개.

| 차원 | slug → enum |
|---|---|
| 용도 | 아파트 APART, 오피스텔 OFFICETEL, 원룸 ONE_ROOM(→ OPEN_ONE_ROOM·SPLIT_ONE_ROOM), 빌라 TWO_ROOM, 주택 HOUSE, 상가 STORE, 사무실 OFFICE, 건물 BUILDING, 공장창고 FACTORY, 토지 LAND |
| 거래 | 월세 MONTH, 전세 BORROW, 매매 BUY, 단기 SHORT, 연세 YEAR |
| 거래방식 | 직거래 DIRECT, 중개 BROKER |

헬퍼는 `--sales-type`/`--trade-type` 값(enum 또는 한글 slug, 콤마구분)을 slug 조합별 URL로 각각 가져와 합친 뒤 로컬에서 다시 필터한다. slug가 없는 enum이 섞이면 무필터 페이지를 가져와 로컬 필터만 한다. 필터 URL도 20건 상한이므로 좁힐수록 원하는 매물 비중이 커진다.

## 층수

목록 단계에서 `relayRecords`의 `floor/topFloor`로 `floor_label`("5층/7층")을 채운다. 상세 페이지 JSON-LD `Product.additionalProperty`의 `floor`/`topFloor`는 2026-11부터 "5층"처럼 단위가 붙어 오며, 둘 다 같은 형식으로 정규화한다. `nearbySubwayStation`도 상세에서 추출. 제목은 `Product.name`, 주소는 `Place.name`.

## Commands

```bash
# 기본 검색 (상위 5개 제목·주소 보강)
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "염창동" --limit 20

# 행정동 이름도 가능 (가양1동 → 서울 강서구 가양동), 앞 단어는 지역 힌트
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "가양1동"
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "대전 가양1동"

# 서버 필터 (경로 slug) + 검색 동만 남기기
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "염창동" --sales-type 원룸,오피스텔 --trade-type MONTH --exact-dong
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "염창동" --sales-type APART --trade-type BORROW --deal-type DIRECT

# 인접 동까지 확장 (SSR siblings = 같은 구의 법정동)
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "등촌1동" --expand --expand-max 6

# 제목 보강 끄기(빠름) / 상세
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- search --region "염창동" --titles 0
npx -y @nomadamas/k-skill@0 exec daangn-realty-search scripts/daangn_realty.py -- detail "https://realty.daangn.com/articles/5060253"
```

옵션: `--limit`(기본 20), `--titles N`(상세로 제목·주소 보강할 상위 N, 기본 5, 0=끔), `--expand`/`--expand-max`(기본 6), `--sales-type`, `--trade-type`, `--deal-type DIRECT|BROKER`, `--exact-dong`(인접 동 매물 제외).
`--keyword`는 반환 매물의 공개 필드 텍스트를 필터링한다. `--only-verified`는 공개 피드에 인증 필터가 없어 호환 목적으로만 허용한다.

## Output fields

최상위: `effective_region`, `region_resolution{query, dong_name, admin_to_legal, candidates}`, `sources[{region, url, urls?, count, total_available, note}]`, `count`, `errors`, `items`.

매물: `article_id, salesType, area_sqm, area_pyeong, trades[{type,label,deposit_manwon,monthly_manwon,price_manwon,per_pyeong_manwon,yearly_manwon?}], url, region, searched_region, floor_label, building_name, title, address, nearby_subway, release_date`

- `region`은 매물 소재 동(`regionName3`, 인접 동일 수 있음), `searched_region`은 조회한 지도 페이지의 "구 동".
- `trades`는 relayRecords가 있으면 매물의 전체 거래, 없으면 SSR 대표 거래 1건.
- `release_date`는 상세 페이지 JSON-LD의 `Product.releaseDate`(ISO 8601, UTC)이며 `--titles` 보강 대상 매물에만 채워진다. 최초 등록일인지 최근 끌어올리기/수정일인지는 당근 쪽 명세에 없어 확정할 수 없다.

## Region handling

- 당근부동산 지도는 **법정동**(가양동·등촌동) 단위다. 행정동 경로(`/가양1동`)는 HTTP 404.
- region API는 서울 행정동을 `가양제1동` 형태로만 알고 `등촌1동`은 후보 0건, `가양1동`은 대전 동구만 돌려준다. 그래서 `가양1동`·`가양제1동`·`상계3.4동`·`화곡본동`처럼 숫자/본동 접미사가 붙은 이름은 법정동(`가양동`)으로 바꿔 먼저 찾고, 없을 때만 원래 이름으로 찾는다.
- 앞 단어는 시도/시군구 힌트("서울 강서구 가양1동", "대전 가양1동").
- 후보 순위: 힌트 일치 → 동명 정확 일치 → **서울특별시** → depth 3. 같은 동명이 여러 시도에 있으면 서울을 고른다. 결과 `region_resolution.candidates`로 다른 후보를 보여 주고, 원하는 곳이 아니면 힌트를 붙여 다시 조회한다.
- 이름 규칙으로 못 바꾸는 행정동(예: 관악구 청룡동 → 봉천동)은 404 note가 나오므로 법정동 이름으로 다시 조회한다.
- `--expand`는 SSR `siblings`(같은 구 법정동)를 쓰고, 없으면 region API의 같은 `name2Id` depth 3 동으로 fallback.

## Safety and scope

- 읽기 전용 검색/상세만. 로그인·채팅·거래·예약·계약 자동화 없음.
- 공개 표면이 바뀌거나 빈 응답/봇 차단이면 실패 모드로 보고하고 우회하지 않는다.
- 결과는 실시간 호가라 실거래와 다를 수 있으므로 source URL을 함께 제시.

## Failure modes

- `매물 데이터 없음: TanStack SSR 스트림·RELAY_STORE 모두 없음` (sources note) → 페이지 구조 재변경 또는 봇 차단. HTML의 `<script class="$tsr">`와 `articles:` 위치 재확인 필요.
- `SSR 스트림에 articles 없음` → 스트림은 있으나 loaderData 키가 바뀜.
- `HTTP 404: 당근부동산 지도에 없는 동 이름` → 행정동/오타. 법정동으로 다시 조회.
- 시군구(name2) 랜딩 URL은 매물이 없다 — **반드시 동(name3)까지** 있어야 articles가 SSR로 채워진다.
- URL 당 20건 상한 + 인접 동 혼입: 특정 동만 필요하면 `--exact-dong`과 slug 필터를 함께 쓴다.
- 상세는 삭제/비공개 글에서 실패할 수 있다.

## Done when

- 지역 id 해석(행정동 → 법정동 포함) → map URL의 SSR 스트림에서 매물 추출 → source URL·effective_region·region_resolution 포함.
- 인증/거래성 액션은 수행하지 않았다.

## Notes

- Windows stdout 한글 깨짐 방지: 지원 런타임에서는 `sys.stdout.reconfigure(encoding='utf-8')`를 적용한다.
- `area`·가격 필드가 문자열로 오는 케이스가 있어 모든 수치 연산 전 float 변환 가드.
