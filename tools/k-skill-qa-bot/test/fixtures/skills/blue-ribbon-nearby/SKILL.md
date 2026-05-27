---
name: blue-ribbon-nearby
description: Use when the user asks for nearby restaurants or 근처 맛집 and wants 블루리본 picks.
license: MIT
metadata:
  category: food
  locale: ko-KR
  phase: v1
---

# Blue Ribbon Nearby

## What this skill does

블루리본 선정 맛집을 사용자 현재 위치 기준 거리순으로 조회한다.

## When to use

- "근처 맛집 찾아줘"
- "여기 근처 블루리본 맛집 뭐 있어?"

## Mandatory first question

현재 위치를 알려주세요.

## Prerequisites

- 인터넷 연결
- `k-skill-proxy` 의 `/v1/blue-ribbon/nearby` 경유

## Done when

- 거리순 후보를 정리해 응답했다.
