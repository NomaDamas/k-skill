# Toss Securities

## What this skill does

토스증권 **공식 Open API 전용 조회(read-only)** 흐름을 실행한다. 토스증권 공식 Open API(`https://openapi.tossinvest.com`)를 OAuth 2.0 Client Credentials 토큰으로 직접 호출한다.

조회 항목:

- 계좌 목록 / 보유 주식
- 시세(현재가/호가/체결/상하한가/캔들) / 종목 정보 / 매수 유의사항
- 환율 / 장 운영 캘린더(KR·US)
- 대기중 주문 조회 / 주문 상세 / 매수가능금액 / 판매가능수량 / 수수료

## When to use

- "토스증권 삼성전자 현재가 확인해줘"
- "내 보유 주식 보여줘"
- "대기중 주문 조회해줘"
- "원달러 환율 알려줘"

## Use only the official Open API

### Prerequisites

- 토스증권 OpenAPI 콘솔에서 발급한 `client_id` / `client_secret`
- Node.js 18+ (global `fetch`)

자격 증명은 사용자 환경변수로 두고 helper가 토스 서버로 **직접** 호출한다. 공유 프록시로 보내지 않는다.

| 환경변수 | 설명 |
|---|---|
| `TOSSINVEST_CLIENT_ID` | client id (필수) |
| `TOSSINVEST_CLIENT_SECRET` | client secret (필수) |
| `TOSSINVEST_ACCOUNT` | accountSeq. 계좌·자산·주문조회에 필요 (선택) |

### Workflow

helper는 내부적으로 `POST /oauth2/token` 으로 토큰을 발급(Client Credentials)받아 `Authorization: Bearer` 로 호출한다. API origin은 `https://openapi.tossinvest.com` 으로 고정되며 다른 host로 변경할 수 없다. 계좌·자산·주문조회 API는 `X-Tossinvest-Account` 헤더가 추가로 필요하다.

```js
const {
  getPrices,
  listOfficialAccounts,
  getHoldings
} = require("toss-investment");

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

## Official-only boundary

- 공식 API credentials가 없으면 `TossCredentialsError` 로 종료하고 필요한 환경변수를 안내한다.
- 공식 API가 제공하지 않는 기능은 지원하지 않는다고 명확히 답한다.
- 비공식 CLI, 로그인 세션 재사용, 크롤링, 임의 HTTP 호출로 우회하지 않는다.

## Answer conservatively

- 계좌번호/민감정보는 꼭 필요한 범위만 노출한다.
- 사용자가 "오늘" 같은 상대 날짜를 말하면 절대 날짜로 풀어 답한다.
- 이 스킬은 조회 전용이다. 실거래 mutation 은 범위 밖이라고 분명히 말한다.

## Done when

- 공식 API credentials 상태가 확인되었다.
- 요청에 맞는 read-only 호출을 실행했다.
- 결과를 한국어로 짧게 정리했다.

## Failure modes

- 공식 API credentials(`TOSSINVEST_CLIENT_ID`/`SECRET`)가 없으면 `TossCredentialsError` 로 명확히 실패한다.
- 계좌·자산·주문조회 helper에 `X-Tossinvest-Account` 가 없으면 네트워크 호출 전에 실패한다.
- 공식 API가 지원하지 않는 요청은 비공식 경로로 우회하지 않고 지원 불가로 종료한다.
- 계좌/주문 정보는 민감하므로 출력 범위를 과도하게 넓히지 않는다.
