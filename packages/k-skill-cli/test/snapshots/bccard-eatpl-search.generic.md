# bccard-eatpl-search — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec bccard-eatpl-search scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path bccard-eatpl-search <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read bccard-eatpl-search references/<file>`.

# BC카드 eat.pl 맛집 검색

## What this skill does

사용자가 말한 장소를 먼저 카카오맵 등 지도 스킬로 정확한 도로명주소로 해석한 뒤, 그 주소를 중심으로 BC카드 eat.pl 잇플의 가맹점 검색 API를 조회한다. 결과는 API가 반환하는 매출 랭킹 상위 순서를 보존하며, 사용자의 장르·동네·외국인 방문·회식·영업시간·혼잡 시간 조건으로 좁혀 표로 제시한다.

`allSaleRnk`와 `ccgSaleRnk`는 백분위(%)이고 값이 낮을수록 상위다. 1% 미만은 `상위 0.04%`처럼 소수점을 보존한다. 추천은 일반적인 별점 순위가 아니라 최근 1개월 BC카드 결제 데이터에 기반한 매출 순이다.

## When to use

- "강남역 근처 고기집 중 매출 높은 곳"
- "을지로입구역 주변 외국인이 많이 가는 카페"
- "성수동에서 회식하기 좋은 맛집"

## Workflow

1. 장소명이 모호하면 먼저 행정구역 또는 도로명주소를 확인한다. `kakao-map`의 장소 검색/주소 변환을 우선 사용하고, 사용자가 지정한 경우 다른 지도 스킬로 교차 확인한다.
2. 검색 중심은 장소의 정확한 주소에서 최소한 시·군·구와 도로명/동 단위로 정한다. eat.pl API는 텍스트 주소 부분일치 검색이며 반경(meter) 검색 API가 아니므로, API 결과를 실제 근처로 단정하지 말고 지도 스킬로 위치를 교차 확인한다.
3. 다음 프록시 endpoint를 GET으로 호출한다.

```bash
curl -fsS --get "${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}/v1/bccard-eatpl/search" \
  --data-urlencode 'location=서울 중구 을지로30길 20' \
  --data-urlencode 'merTpbuzNm=카페'
```

지원 입력:

- `location` 또는 `address`: 정확한 주소/지역 문자열
- `merTpbuzNm`, `genre`, `business_type`: eat.pl 대분류 또는 소분류
- `merNm`, `merchant_name`: 가맹점명 일부

4. 최대 100건을 받은 뒤 지도 검색 결과와 주소·상호를 대조하고, 요청 조건에 맞는 매장만 남긴다. 존재하지 않는 리뷰·메뉴·주차·영업 여부를 추측하지 않는다.
5. 표에는 `가맹점명`, `주소`, `업종`, `전국 매출 백분위`, `지역 매출 백분위`, `동네 맛집`, `외국인 방문`, `회식 적합`, `영업 관측시간`, `혼잡 요일/시간`, `주요 고객층`, `eat.pl 상세 링크`를 포함한다.
6. 반드시 `eat.pl 잇플 · BC카드 결제 데이터 기반`을 출처로 표기한다. 상세 URL은 API의 `merUrl`을 그대로 사용하며 경로를 조합하지 않는다.

## Credentials and proxy operations

사용자에게 credentials를 묻거나 출력하지 않는다. proxy 운영 환경에 다음 값을 secret으로 주입한다.

- `BCCARD_EATPL_INST_NM`: 제휴 시 발급된 기관코드
- `BCCARD_EATPL_API_BASE_URL`: 기본값 `https://dev-api.paybooc.ai/api/mer`; 정식 오픈 시 운영 URL로 변경
- `BCCARD_EATPL_API_TIMEOUT_MS`: 선택값, 기본 20000

`trnsTrceNo`는 사용자가 입력하지 않는다. proxy가 기관코드 + 한국시간 기준 `YYYYMMDD` + 10자리 순번으로 매 요청 생성한다.

## Important interpretation

- API 결과 자체가 매출 랭킹 상위 순이며, 별도 매출액은 제공되지 않는다.
- `allSaleRnk`/`ccgSaleRnk`는 퍼센트 백분위이며 낮을수록 상위다.
- `srtTime`/`endTime`은 최근 1개월 결제 승인 시각 기반 관측값이지 영업시간 공시가 아니다.
- 실시간 영업 여부는 `merUrl` 상세 페이지를 확인해야 하며, API 관측값과 다를 수 있다.
- 전화번호는 유효하지 않을 수 있다.
- 좌표는 TM128이므로 WGS84 지도 좌표로 직접 해석하지 않는다.

## Failure modes

- `400 bad_request`: 주소·장르·가맹점명 중 하나도 없거나 입력이 잘못됨
- `503 upstream_not_configured`: `BCCARD_EATPL_INST_NM` 미설정
- `403/401 upstream_error`: IP 등록, 기관코드, 제휴 권한 또는 upstream 인증 문제
- `502 upstream_error`: eat.pl API 연결·서버 오류
- `502 upstream_semantic_error`: `rspCode`가 성공이 아니거나 응답 구조가 명세와 다름
- 개발 서버 연결 타임아웃: 개발 API 접근 정보 또는 네트워크/IP allowlist를 BC카드 측에 확인
- 빈 결과: 주소 텍스트가 너무 좁거나 업종 표기가 맞지 않을 수 있으므로 임의 재시도하지 말고 주소 범위를 넓히거나 명세의 업종값을 확인

## Legal and partnership notice

이 스킬은 BC카드와의 공식 제휴 연동을 위해 제공되는 k-skill 구현물이라는 전제에서 사용한다. 다만 이 저장소와 k-skill 자체가 BC카드의 공식 제품·상표·지원 채널이라는 의미는 아니며, 실제 운영 전에는 BC카드의 제휴 승인·기관코드 발급·IP 등록·노출 문구 검수를 완료해야 한다. 출처는 항상 `eat.pl 잇플 · BC카드 결제 데이터 기반`으로 표시한다.

## Done when

- 장소를 주소로 해석했다.
- eat.pl 결과를 최대 100건까지 받아 지도 정보와 대조했다.
- 사용자의 조건으로 필터링한 표와 `web.paybooc.ai` 상세 링크를 제공했다.
- 매출 순 추천과 최근 1개월 결제 데이터 기준임을 설명했다.
- 출처·제휴 전제·데이터 한계를 함께 고지했다.
