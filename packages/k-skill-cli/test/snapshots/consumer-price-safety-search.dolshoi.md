# consumer-price-safety-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 소비자 가격·안전 조회

## Draft status

이 스킬은 #390의 **draft scaffold**다. 참가격과 소비자24는 서로 다른
upstream이다. 소비자24는 `openapiSvcId`(서비스 카탈로그 ID), 서비스별
승인 `serviceKey`, 리콜 메뉴 `cntntsId`를 분리해 관리해야 한다.

## Planned v1

- 참가격 품목·지역별 가격
- 소비자24 물품정보
- 소비자24 전체 신청 서비스의 리콜 정보
- 서비스별 키 allowlist와 공식 오류 코드 보존

## Credential model

`serviceKey`만 secret이며 gpu01 runtime env에 보관한다. `openapiSvcId`와
`cntntsId`는 공개 매핑이므로 저장소 코드에 둘 수 있다. 최종 env 이름과
서비스별 성공 여부는 live probe 후 확정한다.

## Official sources

- 참가격: https://www.data.go.kr/dataset/3043385/openapi.do
- 소비자24 목록: https://www.consumer.go.kr/user/ftc/consumer/openApiSvcUser/120/selectOpenApiSvcList.do

## Draft stop condition

전체 신청 서비스별 키가 실제 성공하는지 확인하고 실패하는 live E2E부터
추가한 뒤 proxy route, helper, parser, 문서와 manual QA를 완성한다.
