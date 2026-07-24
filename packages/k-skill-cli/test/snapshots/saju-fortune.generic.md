# saju-fortune — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- This skill produces local artifacts (documents, conversions, corrections, generated text). Completion means the requested artifact is actually created/edited and its location or content is reported. No external side effects are involved unless explicitly documented.

# Saju Fortune

## What this skill does

`saju-fortune` npm package로 사주팔자 기본 구조, 오행 분포, 용신 조율점, 주제별 운세, 궁합 풀이를 제공한다. 사용자를 바로 점치는 대신 먼저 필요한 정보를 인터뷰하고, 패키지 결과를 근거로 사주 풀이 에이전트처럼 대화한다.

이 스킬은 `hjsh200219/fortuneteller` MCP 서버의 도구 모델(`analyze_saju`, `check_compatibility`, `get_daily_fortune`, `get_dae_un`, `get_fortune_by_period`)을 참고하지만 **MCP 서버를 따로 실행하지 않는다**. 에이전트는 로컬/전역 npm package를 직접 호출한다.

## When to use

- "사주 봐줘"
- "올해 운세 어때?"
- "연애운/재물운/직업운/건강운 봐줘"
- "우리 궁합 봐줘"
- "생년월일시로 사주팔자 풀이해줘"

## When not to use

- 의학적 진단, 투자 수익 보장, 법적 판단처럼 전문 책임이 필요한 결정을 대신해야 하는 경우
- 사용자가 출생 정보를 제공하지 않고 사주 계산 없이 일반 조언만 원하는 경우
- 사주 풀이를 사실 확정이나 운명 결정론으로 제시해야 하는 경우

## Prerequisites

- Node.js 18+
- 배포 후: `npm install -g saju-fortune`
- 실행 전: `export NODE_PATH="$(npm root -g)"`
- 이 저장소에서 개발할 때: 루트에서 `npm install`

## Required interview inputs

사주 계산 전에 아래를 확인한다.

1. 이름(선택)과 한자 이름(선택)
2. 양력/음력
3. 생년월일 (`YYYY-MM-DD`)
4. 태어난 시간 (`HH:mm`, 모르면 모른다고 기록하고 시간 정확도 한계를 설명)
5. 성별 (`male` 또는 `female`으로 package 호출)
6. 출생 시군구(선택, 모르면 생략)
7. 보고 싶은 주제: 종합운, 연애운, 재물운, 직업운, 건강운, 한해 운세, 궁합

궁합은 두 사람 각각의 생년월일시와 성별을 확인한다.

## Workflow

### 1. Interview first

정보가 부족하면 풀이를 시작하지 말고 짧게 묻는다.

권장 질문:

```text
사주 풀이를 위해 양력/음력, 생년월일, 태어난 시간, 성별을 알려주세요. 보고 싶은 주제도 골라주세요: 연애운, 재물운, 직업운, 건강운, 한해 운세, 궁합.
```

태어난 시간을 모르면:

```text
태어난 시간을 모르면 시주는 확정하지 못해요. 가능한 시간대가 있으면 알려주시고, 없으면 연·월·일 중심의 보수적 풀이로 진행할게요.
```

음력 생일이면 이 패키지 안에서 변환하지 않는다. 검증된 만세력으로 양력 생년월일을 먼저 확인한 뒤 `calendar: "solar"`로 호출하고, 변환 근거와 윤달 여부를 한계로 적는다.

### 2. Install package when missing

`node -e 'require("saju-fortune")'`가 실패하면 다른 웹 스크래핑이나 MCP 서버 실행으로 우회하지 말고 전역 package 설치를 먼저 시도한다.

```bash
npm install -g saju-fortune
export NODE_PATH="$(npm root -g)"
```

### 3. Analyze one person's saju

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const { analyzeSaju } = require("saju-fortune")

