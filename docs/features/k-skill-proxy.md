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
- `GET /v1/seoul-density/citydata` (서울 실시간 도시데이터 핫스팟 혼잡도/추정 인구, `SEOUL_OPEN_API_KEY`)
- `GET /v1/seoul-bike/realtime` (서울 따릉이 실시간 대여정보 `bikeList`, `SEOUL_OPEN_API_KEY`)
- `GET /v1/seoul-bike/stations` (서울 따릉이 대여소 마스터 `tbCycleStationInfo`, `SEOUL_OPEN_API_KEY`)
- `GET /v1/seoul-bike/nearby` (좌표 주변 따릉이 실시간 대여소 필터링, `SEOUL_OPEN_API_KEY`)
- `GET /v1/han-river/water-level`
- `GET /v1/household-waste/info` (생활쓰레기 배출정보, `DATA_GO_KR_API_KEY`; 쿼리 `pageNo`·`numOfRows` 필수, 값 `1`·`100`)
- `GET /v1/ev-charger/info` (전기차 충전소 정보, `DATA_GO_KR_API_KEY`, 데이터셋 `15076352` 별도 활용신청)
- `GET /v1/ev-charger/status` (전기차 충전기 상태, `DATA_GO_KR_API_KEY`, 데이터셋 `15076352` 별도 활용신청)
- `GET /v1/building-register/title` (건축물대장 표제부, `DATA_GO_KR_API_KEY`, 데이터셋 `15134735` 별도 활용신청)
- `GET /v1/keris-academic/search` (KERIS RISS 학술 메타데이터 검색, `KSKILL_RISS_API_KEY`, compatibility `RISS_API_KEY`, XML upstream)
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
- `GET /v1/data4library/library-search` (도서관 정보나루 정보공개 도서관 조회, `DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/book-search` (도서관 정보나루 도서 검색, `DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/book-detail` (도서관 정보나루 도서 상세 조회, `DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/libraries-by-book` (도서 소장 도서관 조회, `DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/data4library/book-exists` (도서관별 도서 소장여부, `DATA4LIBRARY_AUTH_KEY`)
- `GET /v1/kstartup/business-info` (창업진흥원 K-Startup 통합공고 지원사업 정보, `DATA_GO_KR_API_KEY`)
- `GET /v1/kstartup/announcements` (창업진흥원 K-Startup 지원사업 공고 정보, `DATA_GO_KR_API_KEY`)
- `GET /v1/kstartup/contents` (창업진흥원 K-Startup 창업 콘텐츠 정보, `DATA_GO_KR_API_KEY`)
- `GET /v1/kstartup/statistics` (창업진흥원 K-Startup 통계보고서 정보, `DATA_GO_KR_API_KEY`)
- `GET /v1/kr-whois/domain` (KISA WHOIS `.kr`/`.한국` 도메인 조회, `DATA_GO_KR_API_KEY`)
- `GET /v1/kr-whois/ip` (KISA WHOIS IPv4/IPv6 조회, `DATA_GO_KR_API_KEY`)
- `GET /v1/kr-whois/as` (KISA WHOIS AS 번호 조회, `DATA_GO_KR_API_KEY`)
- `GET /v1/vworld/search` (VWorld 단지명·지번 검색, 호출자 `x-k-skill-vworld-api-key` 헤더 필요)
- `GET /v1/vworld/apartment-prices` (VWorld 공동주택 공시가격 조회, 호출자 `x-k-skill-vworld-api-key` 헤더 필요)
- `GET /B552584/:service/:operation` (허용된 AirKorea route passthrough)

## 권장 환경변수

클라이언트(스킬) 쪽:

- 일반 hosted client는 `KSKILL_PROXY_BASE_URL`을 unset/empty로 비워 두면 hosted `https://k-skill-proxy.nomadamas.org`를 기본값으로 사용합니다.
- `KSKILL_PROXY_BASE_URL=https://your-proxy.example.com`은 self-host 또는 alternate proxy를 명시적으로 쓰는 경우에만 설정하는 override 예시입니다.

프록시 서버 쪽:

- `AIR_KOREA_OPEN_API_KEY=...`
- `KMA_OPEN_API_KEY=...`
- `SEOUL_OPEN_API_KEY=...`
- `HRFCO_OPEN_API_KEY=...`
- `OPINET_API_KEY=...`
- `DATA_GO_KR_API_KEY=...` (WHOIS `15094277`, EV 충전소 `15076352`, 건축물대장 `15134735` 등 route별 공공데이터포털 활용신청 승인 필요)
- `KSKILL_RISS_API_KEY=...` (RISS API 센터 검색 API key; compatibility `RISS_API_KEY`, `DATA_GO_KR_API_KEY`와 별개)
- `FOODSAFETYKOREA_API_KEY=...` (선택: 식품안전나라 회수 live 결과, 없으면 sample fallback)
- `KEDU_INFO_KEY=...` (나이스 교육정보 개방 포털 Open API 인증키)
- `DATA4LIBRARY_AUTH_KEY=...` (도서관 정보나루 Open API 인증키)
- `KRX_API_KEY=...`
- `NAVER_SEARCH_CLIENT_ID=...`, `NAVER_SEARCH_CLIENT_SECRET=...` (선택: 네이버 검색 Open API 쇼핑 검색)
- `KSKILL_PROXY_PORT` (local development only; choose it in your shell)

## 프로덕션 배포 구조

프로덕션 proxy 서버는 **gpu01**에서 운영한다.

- systemd user service: `k-skill-proxy.service`
- tunnel service: `k-skill-proxy-tunnel.service`
- 공개 도메인: `k-skill-proxy.nomadamas.org`
- 자동 배포 스크립트: `scripts/deploy-k-skill-proxy-gpu01.sh`
- 시크릿: gpu01 app directory의 `.env`에서 runtime에 주입

`main` 브랜치에 push/merge되면 gpu01 cron이 `origin/main`을 감지하고 테스트, 백업, 파일 동기화, systemd 재시작, local/public `/health` smoke test를 수행한다. 운영 절차와 rollback 방법은 [`docs/deploy-k-skill-proxy.md`](../deploy-k-skill-proxy.md)에 정리되어 있다.

## 기본 공개 정책

- 이 프록시는 **무료 API만** 붙인다.
- 기본값은 **무인증 공개 endpoint** 다.
- 대신 read-only / allowlisted endpoint / cache / rate limit 을 유지한다.
- 문제가 생기면 그때 인증이나 더 강한 방어를 덧붙인다.

VWorld 두 경로는 Cloudflare Worker와 VWorld 사이의 네트워크 호환 문제를 우회하는 BYOK 예외다. 키는 프록시 환경에 저장하지 않고 호출자가 HTTPS 전용 헤더로 위임한다. 프록시는 키를 고정된 VWorld 두 경로에만 전달하며, 리다이렉트와 쿼리스트링 `key`를 거부한다. 응답은 허용 필드만 새 JSON으로 투영하고 스트리밍 크기를 2 MiB로 제한하며 `private, no-store`로 외부 캐시를 막는다. 단지 검색 성공만 키 원문 대신 SHA-256 범위로 분리된 VWorld 전용 16 MiB 내부 캐시를 사용하고, 공시가격 페이지는 다중 페이지 시점 일관성을 위해 캐시하지 않는다.

## 사용법

일반 경로는 필요한 쿼리를 그대로 프록시에 넣으면 프록시가 upstream API key를 서버에서 주입합니다. VWorld BYOK 경로만 호출자가 `x-k-skill-vworld-api-key` 헤더를 제공합니다.

요약 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/fine-dust/report' \
  --data-urlencode 'regionHint=서울 강남구'
```

서울 지하철 도착정보 endpoint:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-subway/arrival" \
  --data-urlencode 'stationName=강남'
```

서울 실시간 혼잡도 endpoint:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-density/citydata" \
  --data-urlencode 'area=강남역'

# 서울 따릉이 주변 대여소
curl -fsS --get "${BASE}/v1/seoul-bike/nearby" \
  --data-urlencode 'lat=37.5717' \
  --data-urlencode 'lon=126.9763' \
  --data-urlencode 'radius_m=500'
```

한국 날씨 endpoint:

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/korea-weather/forecast" \
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

전기차 충전소 정보·상태 endpoint. `serviceKey`와 `dataType`은 caller가 지정할 수 없고, 서버가 `DATA_GO_KR_API_KEY`와 `dataType=JSON`을 주입한다. `pageNo` 기본값은 1, `numOfRows` 기본값은 10이고 최대 100이다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/ev-charger/info' \
  --data-urlencode 'location=서울 강남구' \
  --data-urlencode 'numOfRows=10'

curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/ev-charger/status' \
  --data-urlencode 'statId=ME000001' \
  --data-urlencode 'limitYn=Y' \
  --data-urlencode 'period=10'
```

공공데이터포털 인증키를 이미 갖고 있어도 데이터셋 `15076352` 활용신청은 별도로 필요하다. 자동승인 대상이지만 활성화 전에는 `502 upstream_forbidden`이 반환된다. `/health`의 `evChargerConfigured`는 서버 키 설정 여부를 나타낸다.

건축물대장 표제부 endpoint. 19자리 `pnu` 또는 `sigunguCd`, `bjdongCd`, `platGbCd`, `bun`, 선택 `ji`를 받는다. `bun`/`ji`는 4자리로 정규화되며 `serviceKey` override는 거부한다. upstream XML 성공 payload만 캐시한다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/building-register/title' \
  --data-urlencode 'pnu=1168010100101230004'
```

PNU의 11번째 자리는 토지구분으로 `1`은 일반 토지, `2`는 산이다. proxy는 이를 건축물대장 API의 `platGbCd=0`, `platGbCd=1`로 각각 변환한다.

데이터셋 `15134735` 활용신청은 별도로 필요하며 자동승인 후에도 활성화 전에는 `502 upstream_forbidden`이 반환될 수 있다. `/health`의 `buildingRegisterConfigured`는 서버 키 설정 여부만 나타낸다.

KERIS/RISS 학술자료 검색:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/keris-academic/search' \
  --data-urlencode 'keyword=인공지능 교육' \
  --data-urlencode 'resourceType=A' \
  --data-urlencode 'page=1' \
  --data-urlencode 'pageSize=10'
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

KOSIS 통계 조회 endpoint (`KOSIS_API_KEY` 필요, caller `apiKey`는 무시하고 서버 쪽 키를 주입):

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/kosis/search' \
  --data-urlencode 'q=1인 가구' \
  --data-urlencode 'limit=3'

curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/kosis/meta' \
  --data-urlencode 'tableId=DT_1JC1501' \
  --data-urlencode 'metaType=ITM'

curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/kosis/data' \
  --data-urlencode 'tableId=DT_1JC1501' \
  --data-urlencode 'prdSe=Y' \
  --data-urlencode 'start=2020' \
  --data-urlencode 'end=2023' \
  --data-urlencode 'objL1=ALL'
```

Kakao Local geocoding endpoint (`KAKAO_REST_API_KEY` 필요, caller `apiKey`는 무시하고 서버 쪽 키를 주입):

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/kakao-local/geocode' \
  --data-urlencode 'q=서울역' \
  --data-urlencode 'limit=1'
```



도서관 정보나루 도서 검색 endpoint (`DATA4LIBRARY_AUTH_KEY` 필요):

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/book-search' \
  --data-urlencode 'keyword=역사' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'pageSize=10'
```

도서 상세/소장 조회 endpoint:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/book-detail' \
  --data-urlencode 'isbn13=9788971998557' \
  --data-urlencode 'loaninfoYN=Y'

curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/libraries-by-book' \
  --data-urlencode 'isbn=9788971998557' \
  --data-urlencode 'region=11'

curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/data4library/book-exists' \
  --data-urlencode 'libraryCode=111001' \
  --data-urlencode 'isbn13=9788971998557'
```

프록시는 caller가 넘긴 `authKey`/`format`을 무시하고 서버 쪽 `DATA4LIBRARY_AUTH_KEY`와 `format=json`을 주입한다.

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
- 도서관 정보나루 route도 사용자에게 `DATA4LIBRARY_AUTH_KEY` 를 배포하지 않습니다.
- self-host proxy 운영자는 동일 route를 local/self-host URL 로도 검증합니다.
