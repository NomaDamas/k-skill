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
npx -y @nomadamas/k-skill@0 exec g2b-order-plan-search scripts/g2b_order_plan.py -- \
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
npx -y @nomadamas/k-skill@0 exec g2b-order-plan-search scripts/g2b_order_plan.py -- \
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

### 4. Separate search candidates from participation eligibility

발주계획 검색 결과는 후보이지 참가자격 확인 결과가 아니다. `bidNtceNoList`가 있더라도 실제 공고의 현재 공고번호·차수와 원문 URL을 먼저 확인한다. 번호가 없거나 원문을 확인하지 못했으면 `참가자격: 확인 필요`로 남긴다. 이 스킬의 API는 공고문·첨부·자격 변경 이력을 반환하지 않으므로 이를 추정해 채우지 않는다.

참가 가능 여부를 요청받았을 때만 별도 검토 표를 만든다. 사용자가 제공한 회사 서류와 공식 최종 공고문·첨부를 같은 단위로 대조한다. 지역, 면허·업종, 실적, 등록·인증의 **4항목 모두**에 공고 원문 인용·URL·공고번호/차수·자격 기준일과 회사 측 근거를 붙인다. 인증은 공고에서 필수인지 가점인지 구분한다. 이름이 비슷하다는 이유로 업종 코드 일치를 가정하지 않는다.

| 항목 | 공고 요건·필수/가점 | 회사 서류 근거 | 공고 원문·URL·번호/차수 | 기준일 | 결과 |
| --- | --- | --- | --- | --- | --- |
| 지역 | 본점/지점 인정 범위와 소재지 | 소재지 및 등록시점 | 확인한 원문 | 공고가 정한 시점 | 충족/미충족/확인 필요 |
| 면허·업종 | 요구 면허·업종 코드 | 등록 코드 및 유효기간 | 확인한 원문 | 공고가 정한 시점 | 충족/미충족/확인 필요 |
| 실적 | 인정 기간·종류·금액 | 증명서·완료일·금액 | 확인한 원문 | 실적 기산일 | 충족/미충족/확인 필요 |
| 등록·인증 | 필수 등록·인증과 가점 구분 | 등록 및 인증 유효기간 | 확인한 원문 | 공고가 정한 시점 | 충족/미충족/확인 필요 |

원문/서류/기준일이 없거나 해석이 모호하면 `확인 필요`다. 네 항목은 점검 순서이며 법적 자격요건의 전부가 아니다. 공동수급·직접생산확인 등 해당 공고의 추가 필수요건도 빠짐없이 확인하고, 네 항목만 맞았다는 이유로 참가 가능을 보장하지 않는다. 사업자등록 상태 정상이나 부정당제재 0건도 공고별 자격 충족의 증거가 아니다.

저장한 공고를 재검토할 때는 최종 정정/취소/재공고와 첨부를 다시 확인한다. 이전/최종 공고번호·차수·확인시각을 남기고 마감·예산·과업·지역·면허/업종·실적·등록/인증을 전후 비교한다. 변경된 자격은 재검토하며, 최종 원문을 확인할 수 없으면 이전 판단을 유지하지 않고 `확인 필요`로 표시한다. 31% 같은 민간 집계 비율은 이 판단의 근거로 사용하지 않는다.

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
