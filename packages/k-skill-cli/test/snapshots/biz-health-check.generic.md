# biz-health-check — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Resolve credentials in this order: already-injected environment variables, then the host vault, then `~/.config/k-skill/secrets.env` (mode `0600`). If the value is missing, request it through the safest input surface the host provides and store it in the vault or dotenv; never echo it back.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 사업자 실사 복합 조회 (biz-health-check)

## What this skill does

사업자등록번호(+상호/지역)를 입력하면 무료 공공 데이터 6종을 한 번에 교차 조회해 실사 리포트 한 장을 만든다. 같은 레포의 단품 스킬 helper를 그대로 재사용한다(단일 진실원천).

| 섹션 | 데이터 | 단품 스킬 | 경로 |
|---|---|---|---|
| 국세청 상태 | 계속/휴업/폐업·과세유형 | `nts-business-registration` | proxy |
| 국민연금 | 가입자수·당월 고지금액·월별 | `national-pension-workplace` | proxy |
| 체납 명단 | 고액·상습체납자 명단공개 대조 | `nts-tax-delinquency` | 직접(무인증) |
| 금융위 | 대표자·설립일·업종 법인개요 | `fsc-corporate-info` | proxy |
| 부정당제재 | 조회시점 유효 제재 | `g2b-sanctioned-supplier` | proxy |
| 인허가 영업상태 | 동네 사업장(208업종) 영업/폐업·업력 | `localdata-business-status` | 직접(무인증) |

공시 유무는 기존 `k-dart` 스킬을 함께 쓰면 된다.

## Design principles

- **점수·등급·"위험" 같은 해석 라벨을 산출하지 않는다.** 각 항목의 사실 + 출처 + 조회시각만 병렬한다. 판단은 사용자 몫이다.
- 한 항목 조회가 실패해도 전체를 막지 않고 그 항목만 정직하게 강등한다(`unavailable` + 사유).
- 단품 helper를 찾지 못하면(개별 설치 등) 해당 섹션만 건너뛰고 나머지를 진행한다.

## When to use

- "이 사업자(거래처/의뢰인) 실제 문제 없는지 한 번에 확인해줘"
- "○○○-○○-○○○○○ 살아있는 회사야? 직원은 좀 있고, 체납·입찰 제재 이력은 없어?"

## Prerequisites

- 인터넷 연결, `python3`
- 같은 레포의 단품 스킬 6종(이 복합이 helper를 재사용)
- proxy 섹션을 켜려면 hosted/self-host `k-skill-proxy` 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- proxy 섹션(국세청 상태·국민연금·금융위·부정당)은 운영 서버의 `DATA_GO_KR_API_KEY`로 동작한다. 활용신청 항목은 각 단품 스킬 문서를 따른다.
- 무인증 섹션(체납·인허가)은 키 없이 사용자 머신에서 직접 동작한다.

## Inputs

- `b_no`: 사업자등록번호 10자리(하이픈 허용) — 상태조회·부정당제재에 필요
- `--name`: 상호·법인명 — 국민연금·금융위·체납·인허가에 필요
- `--region`: 시군구 — 인허가(동네 사업장) 조회에 필요 (예: `제주제주시`)
- `--industry`: 인허가 업종(여러 번 지정 가능). 생략 시 음식점·카페·숙박

## CLI examples

```bash
python3 biz-health-check/scripts/biz_health_check.py 124-81-00998 --name "삼성전자"

# 동네 사업장까지 포함
python3 biz-health-check/scripts/biz_health_check.py --name "호텔샬롬" --region 제주제주시 --industry 숙박업
```

## Output

- `sections`: 6개 섹션 각각의 `data`(단품 응답 원문) 또는 `status: unavailable` + `note`
- 입력에 따라 일부 섹션은 생략된다(예: `--name` 없으면 국민연금/금융위/체납 생략).

## Failure modes

- 섹션별 강등은 리포트에 그대로 남는다(전체 실패가 아니다).
- proxy 섹션이 `503/502`면 운영 서버 키·활용신청 문제 — 각 단품 스킬 문서 참고.

## Official surfaces

- 각 단품 스킬 문서(`docs/features/<skill>.md`)의 공식 출처를 따른다.
