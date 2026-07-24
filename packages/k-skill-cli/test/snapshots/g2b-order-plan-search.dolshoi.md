# g2b-order-plan-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- Use the built-in browser tool backed by CloakBrowser first. Fall back to `k-skill-browser-runtime` providers only when CloakBrowser is unavailable.
- Use the official legal/government surface with CloakBrowser and vault-backed login. Proceed through ordinary login, supported identity verification, document upload, form filling, fee calculation, and reversible preparation when the official surface and available capabilities support them.
- Do not evade CAPTCHA, impersonate the user, forge identity evidence, or bypass an authentication/security control. If the official flow presents a user-presence-only verification or electronic-signature prompt, open the exact prompt and let the user complete that control, then resume the same workflow immediately afterward.
- Immediately before filing, bidding, paying a government fee, signing, cancelling, or another irreversible legal effect, call `clarify` with the exact case/form, parties, documents, amount, and legal effect. Execute after approval and verify the official receipt or resulting status.

# 나라장터 발주계획 검색

## What this skill does

`g2b-order-plan-search`는 공공데이터포털의 **조달청_나라장터 발주계획현황서비스**(data.go.kr 15129462, `OrderPlanSttusService`)를 `k-skill-proxy` 경유로 호출해 나라장터에 등록된 발주계획 목록을 조회한다.

- 대상 업무: 물품, 공사, 용역, 외자
- 검색 조건: 발주년월 범위, 게시일시 범위, 발주기관명/코드, 사업명 키워드, 조달방식, 기관소재지, 세부품명번호, 업무유형, 공종 등
- 반환: 발주년도/월, 발주기관, 사업명, 계약방법, 발주금액, 담당부서/담당자/전화번호, 입찰공고번호목록 등 upstream 원문 필드

입찰 참가, 로그인, 입찰서 제출, 인증서 작업, 결제, 낙찰/계약 처리 자동화는 하지 않는다.

## Public access path discovered

### Primary source: 공공데이터포털 API through k-skill-proxy

- data.go.kr dataset: <https://www.data.go.kr/data/15129462/openapi.do>
- upstream base: `https://apis.data.go.kr/1230000/ao/OrderPlanSttusService`
- proxy route: `GET /v1/g2b/order-plans`
- API key location: proxy server only (`DATA_GO_KR_API_KEY`)

Operations used:

| kind | endpoint |
| --- | --- |
| `goods` / `물품` | `getOrderPlanSttusListThngPPSSrch` |
| `construction` / `공사` | `getOrderPlanSttusListCnstwkPPSSrch` |
| `service` / `용역` | `getOrderPlanSttusListServcPPSSrch` |
| `foreign` / `외자` | `getOrderPlanSttusListFrgcptPPSSrch` |
| `all` / `전체` | above four endpoints, merged with `_order_plan_kind` |

The API is a free data.go.kr service that requires an application key, so it follows the repository's free-API proxy policy and does not expose the key to users.

## When to use

- "나라장터 발주목록에서 청소 용역 찾아줘"
- "조달청 물품 발주계획 2025년 1월 목록 조회"
- "서울 기관 공사 발주계획 검색"
- "발주기관명으로 나라장터 발주계획 보여줘"

## Prerequisites

- 인터넷 연결, `python3`
- hosted/self-host `k-skill-proxy`의 `/v1/g2b/order-plans` route 접근 가능
- proxy 운영 서버의 `DATA_GO_KR_API_KEY`가 data.go.kr 15129462에 활용신청되어 있어야 함

사용자 측 필수 시크릿은 없다. Self-host proxy를 쓸 때만 `KSKILL_PROXY_BASE_URL`을 설정한다.

## Inputs

CLI flags:

- `--kind`: `goods`/`물품`, `construction`/`공사`, `service`/`용역`, `foreign`/`외자`, `all`/`전체` (default `goods`)
- `--keyword`, `-q`: 사업명 검색어 (`bizNm`)
- `--order-from`, `--order-to`: 발주년월 범위 (`YYYY-MM` 또는 `YYYYMM`)
- `--posted-from`, `--posted-to`: 게시일시 범위 (`YYYY-MM-DD`, `YYYYMMDD`, `YYYYMMDDHHMM`)
- `--institution`: 발주기관명
- `--institution-code`: 발주기관코드
- `--region`: 기관소재지명
- `--procurement-method`: 조달방식
- `--product-code`: 세부품명번호(물품)
- `--business-type`: 업무유형명/업무유형코드(공사·용역·외자)
- `--construction-type`: 공종구분명(공사)
- `--page`, `--limit`: 페이지와 한 페이지 결과 수(최대 100)

## Workflow

### 1. Search order plans

```bash
python3 g2b-order-plan-search/scripts/g2b_order_plan.py \
  --kind service \
  --keyword 청소 \
  --order-from 2025-01 \
  --order-to 2025-03 \
  --posted-from 2025-01-01 \
  --posted-to 2025-01-31 \
  --limit 10
```

### 2. Narrow by institution or location

```bash
python3 g2b-order-plan-search/scripts/g2b_order_plan.py \
  --kind goods \
  --institution 조달청 \
  --region 대전 \
  --order-from 2025-01 \
  --order-to 2025-01
```

### 3. Read output conservatively

The result is the proxy JSON response. Important fields:

- `query`: normalized upstream parameters and selected operation
- `total_count`, `page`, `page_size`
- `items[]`: upstream order-plan rows
- `items[].orderPlanUntyNo`: 발주계획통합번호
- `items[].bizNm`: 사업명
- `items[].orderInsttNm`: 발주기관명
- `items[].orderMnth`: 발주월
- `items[].sumOrderAmt`, `items[].orderContrctAmt`: 발주금액 fields when upstream provides them
- `items[].bidNtceNoList`: linked bid notice numbers when upstream provides them

When answering, show the official source (data.go.kr dataset and g2b.go.kr manual verification URL) and state that 발주계획은 사전계획이며 실제 사전규격/입찰공고/계약과 1:1로 보장되지 않는다.

## Done when

- The proxy route `/v1/g2b/order-plans` was queried.
- The selected `kind` mapped to the correct PPS order-plan endpoint.
- Date/month filters and keyword/institution filters are reflected in `query`.
- Results include source fields and manual verification guidance.
- No login, bidding, certificate, submission, or payment flow was automated.

## Failure modes

- `503 upstream_not_configured`: proxy server has no `DATA_GO_KR_API_KEY`.
- `502 upstream_forbidden`: proxy key is not approved for data.go.kr service 15129462.
- `400 bad_request`: invalid kind, date/month, page, or limit input.
- `total_count = 0`: no order plans matched the selected conditions.
- Upstream resultCode `03`: data.go.kr reports no data.
- API changed endpoint names, parameters, or envelope shape.
- 발주계획은 실제 입찰공고 등록의 필수 선행조건이 아니며, 발주계획에 없는 사전규격·입찰공고·계약도 있을 수 있다.

## Official surfaces

- 공공데이터포털: <https://www.data.go.kr/data/15129462/openapi.do>
- upstream: `https://apis.data.go.kr/1230000/ao/OrderPlanSttusService`
- 수동 대조: 나라장터 <https://www.g2b.go.kr>
- proxy route: `GET /v1/g2b/order-plans`
