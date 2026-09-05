# coupang-product-search — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Resolve credentials in this order: already-injected environment variables, then the host vault, then `~/.config/k-skill/secrets.env` (mode `0600`). If the value is missing, request it through the safest input surface the host provides and store it in the vault or dotenv; never echo it back.
- Use `k-skill-browser-runtime` (provider `auto`) for logged-in or rendered-page automation. On macOS it tries Aside Browser first, then BrowserOS CDP, then user-launched Chrome/Chromium CDP; on other platforms it tries BrowserOS CDP, then Aside Browser, then user-launched Chrome/Chromium CDP. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.
- Complete search, comparison, and link preparation that the documented portable workflow supports, then hand off to the official surface for login, cart, and payment. Do not automate purchase here.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec coupang-product-search scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path coupang-product-search <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read coupang-product-search references/<file>`.

# Coupang Product Search

## Purpose

`k-skill-proxy`의 공식 Coupang Partners API route로 쿠팡 상품을 검색한다.
사용자에게 쿠팡 파트너스 access/secret key를 요구하지 않는다. 키와 HMAC
서명은 proxy 서버에만 존재한다.

## Endpoint

```text
GET ${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}/v1/coupang/products/search
```

허용 query:

| field | required | rule |
| --- | --- | --- |
| `keyword` 또는 `q` | yes | 2~100자 검색어 |
| `limit` | no | 1~10, 기본 10 |
| `subId` | no | 호출 분석용 식별자, 최대 100자 |

`COUPANG_ACCESS_KEY`와 `COUPANG_SECRET_KEY`를 caller 환경이나 명령 인자로
넣지 않는다. 운영자가 proxy의 gpu01 runtime `.env`에만 설정한다.

상품 링크를 안내할 때는 반드시 "쿠팡 파트너스 활동을 통해 일정액의 수수료를
제공받을 수 있습니다."라고 고지한다.

## Workflow

1. 검색어가 넓으면 용도, 예산, 브랜드, 용량을 확인한다.
2. 아래처럼 proxy를 호출한다.

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/coupang/products/search" \
  --data-urlencode 'keyword=무선청소기' \
  --data-urlencode 'limit=10' \
  --data-urlencode 'subId=k-skill'
```

3. 응답의 `items`를 읽고 `is_rocket`에 따라 로켓배송과 일반배송으로 나눈다.
4. 사용자의 예산이 있으면 `price`로 필터링하고 상위 3~5개만 비교한다.
5. 가격, 품절, 배송 정보는 변할 수 있음을 명시한다.
6. 상품 링크를 제공할 때 아래 affiliate 고지를 반드시 포함한다.

```text
쿠팡 파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다.
```

## Response fields

각 상품은 다음 안정 필드를 제공한다.

- `product_id`
- `title`
- `price`, `price_text`
- `url`, `image_url`
- `review_count`, `score`
- `is_rocket`, `is_free_shipping`

## Failure modes

- `400 bad_request`: 검색어가 없거나 너무 짧음. 입력을 바로잡아 재호출한다.
- `503 upstream_not_configured`: proxy 운영자가 Coupang key 두 개를 아직 설정하지 않음.
- `502 upstream_forbidden`: 키가 거절되었거나 Partners API 권한이 없음.
- `502 upstream_error` / `upstream_unavailable`: 쿠팡 upstream 장애. 실패를 숨기지 말고 나중 재시도를 안내한다.

임의의 Coupang scraping, 구형 HF Space MCP, `a.retn.kr` hosted fallback,
사용자 제공 API key로 우회하지 않는다.

## Continue to cart or purchase

사용자가 장바구니 또는 구매를 요청했고 CloakBrowser mode라면 결과 링크에서
멈추지 않는다.

1. 선택 상품의 공식 쿠팡 URL을 열어 상품명, 판매자, 옵션, 수량, 실시간 가격,
   로켓배송 여부와 품절 상태를 다시 확인한다.
2. 로그인이 필요하면 provisioned vault capability를 사용하고, 없으면
   `request_vault_credential`로 쿠팡 login을 저장한 뒤 재개한다.
3. 장바구니 담기는 가역적이므로 수행 후 실제 담김을 확인한다.
4. 구매는 배송지, 쿠폰, 결제수단 적용 후 최종 주문 직전에 정확한 대상과 금액을
   `clarify`로 승인받고 실행한다.

## Done when

- proxy 응답을 실제로 받았다.
- 로켓배송/일반배송과 가격을 구분해 후보를 정리했다.
- 가격·배송 변동 가능성과 affiliate 고지를 포함했다.
- 액션 요청이면 해당 표면의 실제 완료 상태를 확인했다.
