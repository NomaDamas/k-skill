# 종교시설 찾기 / Religious Facility Search

## What this skill does

동네·역명·랜드마크 텍스트를 기준점으로 잡고 주변 **종교시설을 거리순으로 조회**한다.
교회, 성당, 사찰을 같은 경로로 다루며 기본 대상은 교회다.

- 조회 전용이다. 등록, 연락, 방문 예약 같은 액션은 하지 않는다.
- 위치는 사용자가 제공한 텍스트만 쓴다. 자동 위치 추적을 하지 않는다.
- **공식 Kakao Local REST API**를 `k-skill-proxy` 경유로 호출한다. 사용자 머신에는
  API 키가 필요 없고, 프록시 운영자의 `KAKAO_REST_API_KEY`로 인증한다.

## When to use

- "근처 교회 찾아줘"
- "강남역 근처 교회 알려줘"
- "명동 성당 위치가 어디야"
- "경주에 절 어디 있어?"
- "이 근처 종교시설 알려줘"
- "온누리교회 주소 알려줘"

## Inputs

- `location`: 동네·역명·랜드마크. 예: `강남역`, `성수동`, `경주`
- `--name`: 시설 이름으로 직접 검색. 예: `--name 온누리교회`
- `--type`: `교회`(기본) / `성당` / `절` / `사찰` / `전체`
- `--radius`: 기준점으로부터 최대 거리(m, 최대 20000). Kakao Local API의 상한이다
- `--limit`: 표시 개수 (기본 5, 최대 45). 페이지당 15건씩 최대 3페이지를 가져온다
- `--json`: JSON 출력

사용자가 "성당", "절", "사찰"을 명시하면 `--type`을 그에 맞게 지정한다. 종류를 특정하지
않고 "종교시설"이라고만 하면 `--type 전체`를 쓴다.

위치도 이름도 없으면 **먼저 사용자에게 위치를 묻는다.** 비대화형 자동화에서는
임의로 좁히지 말고 "입력 없음"을 명시한다.

권장 질문:

```text
어느 동네나 역 근처에서 찾을까요? (예: 강남역, 성수동)
```

## Public access path discovered

### 선택한 공개 경로

공식 Kakao Local REST API의 keyword 검색 하나만 쓴다. `k-skill-proxy`가 운영자 키로
인증을 대행하므로 사용자 머신에는 키가 필요 없다.

1. `GET {proxy}/v1/kakao-map/search/keyword?q=<위치>`
   → 첫 번째 결과를 기준점(anchor) 좌표로 쓴다.
2. `GET {proxy}/v1/kakao-map/search/keyword?q=<종류>&x=<lon>&y=<lat>&radius=<m>&sort=distance&size=15&page=1..3`
   → 거리순 장소 목록. 거리는 upstream이 주는 공식 `distance` 필드를 그대로 쓴다.

`{proxy}`는 기본 `https://k-skill-proxy.nomadamas.org`이며 `KSKILL_PROXY_BASE_URL`로
바꿀 수 있다. 같은 라우트를 `kakao-map` 스킬이 이미 쓰고 있다.

### 왜 이 경로인가

- **공식 문서화 API**: Kakao Developers가 스키마를 보장한다. 이전의 모바일 웹 표면
  (`m.map.kakao.com`) 스크래핑은 문서가 없어 구조가 바뀌면 깨지는 상수 리스크가 있었다.
- **proxy 편입 규칙 적합**: upstream이 API 키를 요구하므로 `AGENTS.md` 규칙상
  `k-skill-proxy`를 거치는 것이 맞다. 프록시에 캐시·rate-limit이 있어 쿼터도 보호된다.
- **거리 계산 불필요**: `sort=distance` + `distance` 필드가 공식 제공되어 haversine을
  직접 돌릴 필요가 없다.
- **전국 커버리지**: 지자체 공공데이터(예: 서울 종로구 교회 현황
  `https://www.data.go.kr/data/15117640/fileData.do`)는 구 단위로만 공개되어 전국
  표준데이터가 없다. 주 경로로 쓸 수 없어 참고 출처로만 둔다.
- **분류가 데이터에 있음**: `category_name`에 종교 분류가 그대로 들어온다.

```
교회 → 문화,예술 > 종교 > 기독교 > 교회
성당 → 문화,예술 > 종교 > 천주교 > 성당
사찰 → 문화,예술 > 종교 > 불교 > 절,사찰
기타 → 문화,예술 > 종교 > 종교시설 / 문화,예술 > 종교 > 통일교 …
```

`category_name`에 `종교` 노드가 있는 결과만 통과시키므로 `써브웨이 명동성당점` 같은
이름만 비슷한 음식점·서점이 결과에 섞이지 않는다. `--type`은 그 안에서 마지막
두 분류 토큰으로 한 번 더 좁힌다.

### fallback 순서

