# k-skill 프록시 서버 가이드

## 이 기능으로 할 수 있는 일

- AirKorea 같은 무료/공공 API key를 서버에만 보관
- `k-skill` 클라이언트는 프록시만 호출
- 캐시, 인증, rate limit, 로깅을 한곳에서 통제

## 기본 구조

```text
client/skill -> k-skill-proxy -> upstream public API
```

현재 기본 엔드포인트는 아래와 같습니다.

- `GET /health`
- `GET /v1/fine-dust/report`
- `GET /v1/korea-weather/forecast`
- `GET /v1/seoul-subway/arrival`
- `GET /v1/han-river/water-level`
- `GET /v1/household-waste/info` (생활쓰레기 배출정보, `DATA_GO_KR_API_KEY`; 쿼리 `pageNo`·`numOfRows` 필수, 값 `1`·`100`)
- `GET /v1/mfds/drug-safety/lookup` (식약처 의약품개요정보 + 안전상비의약품 정보, `DATA_GO_KR_API_KEY`)
- `GET /v1/mfds/food-safety/search` (식약처 부적합 식품 + 식품안전나라 회수 정보, `DATA_GO_KR_API_KEY`, 선택적 `FOODSAFETYKOREA_API_KEY`)
- `GET /v1/korean-stock/search`
- `GET /v1/korean-stock/base-info`
- `GET /v1/korean-stock/trade-info`
- `GET /v1/naver-shopping/search` (네이버 검색 Open API 쇼핑 검색 우선, 키가 없으면 공개 BFF JSON 기반 상품/가격 후보 조회)
- `GET /v1/opinet/around`
- `GET /v1/opinet/detail`
- `GET /v1/neis/school-search` (나이스 학교기본정보, `KEDU_INFO_KEY`)
- `GET /v1/neis/school-meal` (나이스 급식식단정보, `KEDU_INFO_KEY`)
- `GET /B552584/:service/:operation` (허용된 AirKorea route passthrough)

## 권장 환경변수

클라이언트(스킬) 쪽:

- `KSKILL_PROXY_BASE_URL=https://your-proxy.example.com`

프록시 서버 쪽:

- `AIR_KOREA_OPEN_API_KEY=...`
- `KMA_OPEN_API_KEY=...`
- `SEOUL_OPEN_API_KEY=...`
- `HRFCO_OPEN_API_KEY=...`
- `OPINET_API_KEY=...`
- `DATA_GO_KR_API_KEY=...`
- `FOODSAFETYKOREA_API_KEY=...` (선택: 식품안전나라 회수 live 결과, 없으면 sample fallback)
- `KEDU_INFO_KEY=...` (나이스 교육정보 개방 포털 Open API 인증키)
- `KRX_API_KEY=...`
- `NAVER_SEARCH_CLIENT_ID=...`, `NAVER_SEARCH_CLIENT_SECRET=...` (선택: 네이버 검색 Open API 쇼핑 검색)
- `KSKILL_PROXY_PORT=4020`

## 프로덕션 배포 구조

프로덕션 proxy 서버는 개발 repo와 분리된 별도 clone으로 운영한다.

- 배포 디렉토리: `~/.local/share/k-skill-proxy` (main 브랜치 단독 clone)
- PM2 프로세스: `k-skill-proxy`
- Cloudflare Tunnel ingress: `k-skill-proxy.nomadamas.org -> http://localhost:4020`

### 자동 배포 (cron)

`~/.local/share/k-skill-proxy/scripts/auto-update-proxy.sh`가 매시 정각에 실행된다.

```
0 * * * * PATH=/usr/bin:/opt/homebrew/bin:/opt/homebrew/lib/node_modules/.bin:$PATH ~/.local/share/k-skill-proxy/scripts/auto-update-proxy.sh >> /tmp/k-skill-proxy-update.log 2>&1
```

동작 순서:

1. `git fetch origin main`
2. local SHA == remote SHA 이면 종료 (up-to-date)
3. `git pull --ff-only`
4. `package-lock.json` 변경 시 `npm ci`
5. `pm2 restart k-skill-proxy --update-env`

따라서 **main에 merge되어야 프로덕션에 반영**된다. dev 브랜치 변경은 프로덕션에 영향 없음.

로그: `/tmp/k-skill-proxy-update.log`

### 초기 설정 (PM2 + cloudflared)

1. `pm2 start ecosystem.config.cjs`
2. `pm2 save`
3. `pm2 startup` 출력대로 launchd 등록
4. Cloudflare Tunnel ingress 에 `k-skill-proxy.nomadamas.org -> http://localhost:4020` 추가

## 기본 공개 정책

- 이 프록시는 **무료 API만** 붙인다.
- 기본값은 **무인증 공개 endpoint** 다.
- 대신 read-only / allowlisted endpoint / cache / rate limit 을 유지한다.
- 문제가 생기면 그때 인증이나 더 강한 방어를 덧붙인다.

