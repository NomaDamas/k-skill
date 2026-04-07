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

이 패키지는 CDP 연결용 `playwright-core` 를 함께 설치한다. 별도 Playwright 브라우저 번들을 받지 않고, 사용자가 직접 띄운 기존 Chrome/Chromium 프로필에 연결한다.

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
