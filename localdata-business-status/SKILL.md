---
name: localdata-business-status
description: 지방행정 인허가데이터(LOCALDATA)로 동네 사업장(식당·카페·숙박·약국·미용실·학원 등 인허가 업종 208종)의 영업/휴업/폐업 상태, 인허가일자(업력), 폐업일자, 업태, 주소를 조회한다. 상호+시군구로 검색하며 인증키 불필요.
license: MIT
metadata:
  category: business
  locale: ko-KR
  phase: v1
---

# 지방행정 인허가 영업상태 조회 (동네 사업장)

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.


## What this skill does

행정안전부 **지방행정 인허가데이터(LOCALDATA)**의 지역별 CSV를 `file.localdata.go.kr`에서 직접 받아, 동네 사업장의 영업상태를 조회한다.

- 영업상태(영업/휴업/폐업), 상세영업상태, 인허가일자(업력), 폐업일자, 업태구분, 도로명/지번 주소, 데이터갱신시점
- 인허가 업종 **208종 전체** 지원 — 한글명("약국", "숙박업", "일반음식점")으로 지정 가능

전국 통파일이 업종당 수백 MB라 **시군구 단위 지역 지정**(`--region`)이 필요하다. 받은 파일은 1일 로컬 캐시한다.

이 자료에는 **사업자등록번호가 수록되지 않는다.** 상호(사업장명) 문자열 일치 후보의 사실만 나열하며, 동명 상호 가능성은 사용자가 판단한다. 자료는 매일 갱신되며 2일 전 기준으로 현행화된다.

## Design principles

- 점수·등급·해석 라벨을 만들지 않는다. 조회된 사실 + 출처 + 조회시각만 담는다.
- 인증 없이 동작하는 공개 파일 서버이므로 프록시를 거치지 않고 사용자 머신에서 직접 호출한다.

## When to use

- "제주시 ○○호텔 지금 영업 중이야? 오래된 곳이야?" — 사업자번호를 몰라도 상호+시군구로 조회
- "이 동네 가게 폐업했어?", "이 식당 인허가가 언제야(업력)?"

## Prerequisites

- 인터넷 연결, `python3` (stdlib만 사용 — 추가 의존성 없음)
- `scripts/localdata_business_status.py` helper
- `data/localdata_industries.json`(업종 208종), `data/localdata_orgcodes.json`(지자체 245종)

## Credential requirements

- 없음. 무인증 공개 파일 다운로드다.

## Inputs

- `--name`: 상호(사업장명) — 필수
- `--region`: 시군구 — 필수 (예: `제주제주시`, `서울종로구`, `경기수원시`)
- `--industry`: 업종 slug 또는 한글명 (여러 번 지정 가능). 생략 시 일반음식점·휴게음식점·숙박업

## Privacy boundary

- 입력한 상호·지역은 LOCALDATA 파일 서버로 전송된다(다운로드 요청 파라미터).
- 자료에 사업자등록번호가 없어 상호 문자열 매칭이며 동일성을 단정하지 않는다.

## CLI examples

```bash
python3 localdata-business-status/scripts/localdata_business_status.py \
  --name "호텔샬롬" --region 제주제주시 --industry 숙박업

# 업종 여러 개
python3 localdata-business-status/scripts/localdata_business_status.py \
  --name "○○약국" --region 서울종로구 --industry 약국
```

## Failure modes

- `unavailable` + 안내: 상호/지역 미입력, 지역·업종 특정 실패(후보 나열), 다운로드 실패 — 수동 확인 URL 제공.
- 0건: 매치 없음 (`total_match_count: 0`).

## Official surfaces

- 인허가 영업상태: `https://file.localdata.go.kr/file/download/<업종slug>/info?orgCode=<지자체코드>` (무인증, Referer 필요, CP949 CSV)
- 본체: <https://www.localdata.go.kr>
