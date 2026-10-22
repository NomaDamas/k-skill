---
title: 헤이유미 맛집 검색·식당 예약 가이드
description: API 키 없이 구글 로그인만으로 헤이유미 공식 MCP 서버에 연결해 한국 식당을 검색하고 예약 요청을 보내 사장님 확정까지 확인하는 방법
---

# 헤이유미 맛집 검색·식당 예약 가이드

## 이 기능으로 할 수 있는 일

- 동네 이름(`홍제동`)을 지역 코드·좌표로 풀고 주변 맛집·카페·바 검색 (`/regions`, `/places`, `/places/nearby`)
- 예약 가능 매장만, 영업 시각, 분위기, 주차, 채식, 외국어 응대 같은 조건 검색
- 신뢰도(`confidence`)·활동 최신성(`freshnessScore`)과 함께 후보 정리
- **식당 예약 요청**: 사용자 승인(`clarify`) 후 전송, 사장님이 수락/거절/무응답(약 5분)할 때까지 확인
- **실시간 문의**: 지금 메뉴 재고, 웨이팅, N명 즉시 착석 가능 여부를 사장님에게 확인

선결제는 없다. 예약자는 카카오톡/SMS로 진행 상황을 받는다.

## 인증: 구글 로그인(키 불필요)

헤이유미는 구글 로그인을 **MCP 서버(`https://mcp.heyyumi.ai/mcp`)** 에 대해서만 문서화한다(REST `api.heyyumi.ai`는 `hmp_` 키 전용). 그래서 이 스킬은 REST가 아니라 MCP Streamable HTTP로 직접 호출한다. k-skill-proxy는 쓰지 않는다. 사용자별 OAuth 토큰은 사용자 머신 밖으로 나가지 않는다.

```bash
npx -y @nomadamas/k-skill@0 exec heyyumi scripts/heyyumi.mjs -- login
```

1. 헬퍼가 `https://heyyumi.ai/.well-known/oauth-authorization-server`를 읽고, 동적 클라이언트 등록(RFC 7591)으로 `client_id`를 받는다. 구글 클라이언트 ID/시크릿은 필요 없다(구글 로그인은 헤이유미 로그인 페이지가 처리).
2. PKCE(S256)와 `resource=https://mcp.heyyumi.ai`가 담긴 로그인 URL을 출력하고 `127.0.0.1` 임시 포트에서 콜백을 기다린다(최대 5분).
3. 사용자가 같은 컴퓨터 브라우저에서 URL을 열어 약관·개인정보처리방침에 동의하고 "Google로 계속하기"로 로그인한다. 처음이면 계정이 자동 생성된다.
4. 토큰이 `~/.config/k-skill/heyyumi-oauth.json`(0600)에 저장되고 만료 시 refresh_token으로 자동 갱신된다. 갱신이 거절되면 `login_required`.

이미 `hmp_` API 키가 있으면 `KSKILL_HEYYUMI_API_KEY`로 넣어도 된다(같은 MCP 서버에 Bearer, 로그인 토큰보다 우선).

**사전 확인한 것**: 인증 서버 discovery, DCR(201), `/oauth/authorize`→헤이유미 로그인 화면(Google로 계속하기 버튼), 인증 없는 MCP 요청의 `401`+`WWW-Authenticate resource_metadata`, MCP 도구 스키마(Smithery 레지스트리, 공식 `hmp-dev/heyyumi-mcp` README).
**검증하지 못한 것**: 실제 구글 계정으로 로그인해 받은 토큰으로 `tools/call`을 성공시키는 단계는 사용자 로그인이 필요해 실행하지 못했다. 도구 응답 JSON의 정확한 모양(`structuredContent` 여부 등)은 스키마와 mock 기준이다.

## 호출 예

```bash
H="npx -y @nomadamas/k-skill@0 exec heyyumi scripts/heyyumi.mjs --"
$H login
$H regions --dong 홍제동 --sigungu 서대문구
$H search --keyword 파스타 --reservable true --open-at "2026-12-01T19:00" --region-code 1141011100
$H search --keyword 카페 --region-code 1141011100 --filter wifi=true --filter pet_friendly=true
$H place 1726507251 --fields core,contact_hours,quality

# 전송 없이 미리보기 (--confirm 없음)
$H reserve --place-id 1726507251 --time 2026-12-01T19:00:00+09:00 --guests 2 --phone 010-1234-5678 --name 홍길동
# 사용자 승인(clarify) 후에만 실제 전송
$H reserve --place-id 1726507251 --time 2026-12-01T19:00:00+09:00 --guests 2 --phone 010-1234-5678 --name 홍길동 --confirm
$H reservation-status <reservationId> --wait
```

외국 번호(`+82`·`010` 이외)로 예약하면 `--email`이 필요하다. 문자 대신 이메일로 결과가 간다.

## 안전 규칙

- `reserve`, `live-ask`는 `--confirm`이 없으면 네트워크 요청 없이 `preview`만 출력한다. 사장님 푸시와 손님 문자는 되돌릴 수 없으므로 에이전트는 매장·시각·인원·연락처를 `clarify`로 보여 주고 승인받은 뒤에만 `--confirm`을 붙인다.
- 멱등 키는 `placeId|시각|인원|연락처`에서 결정적으로 만든다. 같은 요청을 재시도해도 중복 예약이 생기지 않는다. 샌드박스 모드는 MCP에 없으므로 `--confirm` 호출은 항상 실제 전송이다.
- `status: pending`은 확정이 아니다. `confirmed`/`cancelled`/`expired`가 나올 때까지 `--wait`(서버에서 최대 약 25초 블록)를 반복한다.
- `reservation_not_available`, `live_status_not_available`(422)은 재시도하지 않는다. 비파트너 매장은 11:00~21:00 KST에만 요청을 받는다(`reservation_requests_closed`, `retryAfter`).

## 한도·라이선스

- 개인 무료: 하루 약 20회 질문(구글 로그인 MCP). Plus 월 4,900원(약 150회)은 결제 준비 중. 한도를 넘으면 `rate_limited`.
- 개인의 대화형 사용용이다. 앱·서비스에 붙여 사용자에게 제공하는 상업 이용과 대량 수집은 헤이유미 개발자 플랜/별도 라이선스 대상이라 이 스킬로 하지 않는다.

## 실패 모드

`missing_credentials`, `login_required`, `unauthorized`, `rate_limited`, `reservation_not_available`, `live_status_not_available`, `reservation_requests_closed`(+`retryAfter`), `venue_closed_at_requested_time`, `reservation_time_past`, `guest_phone_required`, `guest_email_required`, `venue_not_found`, `upstream_error`. 처리 방법은 `heyyumi/instruction.md`의 Failure modes 표를 따른다.

## 출처

헤이유미(주식회사 하이드미플리즈) 공식 MCP 서버 https://mcp.heyyumi.ai/mcp (소스 https://github.com/hmp-dev/heyyumi-mcp), 개발자 문서 https://heyyumi.ai/developers. 이 스킬은 헤이유미 공식 기능이 아니며 제휴 관계를 주장하지 않는다.
