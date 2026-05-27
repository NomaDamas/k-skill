# 한국 중세 국어풍 변환 가이드

## 이 기능으로 할 수 있는 일

- 한국어 입력문을 창작용 **중세국어풍 문체**로 변환
- `은/는`, `을/를`, `에서` 같은 일부 조사를 `ᄋᆞᆫ`, `ᄋᆞᆯ`, `애`처럼 변환
- `했다`, `하는`, `말하는` 같은 일부 어미를 `ᄒᆞ엿다〮`, `ᄒᆞᄂᆞᆫ`, `ᄆᆞᆯᄒᆞᄂᆞᆫ`처럼 변환
- 날짜 단위를 `年`, `月`, `日`로 변환
- 일부 한자어를 `熱愛說`, `俳優`, `學校`처럼 Hanja 힌트로 변환
- URL, 이메일, Markdown 링크, inline/fenced code span은 구조 토큰으로 보고 변환하지 않음
- 인명·숫자·고유명사는 완전 보존이 아니라, 규칙이 맞지 않을 때 원문을 남기는 best-effort 방식으로 처리

## 왜 별도 스킬이 필요한가

LLM에게 "중세 국어처럼"이라고만 요청하면 변환 강도와 표기가 매번 달라진다. 이 스킬은 밈/창작용 변환에서 필요한 최소 계약을 고정한다.

- 동일 입력은 동일 출력으로 변환한다.
- 어떤 규칙이 적용됐는지 `replacements` 배열로 확인할 수 있다.
- 학술적 복원이 아니라 스타일 변환임을 문서화한다.

## 기본 계약

프로필은 `middle-korean-style-v1`이다.

- 날짜 단위 정규화를 먼저 적용한다. `2015년 7월 21일`은 `2015年 7月 21日`처럼 바뀐다.
- 그다음 결정론적 lexicon 치환을 적용한다.
- 일부 현대 조사를 중세국어풍 조사로 바꾼다.
- 일부 현대 어미를 `ᄒᆞ-` 계열 중세국어풍 어미로 바꾼다.
- URL, 이메일, Markdown 링크, inline/fenced code span은 먼저 보호한 뒤 마지막에 원문 그대로 복원한다.
- 한자어 힌트는 넓은 전역 치환으로 적용되므로 합성어·고유명사처럼 보이는 문자열 안에서도 바뀔 수 있다.
- 변환하지 못한 내용은 원문 의미 보존을 위해 그대로 둔다.

`middle-korean-style-v1`의 출력 변경은 호환성에 영향을 주는 계약 변경으로 본다. 새 규칙을 추가하거나 순서를 바꿀 때는 회귀 테스트와 문서 예시를 함께 갱신한다.

## CLI 사용 예시

### 기본 JSON 출력

```bash
node scripts/korean_middle_korean.js --text "민수는 3월 5일 학교에서 공부했다."
```

예상 출력 일부:

```json
{
  "profile": "middle-korean-style-v1",
  "input": "민수는 3월 5일 학교에서 공부했다.",
  "output": "민수ᄋᆞᆫ 3月 5日 學校애 공부ᄒᆞ엿다〮.",
  "replacements": [
    { "kind": "date", "from": "월→月", "to": "$1月", "count": 1 }
  ]
}
```

### 변환문만 출력

```bash
node scripts/korean_middle_korean.js --text "열애설을 인정했다." --format text
```

예상 출력:

```text
熱愛說ᄋᆞᆯ 인졍ᄒᆞ엿다〮.
```

### 파일/stdin 입력

```bash
node scripts/korean_middle_korean.js --file ./input.txt --format text
cat input.txt | node scripts/korean_middle_korean.js --stdin --format json
```

## 응답 원칙

- 결과는 `output` 필드를 중심으로 전달한다.
- "정확한 중세국어 번역"이 아니라 "중세국어풍/창작용 변환"이라고 설명한다.
- 사용자가 학술적 정확성을 요구하면 이 스킬의 한계를 먼저 알리고, 전문 고문헌 검토가 필요하다고 안내한다.

## 검증

```bash
node --test scripts/test_korean_middle_korean.js
node scripts/korean_middle_korean.js --text "민수는 3월 5일 학교에서 공부했다." --format text
```