1. 기준점 해석 실패 → 거리 없이 결과 목록만 제공한다 (stderr에 사유 표시).
2. 지정한 종류가 0건 → `--type 전체`로 넓히거나 `--radius`를 걸었다면 풀고 재시도한다.
3. 검색 결과 0건 → 상위 행정구역으로 넓혀 재시도한다.
4. 프록시 장애가 계속되면 결과를 지어내지 말고 실패를 그대로 알린다.

## Workflow

1. 사용자에게 위치와 시설 종류를 확인한다. 위치가 없으면 먼저 묻는다.
2. helper를 실행한다.

```bash
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- "강남역" --limit 5
```

성당:

```bash
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- "명동" --type 성당 --limit 5
```

사찰:

```bash
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- "경주" --type 절 --limit 5
```

종류를 가리지 않을 때:

```bash
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- "성수동" --type 전체 --radius 600
```

이름으로 검색:

```bash
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- --name "온누리교회"
```

3. 결과를 3~5개로 요약한다. 각 항목에 이름, 주소, 거리, 연락처를 붙인다.
4. 예배·미사·법회 시간을 물으면 **추정하지 말고** 카카오맵 장소 페이지나 전화로 안내한다.

## Output

기준 위치와 검색어를 먼저 보여주고 거리순 목록을 출력한다.

```
기준 위치: 강남역 2호선 (37.49809, 127.02800)
검색어: "교회" · 후보 43건 중 종교시설 40건 (가까운 5건 표시)

1. 강남성서침례교회  (교회 · 기독교)
   서울 서초구 강남대로55길 9-11
   약 313m
   전화 02-3474-3609
   지도 https://place.map.kakao.com/85095074
```

`--json`은 다음 구조로 출력한다.

```json
{
  "query": "교회",
  "anchor": { "name": "강남역 2호선", "lat": 37.49809, "lon": 127.02800 },
  "scanned": 43,
  "matched": 40,
  "items": [
    {
      "id": "85095074",
      "name": "강남성서침례교회",
      "category": "교회",
      "denomination": "기독교",
      "category_group": "종교",
      "lat": 37.4964,
      "lon": 127.0380,
      "address": "서울 서초구 강남대로55길 9-11",
      "phone": "02-3474-3609",
      "homepage": null,
      "place_url": "https://place.map.kakao.com/85095074",
      "distance_m": 313
    }
  ]
}
```

`homepage`는 Kakao Local API가 외부 홈페이지를 제공하지 않아 항상 `null`이다.
대신 `place_url`(카카오맵 장소 페이지)로 안내한다.

## Done when

- 기준 위치와 시설 종류를 확정하고 사용자에게 알렸다.
- `category_name`의 `종교` 노드로 검증된 후보를 거리순 3~5개로 정리했다.
- 각 후보에 주소와, 있으면 전화번호·카카오맵 링크를 붙였다.
- 예배·미사·법회 시간을 임의로 지어내지 않고 공식 출처로 넘겼다.

## Failure modes

- **검색 결과 없음**: 검색어가 좁거나 오탈자다. 상위 행정구역으로 넓혀 재시도한다.
- **지정 종류 0건**: 후보는 잡혔지만 해당 종류가 없다. `--type 전체`로 넓히거나, `--radius`를 걸었다면 풀고 확인한다. `--radius`는 결과를 좁히는 옵션이라 늘려도 새 후보를 가져오지 않는다.
- **프록시 503 `upstream_not_configured`**: 프록시에 `KAKAO_REST_API_KEY`가 없다. 운영자에게 키 설정을 요청한다.
- **프록시 401/403 → 503 변환**: Kakao 키 revoke나 일일 쿼터 초과 신호다. 잠시 후 재시도하고 계속되면 운영자에게 알린다.
- **프록시 5xx / 타임아웃**: 프록시 또는 upstream 일시 장애. 재시도하고 계속 실패하면 그대로 보고한다.
- **좌표 입력**: v1은 `위도,경도` 입력을 지원하지 않는다. helper가 명시적으로 거부하고
  동네·역명을 요구한다.
- **시·군 단위 입력**: 기준점이 그 안의 특정 장소로 잡혀 절대 거리가 대략치가 된다.
  동·역 단위에서 가장 정확하다.
- **예배·미사·법회 시간**: 이 데이터에 없다. 제공하지 않는다.

## Notes

- 공개 정보 조회 전용이다. 종교나 교단의 우열을 평가하거나 이단 여부를 판별하지 않는다.
- 특정 시설이나 교단을 권유하지 않는다. 거리와 공개 정보만 근거로 나열한다.
- 예배·미사·법회 시간, 성직자, 교단 소속은 이 데이터에 없다. 추정하지 않고 공식 출처로 넘긴다.
- 사용자가 제공한 위치 텍스트만 쓴다. 위치를 자동으로 알아내려 하지 않는다.
