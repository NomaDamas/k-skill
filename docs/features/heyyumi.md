---
title: 헤이유미 예약 가능한 맛집 검색·식당 예약 가이드
description: 헤이유미 공식 CLI로 예약 가능한 한국 식당·카페를 찾고, 승인 후 예약 요청을 보내 사장님 수락/거절까지 확인하는 방법
---

# 헤이유미 예약 가능한 맛집 검색·식당 예약 가이드

## 이 기능으로 할 수 있는 일

- 지역(`을지로`, `홍제동`, 역·랜드마크)과 조건(업종, 분위기, 영업 시각, 주차, 채식, 외국어 등)으로 한국 식당·카페·바 검색
- **예약 가능한 매장만 골라 보기**(`--reservation_channel yumi`) 후 예약 요청 전송
- 사장님의 수락/거절/무응답(약 5분)까지 확인해 `confirmed` / `cancelled` / `expired`로 보고
- "지금 자리 있어요? 웨이팅 몇 분이에요? 이 메뉴 남았어요?" 실시간 문의 (파트너 매장)

선결제는 없다. 요청은 실제 매장으로 간다.

## 공식 CLI 사용

이 스킬은 헤이유미가 공개한 공식 CLI [`heyyumi`](https://github.com/hmp-dev/heyyumi-cli)(npm)를 그대로 호출한다. 별도 헬퍼 코드를 두지 않는다. k-skill-proxy도 쓰지 않으며 호출은 사용자 머신에서 헤이유미 서버(`mcp.heyyumi.ai`)로 직접 간다.

```bash
npx -y heyyumi@0 status
npx -y heyyumi@0 login                  # 구글 로그인 (키 필요 없음)
npx -y heyyumi@0 login --no-browser     # 로그인 URL만 출력
npx -y heyyumi@0 help
```

## 로그인

1. `login`이 `127.0.0.1` 임시 포트에서 콜백을 기다리며 헤이유미 로그인 페이지(`heyyumi.ai/oauth/authorize`, PKCE S256)를 연다.
2. 사용자가 약관·개인정보처리방침에 동의하고 "Google로 계속하기"로 로그인한다. 처음이면 계정과 이 연결 전용 키가 자동 생성되어 사용자별로 한도가 계산된다.
3. 토큰은 `~/.config/heyyumi/credentials.json`(0600)에 저장되고 만료 시 자동 갱신된다(갱신 중복은 파일 잠금으로 막는다). `logout`으로 지운다.

로그인과 약관 동의는 사용자가 직접 한다. 콜백이 같은 컴퓨터의 `127.0.0.1`로 돌아오므로 원격 서버 셸에서는 쓸 수 없다. 이미 대시보드 키(`hmp_...`)가 있으면 `HEYYUMI_API_KEY`를 설정해 로그인을 건너뛸 수 있다.

## 호출 예 (을지로 힙한 카페, 예약 가능)

```bash
H="npx -y heyyumi@0"
$H regions 을지로
$H search --region 을지로 --subtype coffee --atmosphere trendy --reservation_channel yumi --page-size 8
$H place 324146172 --fields quality,contact_hours,edge

# 아래는 사용자 승인(clarify) 후에만. 실행하는 순간 실제 매장으로 전송된다
$H reserve 324146172 --time "2026-10-23 19:00" --party 2 --name 홍길동 --phone 010-1234-5678
$H wait <reservationId>
```

### 예약 가능 판단 (`yumiBooking`)

| 값 | 의미 |
| --- | --- |
| `canRequest:true, partner:true, requestHours:"anytime"` | 파트너 매장. 언제든 요청, 빠른 응답, 실시간 문의 가능 |
| `canRequest:true, partner:null, requestHours:"11:00-21:00 KST"` | 비파트너. 매일 11:00~21:00 KST에만 요청 접수 |
| `canRequest:false` / 없음 | 이 CLI로는 요청 불가. 전화·외부 예약 안내 |

외국 번호로 예약하려면 `--email`이 필요하다(문자 대신 이메일로 결과를 보낸다).

## 안전 규칙

- **CLI에는 전송 없는 미리보기나 샌드박스가 없다.** `reserve`·`live`를 실행하는 순간이 곧 전송이므로 에이전트는 매장·시각·인원·번호·요청사항을 `clarify`로 보여 주고 승인받은 뒤에만 실행한다.
- 시각은 한국시간이며 `"2026-10-23 19:00"` 형식이다. 날짜 없는 `"19:00"`은 CLI가 거절한다.
- `reserve`가 돌려주는 `pending`/`reservationId`는 확정이 아니다. `wait`로 `confirmed`/`cancelled`/`expired`를 확인한다.
- 오타 난 플래그(`--nme`)는 CLI가 거절한다. 이름 없는 예약이 조용히 만들어지지 않는다.
- 같은 요청을 재시도할 때는 `--idempotency-key`를 같은 값으로 준다.
- `--atmosphere` 같은 선호 조건은 순위만 올리고 걸러내지 않는다(`meta.softenedFilters`). 사용자에게 그렇게 알린다.

## 한도·라이선스

- 개인 대화형 사용은 무료이며 하루 질문 한도가 있다. 회사 제품·서비스에 넣는 상업 이용과 대량 수집은 헤이유미 별도 라이선스 대상이다.

## 실패 모드

종료 코드 `3`(`login_required`, `invalid_api_key`), `2`(`usage`, `unknown_option`), `1`(서버/도구 오류: `reservation_not_available`, `reservation_requests_closed`+`retryAfter`, `venue_closed_at_requested_time`, `reservation_time_past`, `guest_phone_required`, `guest_email_required`, `live_status_not_available`, `partner_scope_required`). 처리 방법은 `heyyumi/instruction.md`의 Failure modes 표를 따른다.

## 출처

헤이유미(주식회사 하이드미플리즈) 공식 CLI https://github.com/hmp-dev/heyyumi-cli, 개발자 문서 https://heyyumi.ai/developers. 이 스킬은 헤이유미 공식 기능이 아니며 제휴 관계를 주장하지 않는다.
