# korean-character-count — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- This skill produces local artifacts (documents, conversions, corrections, generated text). Completion means the requested artifact is actually created/edited and its location or content is reported. No external side effects are involved unless explicitly documented.

# 한국어 글자 수 세기

## What this skill does

자기소개서, 지원서, 자유서술형 폼처럼 **글자 수 제한이 중요한 한국어 텍스트**를 대상으로 LLM 추정 없이 결정론적으로 카운트한다.

- 기본 글자 수: `Intl.Segmenter` 기반 Unicode extended grapheme cluster
- 줄 수: `CRLF`, `LF`, `CR`, `U+2028`, `U+2029` 를 줄바꿈 1회로 계산
- 기본 byte 수: UTF-8 실제 인코딩 길이
- 호환 프로필: `neis` byte 규칙

## When to use

- "이 자기소개서 1000자 넘는지 정확히 세줘"
- "이 텍스트를 UTF-8 byte 기준으로 계산해줘"
- "줄 수랑 byte 수도 같이 알려줘"
- "한글/영문/이모지 섞인 문장을 추정 말고 코드로 세줘"

## Why this skill exists

- 글자 수 제한은 1자 차이도 민감하다.
- LLM이 글자 수를 눈대중으로 예측하면 재현성이 없다.
- 이 스킬은 **입력을 임의로 trim/정규화하지 않고**, 문서화된 계약으로만 센다.

## Contracts

### `default` profile

- characters: `Intl.Segmenter("ko", { granularity: "grapheme" })`
- bytes: `Buffer.byteLength(text, "utf8")`
- lines:
  - empty string => `0`
  - non-empty => 줄바꿈 시퀀스 수 + `1`
  - `CRLF` 는 `2`줄바꿈이 아니라 `1`줄바꿈으로 센다.

### `neis` profile

- characters: `default` 와 동일
- lines: `default` 와 동일
- bytes:
  - 한글 grapheme => `3B`
  - ASCII grapheme => `1B`
  - Enter/줄바꿈 시퀀스 => `2B`
  - 그 외 문자는 UTF-8 byte 길이로 fallback

## Prerequisites

- `node` 18+
- 설치된 skill payload 안에 `scripts/korean_character_count.js` helper 포함
- 별도 API 키 없음

## Workflow

1. 텍스트를 직접 받거나 파일/STDIN으로 읽는다.
2. `node scripts/korean_character_count.js` 로 결정론적 카운트를 실행한다.
3. 필요한 프로필(`default`/`neis`)과 출력 형식(`json`/`text`)을 고른다.
4. 결과를 그대로 반환하고, 어떤 계약으로 셌는지 함께 알려준다.

## CLI examples

```bash
node scripts/korean_character_count.js --text "가나다"
node scripts/korean_character_count.js --text $'첫 줄\r\n둘째 줄🙂'
node scripts/korean_character_count.js --text $'첫 줄\n둘째 줄🙂' --profile neis --format text
node scripts/korean_character_count.js --file ./essay.txt --profile default
cat essay.txt | node scripts/korean_character_count.js --stdin --profile neis
```

## Response policy

- 추정하지 말고 helper 결과를 그대로 쓴다.
- 어떤 profile로 셌는지 함께 보여준다.
- 기본값이 필요하면 `default` profile을 사용한다.
- 제출처가 NEIS/학교생활기록부 같은 별도 계약을 요구할 때만 `neis` 를 쓴다.

## Done when

- 글자 수, 줄 수, byte 수가 함께 반환된다.
- `default` 와 `neis` 계약 차이가 문서에 명시된다.
- `node scripts/korean_character_count.js --help` 가 동작한다.
- 혼합 한국어/영문/공백/개행/emoji 입력에 대한 테스트가 있다.

## Notes

- Unicode grapheme clusters: https://www.unicode.org/reports/tr29/
- WHATWG Encoding Standard: https://encoding.spec.whatwg.org/
- Node `Buffer.byteLength`: https://nodejs.org/api/buffer.html
