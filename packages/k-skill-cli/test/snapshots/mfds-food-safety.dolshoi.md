# mfds-food-safety — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 식품 안전 체크

## What this skill does

식약처/식품안전나라 공개 표면을 **`k-skill-proxy` 경유**로 조회해 식품 안전 정보를 확인한다.

조회 가능한 공식 데이터:
- **건강기능식품 기능성 원료 인정현황** (I-0040) — 원료가 공식 인정됐는지, 1일 섭취량, 섭취시 주의사항
- **건강기능식품 개별인정형 정보** (I-0050) — 개별 인정 원료의 기능성, 섭취량 상·하한, 주의사항
- **건강기능식품 품목제조 신고사항** (I0030) — 신고된 제품의 원재료, 기능성, 섭취 주의사항, 기준규격 (고시형 원료 포함)
- **검사부적합 현황(국내)** (I2620) — 국내 유통 식품 부적합 판정 이력
- **부적합 식품 목록** — 공공데이터포털 경유
- **회수·판매중지 공개 목록** (I0490) — 식품안전나라 경유

하지만 사용자가 복통, 설사, 발진 같은 증상을 말하면 **바로 단정하지 말고 먼저 되묻는다.**

- 누가 먹었는지 (본인/아이/임산부/고령자)
- 무엇을 언제 얼마나 먹었는지
- 같이 먹은 음식/술/약
- 현재 증상과 시작 시점
- 기저질환, 임신, 알레르기
- red flag (`혈변`, `탈수`, `호흡곤란`, `의식저하`, `심한 복통/고열`)

red flag 가 있으면 식품 조회보다 **즉시 응급실·119·의료진 안내**가 우선이다.

## When to use

- "이 음식 먹어도 괜찮니?" → 건강기능식품 원료 인정현황 + 검사부적합 조회
- "차전자피를 먹어도 되나?" → 기능성 원료 인정현황에서 1일 섭취량·주의사항 확인
- "이 김밥 먹고 배가 아픈데 회수 이력 있나?" → 회수·부적합 목록 조회
- "식약처 공식 부적합 식품 목록에서 제품명 확인해줘"
- "식품안전나라 공개 회수 목록에서 업체명으로 찾아줘"

## Prerequisites

- 인터넷 연결
- `python3`
- 설치된 skill payload 안에 `scripts/mfds_food_safety.py` helper 포함
- `k-skill-proxy`의 food-safety route들이 있는 hosted/self-host 프록시에 접근 가능할 것

## Credential requirements

- 사용자 측 **필수** 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA_GO_KR_API_KEY` 는 **프록시 운영 서버** 환경에서 부적합 식품 live 조회용으로만 둔다.
- `FOODSAFETYKOREA_API_KEY` 는 **프록시 운영 서버** 환경에서 식품안전나라 live 조회용으로만 둔다. 없으면 public sample feed로 fallback 할 수 있다.
- FOODSAFETYKOREA_API_KEY 발급: `https://www.foodsafetykorea.go.kr` 에서 회원가입 후 OpenAPI 이용신청. 하나의 키로 I-0040, I-0050, I0490, I2620 등 모든 서비스 호출 가능.

## Mandatory interview first

증상/섭취상황이 언급되면 결론을 말하기 전에 먼저 되묻는다.

권장 첫 질문 예시:

- `누가 무엇을 언제 얼마나 먹었는지, 지금 복통/구토/설사/발진 같은 증상이 있는지 먼저 알려주세요.`
- `호흡곤란, 혈변, 심한 탈수, 의식저하, 심한 복통/고열이 있으면 즉시 응급실이나 119가 우선입니다.`

## Official surfaces

