# k-skill 프록시 서버 가이드

## 이 기능으로 할 수 있는 일

- AirKorea 같은 무료/공공 API key를 서버에만 보관
- `k-skill` 클라이언트는 프록시만 호출
- 캐시, 인증, rate limit, 로깅을 한곳에서 통제

## 기본 구조

```text
client/skill -> k-skill-proxy -> upstream public API
```

현재 기본 엔드포인트는 아래 둘입니다.

- `GET /health`
- `GET /v1/fine-dust/report`
- `GET /v1/korea-weather/forecast`
- `GET /v1/seoul-subway/arrival`
- `GET /B552584/:service/:operation` (허용된 AirKorea route passthrough)

## 권장 환경변수

클라이언트(스킬) 쪽:

- `KSKILL_PROXY_BASE_URL=https://your-proxy.example.com`

프록시 서버 쪽:

- `AIR_KOREA_OPEN_API_KEY=...`
- `KMA_OPEN_API_KEY=...`
- `SEOUL_OPEN_API_KEY=...`
- `KSKILL_PROXY_PORT=4020`

## PM2 + cloudflared

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
- client 쪽에는 upstream API key를 배포하지 않습니다.
- public hosted route rollout 이 끝나기 전에는 서울 지하철/한국 날씨 예시를 local/self-host URL 로 검증합니다.
