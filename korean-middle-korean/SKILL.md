---
name: korean-middle-korean
description: Convert incoming Korean text into a deterministic Korean Middle Korean-style rewrite with archaic particles, endings, Hanja hints, and tone-mark flavor.
license: MIT
metadata:
  category: writing
  locale: ko-KR
  phase: v1
---

# Korean Middle Korean Style Converter

## What this skill does

사용자가 한국어 문장을 "한국 중세 국어처럼", "훈민정음/중세국어 느낌으로", "옛 국어 밈체로" 바꾸어 달라고 할 때, 입력문을 **결정론적 Middle Korean-style 문체**로 바꾼다.

이 스킬은 학술적 복원이 아니라 창작용 스타일 변환이다.

- 현대 한국어 조사 일부를 `ᄋᆞᆫ`, `ᄋᆞᆯ`, `애` 같은 중세국어풍 표기로 바꾼다.
- `했다`, `하는`, `말하는` 같은 현대 어미를 `ᄒᆞ엿다〮`, `ᄒᆞᄂᆞᆫ`, `ᄆᆞᆯᄒᆞᄂᆞᆫ`처럼 바꾼다.
- 날짜 단위는 `年`, `月`, `日`로 바꾼다.
- 일부 한자어/밈 예시는 `熱愛說`, `俳優`, `學校`처럼 Hanja 힌트를 섞는다.
- URL, 이메일, Markdown 링크, inline/fenced code span은 구조 토큰으로 보고 변환하지 않는다.
- 인명·숫자·고유명사는 완전 보존이 아니라, 규칙이 맞지 않을 때 원문을 남기는 best-effort 방식으로 처리한다.
- 한자어 힌트는 넓은 전역 치환으로 적용되므로 합성어·고유명사처럼 보이는 문자열 안에서도 바뀔 수 있다.

## When to use

- "이 문장을 한국 중세 국어로 바꿔줘"
- "훈민정음 느낌 나는 밈 문장으로 변환해줘"
- "중세국어풍으로 농담을 써줘"
- "아래 글을 옛 국어 말투로 바꿔줘"

## When NOT to use

- 학술 논문, 고문헌 번역, 훈민정음 해례본식 엄밀 표기가 필요한 작업
- 법률·의학·계약 문서처럼 의미 오해가 위험한 문서
- 혐오·괴롭힘·명예훼손 목적의 조롱성 변환

## Prerequisites

- `node` 18+
- 설치된 `korean-middle-korean` skill 디렉터리 안에 `scripts/korean_middle_korean.js` helper 포함
- 별도 API 키 없음

## Workflow

1. 변환할 한국어 텍스트를 받는다.
2. 설치된 `korean-middle-korean` skill 디렉터리를 기준으로 `node scripts/korean_middle_korean.js` 를 실행한다.
   - URL, 이메일, Markdown 링크, inline/fenced code span은 보호되어 원문 그대로 복원된다.
3. 기본 JSON 출력에서 `output`을 사용자에게 반환한다.
4. 사용자가 근거를 원하면 `replacements` 배열의 규칙 적용 내역을 요약한다.
5. 학술적 정확성이 필요하다고 보이면 이 스킬은 창작용 스타일 변환임을 먼저 밝힌다.

## CLI examples

```bash
node scripts/korean_middle_korean.js --text "민수는 3월 5일 학교에서 공부했다."
node scripts/korean_middle_korean.js --text "열애설을 인정했다." --format text
cat input.txt | node scripts/korean_middle_korean.js --stdin --format json
node scripts/korean_middle_korean.js --file ./input.txt --format text
```

## Response policy

- `output`을 중심으로 답한다.
- "정확한 중세국어 번역"이라고 단정하지 말고, "중세국어풍/창작용 변환"이라고 설명한다.
- 사용자가 원문 의미 보존을 중요하게 말하면, 변환문 뒤에 "의미 보존 확인"을 짧게 덧붙인다.

## Output schema

```json
{
  "profile": "middle-korean-style-v1",
  "input": "열애설을 인정했다.",
  "output": "熱愛說ᄋᆞᆯ 인졍ᄒᆞ엿다〮.",
  "replacements": [
    { "kind": "lexicon", "from": "열애설", "to": "熱愛說", "count": 1 }
  ],
  "contract": "Deterministic Korean Middle Korean-style rewrite..."
}
```

## Done when

- `node scripts/korean_middle_korean.js --help` 가 동작한다.
- `--text`, `--file`, `--stdin` 입력이 모두 동작한다.
- JSON과 text 출력이 모두 동작한다.
- 이슈 #270의 예시처럼 날짜/Hanja/중세국어풍 조사·어미·성조점이 나타난다.
