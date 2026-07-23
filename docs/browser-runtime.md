# 브라우저 런타임 (k-skill-browser-runtime)

브라우저 세션이 필요한 k-skill은 **돌쇠에서는 내장 CloakBrowser-backed browser tool을 최우선**으로 쓰고, 그 밖의 환경에서는 `k-skill-browser-runtime`을 portable fallback으로 쓴다. 사이트별 로직은 각 스킬에 두고 공통 브라우저 연결·approval/stop rule만 공유한다.

## 기본 동작

- **돌쇠 순서**: 내장 browser tool/CloakBrowser → 사용할 수 없을 때만 portable fallback.
- **portable fallback 순서**: macOS `auto`는 Aside Browser → BrowserOS CDP → Chrome/Chromium CDP다. 다른 플랫폼은 BrowserOS CDP → Aside Browser → Chrome/Chromium CDP 순서를 유지한다.
- **BrowserOS CDP attach**: 사용자가 직접 띄운 BrowserOS GUI 세션에 CDP로 붙는다. 런타임이 BrowserOS를 launch하거나 headless 플래그를 전달하지 않는다.
- **Aside Browser REPL**: Aside는 문서화된 CLI REPL 표면으로만 사용한다. 비공개 localhost port, daemon auth, undocumented CDP endpoint에 의존하지 않는다.
- **Provider 선택**: `KSKILL_BROWSER_PROVIDER` 로 `auto`(기본), `browseros`, `aside`, `chrome-cdp` 를 고른다. 알 수 없는 provider 이름은 `UNKNOWN_PROVIDER` 에러로 fail-closed 된다.
- **직접 HTTP 우선**: 공개 데이터가 직접 HTTP/RSS/sitemap으로 잡히면 그것을 먼저 쓴다. 브라우저는 로그인된 사용자 세션이 필요하거나 렌더링 의존 화면을 확인해야 할 때만 쓴다.

## 공통 경계

- BrowserOS를 launch하거나 headless로 띄우기
- Aside를 launch하거나 비공개 daemon/CDP port에 붙기
- CAPTCHA, 본인인증, 전자서명 우회
- `clarify` 승인 없이 결제, 메시지 전송, 취소, 최종 제출 같은 비가역 외부 효과 실행
- stealth scraping, 사용자 프로필/페이지를 임의로 닫기
- 사이트별 navigation/parsing (이것은 각 스킬이 담당)

## Stop rules

portable runtime은 typed stop reason을 노출한다. 돌쇠에서는 아래처럼 처리한다.

- `AUTH_REQUIRED` — vault capability가 있으면 `vault-run`, 없으면 `request_vault_credential`; 본인인증/인증서만 handoff
- `CAPTCHA_DETECTED` — 봇 검사/CAPTCHA
- `PAYMENT_REQUIRED` — 금액·대상·효과를 `clarify`로 승인받고 지원되는 공식 표면이면 계속 진행
- `ELECTRONIC_SIGNATURE` — 전자서명
- `IRREVERSIBLE_BOUNDARY` — 정확한 payload/effect를 `clarify`로 승인받고 지원되는 공식 표면이면 계속 진행
- `BLOCKED` — upstream 차단/로그인벽/빈 껍데기 응답
- `UNAVAILABLE` — CDP provider 연결 불가

## 브라우저가 필요한 스킬 작성 가이드

새 브라우저 스킬을 만들 때:

1. **돌쇠에서는 CloakBrowser를 우선한다.** 내장 browser tool 또는 `CLOAKBROWSER_PEEK_TOKEN` 신호가 있으면 그 경로를 먼저 쓴다.
2. **그 외에는 `k-skill-browser-runtime`을 선호한다.** 인라인 CDP/Playwright 로직을 새로 짜지 말고 런타임의 `connect()`/`runJob()`/stop rule을 쓴다.
3. **semver 의존성을 쓴다.** `package.json`의 `dependencies`는 `"k-skill-browser-runtime": "^0.1.0"` 처럼 semver로 고정한다. `workspace:` 프로토콜은 npm publish가 깨지므로 쓰지 않는다.
4. **typed stop/continue rule을 노출한다.** CAPTCHA/본인인증/전자서명은 stop, 돌쇠의 vault login과 승인된 payment/submission은 continue로 구분한다.
5. **사이트별 action path를 스킬 안에 둔다.** navigation, selector, 파싱, fallback 순서, 가역적 준비, 비가역 승인 지점을 `SKILL.md`/패키지 코드에 기록한다.
6. **공개/직접 HTTP를 조회에 먼저 쓴다.** 결과를 얻은 뒤 사용자가 실제 액션을 요청했다면 CloakBrowser/공식 브라우저 흐름으로 이어간다.

## 환경변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `KSKILL_BROWSER_PROVIDER` | `auto` | `auto`(macOS: Aside → BrowserOS → Chrome, 기타: BrowserOS → Aside → Chrome), `browseros`, `aside`, `chrome-cdp` |
| `KSKILL_BROWSEROS_CDP_URL` | `http://127.0.0.1:9100` | BrowserOS CDP 엔드포인트 |
| `KSKILL_CHROME_CDP_URL` | `http://127.0.0.1:9222` | Chrome/Chromium CDP 엔드포인트 |
| `KSKILL_ASIDE_COMMAND` | `aside` | Aside CLI 명령 이름 또는 경로 |

## 브라우저가 필요한 패키지

- `hipass-receipt` — 하이패스 로그인 세션에서 사용내역/영수증 조회 (macOS `auto`: Aside → BrowserOS → Chrome, 기타 플랫폼은 BrowserOS 우선)
- `court-auction-notice-search` — 법원경매 직접 HTTP 1차, 플랫폼별 runtime browser fallback 후 로컬 launch
- `court-payment-order-assistant` — 전자소송 지급명령 로그인 이후 handoff (BrowserOS CDP → 수동)
- `yebigun-training` — 예비군 로그인 세션에서 훈련정보 조회 (macOS `auto`: Aside → BrowserOS → Chrome, 기타 플랫폼은 BrowserOS 우선)

## 이 런타임 밖에 있는 브라우저 스킬

- `d2b-notice-search`, `s2b-notice-search` — CDP에 직접 붙지 않고 에이전트가 실행할 브라우저 자동화 **지시문**을 생성한다. 우선순위는 Aside Browser → 사용자가 띄운 BrowserOS CDP/로컬 브라우저 → 직접 HTTP다.
- `foresttrip-vacancy`, `iros-registry-automation` — Python 스킬이라 Node 런타임(`k-skill-browser-runtime`)을 쓸 수 없다. 자격증명 로그인/보안모듈(TouchEn) 흐름을 위해 각자 소유한 Playwright/Chromium 브라우저를 직접 띄운다.

## 관련 문서

- [공통 설정 가이드](setup.md) — 브라우저 런타임 환경변수 포함
- [새 스킬 추가 가이드](adding-a-skill.md) — 브라우저 스킬 작성 가이드
- [`k-skill-browser-runtime` README](../packages/k-skill-browser-runtime/README.md) — API/stop rule 상세
- [돌쇠 런타임 계약](dolshoi-runtime.md) — CloakBrowser 감지와 approval 재개 규칙
