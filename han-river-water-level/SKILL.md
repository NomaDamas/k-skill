---
name: han-river-water-level
description: 한강홍수통제소 기반 현재 수위/유량을 관측소명 또는 관측소코드로 조회한다. 기본 경로는 k-skill-proxy의 han-river water-level endpoint다.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# Han River Water Level

## What this skill does

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/han-river/water-level` 로 요청해서 현재 수위와 유량을 요약한다.

## When to use

- "한강대교 지금 수위 어때?"
- "잠수교 유량 알려줘"
- "1018683 관측소 현재 값 보여줘"

## Inputs

- 기본 입력: 관측소명/교량명(`stationName`)
- 대체 입력: 관측소코드(`stationCode`)

## Prerequisites

- optional: `jq`

## Default path

추가 client API 레이어는 불필요하다. 그냥 프록시 서버에 HTTP 요청만 넣으면 된다.

사용자는 별도 HRFCO `ServiceKey` 를 준비할 필요가 없다. upstream key는 proxy 서버에서만 주입한다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 없으면 기본 경로 `https://k-skill-proxy.nomadamas.org` 를 사용한다.

## Example requests

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/han-river/water-level' \
  --data-urlencode 'stationName=한강대교'
```

관측소코드로 바로 조회해도 된다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/han-river/water-level' \
  --data-urlencode 'stationCode=1018683'
```

## Keep the answer compact

응답에는 아래만 먼저 정리한다.

- 관측소명 / 관측소코드
- 관측 시각
- 현재 수위(m)
- 현재 유량(m^3/s)
- 기준 수위(관심/주의/경보/심각) 중 값이 있는 항목

## Ambiguous station names

입력이 너무 넓으면 proxy 는 `ambiguous_station` 과 함께 `candidate_stations` 를 돌려준다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/han-river/water-level' \
  --data-urlencode 'stationName=한강'
```

이때는 후보 중 하나를 골라 다시 `stationName` 또는 `stationCode` 로 조회한다.

## Detailed API paths

구현 세부는 아래 문서만 참고한다.

- `docs/features/han-river-water-level.md`
- `docs/features/k-skill-proxy.md`

## Failure modes

- 관측소명이 너무 넓어서 여러 관측소가 동시에 잡히는 경우
- 잘못된 관측소코드/관측소명으로 station lookup 이 실패하는 경우
- 프록시 서버에 `HRFCO_OPEN_API_KEY` 가 비어 있는 경우
- 실시간 자료 갱신 지연으로 최신 10분 자료가 비어 있는 경우

## Notes

- 기본 경로는 항상 `k-skill-proxy.nomadamas.org` 의 water-level endpoint 다.
- upstream 은 `waterlevel/info.json` 으로 관측소 메타데이터를 찾고, `waterlevel/list/10M/{WLOBSCD}.json` 으로 최신값을 조회한다.
- 결과는 원시자료 기반이므로 조회 시각을 함께 적는다.
