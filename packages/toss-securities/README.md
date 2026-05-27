# toss-securities

`JungHoonGhae/tossinvest-cli` 의 `tossctl` 바이너리를 감싸는 **read-only tossctl wrapper** 입니다. 이 패키지는 설치/로그인/조회 흐름만 정리하고, 거래 mutation 은 공개 API에서 지원하지 않습니다.

## Install

먼저 upstream CLI 를 설치합니다.

중요: `tossctl >= 0.3.6` 사용을 권장합니다. (`quote` 403 / 세션 관련 upstream 이슈 #15 반영 버전)

```bash
brew tap JungHoonGhae/tossinvest-cli
brew install tossctl
tossctl doctor
tossctl auth doctor
tossctl auth login
```

그 다음 배포된 패키지를 설치합니다.

```bash
npm install toss-securities
```

## Supported read-only helpers

- `listAccounts()`
- `getAccountSummary()`
- `getPortfolioPositions()`
- `getPortfolioAllocation()`
- `getQuote(symbol)`
- `getQuoteBatch(symbols)`
- `listOrders()`
- `listCompletedOrders({ market })`
- `listWatchlist()`
- `checkSession()`

모든 helper 는 내부적으로 `tossctl ... --output json` 을 실행하고, `commandName`, `bin`, `args`, `data` 를 반환합니다.

세션 만료 관련:
- `account summary` 등은 만료 시 에러를 던집니다.
- 일부 커맨드(`portfolio positions`, `watchlist list`)는 upstream에서 빈 배열(`[]`)을 반환할 수 있어, 이 패키지는 기본적으로 `auth doctor`를 추가 확인해 만료를 `TossSessionExpiredError`로 승격합니다.
- 필요하면 `verifySessionOnEmpty: false`로 기존 빈 배열 동작을 유지할 수 있습니다.

대응되는 대표 CLI 는 `tossctl account summary --output json`, `tossctl quote get TSLA --output json`, `tossctl watchlist list --output json` 입니다.

## Usage

```js
const {
  getAccountSummary,
  getQuote,
  listWatchlist
} = require("toss-securities");

async function main() {
  const summary = await getAccountSummary({
    configDir: "/Users/me/.config/tossctl"
  });
  const quote = await getQuote("TSLA");
  const watchlist = await listWatchlist();

  console.log(summary.data);
  console.log(quote.data);
  console.log(watchlist.data);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## What is intentionally not supported

- `tossctl order place`
- `tossctl order cancel`
- `tossctl order amend`
- permission grant/revoke

이 패키지는 조회 전용이다. 실거래에 영향을 주는 명령은 upstream safety gate 를 우회하지 않도록 래핑하지 않는다.
