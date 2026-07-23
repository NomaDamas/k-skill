# coupang-product-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- Use the built-in browser tool backed by CloakBrowser first. Fall back to `k-skill-browser-runtime` providers only when CloakBrowser is unavailable.
- When purchase or cart is requested, continue past search results: open the official product page, verify live price/seller/option/stock, use vault-backed login, and complete reversible cart or checkout preparation.
- Immediately before the final order or payment, call `clarify` with merchant, item/options, quantity, delivery summary, and total amount. After approval, submit and verify the order number and payment status.

# Coupang Product Search

## What this skill does

[retention-corp/coupang_partners](https://github.com/retention-corp/coupang_partners) 저장소의 로컬 Coupang MCP 호환 레이어를 사용해 쿠팡 상품 조회 도구를 실행한다. 기존 유지보수형 HF Space MCP 엔드포인트 대신, 이 저장소의 `bin/coupang_mcp.py`가 제공하는 `local://coupang-mcp` 계약을 호출한다.

- 키워드 상품 검색
- 로켓배송 전용 필터 검색
- 가격대 범위 검색
- 상품 비교표 생성
- 카테고리별 베스트 상품
- 골드박스 당일 특가
- 인기 검색어/계절 상품 추천

## How it works

```
Claude Code / Codex
  → coupang-product-search/scripts/coupang_partners_mcp.py
    → git clone/update retention-corp/coupang_partners (user cache)
      → python3 bin/coupang_mcp.py
        → local://coupang-mcp compatible tool layer
          ├─ Coupang Partners API client (operator keys present)
          └─ hosted fallback → https://a.retn.kr/v1/public/assist (no keys)
```

Hard rules:

- `COUPANG_MCP_ENDPOINT`는 호환성 knob로만 유지한다. 기본값은 `local://coupang-mcp`다.
- 구형 HF Space hosted MCP 엔드포인트를 사용하거나 새로 지어내지 않는다.
- upstream 저장소는 `https://github.com/retention-corp/coupang_partners.git`만 사용한다.
- `tools`와 `init`은 로컬 MCP 계약 확인용으로 먼저 실행한다.

## Execution paths

`retention-corp/coupang_partners`는 하나의 CLI 뒤에서 두 가지 경로를 자동으로 선택한다. 래퍼(`coupang_partners_mcp.py`)는 두 경로 모두를 그대로 통과시킨다.

1. **Operator (local HMAC) path** — `COUPANG_ACCESS_KEY`와 `COUPANG_SECRET_KEY`가 둘 다 설정된 경우. upstream이 Coupang Partners API를 HMAC 서명해 직접 호출한다. 키/시크릿은 절대 답변·문서·커밋에 노출하지 않는다.
2. **Credentialless hosted fallback path** — 위 두 키 중 하나라도 없는 경우(또는 `OPENCLAW_SHOPPING_FORCE_HOSTED=1`). upstream이 자동으로 Retention Corp의 hosted 백엔드(`https://a.retn.kr/v1/public/assist`)로 떨어진다. 이 경로는 `X-OpenClaw-Client-Id` allowlist로 게이트되어 있으며, upstream이 기본으로 실어 보내는 `openclaw-skill` 값이 현재 Retention Corp allowlist에 등록된 값이다. k-skill 래퍼는 `OPENCLAW_SHOPPING_CLIENT_ID`를 별도로 설정하지 않고 이 upstream 기본값을 그대로 사용한다.

두 경로 모두 JSON envelope(`ok`/`data.session_id`/`data.tool`/`data.payload`/`data.result`) 모양은 동일하므로, 답변 로직은 경로를 구별할 필요가 없다. short deeplink는 hosted fallback에서는 `https://a.retn.kr/s/...` 형태로, operator path에서는 `https://link.coupang.com/...` 형태로 온다.

### 관련 환경변수

| 환경변수 | 역할 | 기본값 |
|---------|------|--------|
| `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` | 운영자 Coupang Partners API 크리덴셜. 둘 다 있을 때만 로컬 HMAC 경로가 활성화된다. | 없음 (없으면 hosted fallback) |
| `OPENCLAW_SHOPPING_CLIENT_ID` | hosted fallback이 보낼 `X-OpenClaw-Client-Id`. upstream이 `openclaw-skill`을 기본으로 실어 보내며 이 값이 현재 Retention Corp allowlist에 등록되어 있다. k-skill 래퍼는 이 변수를 오버라이드하지 않는 것을 권장한다. | `openclaw-skill` |
| `OPENCLAW_SHOPPING_FORCE_HOSTED` | `1`이면 키가 있어도 hosted 경로를 강제한다. | 비어있음 |
| `OPENCLAW_SHOPPING_BASE_URL` | hosted 백엔드 base URL 오버라이드. 스테이징/로컬 backend 테스트용. | `https://a.retn.kr` |

## MCP endpoint / contract

```
local://coupang-mcp
```

프로토콜 호환 버전: MCP `2025-03-26`. 네트워크로 붙는 Streamable HTTP 서버가 아니라, upstream 저장소의 로컬 MCP 호환 CLI가 같은 도구 이름과 JSON-RPC 모양의 payload를 반환한다.

## When to use

- "쿠팡에서 생수 가격 좀 찾아줘"
- "로켓배송 에어팟 찾아줘"
- "20만원 이하 키보드 추천해줘"
- "아이패드 vs 갤럭시탭 비교"
- "오늘 쿠팡 특가 뭐 있어?"
- "전자제품 베스트 보여줘"

## When not to use

- 돌쇠가 아니며 로그인, 장바구니, 결제 자동화가 필요한 경우
- 돌쇠가 아니며 쿠팡 계정/session 접근이 필요한 경우
- 실시간 재고/품절 여부를 100% 보장해야 하는 경우 (hosted fallback과 Partners API 모두 캐시·지연이 있을 수 있다)

## Workflow

### 1. Clarify the need

검색어가 너무 넓으면 먼저 의도를 좁힌다.

- 권장 질문: `어떤 용도/예산/브랜드/용량을 우선할까요?`

### 2. Bootstrap and check the tool contract

래퍼는 기본적으로 `~/.cache/k-skill/coupang_partners`에 upstream 저장소를 clone한다. 이미 clone되어 있으면 그대로 사용하고, 최신화가 필요할 때만 `--update`를 붙인다.

```bash
python3 coupang-product-search/scripts/coupang_partners_mcp.py tools
python3 coupang-product-search/scripts/coupang_partners_mcp.py init
```

기존 checkout을 명시하거나 CI/검증에서 네트워크 clone을 막으려면:

```bash
python3 coupang-product-search/scripts/coupang_partners_mcp.py \
  --repo-dir /path/to/coupang_partners \
  --no-clone \
  tools
python3 coupang-product-search/scripts/coupang_partners_mcp.py \
  --repo-dir /path/to/coupang_partners \
  --no-clone \
  init
```

### 3. Call tools

구체적인 사용자 요청에 맞춰 upstream CLI 명령을 호출한다. 결과는 `ok`, `data.tool`, `data.payload`, `data.result`를 포함하는 JSON으로 반환된다.

```bash
# 일반 검색 (키 없이도 hosted fallback으로 작동)
python3 coupang-product-search/scripts/coupang_partners_mcp.py search "32인치 4K 모니터"

# 로켓배송 필터
python3 coupang-product-search/scripts/coupang_partners_mcp.py rocket "에어팟"

# 가격대 검색
python3 coupang-product-search/scripts/coupang_partners_mcp.py budget "키보드" --max-price 100000

# 비교
python3 coupang-product-search/scripts/coupang_partners_mcp.py compare "아이패드 vs 갤럭시탭"

# 골드박스 (운영자 키가 필요한 upstream 경로)
python3 coupang-product-search/scripts/coupang_partners_mcp.py goldbox
```

### 4. (optional) hosted fallback 강제

운영자 키가 있는 상태에서도 hosted fallback 경로를 점검하고 싶으면 `OPENCLAW_SHOPPING_FORCE_HOSTED=1`만 추가하면 된다. `OPENCLAW_SHOPPING_CLIENT_ID`는 upstream이 보내는 기본값 `openclaw-skill`이 현재 Retention Corp allowlist에 등록된 값이므로 별도로 설정하지 않는다.

```bash
export OPENCLAW_SHOPPING_FORCE_HOSTED=1
python3 coupang-product-search/scripts/coupang_partners_mcp.py search "에어팟"
```

### 5. Continue from discovery to cart and checkout in Dolshoi

사용자가 구매나 장바구니 담기를 요청했고 CloakBrowser mode라면 MCP 결과 링크에서 멈추지 않는다.

1. 선택한 상품의 공식 쿠팡 URL을 CloakBrowser로 연다.
2. 현재 상품명, 판매자, 옵션, 수량, 로켓배송 여부, 실시간 가격과 품절 여부를 다시 확인한다.
3. 로그인이 필요하면 provisioned vault capability를 사용하고, 없으면 `request_vault_credential`로 쿠팡 login을 저장한 뒤 같은 turn에 재개한다.
4. 옵션과 수량을 선택해 장바구니에 담는다. 장바구니 담기는 가역적이므로 별도 승인 없이 수행하고 실제 담김 상태를 확인한다.
5. 구매 요청이면 배송지/쿠폰/결제수단 적용 후 최종 주문 직전까지 진행한다.
6. `clarify`로 상품·옵션·수량·배송지 요약·최종 금액을 승인받고, 승인되면 주문/결제를 실행해 주문번호와 상태를 확인한다.

CloakBrowser를 사용할 수 없는 generic runtime에서는 기존 검색/링크 제공 범위를 유지한다.

## Available tools

| 도구명 | CLI 명령 | 기능 | 파라미터 예시 |
|--------|----------|------|-------------|
| `search_coupang_products` | `search` | 일반 상품 검색 | `"생수"` |
| `search_coupang_rocket` | `rocket` | 로켓배송만 필터링 | `"에어팟"` |
| `search_coupang_budget` | `budget` | 가격대 범위 검색 | `"키보드" --max-price 100000` |
| `compare_coupang_products` | `compare` | 상품 비교표 생성 | `"아이패드 vs 갤럭시탭"` |
| `get_coupang_recommendations` | `recommendations` | 인기 검색어 제안 | `--category 전자제품` |
| `get_coupang_seasonal` | `seasonal` | 계절/상황별 추천 | `"설날 선물"` |
| `get_coupang_best_products` | `best` | 카테고리별 베스트 | `--category-id 1016` |
| `get_coupang_goldbox` | `goldbox` | 당일 특가 정보 | `--limit 10` |

주의: `get_coupang_goldbox`와 `get_coupang_best_products`는 upstream 기준 Coupang Partners API 권한이 필요한 경로이므로, 키가 없는 환경에서는 실패할 수 있다. 이런 경우 에러 메시지를 그대로 전달하고 hosted fallback이 커버하는 `search`/`rocket`/`budget`/`compare` 경로로 우회 제안한다.

## Response format

upstream CLI는 JSON을 출력한다. `data.result` 안의 상품 배열 또는 도구별 객체를 읽고, 답변에서는 로켓배송(rocket)과 일반배송(normal)을 구분한다.

```json
{
  "ok": true,
  "data": {
    "session_id": "session-...",
    "tool": "search_coupang_products",
    "payload": {
      "jsonrpc": "2.0",
      "result": {
        "content": [
          {"type": "text", "text": "[...]"}
        ]
      }
    },
    "result": []
  }
}
```

사용자에게 보여줄 때는 다음처럼 짧게 정리한다.

```
## rocket (상위 후보)

1) LG전자 4K UHD 모니터
   가격: 397,750원 (참고용)
   보러가기: https://a.retn.kr/s/...          # hosted fallback shortlink
   또는:   https://link.coupang.com/a/...     # operator HMAC 경로 딥링크

## normal (상위 후보)

1) 삼성전자 QHD 오디세이 G5 게이밍 모니터
   가격: 283,000원 (참고용)
   보러가기: https://a.retn.kr/s/...
```

## Response policy

- 후보가 여러 개면 상위 3~5개만 짧게 비교한다.
- 로켓배송/일반배송 구분을 명시한다.
- 가격/품절/배송 정보는 실시간 변동될 수 있음을 안내한다.
- upstream checkout, 권한, Coupang Partners 환경변수 문제로 실패하면 실패 원인과 재시도/설정 방법을 짧게 안내한다.
- **Affiliate 고지(필수)**: 응답에 포함되는 shortlink(`https://a.retn.kr/s/...`)와 직접 coupang 딥링크(`link.coupang.com/...?lptag=AF...`)는 Retention Corp의 쿠팡 파트너스(affiliate) 채널로 트래킹된다. upstream이 돌려주는 `disclosure` 문자열(`"파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있음"`)이 있으면 그대로 노출하고, 없으면 같은 취지의 고지를 답변 말미에 덧붙인다.

## Done when

- `tools`와 `init` 또는 실제 명령으로 retention-corp/coupang_partners 로컬 MCP 계약을 확인했다.
- 검색 결과가 로켓배송/일반배송으로 구분되어 정리되었다.
- 사용자 니즈에 맞는 추천 TOP 3이 제시되었다.
- 가격/배송 정보와 변동 가능성 안내가 포함되었다.
- affiliate 고지(disclosure)가 답변에 포함되었다.
- 돌쇠의 장바구니 요청이면 선택 옵션/수량이 실제 장바구니에 담긴 것을 확인했다.
- 돌쇠의 구매 요청이면 `clarify` 승인 후 주문번호와 결제 상태를 확인했다.
