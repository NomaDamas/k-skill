---
name: naver-map-route
description: 네이버맵 길찾기 MVP. 현재위치/캘린더 없이 출발지·목적지 수동 입력으로 경로를 안내한다. 기본은 mock provider, live는 명시 enable일 때만 동작한다.
license: MIT
metadata:
  category: transit
  locale: ko-KR
  phase: mvp1
---

# naver-map-route

네이버맵 길찾기 MVP 스킬.

## When to use

- "출발지/목적지로 길찾기 해줘"
- "/route destination=강남역"
- "/이동루트 출발지=판교역 목적지=강남역"

## MVP 범위

- 현재위치 자동 인식 **미포함**
- 캘린더 연동 **미포함**
- 수동 출발지/목적지 입력만 처리

## Env / 게이트

- `ROUTE_PLANNER_PROVIDER` 기본값은 `mock`
- `ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true` 이고 provider가 `naver`일 때만 live 시도
- `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET` 없으면 즉시 fallback

## 동작 규칙

1. `/route`, `/이동루트` 인자를 동일 규칙으로 파싱한다.
2. 목적지 수동 입력(`destination` 또는 `목적지`)이 있으면 해당 값을 최우선으로 사용한다.
3. live 게이트 조건 미충족이면 mock 경로를 반환한다.
4. live 호출 실패(키 누락, 타임아웃, upstream 에러) 시 mock 또는 안전 안내문으로 fallback 한다.

## 보안 규칙

- secret/token/.env 원문 출력 금지
- API 키 로그 출력 금지
- 실패 로그는 원인 분류만 노출(예: missing_key, timeout, upstream_error)

## Done when

- `/route`, `/이동루트` 모두 수동 입력으로 응답한다.
- 기본 mock 정책이 유지된다.
- live는 명시 enable일 때만 시도된다.
- 키 미설정/에러 시 서비스 중단 없이 fallback 한다.
