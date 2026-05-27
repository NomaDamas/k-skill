---
name: cheap-gas-nearby
description: Use when the user asks for nearby cheapest gas stations or 근처 가장 싼 주유소. Always ask the user's current location first, then use Kakao Map anchor resolution plus official Opinet fuel-price APIs.
license: MIT
metadata:
  category: transport
  locale: ko-KR
  phase: v1
---

# Cheap Gas Nearby

## What this skill does

현재 위치 기준 가장 가까운 주유소 후보를 찾고 Opinet 공개 API로 유가를 비교해 가장 싼 곳을 추천한다.

## When to use

- "근처 가장 싼 주유소 어디야?"
- "여의도 근처 휘발유 싸게 파는 데"
- "내 위치 기준 가까운 셀프 주유소 추천"

## Mandatory first question

현재 위치를 알려주세요.

## Prerequisites

- 인터넷 연결
- `k-skill-proxy` 의 `/v1/opinet/around` 와 `/v1/opinet/detail` 경유

## Done when

- 사용자 위치 기준 거리순/가격순 주유소 후보를 정리해 응답했다.
