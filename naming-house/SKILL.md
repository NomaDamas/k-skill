---
name: naming-house
description: 생년월일시와 성씨·후보 이름을 바탕으로 사주 오행과 성명학 점수를 참고해 어울리는 한국 이름을 추천한다.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

# Naming House

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.


## What this skill does

`naming-house` npm package로 생년월일시 기반 사주 오행, 한자/한글 획수, 발음 흐름, 사용자 선호를 함께 보아 한국 이름 후보를 추천·채점한다. 사주 계산은 기존 `saju-fortune` package의 공개 `analyzeSaju` 결과를 사용하고, 이름 쪽 획수·오행 보조 계산은 `namefyi`와 `korean-stroke`를 로컬에서 호출한다.

이 스킬은 작명 결과를 확정 운명이나 법적 이름 검증으로 제시하지 않는다. 후보별 점수, 근거, 한계를 투명하게 보여 주는 성명학 참고 워크플로우다.

## When to use

- "아이 이름 추천해줘"
- "사주에 맞는 이름 후보를 골라줘"
- "성명학으로 이 이름들이 어떤지 비교해줘"
- "한자 이름 후보의 획수와 오행 흐름을 보고 싶어"

## When not to use

- 법적으로 사용 가능한 인명용 한자인지 확정해야 하는 경우
- 사망, 질병, 불행, 성공 같은 운명을 단정해야 하는 경우
- 생년월일시·성씨·후보 이름 없이 일반적인 예쁜 이름만 원하는 경우
- 전문 작명가·법률·행정 판단을 대체해야 하는 경우

## Prerequisites

- Node.js 18+
- 배포 후: `npm install -g naming-house`
- 실행 전: `export NODE_PATH="$(npm root -g)"`
- 이 저장소에서 개발할 때: 루트에서 `npm install`

## Required interview inputs

1. 성씨(한글)와 가능하면 성 한자
2. 양력/음력 여부
3. 생년월일 (`YYYY-MM-DD`)
4. 태어난 시간 (`HH:mm`, 모르면 모른다고 기록하고 한계를 설명)
5. 성별 (`male` 또는 `female`으로 package 호출)
6. 출생 시군구(선택)
7. 후보 이름 목록(한글 이름 필수, 한자 이름 선택)
8. 선호 음절, 피하고 싶은 음절, 이름 스타일(선택)

음력 생일이면 이 패키지 안에서 변환하지 않는다. 검증된 만세력으로 양력 생년월일을 먼저 확인한 뒤 `calendar: "solar"`로 호출한다.

## Workflow

### 1. Interview first

정보가 부족하면 바로 작명하지 말고 필요한 값을 짧게 묻는다.

```text
작명을 위해 성씨, 양력 생년월일, 태어난 시간, 성별, 후보 이름을 알려주세요. 한자 후보가 있으면 함께 주시면 획수·오행 분석 정확도가 올라갑니다.
```

태어난 시간을 모르면:

```text
태어난 시간을 모르면 시주 기반 보완 오행은 확정하지 못해요. 연·월·일 중심의 보수적 추천으로 진행하고 한계를 함께 표시할게요.
```

### 2. Install package when missing

`node -e 'require("naming-house")'`가 실패하면 웹 스크래핑이나 MCP 서버 실행으로 우회하지 말고 package 설치를 먼저 시도한다.

```bash
npm install -g naming-house
export NODE_PATH="$(npm root -g)"
```

### 3. Recommend from candidates

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const { recommendNames } = require("naming-house")

recommendNames({
  surname: "김",
  surnameHanja: "金",
  birthDate: "2024-05-18",
  birthTime: "09:20",
  calendar: "solar",
  gender: "female",
  birthCity: "서울",
  preferences: { style: "modern", maxCandidates: 10 },
  candidates: [
    { givenName: "서아", hanjaName: "瑞雅", tags: ["modern"] },
    { givenName: "하린", hanjaName: "河潾" },
    { givenName: "지유" }
  ]
}).then((result) => console.log(JSON.stringify(result, null, 2)))
JS
```

### 4. Score one candidate

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const { callNamingHouseTool } = require("naming-house")

callNamingHouseTool("score_name", {
  input: {
    surname: "박",
    surnameHanja: "朴",
    birthDate: "2024-05-18",
    birthTime: "09:20",
    calendar: "solar",
    gender: "male",
    candidates: [{ givenName: "서준", hanjaName: "瑞俊" }]
  },
  candidate: { givenName: "서준", hanjaName: "瑞俊" }
}).then((result) => console.log(JSON.stringify(result, null, 2)))
JS
```

### 5. Interpret results

응답은 아래 구조를 따른다.

1. 입력 정보와 정확도 한계: 음력 변환 여부, 태어난 시간, 한자 누락 여부를 확인한다.
2. 사주 오행 요약: 부족/보완 오행과 일간 중심을 짧게 설명한다.
3. 후보별 점수: 총점, 등급, `elementBalance`, `strokeHarmony`, `soundFlow`, `preferenceFit`를 보여 준다.
4. 성명학 풀이: 한자 획수 또는 한글 fallback, 오행 상생/상극, 발음 흐름을 설명한다.
5. 추천 순서: 점수가 높은 순서대로 장점과 주의점을 함께 적는다.
6. 주의 문구: 성명학은 문화적 참고이며 법적 개명·인명용 한자 검증·운명 판단을 대신하지 않는다고 말한다.

## Done when

- 필요한 출생 정보와 이름 후보를 인터뷰로 확인했다.
- `naming-house` package 결과 JSON을 근거로 점수와 순위를 설명했다.
- 사주 보완 오행, 획수 조화, 발음 흐름, 선호 반영을 분리해 설명했다.
- 음력, 태어난 시간 미상, 한자 누락, 한자 획수 불가 같은 한계를 명시했다.
- MCP 서버, proxy, 웹 스크래핑을 실행하지 않았다.

## Failure modes

- package가 설치되지 않았고 네트워크도 없으면 설치 실패를 설명하고 진행하지 않는다.
- 음력 또는 윤달 생일은 내장 계산으로 변환하지 않는다.
- 태어난 시간이 없으면 시주와 시주 기반 해석은 확정할 수 없다.
- 한자 이름이 없으면 `korean-stroke` 기반 한글 획수 fallback으로 채점하며 정확도가 낮다고 표시한다.
- 한자 획수나 오행을 확인하지 못하면 해당 후보의 한자 수리 해석을 확정하지 않는다.
- 후보 이름이 없으면 임의·무작위 생성 대신 선호 조건을 더 물어본다.

## Notes

- 입력한 생년월일시와 이름 후보는 풀이 중에만 사용하고 영구 저장하지 않는다.
- 성명학 점수는 참고용이며 의료, 투자, 법률, 행정, 가족 의사결정을 대신하지 않는다.
- 불안감을 키우는 흉언, 저주, 사망 예언, 질병 확정 표현은 하지 않는다.
- v1은 공식 인명용 한자 적합성, 불용문자, 법원 개명 가능성을 보증하지 않는다.
