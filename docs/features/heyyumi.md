---
title: 헤이유미 맛집 검색·식당 예약 가이드
description: 헤이유미 공식 REST API로 한국 식당을 검색하고 예약 요청을 보내 사장님 확정까지 확인하는 방법
---

# 헤이유미 맛집 검색·식당 예약 가이드

## 이 기능으로 할 수 있는 일

- 동네 이름(`홍제동`)을 지역 코드·좌표로 풀고 주변 맛집·카페·바 검색 (`/regions`, `/places`, `/places/nearby`)
- 예약 가능 매장만, 영업 시각, 분위기, 주차, 채식, 외국어 응대 같은 조건 검색
- 신뢰도(`confidence`)·활동 최신성(`freshnessScore`)과 함께 후보 정리
- **식당 예약 요청**: 사용자 승인(`clarify`) 후 전송, 사장님이 수락/거절/무응답(약 5분)할 때까지 확인
- **실시간 문의**: 지금 메뉴 재고, 웨이팅, N명 즉시 착석 가능 여부를 사장님에게 확인

선결제는 없다. 예약자는 카카오톡/SMS로 진행 상황을 받는다.

## 인증

| 방법 | 설정 |
| --- | --- |
| API 키(권장) | https://heyyumi.ai/dashboard 에서 `hmp_` 키를 발급해 `KSKILL_HEYYUMI_API_KEY`로 주입 (`docs/setup.md`) |
| 구글 로그인(OAuth) | `npx -y @nomadamas/k-skill@0 exec heyyumi scripts/heyyumi.mjs -- login` |

`login`은 헤이유미 인증 서버(`https://heyyumi.ai/.well-known/oauth-authorization-server`)에서 동적 클라이언트 등록(RFC 7591) 후 PKCE S256 로컬 loopback 흐름으로 브라우저 로그인을 연다. 구글 클라이언트 ID/시크릿은 필요 없다. 토큰은 `~/.config/k-skill/heyyumi-oauth.json`(0600)에 저장되고 만료 시 refresh된다.

**검증하지 못한 점**: 헤이유미 문서는 OAuth를 MCP 서버(`mcp.heyyumi.ai`) 연결용으로만 설명하고, REST는 `hmp_` 키만 문서화한다. 서버 쪽 `/.well-known`, DCR, `/oauth/authorize`→로그인 리다이렉트는 확인했지만, 실제 구글 로그인을 거친 토큰이 `api.heyyumi.ai`에서 통하는지는 확인하지 못했다. REST가 401이면 API 키 경로를 쓴다.

## 호출 예

```bash
H="npx -y @nomadamas/k-skill@0 exec heyyumi scripts/heyyumi.mjs --"
$H regions --dong 홍제동 --sigungu 서대문구
$H search --keyword 파스타 --reservable true --open-at "2026-12-01T19:00" --region-code 1141011100
$H place 1726507251 --fields core,contact_hours,quality

# 샌드박스: 검증은 실제로, 전송·문자는 없음. 약 8초 뒤 모의 결과
$H reserve --sandbox --place-id 1726507251 --time 2026-12-01T19:00:00+09:00 --guests 2 --phone 010-1234-5678
$H reservation-status <reservationId> --wait 25

# 실제 전송(사용자 승인 후에만). --confirm 없으면 미리보기만 출력한다
$H reserve --place-id 1726507251 --time 2026-12-01T19:00:00+09:00 --guests 2 --phone 010-1234-5678 --name 홍길동 --confirm
```

## 안전 규칙

- `reserve`, `live-ask`는 `--confirm`이 없으면 네트워크 요청 없이 `preview`만 출력한다. 사장님 푸시와 손님 문자는 되돌릴 수 없으므로 에이전트는 매장·시각·인원·연락처를 `clarify`로 보여 주고 승인받은 뒤에만 `--confirm`을 붙인다.
- 멱등 키는 `placeId|시각|인원|연락처`에서 결정적으로 만든다. 같은 요청을 재시도해도 중복 예약이 생기지 않는다.
- `status: pending`은 확정이 아니다. `confirmed`/`cancelled`/`expired`가 나올 때까지 `--wait 25`로 확인한다.
- `reservation_not_available`, `live_status_not_available`(422)은 재시도하지 않는다. 비파트너 매장은 11:00~21:00 KST에만 요청을 받는다(`reservation_requests_closed`, `retryAfter`).

## 과금·한도·라이선스

- 필드 등급별 요청당 과금: `core` 1, `contact_hours`/`quality` 2, `edge` 4, `media` 8 토큰. 기본 필드는 `core,contact_hours`.
- 키별 분당 요청 제한(429 + `Retry-After`), 플랜별 월 한도와 결과창. 전체·대량 수집은 Bulk Export 대상이라 이 스킬로 하지 않는다.
- Open Season 동안 개인의 대화형 사용은 무료. 회사 제품·서비스에 넣는 상업 이용은 헤이유미 별도 라이선스가 필요하다.

## 실패 모드

`missing_credentials`, `unauthorized`(401), `rate_limited`(429), `reservation_not_available`/`live_status_not_available`/`reservation_requests_closed`/`venue_closed_at_requested_time`(422), `not_found`(404), `bad_request`(400), `upstream_error`(5xx). 처리 방법은 `heyyumi/instruction.md`의 Failure modes 표를 따른다.

## 출처

헤이유미(주식회사 하이드미플리즈) 공식 API: https://heyyumi.ai/developers, 스펙 https://heyyumi.ai/openapi.json. 이 스킬은 헤이유미 공식 기능이 아니며 제휴 관계를 주장하지 않는다.
