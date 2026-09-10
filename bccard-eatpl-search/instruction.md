# BC카드 eat.pl 맛집 검색

## What this skill does

사용자가 말한 장소를 먼저 `kakao-map`으로 정확한 도로명주소로 해석한 뒤, 그 주소를 중심으로 BC카드 eat.pl 잇플의 가맹점 검색 API를 조회한다. 결과는 API가 반환하는 매출 랭킹 상위 순서를 보존하며, 사용자의 장르·동네·외국인 방문·회식·영업시간·혼잡 시간 조건으로 좁혀 표로 제시한다.

추천은 별점 순위가 아니라 최근 1개월 BC카드 결제 데이터 기반 매출 순이다. 매출액(원)은 없고, 대신 `allSaleRnk`/`ccgSaleRnk` 백분위로 **얼마나 상위인지**를 반드시 숫자로 보여 준다. `srtTime`/`endTime`은 **영업 예상 시간**으로 정리한다. 모든 행에 eat.pl 상세 링크를 첨부한다.

## When to use

- "강남역 근처 고기집 중 매출 높은 곳"
- "을지로입구역 주변 외국인이 많이 가는 카페"
- "성수동에서 회식하기 좋은 맛집"

## Workflow

1. 장소명이 모호하면 먼저 행정구역 또는 도로명주소를 확인한다. `kakao-map` 스킬을 우선 사용한다. 이 경로는 k-skill-proxy가 중계하는 **카카오 공식 Local REST API** (`GET /v1/kakao-map/search/keyword`, `coord2address` 등)이다. 카카오맵 웹 페이지를 스크래핑하지 않는다. 사용자가 지정한 경우 다른 지도 스킬로 교차 확인할 수 있다.
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
5. 아래 **출력 계약**을 만족하는 표만 사용자에게 보여 준다. 계약을 빠뜨린 표는 미완성이다.
6. 반드시 `eat.pl 잇플 · BC카드 결제 데이터 기반`을 출처로 표기한다.

## 출력 계약 (필수)

표 컬럼: `가맹점명`, `주소`, `업종`, `전국 매출 상위`, `지역 매출 상위`, `동네 맛집`, `외국인 방문`, `회식 적합`, `영업 예상 시간`, `혼잡 요일/시간`, `주요 고객층`, `eat.pl 상세 링크`.

### 매출이 얼마나 높은지

- 매장마다 `전국 매출 상위 {allSaleRnk}%`, `지역 매출 상위 {ccgSaleRnk}%`를 빠짐없이 숫자로 쓴다. "매출이 높다"만 쓰지 않는다.
- 백분위 값이 **낮을수록** 최근 1개월 BC카드 결제 매출 순위가 높다. `상위 0.09%`는 `상위 3%`보다 훨씬 위다.
- 1% 미만은 소수점을 보존한다. 예: `0.04` → `전국 매출 상위 0.04%`.
- 실제 매출액(원)은 API가 제공하지 않는다. 백분위가 높낮이 정보다.

### 영업 예상 시간

- `srtTime`/`endTime`(HHMM)을 `영업 예상 시간 HH:MM–HH:MM`으로 변환한다. 예: `0702`+`2246` → `영업 예상 시간 07:02–22:46`.
- 종료 시각이 시작보다 이르면 자정 넘김으로 `영업 예상 시간 18:14–익일 05:56`처럼 적는다.
- 표 밖 한 줄로 "최근 1개월 결제 승인 시각 기반 추정이므로 공식 영업시간이 아님"을 고지한다.

### 상세 링크 강제

- **모든 행**에 API `merUrl`을 마크다운 링크로 첨부한다: `[eat.pl 상세]({merUrl})`.
- `merUrl`이 없거나 `https://web.paybooc.ai/`로 시작하지 않으면 그 행을 출력하지 않는다.
- 링크가 빠진 목록·표는 완성 결과가 아니다. URL 경로를 조합하거나 추측하지 않는다.

## Credentials and proxy operations

사용자에게 credentials를 묻거나 출력하지 않는다. proxy 운영 환경에 다음 값을 secret으로 주입한다.

- `BCCARD_EATPL_INST_NM`: 제휴 시 발급된 기관코드
- `BCCARD_EATPL_API_BASE_URL`: 기본값 `https://dev-api.paybooc.ai/api/mer`; 정식 오픈 시 운영 URL로 변경
- `BCCARD_EATPL_RELAY_URL`: 선택값, 고정 outbound IP relay URL. 설정하면 proxy는 이 URL만 호출하고, 토큰 없이는 호출하지 않는다
- `BCCARD_EATPL_RELAY_TOKEN`: 선택값, relay `Authorization: Bearer` 시크릿. gpu01 `k-skill-proxy` `.env`와 Lightsail relay env에만 저장한다. 사용자·클라이언트는 Lightsail을 직접 호출하지 않는다
- `BCCARD_EATPL_API_TIMEOUT_MS`: 선택값, 기본 20000

`trnsTrceNo`는 사용자가 입력하지 않는다. proxy가 기관코드 + 한국시간 기준 `YYYYMMDD` + 10자리 순번으로 매 요청 생성한다.

## Important interpretation

- API 결과 자체가 매출 랭킹 상위 순이며, 별도 매출액은 제공되지 않는다. 높낮이는 전국·지역 백분위로만 말한다.
- `allSaleRnk`/`ccgSaleRnk`는 퍼센트 백분위이며 낮을수록 상위다.
- `srtTime`/`endTime`은 최근 1개월 결제 승인 시각 기반 **영업 예상 시간**이지 영업시간 공시가 아니다.
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

- 장소를 `kakao-map`(k-skill-proxy 카카오 공식 Local API)으로 주소로 해석했다.
- eat.pl 결과를 최대 100건까지 받아 지도 정보와 대조했다.
- 사용자의 조건으로 필터링한 표에 전국·지역 매출 상위 %, 영업 예상 시간, `merUrl` 상세 링크가 **모든 행**에 있다.
- 매출 순 추천과 최근 1개월 결제 데이터 기준임을 설명했다.
- 출처·제휴 전제·데이터 한계를 함께 고지했다.
