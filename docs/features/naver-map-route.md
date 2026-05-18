---
title: 네이버맵 길찾기 가이드
description: 현재위치/캘린더 없이 수동 출발지·목적지 입력으로 네이버맵 길찾기 MVP를 운영하는 방법
---

# 네이버맵 길찾기 가이드

## 이 기능으로 할 수 있는 일

- `/route`, `/이동루트`에서 출발지/목적지 수동 입력 기반 경로 응답
- 기본 mock 모드로 안전한 시뮬레이션 응답
- 명시 활성화 시에만 네이버 live provider 시도
- 키 누락/에러 시 graceful fallback

## MVP 범위

- 포함: 수동 입력 길찾기
- 제외: 현재위치 자동 인식, 캘린더 읽기

## 필요한 환경변수

- `ROUTE_PLANNER_PROVIDER` (기본 `mock`, live 시 `naver`)
- `ROUTE_PLANNER_ENABLE_LIVE_PROVIDER` (`true`일 때만 live 시도)
- `NAVER_MAP_CLIENT_ID` (live 시 필요)
- `NAVER_MAP_CLIENT_SECRET` (live 시 필요)

## 기본 동작 규칙

1. 기본 provider는 mock이다.
2. 아래 3개가 모두 충족될 때만 live를 시도한다.
   - `ROUTE_PLANNER_ENABLE_LIVE_PROVIDER=true`
   - `ROUTE_PLANNER_PROVIDER=naver`
   - 네이버 키 2종 존재
3. 조건 미충족 또는 live 실패 시 mock/fallback 응답을 반환한다.

## 입력 예시

- `/이동루트 출발지=판교역 목적지=강남역`
- `/route destination=강남역`

## 실패 모드

- `missing_key`: 네이버 키 미설정
- `live_disabled`: live 플래그 비활성
- `provider_mismatch`: provider가 `naver`가 아님
- `upstream_error` / `timeout`: 외부 응답 실패

각 실패 모드는 사용자에게 안전한 fallback 응답으로 처리한다.

## 보안 규칙

- secret/token/.env 원문 출력 금지
- API 키 값 로그 출력 금지
- 에러 보고 시 원인 분류만 노출

## 검증 체크리스트

- `/route` 수동 입력 응답 확인
- `/이동루트` 수동 입력 응답 확인
- mock 기본 동작 확인
- live opt-in 게이트 동작 확인
- 키 누락 시 graceful fallback 확인
