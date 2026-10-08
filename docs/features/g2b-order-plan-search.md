# 나라장터 발주계획 검색 (g2b-order-plan-search)

`g2b-order-plan-search`는 공공데이터포털의 **조달청_나라장터 발주계획현황서비스**(15129462, `OrderPlanSttusService`)를 `k-skill-proxy` 경유로 호출해 물품·공사·용역·외자 발주계획 목록을 조회한다.

## 제공 기능

- 발주계획 목록 검색: 물품, 공사, 용역, 외자
- 조건 검색: 발주년월 범위, 게시일시 범위, 발주기관명/코드, 사업명 키워드, 조달방식, 기관소재지, 세부품명번호, 업무유형, 공종
- 반환: 발주기관, 사업명, 발주월, 계약방법, 금액, 담당부서/담당자/전화번호, 입찰공고번호목록 등 upstream 원문 필드

## 정책 경계

- data.go.kr 무료 API이지만 API key가 필요하므로 `k-skill-proxy`를 사용한다.
- 사용자 로컬에 `DATA_GO_KR_API_KEY`를 요구하지 않는다.
- 나라장터 로그인, 인증서, 입찰 참가, 제출, 결제, 낙찰/계약 처리는 자동화하지 않는다.
- 발주계획은 사전계획이며 실제 사전규격공개/입찰공고/계약과 1:1로 보장되지 않는다.

## 검색 결과와 참가자격은 별개

발주계획 검색 결과는 참가자 후보이지 참가자격 확인 결과가 아니다. `bidNtceNoList`가 있어도 실제 현재 공고·차수·첨부를 나라장터 원문에서 확인해야 한다. 이 API가 공고문과 자격 변경 이력을 제공하지 않으므로 번호나 원문이 없으면 `참가자격: 확인 필요`로 표시한다.

회사 서류와 공식 최종 공고를 대조할 때는 지역, 면허·업종 코드, 실적, 등록·인증의 4항목을 각각 공고 원문 인용·URL·공고번호/차수·기준일과 함께 기록한다. 인증은 필수와 가점을 구분하고, 원문·서류·기준일이 없거나 모호하면 `확인 필요`다. 네 항목 외 공고별 추가 필수요건도 확인하며, 검색 노출·사업자 상태 정상·부정당제재 0건만으로 참가 가능을 보장하지 않는다.

저장 공고는 최종 정정·취소·재공고와 첨부를 다시 확인하고 이전/최종 자격·마감·예산·과업 변경을 비교한다. 최신 원문이 없으면 이전 판단을 유지하지 않는다.

## 사용 예시

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

```bash
npx -y @nomadamas/k-skill@0 exec g2b-order-plan-search scripts/g2b_order_plan.py -- \
  --kind goods \
  --institution 조달청 \
  --region 대전 \
  --order-from 2025-01 \
  --order-to 2025-01
```

## kind 매핑

| 입력 | upstream endpoint |
| --- | --- |
| `goods`, `물품` | `getOrderPlanSttusListThngPPSSrch` |
| `construction`, `공사` | `getOrderPlanSttusListCnstwkPPSSrch` |
| `service`, `용역` | `getOrderPlanSttusListServcPPSSrch` |
| `foreign`, `외자` | `getOrderPlanSttusListFrgcptPPSSrch` |
| `all`, `전체` | 위 4개 endpoint를 순차 조회 후 병합 |

## 출력 필드

- `query`: 정규화된 검색 조건과 upstream operation
- `total_count`, `page`, `page_size`
- `items[]`: upstream 원문 발주계획 row
- `source.data_go_kr_dataset`: `15129462`
- `source.upstream`: 호출 upstream URL

## 실패 모드

- `503 upstream_not_configured`: 프록시에 `DATA_GO_KR_API_KEY` 없음
- `502 upstream_forbidden`: 프록시 키가 15129462에 활용신청되지 않음
- `400 bad_request`: kind/date/month/page/limit 입력 오류
- `total_count: 0`: 조건에 맞는 발주계획 없음
- upstream resultCode `03`: 데이터 없음

## 공식 출처

- 공공데이터포털: <https://www.data.go.kr/data/15129462/openapi.do>
- upstream: `https://apis.data.go.kr/1230000/ao/OrderPlanSttusService`
- 수동 대조: 나라장터 <https://www.g2b.go.kr>
- 프록시 route: `GET /v1/g2b/order-plans`
