---
name: nts-tax-delinquency
description: 국세청 고액·상습체납자 명단공개를 nts.go.kr 공개 검색으로 조회한다. 상호·법인명으로 법인 명단과 개인 명단을 대조해 공개된 체납 사실(총 체납액·세목·체납요지 등)을 나열한다. 인증키 불필요. 돌쇠에서는 공식 표면을 통한 후속 액션까지 진행한다.
license: MIT
metadata:
  category: business
  locale: ko-KR
  phase: v1
---

# 국세청 고액·상습체납자 명단공개 검색

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.

## Dolshoi action path

- Use the documented data/lookup path to gather the exact eligibility, recipient, amount, evidence, and official form inputs.
- In Dolshoi, open the official surface in CloakBrowser, use vault-backed login, and populate/upload all reversible fields and documents instead of ending with a checklist or link.
- Immediately before payment, donation, filing, final submission, cancellation, or another irreversible account mutation, call `clarify` with the exact recipient, amount/payload, and effect. After approval, submit and verify the official result.
- Keep CAPTCHA, identity proofing, electronic signature, legal judgment, and unsupported official surfaces as hard boundaries; otherwise later read-only wording is generic fallback only.



## What this skill does

국세청 누리집의 **고액·상습체납자 명단공개**(국세기본법 제85조의5)를 무인증 공개 검색으로 직접 조회한다.

- 법인 명단: 법인명으로 검색 — 공개년도·법인명·대표자·업종·소재지·총 체납액·세목·체납건수·체납요지
- 개인 명단: 상호로 검색 — 공개년도·성명·연령·상호·직업·주소·총 체납액·세목·체납요지

이 명단에는 **사업자등록번호가 수록되지 않는다.** 상호·법인명 문자열 일치 후보의 공개 사실만 나열하며, 동명 상호 가능성은 사용자가 판단한다.

## Design principles

- 점수·등급·해석 라벨을 만들지 않는다. 공개된 사실 + 출처만 담는다.
- 인증 없이 동작하는 공개 read-only 검색이므로 프록시를 거치지 않고 사용자 머신에서 직접 호출한다.
- HTML 스크래핑이므로 페이지 마커가 어긋나면 즉시 `unavailable`로 강등하고 수동 확인 경로를 안내한다.

## When to use

- "이 회사(거래처/의뢰인) 국세 체납 명단공개에 올라 있어?"
- "상호로 고액·상습체납자 명단 대조해줘"

## Prerequisites

- 인터넷 연결, `python3` (stdlib만 사용 — 추가 의존성 없음)
- `scripts/nts_tax_delinquency.py` helper

## Credential requirements

- 없음. 무인증 공개 검색이다.

## Inputs

- `--name`: 상호·법인명 — 필수 (명단에 사업자등록번호가 없어 번호로는 검색 불가)

## Privacy boundary

- 입력한 상호·법인명은 국세청 누리집으로 전송된다.
- 명단공개 자료에 사업자등록번호가 없어 상호·법인명 문자열 일치의 공개 사실만 나열한다.

## CLI examples

```bash
python3 nts-tax-delinquency/scripts/nts_tax_delinquency.py --name "○○건설"
```

## Failure modes

- `unavailable` + 안내: 상호 미입력, 네트워크 오류, 페이지 구조 변경 추정 — 수동 확인 URL 제공.
- 0건: 두 명단 모두 매치 없음 (`match_count: 0`).

## Official surfaces

- 명단공개 검색: `https://www.nts.go.kr/nts/ad/openInfo/selectList.do`
