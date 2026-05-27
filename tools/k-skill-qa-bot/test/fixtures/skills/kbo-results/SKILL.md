---
name: kbo-results
description: Fetch KBO game schedules and results for a specific date with the kbo-game npm package. Use when the user asks for today's KBO games, yesterday's scores, or a date-specific scoreboard.
license: MIT
metadata:
  category: sports
  locale: ko-KR
  phase: v1
---

# KBO Results

## What this skill does

`kbo-game` 패키지로 특정 날짜 KBO 경기 정보를 가져와 경기 일정, 스코어, 상태를 요약한다.

## When to use

- "오늘 KBO 경기 결과 알려줘"
- "어제 한화 경기 스코어 보여줘"
- "2026-04-01 KBO 일정 정리해줘"

## Prerequisites

- Node.js 18+
- `npm install -g kbo-game`

## Done when

- 사용자에게 홈팀/원정팀, 최종 스코어, 경기 상태를 정리해 응답했다.

## Failure modes

- KBO 사이트 변경으로 패키지 응답이 깨질 수 있다.