- 공공데이터포털 문서: `https://www.data.go.kr/data/15056516/openapi.do`
- 부적합 식품 endpoint: `https://apis.data.go.kr/1471000/PrsecImproptFoodInfoService03/getPrsecImproptFoodList01`
- 식품안전나라 회수·판매중지 (I0490): `https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=I0490&svc_type_cd=API_TYPE06`
- 식품안전나라 회수 sample: `https://openapi.foodsafetykorea.go.kr/api/sample/I0490/json/1/5`
- 건강기능식품 기능성 원료 인정현황 (I-0040): `https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=I-0040&svc_type_cd=API_TYPE06`
- 건강기능식품 기능성 원료 sample: `https://openapi.foodsafetykorea.go.kr/api/sample/I-0040/json/1/5`
- 건강기능식품 개별인정형 정보 (I-0050): `https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=I-0050&svc_type_cd=API_TYPE06`
- 건강기능식품 개별인정형 sample: `https://openapi.foodsafetykorea.go.kr/api/sample/I-0050/json/1/5`
- 검사부적합(국내) (I2620): `https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=I2620&svc_type_cd=API_TYPE06`
- 검사부적합(국내) sample: `https://openapi.foodsafetykorea.go.kr/api/sample/I2620/json/1/5`
- 건강기능식품 품목제조 신고사항 (I0030): `https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=I0030&svc_type_cd=API_TYPE06`
- 건강기능식품 품목제조 신고 sample: `https://openapi.foodsafetykorea.go.kr/api/sample/I0030/json/1/5`
- 프록시 route: `GET /v1/mfds/food-safety/search`
- 프록시 route: `GET /v1/mfds/food-safety/health-food-ingredient`
- 프록시 route: `GET /v1/mfds/food-safety/product-report`
- 프록시 route: `GET /v1/mfds/food-safety/inspection-fail`

## Workflow

1. 증상/섭취상황이 있으면 인터뷰를 먼저 진행한다.
2. red flag 가 있으면 즉시 응급 안내로 전환한다.
3. "이거 먹어도 되나?" 류 질문:
   - `/v1/mfds/food-safety/product-report` 로 건강기능식품 품목제조 신고사항을 조회한다 (원재료, 기능성, 섭취 주의사항, 기준규격). 고시형 원료(차전자피 등)는 여기서 확인.
   - `/v1/mfds/food-safety/health-food-ingredient` 로 건강기능식품 기능성 원료 인정현황을 조회한다 (개별인정형 원료의 1일 섭취량, 주의사항).
   - `/v1/mfds/food-safety/inspection-fail` 로 국내 검사부적합 이력을 확인한다.
   - `/v1/mfds/food-safety/search` 로 회수·부적합 공개 목록도 함께 조회한다.
4. 제품명, 업체명, 기능성, 섭취량, 주의사항, 부적합 사유를 짧게 정리하고, 먹어도 되는지 단정하지 않는다.
5. 프록시가 `FOODSAFETYKOREA_API_KEY` 없이 동작 중이면 결과가 sample feed 기반일 수 있음을 warnings 로 확인한다.

## CLI examples

```bash
python3 scripts/mfds_food_safety.py interview \
  --question "이 김밥 먹어도 되나요?" \
  --symptoms "복통과 설사"
```

```bash
python3 scripts/mfds_food_safety.py search --query "김밥" --limit 5
```

```bash
python3 scripts/mfds_food_safety.py product-report --query "차전자피" --limit 5
```

```bash
python3 scripts/mfds_food_safety.py health-food-ingredient --query "스타놀" --limit 5
```

```bash
python3 scripts/mfds_food_safety.py inspection-fail --query "쪽갓" --limit 5
```

## Response policy

- 이 스킬은 **직접 진단**을 하지 않는다.
- 이 스킬은 **식중독 진단**이나 **섭취 허가/금지의 최종 판정**을 하지 않는다.
- 공식 공개 목록에 있는 사실만 전달한다.
- 증상이 있는 질문은 인터뷰 없이 바로 답하지 않는다.
- red flag 또는 고위험군이면 의료진 상담을 우선 권고한다.

## Done when

- 증상 또는 섭취상황을 먼저 되물었다.
- red flag 여부를 확인했다.
- 프록시 route를 통해 공식 공개 목록에서 제품명 또는 업체명 기준 결과를 최소 1건 이상 찾았거나, 없다고 분명히 알렸다.
- 제품명, 업체명, 공개사유/부적합 사유, 공개일자를 포함한 요약을 제공했다.
