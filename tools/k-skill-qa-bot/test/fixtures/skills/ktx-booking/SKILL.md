---
name: ktx-booking
description: Search, reserve, inspect, and cancel KTX or Korail tickets in Korea.
license: MIT
metadata:
  category: transport
  locale: ko-KR
  phase: v1
---

# KTX Booking

## What this skill does

Korail 로그인 세션으로 KTX 좌석 조회·예약·확인·취소 흐름을 수행한다.

## When to use

- "5월 20일 서울→부산 KTX 좌석 알려줘"

## Prerequisites

- `KSKILL_KTX_ID`, `KSKILL_KTX_PASSWORD` 사용자 본인 Korail 자격증명 필요

## Done when

- 요청된 작업이 완료되어 예약 번호 또는 확정 정보를 응답했다.
