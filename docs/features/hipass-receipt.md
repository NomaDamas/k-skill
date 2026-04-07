# 하이패스 영수증 발급 가이드

## 이 기능으로 할 수 있는 일

- 공식 하이패스 홈페이지에서 로그인된 Chrome 세션 재사용
- 사용내역 조회
- 특정 거래의 영수증 팝업/출력 화면 진입
- 세션 만료 감지 후 재로그인 안내

## 먼저 알아둘 점

- 이 기능은 **로그인된 브라우저 세션에서만 동작**한다.
- 하이패스 ID/PW/인증코드 입력을 자동화하지 않는다.
- 공개 페이지 기준으로 세션 타이머는 **20분(`session_time=1200`)** 이고, 세션 연장/종료는 `/comm/sessionCheck.do`, `/comm//sessionout.do` 경로를 사용한다.
- 보호 페이지는 `mgs_type 11/12` 와 `/comm/lginpg.do` 이동으로 세션 종료를 알린다.
- 따라서 쿠키 파일만 오래 보관해 재사용하는 완전 자동 로그인 유지 봇은 v1 범위 밖이다.

## 설치

```bash
npm install hipass-receipt
```

배포 패키지에는 CDP 연결용 `playwright-core` 가 함께 들어 있다. 별도 Playwright 브라우저를 내려받지 않고, 사용자가 직접 연 Chrome/Chromium 세션에 붙는다.

이 레포를 clone 한 유지보수자라면 루트에서 `npm install` 로 workspace 패키지까지 함께 설치해도 된다.

## 로그인 브라우저 준비

전용 Chrome 프로필 + CDP 포트로 브라우저를 띄운다.

```bash
hipass-receipt chrome-command --profile-dir "$HOME/.cache/k-skill/hipass-chrome" --debugging-port 9222
```

그 다음 사용자가 직접 `https://www.hipass.co.kr/comm/lginpg.do` 에 로그인한다.

## 사용내역 조회

```bash
hipass-receipt list \
  --cdp-url http://127.0.0.1:9222 \
  --start-date 2026-04-01 \
  --end-date 2026-04-07 \
  --page-size 30 \
  --encrypted-card-number BASE64_OR_SITE_VALUE
```

내부적으로 다음 흐름을 사용한다.

1. `/usepculr/InitUsePculrTabSearch.do` 진입
2. `hpForm` 에 검색조건 주입
3. `/usepculr/UsePculrTabSearchList.do` 로 submit
4. iframe HTML 파싱 후 정규화 JSON 반환

`--encrypted-card-number` 는 기존 `--ecd-no` 별칭과 같다.

## 영수증 팝업 열기

먼저 `list` 결과에서 원하는 행의 `rowIndex` 를 확인한다.

```bash
hipass-receipt receipt \
  --cdp-url http://127.0.0.1:9222 \
  --start-date 2026-04-01 \
  --end-date 2026-04-07 \
  --row-index 1
```

이 명령은 선택한 행의 `영수증`/`출력` control 을 클릭하고, 팝업이 열리면 URL/title 을 반환한다. 공식 안내 기준으로 사용내역 화면에서는 `영수증선택출력` 또는 `영수증전체출력` 으로 이어진다.

## 세션 만료 처리

다음 신호 중 하나가 보이면 즉시 실패시키고 재로그인을 요구한다.

- `/comm/lginpg.do` redirect
- `mgs_type = 11`
- `mgs_type = 12`
- 권한체크(CommonAuthCheck.jsp) 응답

## 검증 전략

### 자동 검증

- query builder 테스트
- 사용내역 목록 HTML parser 테스트
- 상세/영수증 submit field 보존 테스트
- 로그인/권한체크 페이지 감지 테스트

### 로그인 없이 가능한 smoke

```bash
node packages/hipass-receipt/src/cli.js fixture-demo \
  --fixture packages/hipass-receipt/test/fixtures/usage-history-list.html
```

### 로그인 세션이 필요한 최종 확인

- 실제 계정으로 로그인된 전용 Chrome 프로필 준비
- `hipass-receipt list` 실행
- `hipass-receipt receipt --row-index <n>` 실행
- 세션 만료 후 다시 실행해 재로그인 요구 메시지 확인

## 보안 원칙

- 하이패스 비밀번호를 새 env var나 repo 문서에 추가하지 않는다.
- 로그인은 반드시 사용자가 브라우저 안에서 직접 수행한다.
- 이 기능은 조회/영수증 보조까지만 다루며 장기 무인 자동화는 약속하지 않는다.
