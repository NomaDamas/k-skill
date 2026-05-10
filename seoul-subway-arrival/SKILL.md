---
name: seoul-subway-arrival
description: Look up Seoul real-time subway arrival information with the official Seoul Open Data API. Use when the user asks when a train arrives, which trains are approaching a station, or how crowded Seoul subway timing looks right now.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: v1
---

# Seoul Subway Arrival

## What this skill does

서울 열린데이터 광장의 실시간 지하철 도착정보 Open API를 `k-skill-proxy` 경유로 조회해 역 기준 도착 예정 열차 정보를 요약한다.

## When to use

- "강남역 지금 몇 분 뒤 도착해?"
- "서울역 1호선 도착 정보 보여줘"
- "잠실역 곧 들어오는 열차 정리해줘"

## Prerequisites

- optional: `jq`
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.)

## Required environment variables

- 없음. `KSKILL_PROXY_BASE_URL` 은 선택 사항이며, 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.

사용자가 개인 서울 열린데이터 광장 OpenAPI key를 직접 발급할 필요는 없다. `/v1/seoul-subway/arrival` route는 기본 hosted proxy에서 호출하고, upstream key는 proxy 서버 쪽에만 보관한다. 별도 proxy를 쓰는 경우에만 `KSKILL_PROXY_BASE_URL` 을 설정한다.

### Proxy resolution order

1. **`KSKILL_PROXY_BASE_URL` 이 있으면** 그 값을 사용한다.
2. **없거나 빈 값이면** 기본 hosted proxy `https://k-skill-proxy.nomadamas.org` 를 사용한다.
3. **직접 proxy를 운영하는 경우에만** proxy 서버 upstream key를 서버 쪽에만 설정한다.

클라이언트/사용자 쪽에서 upstream key를 직접 다루지 않는다.

## Inputs

- 역명
- 선택 사항: 가져올 건수

## Workflow

### 1. Resolve the proxy base URL

`KSKILL_PROXY_BASE_URL` 이 있으면 그 값을 사용하고, 없거나 비어 있으면 기본 hosted proxy `https://k-skill-proxy.nomadamas.org` 를 사용한다.

### 2. Query the official station arrival endpoint

proxy는 서울 실시간 지하철 API key를 서버에서 주입하고, 역명 기준 실시간 도착정보만 공개 read-only endpoint로 노출한다.

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/seoul-subway/arrival" \
  --data-urlencode 'stationName=강남'
```

필요하면 `startIndex`, `endIndex` 로 응답 범위를 조정할 수 있다.

### 3. Summarize the response

가능하면 아래 항목만 먼저 요약한다.

- 호선
- 상/하행 또는 외/내선
- 첫 번째 도착 메시지
- 두 번째 도착 메시지
- 도착 예정 시간(있으면 초 단위)

### 4. Be conservative about live data

실시간 데이터는 몇 초 단위로 바뀔 수 있으므로, 답변에는 조회 시점을 같이 적는다.

## Done when

- 요청 역의 도착 예정 열차가 정리되어 있다
- live data 기준 시점이 명시되어 있다
- upstream key가 클라이언트에 노출되지 않았다

## Failure modes

- proxy upstream key 미설정
- quota 초과
- 역명 표기 불일치

## Notes

- 서울 열린데이터 광장 가이드는 실시간 지하철 Open API에 일일 호출 제한이 있을 수 있다고 안내한다
- proxy 운영/환경변수 설정은 `docs/features/k-skill-proxy.md` 를 참고한다
- endpoint path는 API 버전 변경 가능성이 있으므로 실패 시 dataset console의 최신 샘플 URL을 다시 확인한다
