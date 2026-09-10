# nongsaro-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 농사로 작목·병해충·농업기술 조회

## Draft status

이 스킬은 #389의 **draft scaffold**다. 농사로는 서비스별 Open API 계약과
인증키·응답 필드가 다르므로 대표 operation을 실제 운영 키로 검증하기
전까지 live 조회 구현으로 간주하지 않는다.

## Planned v1

- 작목·농업기술 정보
- 병해충·방제 정보
- 좁은 서비스 allowlist와 공식 필드 보존
- 빈 결과, 키 오류, quota, 상류 장애 구분

## Prerequisite

농사로 Open API 이용신청과 인증키 발급 후 gpu01 proxy runtime env에
등록한다. 키는 저장소·PR·로그·사용자 응답에 노출하지 않는다.

공식 API 안내: https://www.nongsaro.go.kr/portal/ps/psz/psza/contentMain.ps?menuId=PS00191

## Draft stop condition

대표 operation의 실제 성공 응답을 확인하면 실패하는 live E2E부터 추가하고
proxy route, helper, 문서와 manual QA를 완성한다.
