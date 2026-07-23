---
name: g2b-sanctioned-supplier
description: 조달청 나라장터 부정당제재업체정보를 공공데이터포털 API(k-skill-proxy 경유)로 조회한다. 사업자등록번호 정확 일치로 조회시점 현재 유효한 입찰참가자격 제한(부정당제재)의 기간·제재기관·근거법률을 확인한다.
license: MIT
metadata:
  category: business
  locale: ko-KR
  phase: v1
---

# 나라장터 부정당제재업체정보 조회

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.


## What this skill does

공공데이터포털의 **조달청 나라장터 사용자정보 서비스**(data.go.kr 15129466, `getUnptRsttCorpInfo02`)를 `k-skill-proxy` 경유로 호출해, 사업자등록번호 정확 일치(`inqryDiv=1`)로 **조회시점 현재 유효한** 부정당제재를 조회한다.

- 반환: 제재 시작/종료일자, 제재기관명, 계약법구분, 제재근거법률 등 upstream 필드 원문

## Coverage boundary

upstream 명세상 다음은 **제공되지 않는다** — 과거 이력 조회가 아니다.

- 조회시점에 제재만료·해제된 건
- 나라장터 미등록업체·개인에 대한 제재

만료 이력까지 보려면 나라장터(<https://www.g2b.go.kr>)에서 수동 확인이 필요하다.

## Design principles

- 점수·등급·해석 라벨을 만들지 않는다. upstream 사실 + 출처 + 적용범위 한계만 담는다.

## When to use

- "이 회사 입찰 제재(부정당제재) 이력 있어?"
- "거래/계약 전에 부정당업자 제재 여부 확인해줘"

## Prerequisites

- 인터넷 연결, `python3`
- `scripts/g2b_sanctioned_supplier.py` helper
- hosted/self-host `k-skill-proxy`의 `/v1/g2b/sanctioned-supplier` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host 프록시를 쓸 때만 설정. 비우면 hosted `https://k-skill-proxy.nomadamas.org` 사용.
- `DATA_GO_KR_API_KEY` 는 프록시 운영 서버 환경에만 둔다. 공공데이터포털에서 `조달청_나라장터 사용자정보 서비스`(부정당제재업체정보조회 포함) 활용신청이 되어 있어야 한다.

## Inputs

- `--bizno`: 사업자등록번호 10자리(하이픈 허용) — 필수

## CLI examples

```bash
python3 g2b-sanctioned-supplier/scripts/g2b_sanctioned_supplier.py --bizno 124-81-00998
```

## Failure modes

- `400 bad_request`: 사업자번호가 10자리가 아님.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 없음.
- `502 upstream_forbidden`: 프록시 키가 15129466에 활용신청되지 않음.
- `total_count = 0`: 조회시점 현재 유효한 제재 없음 (만료·미등록업체는 미제공임에 유의).

## Official surfaces

- 공공데이터포털: <https://www.data.go.kr/data/15129466/openapi.do>
- upstream: `https://apis.data.go.kr/1230000/ao/UsrInfoService02/getUnptRsttCorpInfo02`
- 수동 대조: 나라장터 <https://www.g2b.go.kr>
- 프록시 route: `GET /v1/g2b/sanctioned-supplier`