const result = analyzeSaju({
  name: "민준",
  birthDate: "1990-03-15",
  birthTime: "10:30",
  calendar: "solar", // 음력은 검증된 만세력으로 양력 변환 후 입력
  gender: "male",
  birthCity: "서울"
}, {
  analysisType: "fortune",
  fortuneType: "wealth",
  targetYear: 2026
})

console.log(JSON.stringify(result, null, 2))
JS
```

`fortuneType` mapping:

- 종합운: `general`
- 연애운: `love`
- 재물운: `wealth`
- 직업운: `career`
- 건강운: `health`
- 한해 운세: `general` + `targetYear`

### 4. Check compatibility

```bash
NODE_PATH="$(npm root -g)" node - <<'JS'
const { checkCompatibility } = require("saju-fortune")

const result = checkCompatibility({
  person1: { name: "민준", birthDate: "1990-03-15", birthTime: "10:30", gender: "male" },
  person2: { name: "서연", birthDate: "1992-07-20", birthTime: "14:30", gender: "female" }
})

console.log(JSON.stringify(result, null, 2))
JS
```

### 5. MCP-style tool names without serving MCP

패키지는 upstream MCP 서버의 대표 도구명을 로컬 함수로 흉내 낸다. MCP 서버를 따로 띄우지 않는다.

```js
const { callSajuTool } = require("saju-fortune")

const result = callSajuTool("analyze_saju", {
  birthDate: "1990-03-15",
  birthTime: "10:30",
  gender: "male",
  analysisType: "fortune",
  fortuneType: "love"
})
```

지원 도구명:

- `analyze_saju`
- `check_compatibility`
- `get_daily_fortune`
- `get_dae_un`
- `get_fortune_by_period`
- `convert_calendar`
- `manage_settings`

### 6. Interpret like a fortune-reading agent

응답은 아래 구조를 따른다.

1. 입력 정보와 정확도 한계: 양력/음력, 시간, 출생지 누락 여부를 확인한다.
2. 사주팔자 요약: 연주·월주·일주·시주와 일간을 짧게 설명한다.
3. 오행 분포: 강한 오행과 부족한 오행을 생활 언어로 번역한다.
4. 주제별 풀이: 연애운/재물운/직업운/건강운/한해 운세 중 사용자가 고른 주제만 깊게 본다.
5. 실천 조언: 결정론 대신 대화, 습관, 리스크 관리 조언을 준다.
6. 주의 문구: 사주 풀이는 재미와 자기점검용이며 의료·투자·법률 판단을 대신하지 않는다고 말한다.

## Done when

- 필요한 출생 정보를 인터뷰로 확인했다.
- `saju-fortune` package 결과를 근거로 사주팔자와 오행 분포를 확인했다.
- 사용자가 요청한 주제(연애운, 재물운, 한해 운세 등)에 맞춰 풀이했다.
- 모르는 시간, 음력 윤달, 출생지 누락 같은 한계를 명시했다.
- MCP 서버를 실행하거나 별도 서버를 서빙하지 않았다.

## Failure modes

- 태어난 시간이 없으면 시주와 시주 기반 해석은 확정할 수 없다.
- 음력 또는 윤달 생일은 내장 계산으로 변환하지 않는다. 검증된 만세력으로 양력 날짜를 먼저 확인하지 못하면 풀이하지 않는다.
- 출생지가 없으면 경도 보정은 생략되거나 기본값으로 해석된다.
- package가 설치되지 않았고 네트워크도 없으면 설치 실패를 설명하고 진행하지 않는다.
- 사주 풀이는 전통 해석 기반의 참고 자료이며 의료, 투자, 법률, 안전 결정을 대체하지 않는다.

## Notes

- 입력한 생년월일시는 풀이 중에만 사용하고 영구 저장하지 않는다.
- 사용자가 불안해할 만한 단정적 흉언, 저주, 사망 예언, 질병 확정 표현은 하지 않는다.
- 궁합 점수는 관계 대화의 참고자료일 뿐 이별/결혼 결정을 대신하지 않는다.
