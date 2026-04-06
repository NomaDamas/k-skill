# 한국 날씨 조회 가이드

## 이 기능으로 할 수 있는 일

- 한국 기상청 단기예보 조회서비스를 proxy 경유로 호출
- `nx` / `ny` 격자 또는 `lat` / `lon` 기준 단기예보 확인
- 개인 OpenAPI key 없이 `TMP`, `SKY`, `PTY`, `POP` 같은 핵심 날씨 category 요약

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- [보안/시크릿 정책](../security-and-secrets.md) 확인
- self-host 또는 배포 확인이 끝난 proxy base URL: `KSKILL_PROXY_BASE_URL`

## 필요한 환경변수

- `KSKILL_PROXY_BASE_URL` (필수: self-host 또는 배포 확인이 끝난 proxy base URL)

사용자가 공공데이터포털 기상청 단기예보 API key를 직접 발급할 필요는 없다. 대신 `KSKILL_PROXY_BASE_URL` 은 `/v1/korea-weather/forecast` route가 실제로 배포된 proxy 를 가리켜야 한다. upstream `KMA_OPEN_API_KEY` 는 proxy 서버에서만 관리한다.

## 입력값

- 격자 좌표 `nx`, `ny`
- 또는 위도/경도 `lat`, `lon`
- 선택 사항: `baseDate`, `baseTime`, `pageNo`, `numOfRows`

## 기본 흐름

1. `KSKILL_PROXY_BASE_URL` 로 self-host 또는 배포 확인이 끝난 proxy base URL 을 확인한다.
2. `/v1/korea-weather/forecast` 로 한국 기상청 단기예보를 조회한다.
3. `baseDate` / `baseTime` 을 생략하면 proxy 가 KST 기준 최신 발표 시각을 자동으로 선택한다.
4. 응답의 `item[]` 에서 `TMP`, `SKY`, `PTY`, `POP`, `PCP`, `SNO`, `REH`, `WSD` 를 우선 요약한다.

## 예시

위도/경도 기준:

```bash
curl -fsS --get 'https://your-proxy.example.com/v1/korea-weather/forecast' \
  --data-urlencode 'lat=37.5665' \
  --data-urlencode 'lon=126.9780'
```

격자 좌표 기준:

```bash
curl -fsS --get 'https://your-proxy.example.com/v1/korea-weather/forecast' \
  --data-urlencode 'nx=60' \
  --data-urlencode 'ny=127' \
  --data-urlencode 'baseDate=20260405' \
  --data-urlencode 'baseTime=0500'
```

## Category 메모

- `TMP`: 기온(℃)
- `SKY`: 하늘상태
- `PTY`: 강수형태
- `POP`: 강수확률(%)
- `PCP`: 강수량
- `SNO`: 적설
- `REH`: 습도(%)
- `WSD`: 풍속(m/s)

## 주의할 점

- 단기예보는 5km 격자 기반이라 행정구역 경계와 완전히 일치하지 않을 수 있다.
- 발표 시각 직후에는 최신 `baseTime` 이 아직 준비되지 않았을 수 있다. proxy 는 보수적으로 직전 발표 시각을 선택한다.
- public hosted route rollout 이 끝나기 전까지는 `KSKILL_PROXY_BASE_URL` 을 반드시 명시한다.
- self-host proxy 설정은 [k-skill 프록시 서버 가이드](k-skill-proxy.md)를 본다.
