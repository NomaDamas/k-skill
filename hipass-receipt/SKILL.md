---
name: hipass-receipt
description: 공식 하이패스 홈페이지에서 사용자가 직접 로그인한 Chrome 세션을 재사용해 사용내역 조회와 영수증 팝업 진입을 돕는다. 돌쇠에서는 공식 표면을 통한 후속 액션까지 진행한다.
license: MIT
metadata:
  category: transport
  locale: ko-KR
  phase: v1
---

# 하이패스 영수증 발급

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.

## Dolshoi action path

- Use the documented API/CLI path for discovery and read-only account data, then move to the official account surface when the requested outcome requires an account action.
- In Dolshoi, use CloakBrowser or an available `vault-run` capability with vault-backed login and perform reversible export, draft, filter, or configuration steps.
- Immediately before a paid, destructive, externally visible, or otherwise irreversible mutation, call `clarify` with the exact account, target, amount/payload, and effect. After approval, execute and verify the new state.
- Do not invent unsupported trading, payment, or account controls; where the official/installed surface is read-only, report that concrete boundary after completing all supported steps.



## What this skill does

공식 하이패스 홈페이지(`https://www.hipass.co.kr`)에서 **이미 로그인된 브라우저 세션**을 재사용해:

- 사용내역 조회
- 특정 행 선택
- 영수증 팝업/출력 화면 진입
- 세션 만료 감지 후 재로그인 안내

까지를 반자동으로 돕는다.

## Hard limits

- **로그인은 반드시 사용자가 직접 해야 한다.**
- 이 스킬은 **로그인된 세션에서만** 동작한다.
- ID/PW, 인증코드, OTP, 공동인증서 절차를 자동 입력하지 않는다.
- `JSESSIONID` 쿠키만 저장해 장시간 재사용하는 방식은 지원하지 않는다.
- 권장 세션 형태는 **Playwright persistent context** 또는 Chrome `user-data-dir` / remote-debugging 재사용이다.
- **세션이 만료되면 즉시 중단하고 다시 로그인**해야 한다.

## Why this design

현재 공개 페이지 기준으로:

- 로그인 페이지와 메인 페이지에 `session_time=1200` 이 노출된다.
- 세션 연장은 `/comm/sessionCheck.do`
- 세션 종료는 `/comm//sessionout.do`
- 미로그인/세션 종료 보호 응답은 `mgs_type 11/12` 후 `/comm/lginpg.do` 로 이동한다.
- 사용내역 조회는 `/usepculr/InitUsePculrTabSearch.do` → `hpForm` submit → `/usepculr/UsePculrTabSearchList.do` 흐름이다.
- 영수증은 `/usepculr/UsePculrReceiptPrint.do` 팝업 진입으로 이어진다.

즉 v1은 **“로그인된 Chrome 세션 재사용”** 이 가장 현실적이다.

## Prerequisites

- macOS 또는 Chrome 실행 가능한 환경
- `npm install hipass-receipt` 또는 이 레포에서 `npm install` (`playwright-core` 포함)
- Chrome 원격 디버깅 포트 사용 가능
- 사용자가 직접 하이패스 로그인 가능

## Workflow

### 1. 전용 Chrome 프로필로 로그인 브라우저를 띄운다

```bash
hipass-receipt chrome-command --profile-dir "$HOME/.cache/k-skill/hipass-chrome" --debugging-port 9222
```

위 명령이 출력한 Chrome 실행문으로 브라우저를 띄운 뒤, 사용자가 직접 `https://www.hipass.co.kr/comm/lginpg.do` 에 로그인한다.

### 2. 사용내역을 조회한다

```bash
hipass-receipt list \
  --cdp-url http://127.0.0.1:9222 \
  --start-date 2026-04-01 \
  --end-date 2026-04-07 \
  --page-size 30
```

- 카드사/암호화 카드번호를 알고 있으면 `--encrypted-card-number` 등으로 더 좁힐 수 있다.
- `--encrypted-card-number` 는 CLI의 기존 `--ecd-no` 별칭이다.
- 결과 JSON에서 `rowIndex` 를 확인한다.

### 3. 특정 row의 영수증 팝업을 연다

```bash
hipass-receipt receipt \
  --cdp-url http://127.0.0.1:9222 \
  --start-date 2026-04-01 \
  --end-date 2026-04-07 \
  --row-index 1
```

- 선택한 행의 `영수증`/`출력` control 을 클릭한다.
- 팝업이 열리면 URL/title 을 반환한다.

## Response policy

- “로그인 필수”, “세션 만료 시 재로그인 필요”를 항상 명확히 적는다.
- 하이패스 계정 비밀번호를 받아 저장하거나 새 env var를 만들지 않는다.
- 세션이 만료됐으면 즉시 실패시키고 `/comm/lginpg.do` 재로그인만 안내한다.
- v1 범위를 넘어서는 완전 무인 로그인 유지/백그라운드 재인증은 약속하지 않는다.

## Verification

- 자동 검증: fixture 기반 query/parser/session-detection 테스트
- smoke 검증: `hipass-receipt fixture-demo --fixture ...`
- 최종 실서비스 검증: **로그인된 세션으로 수동 smoke test**

## Done when

- 로그인된 세션으로 사용내역 조회가 가능하다.
- 특정 row를 선택해 영수증 팝업 진입을 시도할 수 있다.
- 세션 종료 응답을 감지하면 재로그인을 요구한다.
