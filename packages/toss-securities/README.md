# toss-securities

토스증권 **조회 전용(read-only)** 클라이언트입니다. 두 경로를 제공합니다.

1. **공식 Open API (권장 / primary)** — 토스증권 공식 Open API(`https://openapi.tossinvest.com`)를 OAuth 2.0 Client Credentials 토큰으로 직접 호출합니다.
2. **tossctl fallback** — 공식 API credentials가 없을 때를 위한 비공식 `JungHoonGhae/tossinvest-cli` 의 `tossctl` **read-only tossctl wrapper** 입니다.

두 경로 모두 조회 전용입니다. 거래 mutation(주문 생성/정정/취소)은 의도적으로 래핑하지 않습니다.

## 1. 공식 Open API (권장)

### Credentials

토스증권 OpenAPI 콘솔에서 클라이언트를 등록해 `client_id` / `client_secret` 을 발급받습니다. 자격 증명은 **사용자 본인의 환경변수**로 두고, helper가 `https://openapi.tossinvest.com` 으로 **직접** 호출합니다. 공유 프록시(k-skill-proxy)로는 절대 라우팅하지 않습니다.

| 환경변수 | 필수 | 설명 |
|---|---|---|
| `TOSSINVEST_CLIENT_ID` | 필수 | 발급받은 client id |
| `TOSSINVEST_CLIENT_SECRET` | 필수 | 발급받은 client secret |
| `TOSSINVEST_ACCOUNT` | 선택 | `X-Tossinvest-Account` 에 쓸 accountSeq. 계좌·자산·주문조회 helper에 필요 |
| `TOSSINVEST_API_BASE_URL` | 선택 | 기본 `https://openapi.tossinvest.com` |

per-call 옵션(`{ clientId, clientSecret, account, baseUrl }`)이 환경변수보다 우선합니다.

### 토큰 흐름

helper들은 내부적으로 `POST /oauth2/token` (Client Credentials, `application/x-www-form-urlencoded`)으로 access token을 발급받아 `Authorization: Bearer {token}` 헤더로 호출합니다. 토큰은 프로세스 전역(in-memory) 캐시에 `client_id::base_url` 키로 보관되며 만료 60초 전에 자동 재발급됩니다. 테스트 등에서 캐시를 비우려면 `clearTokenCache()` 를 호출합니다.

> 보안: `client_secret` 와 access token은 throw되는 에러 메시지/`data`에서 항상 `[REDACTED]` 로 마스킹됩니다. 토큰 캐시는 같은 Node 프로세스 안에서 공유됩니다.

### 시세·종목 helper (토큰만 필요)

- `getOrderbook(symbol)` → `GET /api/v1/orderbook`
- `getPrices(symbols)` → `GET /api/v1/prices` (다건은 콤마로 연결, 최대 200)
- `getTrades(symbol, { count })` → `GET /api/v1/trades`
- `getPriceLimits(symbol)` → `GET /api/v1/price-limits`
- `getCandles(symbol, { interval })` → `GET /api/v1/candles` (`interval` 은 `1m`·`1d`, 필수)
- `getStocks(symbols)` → `GET /api/v1/stocks`
- `getStockWarnings(symbol)` → `GET /api/v1/stocks/{symbol}/warnings`
- `getExchangeRate({ from, to })` → `GET /api/v1/exchange-rate`
- `getMarketCalendarKR({ date })` → `GET /api/v1/market-calendar/KR`
- `getMarketCalendarUS({ date })` → `GET /api/v1/market-calendar/US`

### 계좌·자산·주문조회 helper (토큰 + `X-Tossinvest-Account`)

- `listOfficialAccounts()` → `GET /api/v1/accounts` (accountSeq를 얻는 진입점, 토큰만 필요)
- `getHoldings({ symbol })` → `GET /api/v1/holdings`
- `listOpenOrders()` → `GET /api/v1/orders` (대기중 주문)
- `getOrderDetail(orderId)` → `GET /api/v1/orders/{orderId}`
- `getBuyingPower({ currency })` → `GET /api/v1/buying-power`
- `getSellableQuantity(symbol)` → `GET /api/v1/sellable-quantity`
- `getCommissions()` → `GET /api/v1/commissions`

각 helper는 `{ data, rateLimit: { limit, remaining, reset }, requestId, status }` 를 반환합니다. account 헤더가 필요한 helper에서 account가 없으면 네트워크 호출 전에 `TossCredentialsError` 를 던집니다.

### Rate limit / 에러

- `429` 응답은 `Retry-After` (없으면 `X-RateLimit-Reset`) 만큼 대기 후 지수 백오프(1→2→4초)+jitter로 재시도하며 `maxRetries`(기본 3)에서 멈춥니다.
- `401`(`invalid-token`/`expired-token`)은 토큰을 1회 재발급해 재시도하고, 그래도 실패하면 throw합니다.
- 에러 envelope `{ error: { requestId, code, message, data } }` 는 `TossApiError{ code, message, requestId, httpStatus, data }` 로 변환됩니다. `requestId` 는 본문에 없으면 `X-Request-Id` 헤더에서 가져옵니다.

### 사용 예시

```js
const {
  getPrices,
  getHoldings,
  listOfficialAccounts
} = require("toss-securities");

async function main() {
  // 환경변수 TOSSINVEST_CLIENT_ID / TOSSINVEST_CLIENT_SECRET 필요
  const prices = await getPrices(["005930", "AAPL"]);

  const accounts = await listOfficialAccounts();
  const accountSeq = accounts.data.result[0].accountSeq;

  const holdings = await getHoldings({ account: accountSeq });

  console.log(prices.data);
  console.log(holdings.data);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## 2. tossctl fallback (read-only tossctl wrapper)

공식 API credentials가 없으면 비공식 `tossctl` 경로를 fallback으로 쓸 수 있습니다. 먼저 upstream CLI를 설치합니다.

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

### tossctl read-only helpers

- `listAccounts()`
- `getAccountSummary()` — `tossctl account summary --output json`
- `getPortfolioPositions()`
- `getPortfolioAllocation()`
- `getQuote(symbol)` — `tossctl quote get TSLA --output json`
- `getQuoteBatch(symbols)`
- `listOrders()`
- `listCompletedOrders({ market })`
- `listWatchlist()` — `tossctl watchlist list --output json`
- `checkSession()`

모든 tossctl helper는 내부적으로 `tossctl ... --output json` 을 실행하고 `commandName`, `bin`, `args`, `data` 를 반환합니다. 세션이 만료되면 `TossSessionExpiredError` 로 승격됩니다.

## 지원하지 않는 것 (not supported)

- `tossctl order place` / 공식 API `POST /api/v1/orders` (주문 생성)
- `tossctl order cancel` / 공식 API `POST /api/v1/orders/{orderId}/cancel`
- `tossctl order amend` / 공식 API `POST /api/v1/orders/{orderId}/modify`
- permission grant/revoke

이 패키지는 조회 전용이다. 실거래에 영향을 주는 명령은 공식/비공식 어느 경로에서도 래핑하지 않는다.
