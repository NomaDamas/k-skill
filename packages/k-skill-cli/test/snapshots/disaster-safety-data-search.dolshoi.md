# disaster-safety-data-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 재난안전데이터 공유플랫폼 조회

## Draft status

이 스킬은 #393의 **draft scaffold**다. 재난안전데이터 공유플랫폼은
단일 범용 endpoint가 아니라 데이터셋별 `dataSn`과 `DSSP-IF-*` 인터페이스,
데이터별 활용신청·인증키를 사용한다. 대표 데이터셋과 운영 키가 확정되기
전에는 live 조회를 구현한 것으로 간주하지 않는다.

## Planned v1

- 공식 카탈로그에서 데이터셋 발견
- 데이터셋 상세의 제공기관, `dataSn`, `intrfId`, 갱신주기 확인
- 좁게 allowlist한 데이터셋의 read-only 조회
- 빈 결과, 활용승인 누락, quota, CAPTCHA/로그인, 상류 장애를 구분

## Prerequisite

운영자는 재난안전데이터 공유플랫폼에서 대표 데이터셋별 OpenAPI 이용신청과
인증키 발급을 완료한 뒤 gpu01 proxy runtime env에 등록해야 한다. 키는
저장소·PR·로그·사용자 응답에 노출하지 않는다.

공식 표면: https://www.safetydata.go.kr/disaster-data/list2

## Draft stop condition

대표 데이터셋과 실제 성공 응답이 확정되면 실패하는 live E2E부터 추가하고,
그 뒤 proxy route와 helper를 구현한다. 현재 PR은 이 범위와 blocker를
공유하기 위한 draft다.
