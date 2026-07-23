# toss-securities — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Resolve credentials in this order: already-injected environment variables, then the host vault, then `~/.config/k-skill/secrets.env` (mode `0600`). If the value is missing, request it through the safest input surface the host provides and store it in the vault or dotenv; never echo it back.
- Perform read operations and reversible preparation that the documented portable workflow supports; hand irreversible account changes to the user on the official surface.

# Toss Securities

## What this skill does

토스증권 **조회 전용(read-only)** 흐름을 실행한다. 두 경로가 있다.

1. **공식 Open API (권장)** — 토스증권 공식 Open API(`https://openapi.tossinvest.com`)를 OAuth 2.0 Client Credentials 토큰으로 호출.
2. **tossctl fallback** — 공식 credentials가 없을 때 `JungHoonGhae/tossinvest-cli` 의 `tossctl` 을 사용.

조회 항목:

- 계좌 목록 / 보유 주식
- 시세(현재가/호가/체결/상하한가/캔들) / 종목 정보 / 매수 유의사항
- 환율 / 장 운영 캘린더(KR·US)
- 대기중 주문 조회 / 주문 상세 / 매수가능금액 / 판매가능수량 / 수수료
- (tossctl fallback) 계좌 요약, 포트폴리오 비중, 관심종목

## When to use

- "토스증권 삼성전자 현재가 확인해줘"
- "내 보유 주식 보여줘"
- "대기중 주문 조회해줘"
- "원달러 환율 알려줘"

## 1. Prefer the official Open API

### Prerequisites

- 토스증권 OpenAPI 콘솔에서 발급한 `client_id` / `client_secret`
- Node.js 18+ (global `fetch`)

자격 증명은 사용자 환경변수로 두고 helper가 토스 서버로 **직접** 호출한다. 공유 프록시로 보내지 않는다.

| 환경변수 | 설명 |
|---|---|
| `TOSSINVEST_CLIENT_ID` | client id (필수) |
| `TOSSINVEST_CLIENT_SECRET` | client secret (필수) |
| `TOSSINVEST_ACCOUNT` | accountSeq. 계좌·자산·주문조회에 필요 (선택) |
| `TOSSINVEST_API_BASE_URL` | 기본 `https://openapi.tossinvest.com` (선택) |

### Workflow

helper는 내부적으로 `POST /oauth2/token` 으로 토큰을 발급(Client Credentials)받아 `Authorization: Bearer` 로 호출한다. 계좌·자산·주문조회 API는 `X-Tossinvest-Account` 헤더가 추가로 필요하다.

```js
const {
  getPrices,
  listOfficialAccounts,
  getHoldings
} = require("toss-securities");

async function main() {
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

- `429` 는 `Retry-After`/`X-RateLimit-Reset` 만큼 대기 후 백오프 재시도한다.
- `401` 은 토큰을 1회 재발급해 재시도한다.
- `client_secret`/토큰은 에러 메시지에서 마스킹된다.

## 2. tossctl fallback

공식 credentials가 없으면 비공식 `tossctl` 을 fallback으로 쓴다.

### Install `tossctl` first when missing

```bash
brew tap JungHoonGhae/tossinvest-cli
brew install tossctl
tossctl doctor
tossctl auth doctor
tossctl auth login
```

로그인 세션이 없으면 먼저 위 흐름을 끝낸다. 다른 비공식 크롤링이나 임의 HTTP 재구현으로 우회하지 않는다.

지원하는 read-only 명령:

- `tossctl account summary --output json`
- `tossctl portfolio positions --output json`
- `tossctl quote get TSLA --output json`
- `tossctl watchlist list --output json`
- `tossctl orders completed --market all --output json`

패키지 wrapper(`getAccountSummary`, `getPortfolioPositions`, `getQuote`, `listWatchlist` 등)도 그대로 쓸 수 있다.

## Answer conservatively

- 계좌번호/민감정보는 꼭 필요한 범위만 노출한다.
- 사용자가 "오늘" 같은 상대 날짜를 말하면 절대 날짜로 풀어 답한다.
- 이 스킬은 조회 전용이다. 실거래 mutation 은 범위 밖이라고 분명히 말한다.

## Done when

- 공식 API credentials(또는 tossctl 로그인) 상태가 확인되었다.
- 요청에 맞는 read-only 호출을 실행했다.
- 결과를 한국어로 짧게 정리했다.

## Failure modes

- 공식 API credentials(`TOSSINVEST_CLIENT_ID`/`SECRET`)가 없으면 `TossCredentialsError` 로 명확히 실패한다.
- 계좌·자산·주문조회 helper에 `X-Tossinvest-Account` 가 없으면 네트워크 호출 전에 실패한다.
- tossctl fallback은 `auth login` 전이면 계좌/포트폴리오 조회가 실패할 수 있다.
- 계좌/주문 정보는 민감하므로 출력 범위를 과도하게 넓히지 않는다.
