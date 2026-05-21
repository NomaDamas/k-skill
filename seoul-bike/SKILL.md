---
name: seoul-bike
description: 서울 따릉이 실시간 대여소의 대여 가능 자전거와 빈 거치대를 좌표 주변 또는 대여소 이름으로 조회한다.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: v1
---

# Seoul Bike (따릉이)

## What this skill does

서울 열린데이터 광장의 따릉이 실시간 대여정보를 `k-skill-proxy` 경유로 조회해 대여 가능 자전거 수와 빈 거치대 수를 요약한다.

## When to use

- "지금 여기서 따릉이 빌릴 수 있어?"
- "광화문 근처 빈 거치대 있어?"
- "강남역 따릉이 대여소에 자전거 몇 대 남았어?"

## Prerequisites

- Python 3 표준 라이브러리만 사용한다.
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.)

## Required environment variables

없음. 사용자가 개인 서울 열린데이터 광장 OpenAPI key를 직접 발급할 필요는 없다. `/v1/seoul-bike/*` routes는 기본 hosted proxy에서 호출하고, upstream key는 proxy 서버 쪽에만 보관한다.

## Single entrypoint

```bash
python3 "$SKILL_DIR/scripts/seoul_bike.py" <subcommand> [args]
```

첫 사용 시 `Bash(python3 *seoul_bike.py:*)` 패턴 한 번만 승인하면 이후 호출은 모두 자동 허용된다.

## Subcommands

| 명령 | 설명 |
|---|---|
| `nearby --lat LAT --lon LON [--radius-m 500] [--limit 10] [--json]` | 좌표 주변 실시간 대여소 조회 |
| `search <키워드> [--limit 10] [--json]` | 대여소 이름에 키워드가 포함된 실시간 상태 검색 |
| `realtime [--start-index 1 --end-index 1000]` | 실시간 대여정보 원문 JSON 페이지 조회 |

## Workflow

### 1. 현재 위치 주변 대여소 조회

```bash
python3 "$SKILL_DIR/scripts/seoul_bike.py" nearby --lat 37.5717 --lon 126.9763 --radius-m 500
```

요약 항목:

- 대여소명
- 대여 가능 자전거 수 (`parkingBikeTotCnt`)
- 빈 거치대 수 (`rackTotCnt - parkingBikeTotCnt`)
- 거리(m)
- 조회 시각(`proxy.requested_at`)

### 2. 대여소 이름 검색

```bash
python3 "$SKILL_DIR/scripts/seoul_bike.py" search "광화문" --limit 5
```

### 3. Proxy endpoints

- `GET /v1/seoul-bike/realtime?startIndex=1&endIndex=1000` → 서울 `bikeList` 실시간 대여정보
- `GET /v1/seoul-bike/stations?startIndex=1&endIndex=1000` → 서울 `tbCycleStationInfo` 대여소 마스터 정보
- `GET /v1/seoul-bike/nearby?lat=37.5717&lon=126.9763&radius_m=500&limit=10` → proxy-side 주변 대여소 필터링

## Done when

- 대여 가능 자전거 수와 빈 거치대 수가 정리되어 있다.
- live data 기준 조회 시각이 명시되어 있다.
- upstream key가 클라이언트에 노출되지 않았다.

## Failure modes

- proxy upstream key 미설정 (`SEOUL_OPEN_API_KEY` 없음)
- 서울 열린데이터 광장 quota 초과
- 실시간 API가 빈 행 또는 일시 오류를 반환
- 좌표가 없거나 반경 안에 대여소가 없음

## Notes

- 실시간 데이터는 계속 변하므로 답변에 조회 시각을 함께 적는다.
- 예약/대여 자동화는 하지 않는다. 조회 전용 스킬이다.
- proxy 운영/환경변수 설정은 `docs/features/k-skill-proxy.md` 를 참고한다.
