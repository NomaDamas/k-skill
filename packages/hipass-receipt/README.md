# hipass-receipt

`hipass-receipt` 는 공식 하이패스 홈페이지(`https://www.hipass.co.kr`)에서 **사용자가 직접 로그인한 Chrome / Playwright 세션**을 재사용해 사용내역 조회와 영수증 발급 팝업 진입을 돕는 helper 입니다.

## Important scope limits

- 이 패키지는 **logged-in browser session only** 입니다.
- ID/PW/인증코드/OTP 를 자동 입력하지 않습니다.
- 세션이 만료되면 `/comm/lginpg.do` redirect 또는 `mgs_type 11/12` 를 감지하고 재로그인을 요구합니다.
- 장시간 무인 로그인 유지 봇은 지원하지 않습니다.

## Install

```bash
npm install hipass-receipt
```

이 패키지는 [`k-skill-browser-runtime`](../k-skill-browser-runtime) 런타임 어댑터로 브라우저에 연결하고 `playwright-core`를 CDP 클라이언트로 함께 설치한다. 기본 순서는 사용자가 띄운 BrowserOS CDP, Aside Browser REPL, Chrome/Chromium CDP다.

## Browser runtime

`connectToChrome()` / `listUsageHistory()` / `openReceiptPopup()` 는 `k-skill-browser-runtime` 어댑터를 통해 연결한다.

- 기본 provider 는 `auto` 로, BrowserOS CDP(`http://127.0.0.1:9100`) → Aside Browser(`aside repl`) → Chrome CDP(`http://127.0.0.1:9222`) 순서다.
- `KSKILL_BROWSER_PROVIDER=browseros` / `=aside` / `=chrome-cdp` 환경변수 또는 `options.provider` 로 특정 provider 를 고정할 수 있다. `--cdp-url`(`options.cdpUrl`)을 넘기면 그 URL(사용자가 `chrome-command`로 띄운 Chrome 등)에 직접 붙는다. `KSKILL_BROWSEROS_CDP_URL` / `KSKILL_CHROME_CDP_URL` 로 각 CDP URL 을 덮어쓸 수 있고, `KSKILL_ASIDE_COMMAND` 로 Aside CLI 명령을 바꿀 수 있다.
- `options.cdpUrl` 을 넘기면 provider 기본 URL 대신 해당 URL 로 연결한다.
- 정리(cleanup) 시 어댑터는 `browser.disconnect()` 만 호출하고 사용자 브라우저/프로필을 닫지 않는다. BrowserOS 클라이언트는 `disconnect()` 를 노출하며, Playwright CDP Browser 는 `disconnect()` 가 없을 때 런타임이 안전하게 거부(refuse)한다 — 이 경우 로그인된 Chrome 세션은 그대로 유지되며 연결 해제는 프로세스 종료 시 처리된다.
- `buildChromeLaunchCommand()` 는 Chrome 실행 헬퍼로 그대로 유지되며 BrowserOS 런치용이 아니다.

## Start Chrome with a dedicated profile

```bash
hipass-receipt chrome-command --profile-dir "$HOME/.cache/k-skill/hipass-chrome" --debugging-port 9222
```

이 명령이 출력한 Chrome 실행문으로 브라우저를 띄우고, 사용자가 직접 `https://www.hipass.co.kr/comm/lginpg.do` 에 로그인합니다.

## List usage history

```bash
hipass-receipt list \
  --cdp-url http://127.0.0.1:9222 \
  --start-date 2026-04-01 \
  --end-date 2026-04-07 \
  --page-size 30 \
  --encrypted-card-number BASE64_OR_SITE_VALUE
```

내부적으로 `/usepculr/InitUsePculrTabSearch.do` → `hpForm` submit → `/usepculr/UsePculrTabSearchList.do` 흐름을 사용하고, iframe HTML을 정규화된 JSON으로 반환합니다.

`--encrypted-card-number` 는 기존 `--ecd-no` 별칭과 동일하게 동작합니다.

## Open a receipt popup for one row

먼저 `list` 결과에서 `rowIndex` 를 확인한 뒤 같은 검색 조건으로 `receipt` 를 호출합니다.

```bash
hipass-receipt receipt \
  --cdp-url http://127.0.0.1:9222 \
  --start-date 2026-04-01 \
  --end-date 2026-04-07 \
  --row-index 1
```

`receipt` 는 선택한 행 안에서 `영수증`/`출력` 텍스트를 가진 control 을 클릭하고, 팝업이 열리면 URL/title 을 반환합니다.

## Library helpers

- `buildUsageHistoryQuery()`
- `buildReceiptRequest()`
- `buildChromeLaunchCommand()`
- `buildUsageHistorySearchPayload()`
- `detectSessionState()`
- `inspectHipassPage()`
- `parseUsageHistoryList()`
- `findUsageHistoryEntry()`
- `listUsageHistory()`
- `openReceiptPopup()`

## Verification without credentials

fixture 기반 smoke test 는 다음처럼 실행할 수 있습니다.

repo workspace 또는 unpacked tarball/package 디렉터리 안에서는 아래 fixture smoke 를 바로 실행할 수 있습니다.

```bash
node src/cli.js fixture-demo --fixture test/fixtures/usage-history-list.html
```

실서비스 최종 검증은 **로그인된 세션에서 수동 smoke test** 가 필요합니다.
