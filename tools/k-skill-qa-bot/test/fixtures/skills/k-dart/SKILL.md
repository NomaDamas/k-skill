---
name: k-dart
description: 금융감독원 전자공시시스템(DART) OpenAPI로 공시검색, 기업개황, 재무제표, 주요사항보고서를 조회한다.
license: MIT
metadata:
  category: finance
  locale: ko-KR
  phase: v1
---

# k-dart

## What this skill does

DART OpenAPI를 통해 공시검색·기업개황·재무제표·주요사항을 조회한다.

## When to use

- "삼성전자 최근 공시 보여줘"
- "현대차 2025 사업보고서 조회"

## Prerequisites

- `API_K_DART` 환경변수에 사용자 본인 DART OpenAPI 키 필요
- Node.js 18+

## Done when

- 요청된 공시 데이터를 정리해 응답했다.
