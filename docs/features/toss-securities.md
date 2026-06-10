# 토스증권 조회 가이드

토스증권 조회는 두 경로를 제공한다. **공식 Open API(OAuth2)를 우선** 사용하고, 공식 credentials가 없으면 비공식 `tossctl` 을 fallback으로 쓴다. 두 경로 모두 read-only(조회 전용)이며 실거래 mutation은 포함하지 않는다.

## 이 기능으로 할 수 있는 일

- 공식 API: 계좌 목록 / 보유 주식 조회
- 공식 API: 시세(현재가·호가·체결·상하한가·캔들) / 종목 정보 / 매수 유의사항
- 공식 API: 환율(KRW↔USD) / 장 운영 캘린더(KR·US)
- 공식 API: 대기중 주문 조회 / 주문 상세 / 매수가능금액 / 판매가능수량 / 수수료
- tossctl fallback: 계좌 요약, 포트폴리오 보유 종목 / 자산 비중, 관심종목, 월간 체결 내역

## 1. 공식 Open API (권장)

### 먼저 필요한 것

- 토스증권 OpenAPI 콘솔에서 발급한 `client_id` / `client_secret`
- `node` 18+ (global `fetch`)

자격 증명은 사용자 환경변수로 두고 helper가 `https://openapi.tossinvest.com` 으로 직접 호출한다. 공유 프록시(k-skill-proxy)로 보내지 않는다.

| 환경변수 | 설명 |
|---|---|
| `TOSSINVEST_CLIENT_ID` | client id (필수) |
| `TOSSINVEST_CLIENT_SECRET` | client secret (필수) |
| `TOSSINVEST_ACCOUNT` | accountSeq. 계좌·자산·주문조회에 필요 (선택) |
| `TOSSINVEST_API_BASE_URL` | 기본 `https://openapi.tossinvest.com` (선택) |

### 동작 방식

helper는 `POST /oauth2/token` 으로 Client Credentials access token을 발급받아 `Authorization: Bearer` 로 호출한다. 계좌·자산·주문조회 API는 `X-Tossinvest-Account` 헤더가 추가로 필요하다. `429` 는 `Retry-After` 만큼 대기 후 백오프 재시도하고, `401` 은 토큰을 1회 재발급한다. `client_secret`/토큰은 에러에서 마스킹된다.

### Node.js 예시

```js
const {
  getPrices,
  listOfficialAccounts,
  getHoldings,
  getBuyingPower
} = require("toss-securities");

async function main() {
  const prices = await getPrices(["005930", "AAPL"]);

  const accounts = await listOfficialAccounts();
  const accountSeq = accounts.data.result[0].accountSeq;

  const holdings = await getHoldings({ account: accountSeq });
  const buyingPower = await getBuyingPower({ account: accountSeq, currency: "KRW" });

  console.log(prices.data);
  console.log(holdings.data);
  console.log(buyingPower.data);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## 2. tossctl fallback

이 경로는 `JungHoonGhae/tossinvest-cli` 의 `tossctl` 을 그대로 사용한다. 공식 API credentials가 없을 때 쓴다.

```bash
brew tap JungHoonGhae/tossinvest-cli
brew install tossctl
tossctl doctor
tossctl auth doctor
tossctl auth login
```

로그인이 끝나기 전에는 계좌/포트폴리오 조회를 시도하지 않는다.

지원하는 read-only 명령:

- `tossctl account list --output json`
- `tossctl account summary --output json`
- `tossctl portfolio positions --output json`
- `tossctl portfolio allocation --output json`
- `tossctl quote get TSLA --output json`
- `tossctl quote batch TSLA 005930 VOO --output json`
- `tossctl orders list --output json`
- `tossctl orders completed --market all --output json`
- `tossctl watchlist list --output json`

패키지 wrapper(`getAccountSummary`, `getPortfolioPositions`, `getQuote`, `listCompletedOrders`, `listWatchlist` 등)도 동일하게 동작한다.

## 운영 팁

- 공식 API는 `TOSSINVEST_CLIENT_ID`/`TOSSINVEST_CLIENT_SECRET` 가 있어야 동작하고, 계좌·자산·주문조회는 `X-Tossinvest-Account`(=`TOSSINVEST_ACCOUNT` 또는 `account` 옵션)가 필요하다.
- `005930`, `AAPL`, `TSLA` 같이 심볼을 그대로 넘기면 된다. 공식 `getPrices`/`getStocks` 는 다건 심볼을 콤마로 연결한다.
- 주문 관련 답변은 **조회 결과만** 정리하고, 실거래로 이어지는 행동은 권하지 않는다.
- 민감한 계좌 정보는 꼭 필요한 값만 답한다.

## 주의할 점

- 공식 credentials가 없으면 helper가 `TossCredentialsError` 로 명확히 실패한다.
- `tossctl` 은 비공식 CLI 이므로 웹 내부 API 변경에 영향을 받을 수 있다. 브라우저 세션이 만료되면 `tossctl auth login` 을 다시 해야 할 수 있다.
- 이 레포의 `toss-securities` 패키지는 공식/비공식 모두 read-only 이며, 거래 mutation 명령(주문 생성/정정/취소)은 공개 API에 포함하지 않는다.
