# 종교시설 찾기 가이드

## 이 기능으로 할 수 있는 일

- 동네·역명·랜드마크 기준 근처 종교시설 거리순 조회
- 교회(기본), 성당, 사찰을 같은 경로로 조회
- 시설 이름으로 직접 검색해 여러 지점 구분
- 도로명 주소, 기준점으로부터의 거리, 전화번호, 카카오맵 장소 링크 정리

사용자 API 키가 필요 없습니다. 공식 Kakao Local REST API를 `k-skill-proxy` 경유로
호출하며, 프록시 운영자의 `KAKAO_REST_API_KEY`로 인증합니다.

## 가장 먼저 할 일

이 기능은 **위치를 먼저 확인한 뒤** 실행합니다.

권장 질문 예시:

```text
어느 동네나 역 근처에서 찾을까요? (예: 강남역, 성수동)
```

위치도 이름도 없으면 임의로 좁히지 말고 사용자에게 물어봅니다.

## 입력값

- 동네·상권: `성수동`, `광화문`, `해운대`
- 역명·랜드마크: `강남역`, `홍대입구역`, `코엑스`
- 시설 이름: `--name 온누리교회`

옵션:

| 옵션 | 설명 |
| --- | --- |
| `--type` | `교회`(기본) / `성당` / `절` / `사찰` / `전체` |
| `--radius` | 기준점으로부터 최대 거리(m, 최대 20000). Kakao Local API의 상한입니다 |
| `--limit` | 표시 개수 (기본 5, 최대 45). 페이지당 15건씩 최대 3페이지를 가져옵니다 |
| `--json` | JSON 출력 |

좌표(`위도,경도`) 입력은 지원하지 않습니다. helper가 명시적으로 거부하고 동네·역명을 요구합니다.

## 공식 표면

- 공식 Kakao Local REST API keyword 검색 (k-skill-proxy 경유):
  `GET {proxy}/v1/kakao-map/search/keyword?q=..&x=..&y=..&radius=..&sort=distance`
- 기준점 해석과 시설 검색 모두 같은 endpoint를 씁니다. 거리는 upstream이 주는
  공식 `distance` 필드를 그대로 씁니다.
- `{proxy}`는 기본 `https://k-skill-proxy.nomadamas.org`이며 `KSKILL_PROXY_BASE_URL`로
  바꿀 수 있습니다. 같은 라우트를 [kakao-map 스킬](../../kakao-map/instruction.md)이 씁니다.

참고 출처(주 경로로는 쓰지 않음):

- 서울특별시 종로구 교회 현황: `https://www.data.go.kr/data/15117640/fileData.do`
- 서울특별시 관악구 종교시설 현황: `https://www.data.go.kr/data/15117616/fileData.do`

지자체 공공데이터는 구 단위로만 공개되어 전국 표준데이터가 없습니다. 그래서 전국 커버리지가
필요한 이 기능의 주 경로로는 쓰지 않고 참고로만 둡니다.

## 종교시설 판별 기준

Kakao 장소 분류(`category_name`)에는 `종교` 노드가 실제로 존재합니다.

```
교회 → 문화,예술 > 종교 > 기독교 > 교회
성당 → 문화,예술 > 종교 > 천주교 > 성당
사찰 → 문화,예술 > 종교 > 불교 > 절,사찰
```

`category_name`에 `종교` 노드가 있는 결과만 통과시키므로 `써브웨이 명동성당점`처럼
이름에 "성당"이 들어간 음식점·카페·서점이 결과에 섞이지 않습니다. `--type`은 그 안에서
마지막 두 분류 토큰으로 한 번 더 좁힙니다.

`--type 전체`는 "종교시설" 단일 키워드가 교회·사찰을 놓치므로 교회·성당·사찰 세 검색을
합쳐서 중복을 제거합니다.

## 기본 흐름

1. 사용자에게 위치를 먼저 묻습니다.
2. 위치 문자열로 keyword 검색해 첫 결과를 기준점(anchor) 좌표로 씁니다.
3. 시설 종류를 키워드로, 기준점 좌표를 중심으로 `sort=distance` 검색합니다.
4. `종교` 분류가 아닌 후보를 버립니다.
5. 가장 가까운 3~5개만 짧게 응답합니다.

## 실행 예시

```bash
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- "강남역" --limit 5
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- "명동" --type 성당
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- "성수동" --type 전체 --radius 600
npx -y @nomadamas/k-skill@0 exec religious-facility-search scripts/religious_facility_search.py -- --name "온누리교회"
```

## 출력

```
기준 위치: 강남역 2호선 (37.49809, 127.02800)
검색어: "교회" · 후보 43건 중 종교시설 40건 (가까운 5건 표시)

1. 강남성서침례교회  (교회 · 기독교)
   서울 서초구 강남대로55길 9-11
   약 313m
   전화 02-3474-3609
   지도 https://place.map.kakao.com/85095074

예배·미사·법회 시간은 이 데이터에 없다. 각 홈페이지나 전화로 확인할 것.
```

`--json`은 `query`, `anchor`, `scanned`(후보 수), `matched`(종교시설 수), `items[]` 구조로 출력합니다.

## 한계

- **예배·미사·법회 시간은 제공하지 않습니다.** 이 데이터에 없습니다.
  카카오맵 장소 페이지나 전화로 안내하고 추정하지 않습니다.
- **외부 홈페이지 URL이 없습니다.** Kakao Local API가 제공하지 않는 필드라
  `homepage`는 항상 null이고, 대신 카카오맵 장소 링크(`place_url`)를 줍니다.
- **교단·종파 소속 정보가 없습니다.** 이름에서 추론하면 부정확하므로 하지 않습니다.
- **시·군 단위 입력**은 기준점이 그 안의 특정 장소로 잡혀 절대 거리가 대략치가 됩니다.
  동·역 단위에서 가장 정확합니다.

## 실패 모드

| 상황 | 대응 |
| --- | --- |
| 검색 결과 없음 | 상위 행정구역으로 넓혀 재시도 |
| 지정 종류 0건 | `--type 전체`로 넓히거나, `--radius`를 걸었다면 해제 |
| 프록시 503 `upstream_not_configured` | 프록시에 `KAKAO_REST_API_KEY` 없음. 운영자에게 요청 |
| 프록시 503 (Kakao 401/403 변환) | 키 revoke·쿼터 초과 신호. 잠시 후 재시도, 계속되면 운영자에게 보고 |
| 프록시 5xx·타임아웃 | 재시도 후 계속 실패하면 그대로 보고 |
| 기준점 해석 실패 | 거리 없이 결과 목록만 제공 (stderr에 사유 표시) |

## 다루지 않는 것

- 종교나 교단의 우열을 평가하거나 이단 여부를 판별하지 않습니다.
- 특정 시설이나 교단을 권유하지 않습니다. 거리와 공개 정보만 근거로 나열합니다.
- 등록·연락·방문 예약 같은 액션을 대신 수행하지 않습니다.
- 사용자가 제공한 위치 텍스트만 사용하고 위치를 자동으로 알아내지 않습니다.