## 사용법

추가 client API 레이어는 불필요합니다. 필요한 쿼리를 그대로 프록시에 넣으면 되고, 프록시가 upstream API key 만 서버에서 주입합니다.

요약 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/fine-dust/report' \
  --data-urlencode 'regionHint=서울 강남구'
```

서울 지하철 도착정보 endpoint:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/seoul-subway/arrival' \
  --data-urlencode 'stationName=강남'
```

한국 날씨 endpoint:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/korea-weather/forecast' \
  --data-urlencode 'lat=37.5665' \
  --data-urlencode 'lon=126.9780'
```

한강 수위 정보 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/han-river/water-level' \
  --data-urlencode 'stationName=한강대교'
```

이 endpoint 는 내부적으로 HRFCO `waterlevel/info.json` 으로 관측소를 찾고, `waterlevel/list/10M/{WLOBSCD}.json` 으로 최신 10분 수위/유량을 가져옵니다.

Opinet 근처 주유소 가격 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/opinet/around' \
  --data-urlencode 'x=313680' \
  --data-urlencode 'y=545015' \
  --data-urlencode 'radius=1500' \
  --data-urlencode 'prodcd=B027'
```

Opinet 주유소 상세 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/opinet/detail' \
  --data-urlencode 'id=A0009905'
```

나이스 학교 검색·급식 endpoint (학교 급식 식단 스킬에서 사용):

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/neis/school-search' \
  --data-urlencode 'educationOffice=서울특별시교육청' \
  --data-urlencode 'schoolName=미래초등학교'
```

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/neis/school-meal' \
  --data-urlencode 'educationOfficeCode=B10' \
  --data-urlencode 'schoolCode=7010123' \
  --data-urlencode 'mealDate=20260410'
```

생활쓰레기 배출정보 endpoint. 쿼리에 **`pageNo`와 `numOfRows`를 반드시 포함**하고, 값은 각각 **`1`**, **`100`**만 허용한다(`page_no` / `num_of_rows` 동일). 누락·다른 값·숫자만이 아닌 문자열이면 **`400`**(upstream 미호출):

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/household-waste/info' \
  --data-urlencode 'cond[SGG_NM::LIKE]=강남구' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'numOfRows=100'
```

의약품 안전 체크 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/mfds/drug-safety/lookup' \
  --data-urlencode 'itemName=타이레놀' \
  --data-urlencode 'itemName=판콜' \
  --data-urlencode 'limit=5'
```

식품 안전 체크 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/mfds/food-safety/search' \
  --data-urlencode 'query=김밥' \
  --data-urlencode 'limit=5'
```


네이버 쇼핑 가격비교 endpoint (`NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET`이 있으면 공식 Search API 우선):

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/naver-shopping/search' \
  --data-urlencode 'q=에어팟 프로 2세대' \
  --data-urlencode 'limit=10'
```

키가 없는 no-key fallback은 `search.shopping.naver.com/search/all` HTML 페이지 대신
`ns-portal.shopping.naver.com/api/v2/shopping-paged-slot?query=<검색어>&source=shp_gui`
공개 JSON path를 사용한다. `page`는 BFF에 전달한 뒤 해당 페이지 카드만 정규화하고, no-key
`price_asc`/`price_dsc`/`review` 정렬은 선택된 BFF 페이지 안에서 로컬 적용한다. BFF에는 날짜
필드가 없어 no-key `date` 요청은 `meta.sort_applied: "unsupported"`로 표시한다.

한국 주식 검색 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/search' \
  --data-urlencode 'q=삼성전자' \
  --data-urlencode 'bas_dd=20260408'
```

한국 주식 기본정보 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/base-info' \
  --data-urlencode 'market=KOSPI' \
  --data-urlencode 'code=005930' \
  --data-urlencode 'bas_dd=20260408'
```


AirKorea passthrough endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty' \
  --data-urlencode 'returnType=json' \
  --data-urlencode 'numOfRows=1' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'stationName=강남구' \
  --data-urlencode 'dataTerm=DAILY' \
  --data-urlencode 'ver=1.4'
```

## 주의할 점

- upstream key는 프록시 서버에서만 관리합니다.
- 한국 주식 route도 사용자에게 `KRX_API_KEY` 를 배포하지 않습니다.
- client 쪽에는 upstream API key를 배포하지 않습니다.
- public hosted route rollout 이 끝나기 전에는 서울 지하철/한국 날씨 예시를 local/self-host URL 로 검증합니다.
- public hosted route rollout 이 끝나기 전에는 한강 수위 route도 local/self-host 또는 배포 확인이 끝난 proxy URL 로 검증합니다.
