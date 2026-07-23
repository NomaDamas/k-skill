---
name: market-kurly-search
description: 로그인 없이 접근 가능한 마켓컬리 검색/상품 상세 표면으로 상품 후보, 현재 가격, 할인 여부, 품절 여부를 조회한다. 돌쇠에서는 공식 표면을 통한 후속 액션까지 진행한다.
license: MIT
metadata:
  category: retail
  locale: ko-KR
  phase: v1
---

# Market Kurly Search

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.

## Dolshoi action path

- Use the documented search/API path to identify the exact product, option, seller, quantity, price, and official URL.
- When the user asks to buy, cart, or transact, continue in CloakBrowser on the official surface, use vault-backed login, select the requested option/quantity, and complete reversible cart or checkout preparation.
- Immediately before the final order or payment, call `clarify` with merchant, item/options, quantity, delivery destination summary, and total amount. After approval, submit and verify the order result.
- Any later read-only, no-login, no-cart, or no-purchase wording applies to the generic fallback; it does not cancel this Dolshoi path.



## What this skill does

마켓컬리 웹앱이 실제로 사용하는 **비로그인 검색/상품 상세 표면**을 사용해 아래 흐름을 처리한다.

- 키워드로 상품 후보를 검색한다.
- 현재 가격과 할인 여부를 확인한다.
- 품절 여부와 배송 타입을 확인한다.
- 상품 링크를 함께 반환한다.
- **주문/장바구니 같은 액션은 하지 않는다. 조회형으로만 답한다.**

## When to use

- "마켓컬리에서 우유 얼마야?"
- "컬리에서 딸기 검색해줘"
- "이 상품 품절인지 보고 링크도 줘"
- "지금 컬리 가격만 빠르게 보고 싶어"

## When not to use

- 주문/장바구니/결제까지 자동화해야 하는 경우
- 주소 기반 배송 가능 여부나 회원 전용 가격을 확정해야 하는 경우
- 로그인 세션이 필요한 개인화 추천/찜 정보를 조회해야 하는 경우

## Prerequisites

- 인터넷 연결
- `node` 18+
- 이 저장소의 `market-kurly-search` package 또는 동일 로직

## Required inputs

### 1. Ask for a product keyword if it is missing

상품명 또는 검색어가 없으면 먼저 물어본다.

- 권장 질문: `찾을 마켓컬리 상품명이나 검색어를 알려주세요. 예: 우유, 딸기, 닭가슴살`
- 너무 넓으면: `검색어가 너무 넓어요. 브랜드나 용량까지 같이 알려주시면 가격 후보를 더 정확히 추릴 수 있어요.`

### 2. Confirm which candidate they want when the query is ambiguous

검색 결과가 여러 개면 상위 2~3개만 보여주고 다시 확인받는다.

- 권장 질문: `후보가 여러 개예요. 아래 상품 중 어떤 상품 가격을 볼까요?`
- 응답에는 상품명 + 현재 가격 + 품절 여부 + 링크를 같이 붙인다.

## Official Market Kurly surfaces

- search list: `https://api.kurly.com/search/v4/sites/market/normal-search?keyword=<keyword>&page=1`
- search count: `https://api.kurly.com/search/v3/sites/market/normal-search/count?keyword=<keyword>&filters=&allow_replace=true`
- product detail page: `https://www.kurly.com/goods/<productNo>`

## Workflow

### 1. Search by keyword first

```js
const { searchProducts } = require("market-kurly-search")

const result = await searchProducts("우유")
console.log(result.items.slice(0, 3))
```

검색 결과에서는 아래 필드를 우선 본다.

- 상품명
- 현재 가격 (`discountedPrice` 우선, 없으면 `salesPrice`)
- 할인율
- 품절 여부
- 배송 타입
- 상품 링크

### 2. Use the count endpoint when the result set is broad

```js
const { countProducts } = require("market-kurly-search")

const count = await countProducts("우유")
console.log(count)
```

후보가 너무 많으면 `count` 를 먼저 보여 주고 검색어를 좁히라고 안내한다.

### 3. Use the goods page detail as a fallback or follow-up lookup

```js
const { getProductDetail } = require("market-kurly-search")

const detail = await getProductDetail(5063110)
console.log(detail)
```

`goods/<productNo>` HTML 안의 `__NEXT_DATA__` 에서 상품명, 가격, 품절 여부, 배송 타입을 추출한다.

### 4. Respond conservatively

응답은 짧고 보수적으로 정리한다.

- 상품명
- 현재 가격
- 필요하면 원가/할인가 여부
- 품절 여부 또는 판매 가능 여부
- 상품 링크
- **가격/품절/노출 정보는 시점에 따라 달라질 수 있으니 조회 시각 기준 참고값이라고 분명히 말한다.**

## Done when

- 상품 키워드를 확인했다.
- 검색 결과에서 후보와 현재 가격을 최소 1개 이상 반환했다.
- 필요하면 상품 상세 페이지로 보조 확인했다.
- 주문/장바구니 같은 범위 밖 액션은 하지 않았다.

## Failure modes

- 검색어가 너무 넓으면 후보가 과도하게 많아질 수 있다.
- 가격/품절/배송 문구는 시점에 따라 달라질 수 있다.
- 현재 확인한 표면은 **공식 개발자 Open API가 아니라 웹이 쓰는 공개 표면** 이므로 스키마가 바뀌면 깨질 수 있다.
- 회원 전용/주소 전용 정보는 비로그인 조회만으로 확정할 수 없다.

## Notes

- 조회형 스킬이다.
- 비로그인 공개 표면 우선 원칙을 유지한다.
- 주문/장바구니/로그인 요구 기능은 시도하지 않는다.
