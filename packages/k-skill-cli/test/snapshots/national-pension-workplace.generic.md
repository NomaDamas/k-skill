# national-pension-workplace — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 국민연금 가입 사업장 내역 조회

## What this skill does

공공데이터포털의 **국민연금공단_국민연금 가입 사업장 내역 서비스**(data.go.kr 3046071, V2)를 `k-skill-proxy` 경유로 호출해 다음을 조회한다.

- 가입 사업장 후보: 사업장명 + 사업자번호 앞 6자리로 매칭된 사업장 목록 (자료생성년월별 중복은 사업장당 최신 월로 정리)
- 단일 사업장이 특정되면 상세: 가입자수(`jnngpCnt`), 당월 고지금액(`crrmmNtcAmt`), 신규취득/상실 인원
- 월별 가입 현황 시계열

사업자등록번호는 **앞 6자리만 공개**(뒷자리 마스킹)되므로 사업장명이 필수이며, 후보가 여럿이면 특정하지 않고 목록 그대로 돌려준다.

## Design principles

- 점수·등급·"위험" 같은 해석 라벨을 만들지 않는다. upstream이 돌려준 사실만 담는다.
- 후보가 여럿이면 동일성을 단정하지 않는다.

## When to use

- "○○ 회사 직원 규모가 얼마나 돼? 국민연금 가입자수로 보자"
- "이 사업장 당월 국민연금 고지금액이 얼마야?"
- "최근 인원이 늘었는지 줄었는지 월별로 보자"

## Prerequisites

- 인터넷 연결, `python3`
- `scripts/national_pension_workplace.py` helper
- hosted/self-host `k-skill-proxy`의 `/v1/national-pension/workplace` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host 프록시를 쓸 때만 설정. 비우면 hosted `https://k-skill-proxy.nomadamas.org` 사용.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털에서 `국민연금공단_국민연금 가입 사업장 내역` 활용신청이 되어 있어야 한다.

## Inputs

- `--name`: 사업장명(상호) — 필수
- `--b-no`: 사업자등록번호(하이픈 허용). 앞 6자리만 prefix 필터로 쓰인다.

## Privacy boundary

- 국민연금 데이터는 사업자번호 앞 6자리만 공개되므로, 6자리 일치 + 상호 유사 후보를 나열할 뿐 사업장 동일성을 단정하지 않는다.
- 공개 범위는 법인·근로자 일정 규모 이상 사업장 위주이며, 소규모/개인 사업장은 미공개일 수 있다.

## CLI examples

```bash
python3 national-pension-workplace/scripts/national_pension_workplace.py \
  --name "삼성전자(주)" --b-no 124-81-00998
```

## Failure modes

- `400 bad_request`: 사업장명을 주지 않음.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 없음.
- `502 upstream_forbidden`: 프록시 키가 3046071에 활용신청되지 않음.
- 후보 다수: `selected_candidate`가 `null` — 사용자가 후보 목록에서 특정한다.

## Official surfaces

- 공공데이터포털: <https://www.data.go.kr/data/3046071/openapi.do>
- upstream: `https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2` (요청 파라미터 camelCase)
- 프록시 route: `GET /v1/national-pension/workplace`
