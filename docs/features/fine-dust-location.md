# 사용자 위치 미세먼지 조회 가이드

## 이 기능으로 할 수 있는 일

- 지역명/행정구역 힌트로 측정소 후보 찾기
- 단일 측정소 확정이 어려우면 후보 측정소 목록 반환
- 정확한 측정소명으로 재조회
- PM10, PM2.5, 등급, 조회 시각 요약

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인
- `k-skill-proxy` 또는 에어코리아 OpenAPI key

## 필요한 환경변수

클라이언트 기본값:

- 기본 external proxy URL: `https://k-skill-proxy.nomadamas.org`
- `KSKILL_PROXY_BASE_URL` 는 override 가 필요할 때만 사용

프록시 없이 direct fallback 으로 쓸 때만:

- `AIR_KOREA_OPEN_API_KEY`

### Credential resolution order

1. **이미 환경변수에 있으면** 그대로 사용한다.
2. **에이전트가 자체 secret vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)를 사용 중이면** 거기서 꺼내 환경변수로 주입해도 된다.
3. **`~/.config/k-skill/secrets.env`** (기본 fallback) — plain dotenv 파일, 퍼미션 `0600`.
4. **아무것도 없으면** 유저에게 물어서 2 또는 3에 저장한다.

## 입력값

- 기본: 지역명/행정구역 힌트(`regionHint`)
- 재조회: 정확한 측정소명(`stationName`)

## 기본 흐름

1. `KSKILL_PROXY_BASE_URL` 가 있으면 먼저 `k-skill-proxy` 의 `/v1/fine-dust/report` endpoint 를 호출합니다.
2. `regionHint` 가 들어오면 프록시는 먼저 시도명을 추출하고, `getCtprvnRltmMesureDnsty` 로 해당 시도 측정소 목록을 확보합니다.
3. region token 이 시도 내 실제 측정소명과 **유일하게** 대응하면 그 측정소로 `getMsrstnAcctoRltmMesureDnsty` 를 호출합니다.
4. 단일 측정소 확정이 어려우면 `ambiguous_location` 과 `candidate_stations` 를 반환합니다.
5. 클라이언트/사용자는 후보 중 정확한 측정소명으로 다시 `/v1/fine-dust/report?stationName=...` 를 호출합니다.
6. PM10, PM2.5, 등급, 조회 시점/조회 시각을 함께 요약합니다.

프록시 예시:

```bash
npx -y @nomadamas/k-skill@0 exec fine-dust-location scripts/fine_dust.py -- report --region-hint "서울 강남구" --json
```

후보 반환 예시:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/fine-dust/report' \
  --data-urlencode 'regionHint=광주 광산구'
```

정확한 측정소명 재조회:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/fine-dust/report' \
  --data-urlencode 'stationName=우산동(광주)'
```

원본 AirKorea endpoint 형태를 거의 그대로 쓰고 싶으면 passthrough endpoint 도 사용할 수 있습니다. 별도 client API 는 불필요하고, 프록시가 `serviceKey` 만 서버에서 주입합니다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty' \
  --data-urlencode 'returnType=json' \
  --data-urlencode 'numOfRows=1' \
  --data-urlencode 'pageNo=1' \
  --data-urlencode 'stationName=강남구' \
  --data-urlencode 'dataTerm=DAILY' \
  --data-urlencode 'ver=1.4'
```

## 예시

지역 기반 direct fallback:

```bash
curl -sG "http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList" \
  --data-urlencode "serviceKey=${AIR_KOREA_OPEN_API_KEY}" \
  --data-urlencode "returnType=json" \
  --data-urlencode "numOfRows=50" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "addr=서울 강남구"
```

실시간 측정값:

```bash
curl -sG "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty" \
  --data-urlencode "serviceKey=${AIR_KOREA_OPEN_API_KEY}" \
  --data-urlencode "returnType=json" \
  --data-urlencode "numOfRows=100" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "stationName=중구" \
  --data-urlencode "dataTerm=DAILY" \
  --data-urlencode "ver=1.4"
```

helper script 반복 검증:

```bash
npx -y @nomadamas/k-skill@0 exec fine-dust-location scripts/fine_dust.py -- report \
  --station-file scripts/fixtures/fine-dust-stations.json \
  --measurement-file scripts/fixtures/fine-dust-measurements.json \
  --region-hint "서울 강남구"
```

## fallback / 대체 흐름

- 지역명/행정구역을 먼저 받습니다
- 단일 측정소를 확정하지 못하면 후보 측정소 목록을 돌려줍니다
- 사용자는 후보 중 하나를 선택해 `stationName` 으로 다시 조회합니다
- 측정소 목록 API가 403 이어도 `getCtprvnRltmMesureDnsty` 와 측정소별 실측 API 조합으로 우회합니다

## 오류 분류

- AirKorea 가 403 을 돌려주고 fallback 으로도 우회하지 못하면(활용신청 미승인, 서비스키 오류, 미등록 도메인/IP 등 운영 조치가 필요한 원인)
  프록시는 이를 `upstream_forbidden` (HTTP 403) 으로 분류합니다. 일시적 장애가 아니므로 generic 500/502 로 뭉개지 않고
  운영 로그에 error 레벨로 남깁니다.
- 반대로 429 는 `upstream_rate_limited` (HTTP 429, `Retry-After`), 네트워크/타임아웃 실패는 `upstream_fetch_failed` (HTTP 502), 그 외 일시적 upstream 5xx 응답은 generic 500 (`proxy_error`, warn) 으로 구분합니다.

## 주의할 점

- 실시간 수치라 조회 시각을 같이 적어야 합니다
- PM10/PM2.5 값이 `-` 이거나 비정상이면 등급도 함께 재확인합니다
- API 가 `khaiGrade` 를 비워 보내면 통합대기등급은 `정보없음` 으로 표시합니다
- regionHint 는 자연어이므로 단일 측정소가 안 잡히는 경우가 자주 있습니다
- hosted 모드에서는 upstream AirKorea key 를 클라이언트에 배포하지 않고 proxy 에만 둡니다
