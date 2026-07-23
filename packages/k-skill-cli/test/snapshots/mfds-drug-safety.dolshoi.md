# mfds-drug-safety — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 의약품 안전 체크

## What this skill does

식약처 공식 OpenAPI를 **`k-skill-proxy` 경유**로 조회해 **의약품개요정보(e약은요)** 와 **안전상비의약품 정보**를 확인한다.

하지만 사용자가 증상이나 복용 상황을 말하면 **바로 단정하지 말고 먼저 되묻는다.**

- 본인/아이/임산부/고령자 여부
- 어떤 약을 이미 먹었는지 / 지금 먹으려는지
- 언제부터 얼마나 복용했는지
- 현재 증상, 기저질환, 알레르기, 복용 중인 다른 약
- red flag (`호흡곤란`, `의식저하`, `심한 발진`, `지속되는 구토/흉통`)

red flag 가 있으면 API 조회보다 **즉시 119·응급실·의료진 연결**을 우선한다.

## When to use

- "이 약이랑 이 약 같이 먹어도 되니?"
- "타이레놀 먹는 중인데 판콜 같이 먹어도 돼?"
- "두드러기가 있는데 이 약 계속 먹어도 되나?"
- "식약처 공식 약 정보로 효능/주의사항 확인해줘"

## Prerequisites

- 인터넷 연결
- `python3`
- 설치된 skill payload 안에 `scripts/mfds_drug_safety.py` helper 포함
- `k-skill-proxy`의 `/v1/mfds/drug-safety/lookup` route가 있는 hosted/self-host 프록시에 접근 가능할 것

## Credential requirements

- 사용자 측 **필수** 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `DATA_GO_KR_API_KEY` 는 **프록시 운영 서버** 환경에만 둔다.

## Mandatory interview first

증상/복용상황이 언급되면 바로 결론을 말하지 말고 먼저 되묻는다.

권장 첫 질문 예시:

- `누가 복용하려는지(본인/아이/임산부/고령자), 이미 먹은 약 이름, 언제 얼마나 복용했는지, 지금 있는 증상을 먼저 알려주세요.`
- `호흡곤란, 의식저하, 입술·혀 붓기, 심한 전신 발진이 있으면 즉시 119 또는 응급실로 가야 합니다.`

## Official surfaces

- 공공데이터포털 문서: `https://www.data.go.kr/data/15075057/openapi.do`
- e약은요 endpoint: `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`
- 공공데이터포털 문서: `https://www.data.go.kr/data/15097208/openapi.do`
- 안전상비의약품 endpoint: `https://apis.data.go.kr/1471000/SafeStadDrugService/getSafeStadDrugInq`
- 프록시 route: `GET /v1/mfds/drug-safety/lookup`

## Workflow

1. 증상/복용상황이 있으면 인터뷰를 먼저 진행한다.
2. red flag 가 하나라도 있으면 즉시 응급 안내로 전환한다.
3. 약 이름이 확인되면 `k-skill-proxy`의 `/v1/mfds/drug-safety/lookup` 으로 공식 정보를 조회한다.
4. 효능, 사용법, 주의사항, 상호작용, 이상반응, 보관법을 짧게 정리한다.
5. `같이 먹어도 되나?` 질문에는 공식 상호작용 문구만 근거로 제시하고, 최종 판단은 약사·의료진 확인이 필요하다고 명시한다.

## CLI examples

```bash
python3 scripts/mfds_drug_safety.py interview \
  --question "타이레놀이랑 판콜 같이 먹어도 되나요?" \
  --symptoms "두드러기와 어지러움"
```

```bash
python3 scripts/mfds_drug_safety.py lookup --item-name "타이레놀" --item-name "판콜"
```

## Response policy

- 이 스킬은 **진단/처방/복용 지시**를 하지 않는다.
- 공식 문서에 있는 효능/주의/상호작용 문구만 근거로 요약한다.
- 상호작용 문구가 모호하거나 red flag 가 있으면 약사·의사 상담으로 넘긴다.
- 증상이 있는 질문은 인터뷰 없이 바로 답하지 않는다.

## Done when

- 증상 또는 복용상황을 먼저 되물었다.
- red flag 여부를 확인했다.
- 프록시 route를 통해 공식 endpoint 조회 결과를 JSON으로 정리했다.
- 최소한 제품명, 업체명, 효능/주의/상호작용이 포함된 요약을 제공했다.
