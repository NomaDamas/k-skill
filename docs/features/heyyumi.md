---
title: 헤이유미 예약 가능한 맛집 검색·식당 예약 가이드
description: 헤이유미 공식 CLI로 예약 가능한 한국 식당·카페를 찾고, 승인 후 예약 요청을 보내 매장 수락/거절까지 확인하는 방법
---

# 헤이유미 예약 가능한 맛집 검색·식당 예약 가이드

## 이 기능으로 할 수 있는 일

- 지역(`을지로`, `홍제동`, 역·랜드마크), 메뉴 이름, 조건(업종, 분위기, 영업 시각, 주차, 채식, 외국어 응대 등)으로 한국 식당·카페·바 검색
- 외국어로 쓴 요리 이름·지명도 알아듣는다(bibimbap, ビビンバ, Myeongdong)
- 예약 요청을 보내고 매장의 수락/거절/만료까지 확인
- "지금 자리 있어요? 웨이팅 몇 분이에요? 이 메뉴 남았어요?" 실시간 문의

선결제는 없다. 요청은 실제 매장으로 간다.

## 공식 CLI 사용

이 스킬은 헤이유미가 공개한 공식 CLI [`heyyumi`](https://github.com/hmp-dev/heyyumi-cli)(npm)를 그대로 호출한다. 별도 헬퍼 코드를 두지 않는다. k-skill-proxy도 쓰지 않으며 호출은 사용자 머신에서 헤이유미 서버로 직접 간다.

```bash
npx -y heyyumi status
npx -y heyyumi login                  # 구글 로그인 (키 필요 없음)
npx -y heyyumi login --no-browser     # 로그인 URL만 출력
npx -y heyyumi guide                  # 서버가 주는 최신 사용 규칙
npx -y heyyumi help
```

검색·예약·답변 규칙은 `guide`가 헤이유미 서버에서 받아 온다. 이 문서에 정책을 따로 적지 않으므로, 헤이유미 쪽 규칙이 바뀌어도 스킬을 고칠 필요가 없다.

## 로그인

1. `login`이 `127.0.0.1` 임시 포트에서 콜백을 기다리며 헤이유미 로그인 페이지를 연다.
2. 사용자가 약관·개인정보처리방침에 동의하고 "Google로 계속하기"로 로그인한다. 처음이면 계정과 이 연결 전용 키가 자동으로 만들어진다.
3. 토큰은 `~/.config/heyyumi/credentials.json`(0600)에 저장되고 만료 시 자동 갱신된다. `logout`으로 지운다.

로그인과 약관 동의는 사용자가 직접 한다. 콜백이 같은 컴퓨터의 `127.0.0.1`로 돌아오므로 원격 서버 셸에서는 쓸 수 없다. 이미 대시보드 키(`hmp_...`)가 있으면 `HEYYUMI_API_KEY`를 설정해 로그인을 건너뛸 수 있다.

## 호출 예 (을지로 힙한 카페)

```bash
npx -y heyyumi search --region 을지로 --subtype coffee --atmosphere trendy --page-size 8
npx -y heyyumi place 324146172

# 아래는 사용자 승인(clarify) 후에만. 실행하는 순간 실제 매장으로 전송된다
npx -y heyyumi guide reserve
npx -y heyyumi reserve 324146172 --time "2026-10-25 19:00" --party 2 --name 홍길동 --phone 010-1234-5678
```

`reserve` 출력의 `cli.next`가 다음에 실행할 명령이다.

## 안전 규칙

- **CLI에는 전송 없는 미리보기가 없다.** `reserve`·`live`를 실행하는 순간이 곧 전송이므로 에이전트는 매장·시각·인원·번호·요청사항을 `clarify`로 보여 주고 승인받은 뒤에만 실행한다.
- 시각은 한국시간이며 `"2026-10-25 19:00"` 형식이다.
- 오타 난 플래그(`--nme`)는 CLI가 거절한다. 이름 없는 예약이 조용히 만들어지지 않는다.
- 같은 요청을 재시도할 때는 `--idempotency-key`를 같은 값으로 준다.
- `npx -y heyyumi@0`처럼 버전 범위를 붙이지 않는다. npx가 처음 받은 사본을 계속 써서 `guide` 같은 새 명령이 안 들어온다.

## 한도·라이선스

- 개인 대화형 사용은 무료이며 하루 질문 한도가 있다. 회사 제품·서비스에 넣는 상업 이용과 대량 수집은 헤이유미 별도 라이선스 대상이다.

## 실패 모드

종료 코드 `3`은 로그인 필요, `2`는 사용법 오류, `1`은 서버/도구 오류다. 오류 JSON의 `error.message`를 사용자에게 전하고 `error.next`를 따른다. 자세한 처리는 `heyyumi/instruction.md`의 Failure modes 표를 따른다.

## 출처

헤이유미(주식회사 하이드미플리즈) 공식 CLI https://github.com/hmp-dev/heyyumi-cli, 개발자 문서 https://heyyumi.ai/developers. 이 스킬은 헤이유미 공식 기능이 아니며 제휴 관계를 주장하지 않는다.
