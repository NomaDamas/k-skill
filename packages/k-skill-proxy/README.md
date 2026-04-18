# k-skill-proxy

`k-skill`용 Fastify 기반 프록시 서버입니다. AirKorea 미세먼지 조회, 기상청 단기예보, 서울 지하철 실시간 도착정보, 한강홍수통제소 수위 정보를 감싸고, 이후 무료/공공 API adapter를 추가하는 베이스로 씁니다.

## 현재 제공 엔드포인트

- `GET /health`
- `GET /v1/fine-dust/report`
- `GET /v1/korea-weather/forecast`
- `GET /v1/seoul-subway/arrival`
- `GET /v1/han-river/water-level`
- `GET /v1/household-waste/info` — 생활쓰레기 배출정보(`DATA_GO_KR_API_KEY`; `pageNo=1`, `numOfRows=100` 필수)
- `GET /v1/neis/school-search` — 나이스 학교기본정보(교육청명·학교명 검색)
- `GET /v1/neis/school-meal` — 나이스 급식식단정보(일자별 메뉴)
- `GET /v1/mfds/drug-safety/lookup` — 식약처 의약품개요정보(e약은요) + 안전상비의약품 정보(`DATA_GO_KR_API_KEY`)
- `GET /v1/mfds/food-safety/search` — 식약처 부적합 식품 + 식품안전나라 회수 정보(`DATA_GO_KR_API_KEY`, 선택적 `FOODSAFETYKOREA_API_KEY`)
- `GET /v1/korean-stock/search`
- `GET /v1/korean-stock/base-info`
- `GET /v1/korean-stock/trade-info`
- `GET /v1/naver-shopping/search` — 네이버 검색 Open API 쇼핑 검색 우선, 키가 없으면 네이버 쇼핑 공개 BFF JSON 기반 상품/가격 후보 조회

## 환경변수

- `AIR_KOREA_OPEN_API_KEY` — 프록시 서버 쪽 AirKorea upstream key
- `KMA_OPEN_API_KEY` — 프록시 서버 쪽 기상청 단기예보 upstream key
- `SEOUL_OPEN_API_KEY` — 프록시 서버 쪽 서울 열린데이터 광장 upstream key
- `HRFCO_OPEN_API_KEY` — 프록시 서버 쪽 한강홍수통제소 upstream key
- `KEDU_INFO_KEY` — 프록시 서버 쪽 나이스(NEIS) 교육정보 개방 포털 Open API 인증키 (`school-search`, `school-meal`)
- `FOODSAFETYKOREA_API_KEY` — 프록시 서버 쪽 식품안전나라 회수정보 live key (`mfds/food-safety/search`; 없으면 sample feed fallback)
- `KRX_API_KEY` — 프록시 서버 쪽 KRX Open API upstream key
- `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET` — 선택: 네이버 검색 Open API 쇼핑 검색(`shop.json`) 키. 설정되면 네이버 쇼핑 route가 bot-block 위험이 낮은 공식 API를 우선 사용하고, 없으면 공개 BFF JSON(`ns-portal.shopping.naver.com/api/v2/shopping-paged-slot`) 파서로 fallback. 공식 API는 `review` 정렬을 지원하지 않아 `meta.sort_applied: "unsupported"`로 표시한다. no-key fallback은 `page`를 BFF에 전달해 해당 페이지를 고르고, `price_asc`/`price_dsc`/`review`는 선택 페이지 안에서 로컬 정렬하며, `date`는 `meta.sort_applied: "unsupported"`로 표시
- `KSKILL_PROXY_HOST` — 기본 `127.0.0.1`
- `KSKILL_PROXY_PORT` — 기본 `4020`
- `KSKILL_PROXY_CACHE_TTL_MS` — 기본 `300000`
- `KSKILL_PROXY_RATE_LIMIT_WINDOW_MS` — 기본 `60000`
- `KSKILL_PROXY_RATE_LIMIT_MAX` — 기본 `60`
- `DATA_GO_KR_API_KEY` - 공공데이터포털 에서 쓰이는 API 인증키 (`household-waste`, `real-estate`, `mfds-drug-safety`, `mfds-food-safety`)

기본 정책은 **무료 API 공개 프록시 = 무인증** 이다. 대신 endpoint scope 를 좁게 유지하고, cache + rate limit 으로 남용을 늦춘다.

## 로컬 실행

```bash
node packages/k-skill-proxy/src/server.js
```

환경변수(`AIR_KOREA_OPEN_API_KEY` 등)가 이미 설정되어 있거나 `~/.config/k-skill/secrets.env`를 source한 상태에서 실행한다.

서울 지하철 도착정보 예시:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/seoul-subway/arrival' \
  --data-urlencode 'stationName=강남'
```

한국 날씨 예시:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/korea-weather/forecast' \
  --data-urlencode 'lat=37.5665' \
  --data-urlencode 'lon=126.9780'
```

한강 수위 정보 예시:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/han-river/water-level' \
  --data-urlencode 'stationName=한강대교'
```

나이스 학교 검색·급식 식단 예시 (`KEDU_INFO_KEY` 필요). 급식은 교육청 코드(`ATPT_OFCDC_SC_CODE`)와 학교 코드(`SD_SCHUL_CODE`)가 필요하므로 보통 아래 순서로 호출한다.

학교 검색:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/neis/school-search' \
  --data-urlencode 'educationOffice=서울특별시교육청' \
  --data-urlencode 'schoolName=미래초등학교'
```

급식 식단:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/neis/school-meal' \
  --data-urlencode 'educationOfficeCode=B10' \
  --data-urlencode 'schoolCode=7010123' \
  --data-urlencode 'mealDate=20260410'
```

생활쓰레기 배출정보 예시 (`DATA_GO_KR_API_KEY` 필요). `pageNo`·`numOfRows`는 반드시 `1`·`100`:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/household-waste/info' \
  --data-urlencode 'cond[SGG_NM::LIKE]=강남구' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'numOfRows=100'
```

의약품 안전 체크 예시 (`DATA_GO_KR_API_KEY` 필요):

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/mfds/drug-safety/lookup' \
  --data-urlencode 'itemName=타이레놀' \
  --data-urlencode 'itemName=판콜' \
  --data-urlencode 'limit=5'
```

식품 안전 체크 예시 (`DATA_GO_KR_API_KEY` 필요, `FOODSAFETYKOREA_API_KEY` 없으면 회수 정보는 sample fallback):

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/mfds/food-safety/search' \
  --data-urlencode 'query=김밥' \
  --data-urlencode 'limit=5'
```


네이버 쇼핑 가격비교 예시 (`NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET`이 있으면 공식 Search API를 우선 사용):

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/naver-shopping/search' \
  --data-urlencode 'q=에어팟 프로 2세대' \
  --data-urlencode 'limit=10'
```

한국 주식 검색 예시:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/korean-stock/search' \
  --data-urlencode 'q=삼성전자' \
  --data-urlencode 'bas_dd=20260408'
```

프록시는 내부적으로 `waterlevel/info.json` 으로 관측소를 해석하고, `waterlevel/list/10M/{WLOBSCD}.json` 으로 최신 수위/유량을 조회합니다. 한국 주식 route는 KRX Open API에 `AUTH_KEY` 헤더를 서버 쪽에서만 주입합니다.


## PM2 실행

루트의 `ecosystem.config.cjs` + `scripts/run-k-skill-proxy.sh` 조합을 사용하면 재부팅 이후에도 같은 환경변수로 다시 올라옵니다.
