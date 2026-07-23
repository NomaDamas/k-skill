# fsc-corporate-info — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 금융위 기업기본정보(법인 개요) 조회

## What this skill does

공공데이터포털의 **금융위원회_기업기본정보 서비스**(data.go.kr 15043184, `getCorpOutline_V2`)를 `k-skill-proxy` 경유로 호출해 법인 개요를 조회한다.

- 법인명(`corpNm`) 기준 후보 목록: 대표자·설립일·업종 등 upstream 필드 원문
- 사업자번호 교차검증: 응답 item에 `bzno`가 있으면 입력 사업자번호와 정확 일치하는 후보를 분리한다 (`bzno`가 없으면 교차검증 불가 사실을 그대로 표기)

이 API의 검색 파라미터는 `crno`(법인등록번호 13자리)/`corpNm`(법인명)뿐이라 **사업자번호 단독 조회가 불가**하다. 법인명으로 조회한다.

## Design principles

- 점수·등급·해석 라벨을 만들지 않는다. upstream 사실 + 출처만 담는다.
- `crno`(법인등록번호)는 사업자등록번호와 별개 번호임을 혼동하지 않는다.

## When to use

- "이 법인 대표자·설립일·업종 개요 확인해줘"
- "법인명으로 기업 기본정보 조회해줘"

## Prerequisites

- 인터넷 연결, `python3`
- `scripts/fsc_corporate_info.py` helper
- hosted/self-host `k-skill-proxy`의 `/v1/fsc/corp-outline` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host 프록시를 쓸 때만 설정. 비우면 hosted `https://k-skill-proxy.nomadamas.org` 사용.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털에서 `금융위원회_기업기본정보` 활용신청이 되어 있어야 한다.

## Inputs

- `--name`: 법인명(`corpNm`) — 필수
- `--b-no`: 사업자등록번호. 응답에 `bzno`가 있을 때 교차검증에만 쓰인다.

## CLI examples

```bash
python3 fsc-corporate-info/scripts/fsc_corporate_info.py \
  --name "삼성전자" --b-no 124-81-00998
```

## Failure modes

- `400 bad_request`: 법인명을 주지 않음.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 없음.
- `502 upstream_forbidden`: 프록시 키가 15043184에 활용신청되지 않음.
- 빈 결과: 법인명 불일치 — 표기를 바꿔 재시도.

## Official surfaces

- 공공데이터포털: <https://www.data.go.kr/data/15043184/openapi.do>
- upstream: `https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2`
- 프록시 route: `GET /v1/fsc/corp-outline`
