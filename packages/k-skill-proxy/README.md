# k-skill-proxy

`k-skill`용 Fastify 기반 프록시 서버입니다. AirKorea 미세먼지 조회, 기상청 단기예보, 서울 지하철 실시간 도착정보, 한강홍수통제소 수위 정보를 감싸고, 이후 무료/공공 API adapter를 추가하는 베이스로 씁니다.

## 현재 제공 엔드포인트

- `GET /health`
- `GET /v1/fine-dust/report`
- `GET /v1/korea-weather/forecast`
- `GET /v1/seoul-subway/arrival`
- `GET /v1/han-river/water-level`
- `GET /v1/household-waste/info` — 생활쓰레기 배출정보(`DATA_GO_KR_API_KEY`; `pageNo=1`, `numOfRows=100` 필수)
- `GET /v1/parking-lots/search` — 전국주차장정보표준데이터 기반 근처 공영주차장 검색(`DATA_GO_KR_API_KEY`)
- `GET /v1/neis/school-search` — 나이스 학교기본정보(교육청명·학교명 검색)
- `GET /v1/neis/school-meal` — 나이스 급식식단정보(일자별 메뉴)
- `GET /v1/mfds/drug-safety/lookup` — 식약처 의약품개요정보(e약은요) + 안전상비의약품 정보(`DATA_GO_KR_API_KEY`)
- `GET /v1/mfds/food-safety/search` — 식약처 부적합 식품 + 식품안전나라 회수 정보(`DATA_GO_KR_API_KEY`, 선택적 `FOODSAFETYKOREA_API_KEY`)
- `GET /v1/korean-stock/search`
- `GET /v1/korean-stock/base-info`
- `GET /v1/korean-stock/trade-info`
- `GET /v1/naver-shopping/search` — 네이버 검색 Open API 쇼핑 검색 우선, 키가 없으면 네이버 쇼핑 공개 BFF JSON 기반 상품/가격 후보 조회
- `GET /v1/naver-news/search` — 네이버 검색 Open API 뉴스 검색(`news.json`) 기반 최신 뉴스 기사 제목/요약/링크/발행시각 조회(`NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET` 필요)
- `GET /v1/data4library/library-search` — 도서관 정보나루 정보공개 도서관 조회(`DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/book-search` — 도서관 정보나루 도서 검색(`DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/book-detail` — 도서관 정보나루 도서 상세 조회(`DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/libraries-by-book` — 도서 소장 도서관 조회(`DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/book-exists` — 도서관별 도서 소장여부(`DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/lh-notice/search` — LH 청약 공고 목록(`DATA_GO_KR_API_KEY`)
- `GET /v1/lh-notice/detail` — LH 청약 공고 상세(`DATA_GO_KR_API_KEY`)

## `/health` 업스트림 플래그 의미

`/health` 의 `upstreams` 는 각 라우트의 **운영 가능 여부**를 보고하며, 같은 환경변수를 공유하는 라우트라도 **폴백 유무에 따라 의미가 달라진다**:

- `naverShoppingConfigured` — 네이버 쇼핑 라우트는 공개 BFF JSON fallback 이 있어서 **항상 `true`** 다. 키가 없어도 public BFF 경로로 응답이 나간다.
- `naverSearchApiConfigured` — 네이버 검색 Open API 키(`NAVER_SEARCH_CLIENT_ID` + `NAVER_SEARCH_CLIENT_SECRET`) 설정 여부. 네이버 쇼핑 라우트는 이 값이 `true` 면 공식 API 를 선호하고, `false` 면 BFF fallback 으로 자동 전환한다. 즉 이 플래그는 **쇼핑 쪽에서는 advisory** 다.
- `naverNewsApiConfigured` — 네이버 뉴스 라우트의 **운영 가능 여부**. 뉴스에는 fallback 이 없어서 키가 없으면 뉴스 라우트는 `503 upstream_not_configured` 를 돌려준다.

`naverSearchApiConfigured` 와 `naverNewsApiConfigured` 는 같은 환경변수에 의존하므로 현재 boolean 값은 항상 일치하지만, **의미(semantic contract)는 다르다**: 전자는 "공식 키가 있는지" 를, 후자는 "뉴스 라우트가 실제로 응답을 돌려줄 수 있는지" 를 보고한다. 향후 검색 키가 분리되거나 fallback 정책이 바뀌어도 이 두 플래그는 분리된 채 유지된다.

## 환경변수

- `AIR_KOREA_OPEN_API_KEY` — 프록시 서버 쪽 AirKorea upstream key
- `KMA_OPEN_API_KEY` — 프록시 서버 쪽 기상청 단기예보 upstream key
- `SEOUL_OPEN_API_KEY` — 프록시 서버 쪽 서울 열린데이터 광장 upstream key
- `HRFCO_OPEN_API_KEY` — 프록시 서버 쪽 한강홍수통제소 upstream key
- `KEDU_INFO_KEY` — 프록시 서버 쪽 나이스(NEIS) 교육정보 개방 포털 Open API 인증키 (`school-search`, `school-meal`)
- `DATA4LIBRARY_AUTH_KEY` — 프록시 서버 쪽 도서관 정보나루 Open API 인증키 (`data4library/*`)
- `FOODSAFETYKOREA_API_KEY` — 프록시 서버 쪽 식품안전나라 회수정보 live key (`mfds/food-safety/search`; 없으면 sample feed fallback)
- `KRX_API_KEY` — 프록시 서버 쪽 KRX Open API upstream key
- `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET` — 네이버 검색 Open API 키(`shop.json`, `news.json` 공통). 네이버 뉴스 route(`naver-news/search`)는 이 키가 **필수**이며 없으면 `503 upstream_not_configured` 를 돌려준다. 네이버 쇼핑 route(`naver-shopping/search`)는 **선택**이며 설정되면 공식 API 를 우선 사용하고, 없으면 공개 BFF JSON 파서로 fallback 한다. 공식 쇼핑 API 는 `review` 정렬을 지원하지 않아 `meta.sort_applied: "unsupported"`로 표시한다. no-key 쇼핑 fallback 은 `page`를 BFF에 전달해 해당 페이지를 고르고, `price_asc`/`price_dsc`/`review`는 선택 페이지 안에서 로컬 정렬하며, `date`는 `meta.sort_applied: "unsupported"`로 표시
- `KSKILL_PROXY_HOST` — 기본 `127.0.0.1`
- `KSKILL_PROXY_PORT` — 기본 `4020`
- `KSKILL_PROXY_CACHE_TTL_MS` — 기본 `300000`
- `KSKILL_PROXY_RATE_LIMIT_WINDOW_MS` — 기본 `60000`
- `KSKILL_PROXY_RATE_LIMIT_MAX` — 기본 `60`
- `DATA_GO_KR_API_KEY` - 공공데이터포털 에서 쓰이는 API 인증키 (`household-waste`, `parking-lots`, `real-estate`, `mfds-drug-safety`, `mfds-food-safety`, `lh-notice`). 각 서비스는 공공데이터포털에서 별도 "활용신청" 승인이 필요하다. 키를 발급받은 뒤에는 [LH 임대공고문 정보](https://www.data.go.kr/data/15058530/openapi.do) 페이지에서도 활용신청을 눌러 동일 키를 활성화해야 `lh-notice` 라우트가 성공한다. 미활성 상태에서는 upstream이 HTTP 403 Forbidden을 돌려주고 proxy는 `upstream_error`로 변환한다.

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


공영주차장 검색 예시 (`DATA_GO_KR_API_KEY` 필요):

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/parking-lots/search' \
  --data-urlencode 'latitude=37.573713' \
  --data-urlencode 'longitude=126.978338' \
  --data-urlencode 'address_hint=서울특별시 종로구' \
  --data-urlencode 'limit=3' \
  --data-urlencode 'radius=1500'
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


도서관 정보나루 도서 검색 예시 (`DATA4LIBRARY_AUTH_KEY` 필요):

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/data4library/book-search' \
  --data-urlencode 'keyword=역사' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'pageSize=10'
```

도서관 정보나루 상세/소장 확인 예시:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/data4library/book-detail' \
  --data-urlencode 'isbn13=9788971998557' \
  --data-urlencode 'loaninfoYN=Y'

curl -fsS --get 'http://127.0.0.1:4020/v1/data4library/book-exists' \
  --data-urlencode 'libraryCode=111001' \
  --data-urlencode 'isbn13=9788971998557'
```

한국 주식 검색 예시:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/korean-stock/search' \
  --data-urlencode 'q=삼성전자' \
  --data-urlencode 'bas_dd=20260408'
```

LH 청약 공고 목록 예시 (`DATA_GO_KR_API_KEY` 필요):

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/lh-notice/search' \
  --data-urlencode 'panSs=공고중' \
  --data-urlencode 'uppAisTpCd=06' \
  --data-urlencode 'cnpCdNm=부산광역시' \
  --data-urlencode 'pageSize=20'
```

LH 청약 공고 상세:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/lh-notice/detail' \
  --data-urlencode 'panId=2015122300019828' \
  --data-urlencode 'ccrCnntSysDsCd=03' \
  --data-urlencode 'splInfTpCd=051'
```

프록시는 내부적으로 `waterlevel/info.json` 으로 관측소를 해석하고, `waterlevel/list/10M/{WLOBSCD}.json` 으로 최신 수위/유량을 조회합니다. 한국 주식 route는 KRX Open API에 `AUTH_KEY` 헤더를 서버 쪽에서만 주입합니다.


## PM2 실행

루트의 `ecosystem.config.cjs` + `scripts/run-k-skill-proxy.sh` 조합을 사용하면 재부팅 이후에도 같은 환경변수로 다시 올라옵니다.
