# k-skill-proxy

`k-skill`용 Fastify 기반 프록시 서버입니다. AirKorea 미세먼지 조회, 서울 지하철 실시간 도착정보, 한강홍수통제소 수위 정보를 감싸고, 이후 무료/공공 API adapter를 추가하는 베이스로 씁니다.

## 현재 제공 엔드포인트

- `GET /health`
- `GET /v1/fine-dust/report`
- `GET /v1/seoul-subway/arrival`
- `GET /v1/han-river/water-level`

## 환경변수

- `AIR_KOREA_OPEN_API_KEY` — 프록시 서버 쪽 AirKorea upstream key
- `SEOUL_OPEN_API_KEY` — 프록시 서버 쪽 서울 열린데이터 광장 upstream key
- `HRFCO_OPEN_API_KEY` — 프록시 서버 쪽 한강홍수통제소 upstream key
- `KSKILL_PROXY_HOST` — 기본 `127.0.0.1`
- `KSKILL_PROXY_PORT` — 기본 `4020`
- `KSKILL_PROXY_CACHE_TTL_MS` — 기본 `300000`
- `KSKILL_PROXY_RATE_LIMIT_WINDOW_MS` — 기본 `60000`
- `KSKILL_PROXY_RATE_LIMIT_MAX` — 기본 `60`

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

한강 수위 정보 예시:

```bash
curl -fsS --get 'http://127.0.0.1:4020/v1/han-river/water-level' \
  --data-urlencode 'stationName=한강대교'
```

프록시는 내부적으로 `waterlevel/info.json` 으로 관측소를 해석하고, `waterlevel/list/10M/{WLOBSCD}.json` 으로 최신 수위/유량을 조회합니다.


## PM2 실행

루트의 `ecosystem.config.cjs` + `scripts/run-k-skill-proxy.sh` 조합을 사용하면 재부팅 이후에도 같은 환경변수로 다시 올라옵니다.
