# 브라우저 런타임 (k-skill-browser-runtime)

브라우저 세션이 필요한 k-skill 패키지는 `k-skill-browser-runtime`을 기본 런타임으로 쓴다. 이 런타임은 BrowserOS를 먼저 쓰고, Aside Browser가 있으면 Chrome/Chromium CDP보다 먼저 쓰는 브라우저 어댑터다. 사이트별 로직은 각 스킬에 두고 공통 브라우저 연결·stop rule만 담당한다.

## 기본 동작

- **기본 순서**: `auto`는 사용자가 직접 띄운 BrowserOS CDP 세션을 먼저 시도하고, 닿지 않으면 Aside Browser의 공개 `aside repl` 표면을 시도한 뒤, 마지막으로 Chrome/Chromium CDP로 fallback 한다.
- **BrowserOS CDP attach**: 사용자가 직접 띄운 BrowserOS GUI 세션에 CDP로 붙는다. 런타임이 BrowserOS를 launch하거나 headless 플래그를 전달하지 않는다.
- **Aside Browser REPL**: Aside는 문서화된 CLI REPL 표면으로만 사용한다. 비공개 localhost port, daemon auth, undocumented CDP endpoint에 의존하지 않는다.
- **Provider 선택**: `KSKILL_BROWSER_PROVIDER` 로 `auto`(기본), `browseros`, `aside`, `chrome-cdp` 를 고른다. 알 수 없는 provider 이름은 `UNKNOWN_PROVIDER` 에러로 fail-closed 된다.
- **직접 HTTP 우선**: 공개 데이터가 직접 HTTP/RSS/sitemap으로 잡히면 그것을 먼저 쓴다. 브라우저는 로그인된 사용자 세션이 필요하거나 렌더링 의존 화면을 확인해야 할 때만 쓴다.

## 하지 않는 일

- BrowserOS를 launch하거나 headless로 띄우기
- Aside를 launch하거나 비공개 daemon/CDP port에 붙기
- CAPTCHA 우회, 로그인 자동화, 결제/전자서명/되돌릴 수 없는 제출 우회
- stealth scraping, 사용자 프로필/페이지를 임의로 닫기
- 사이트별 navigation/parsing (이것은 각 스킬이 담당)

## Stop rules

런타임은 수동 handoff 경계를 위한 typed stop reason을 노출한다. 브라우저 스킬은 이 경계에 도달하면 멈추고 사용자에게 넘긴다.

- `AUTH_REQUIRED` — 로그인/인증서/보안 모듈 진입
- `CAPTCHA_DETECTED` — 봇 검사/CAPTCHA
- `PAYMENT_REQUIRED` — 결제/인지대/송달료
- `ELECTRONIC_SIGNATURE` — 전자서명
- `IRREVERSIBLE_BOUNDARY` — 최종 제출
- `BLOCKED` — upstream 차단/로그인벽/빈 껍데기 응답
- `UNAVAILABLE` — CDP provider 연결 불가

## 브라우저가 필요한 스킬 작성 가이드

새 브라우저 스킬을 만들 때:

1. **`k-skill-browser-runtime`을 선호한다.** 인라인 CDP/Playwright 로직을 새로 짜지 말고 런타임의 `connect()`/`runJob()`/stop rule을 쓴다.
2. **semver 의존성을 쓴다.** `package.json`의 `dependencies`는 `"k-skill-browser-runtime": "^0.1.0"` 처럼 semver로 고정한다. `workspace:` 프로토콜은 npm publish가 깨지므로 쓰지 않는다.
3. **typed stop rule을 노출한다.** 인증/CAPTCHA/결제/전자서명/되돌릴 수 없는 제출 경계에서 멈추고 수동 handoff로 넘긴다.
4. **사이트별 로직은 스킬 안에 둔다.** navigation, selector, 파싱, fallback 순서는 각 스킬의 `SKILL.md`/패키지 코드에 좁고 명확하게 기록한다.
5. **공개/직접 HTTP를 먼저 쓴다.** 브라우저 없이 잡히는 공개 endpoint는 우선하고, 브라우저는 로그인이 필요한 화면이나 렌더링 의존 화면에만 쓴다.

## 환경변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `KSKILL_BROWSER_PROVIDER` | `auto` | `auto`(BrowserOS → Aside Browser → Chrome CDP), `browseros`, `aside`, `chrome-cdp` |
| `KSKILL_BROWSEROS_CDP_URL` | `http://127.0.0.1:9100` | BrowserOS CDP 엔드포인트 |
| `KSKILL_CHROME_CDP_URL` | `http://127.0.0.1:9222` | Chrome/Chromium CDP 엔드포인트 |
| `KSKILL_ASIDE_COMMAND` | `aside` | Aside CLI 명령 이름 또는 경로 |

## 브라우저가 필요한 패키지

- `hipass-receipt` — 하이패스 로그인 세션에서 사용내역/영수증 조회 (기본 `auto`: BrowserOS → Aside Browser → Chrome CDP)
- `court-auction-notice-search` — 법원경매 직접 HTTP 1차, 브라우저 fallback (BrowserOS/runtime CDP → Aside Browser → Chrome CDP → 로컬 launch)
- `court-payment-order-assistant` — 전자소송 지급명령 로그인 이후 handoff (BrowserOS CDP → 수동)
- `yebigun-training` — 예비군 로그인 세션에서 훈련정보 조회 (기본 `auto`: BrowserOS → Aside Browser → Chrome CDP)

## 이 런타임 밖에 있는 브라우저 스킬

- `d2b-notice-search`, `s2b-notice-search` — CDP에 직접 붙지 않고 에이전트가 실행할 브라우저 자동화 **지시문**을 생성한다. 우선순위는 Aside Browser → 사용자가 띄운 BrowserOS CDP/로컬 브라우저 → 직접 HTTP다.
- `foresttrip-vacancy`, `iros-registry-automation` — Python 스킬이라 Node 런타임(`k-skill-browser-runtime`)을 쓸 수 없다. 자격증명 로그인/보안모듈(TouchEn) 흐름을 위해 각자 소유한 Playwright/Chromium 브라우저를 직접 띄운다.

## 관련 문서

- [공통 설정 가이드](setup.md) — 브라우저 런타임 환경변수 포함
- [새 스킬 추가 가이드](adding-a-skill.md) — 브라우저 스킬 작성 가이드
- [`k-skill-browser-runtime` README](../packages/k-skill-browser-runtime/README.md) — API/stop rule 상세
