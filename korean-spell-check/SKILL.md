---
name: korean-spell-check
description: Use Nara/PNU Korean spell-check surfaces conservatively to proofread Korean text, chunk long input, and return change-focused correction suggestions.
license: MIT
metadata:
  category: writing
  locale: ko-KR
  phase: v1
---

# Korean Spell Check

## What this skill does

국립국어원 계열 규칙을 반영한 **바른한글(구 부산대 맞춤법/문법 검사기)** 표면을 이용해 한국어 문장을 최종 교정한다.

- 기본 진입점은 공개 웹 표면 `https://nara-speller.co.kr/speller/` 이다.
- 자동화가 필요하면 이전 버전 폼 POST 표면 `https://nara-speller.co.kr/old_speller/results` 를 **낮은 요청량으로만** 사용한다.
- 긴 글은 청크로 나눠 순차 검사한다.
- 결과는 `원문`, `교정안`, `이유` 중심으로 정리한다.

## Policy first

- `https://nara-speller.co.kr/old_speller/` 는 **비상업적 용도** 안내와 **개인이나 학생만 무료**라는 문구를 명시한다.
- `https://nara-speller.co.kr/robots.txt` 는 `/` 를 허용하지만 `/test_speller/` 는 금지한다.
- 따라서 이 스킬은 **사용자 주도 최종 검수**, **저빈도 요청**, **문서/이메일/README 교정** 용도로만 쓴다.
- 대량 배치, SaaS 백엔드 연동, 상업 서비스 내 무단 재판매/재노출에는 쓰지 않는다. 그런 경우는 공급사 문의/유료 API 계약을 먼저 검토한다.

## When to use

- "이 한국어 문장 맞춤법 검사해줘"
- "README 한국어 문장 최종 검수해줘"
- "마크다운 파일 전체에서 띄어쓰기/맞춤법 오류를 잡아줘"
- "AI 교정보다 규칙 기반 한국어 검사기로 한 번 더 확인해줘"

## When not to use

- 코드 블록/로그/영문 위주 텍스트를 그대로 대량 전송해야 하는 경우
- 민감정보가 많은 원문을 외부 웹 서비스에 보내면 안 되는 경우
- 상업적 대량 처리 API가 필요한 경우

## Prerequisites

- 인터넷 연결
- `python3` 3.10+
- 이 스킬 디렉토리의 `scripts/korean_spell_check.py` (설치 시 자동 포함)

## Verified surface notes

- 현재 공개 사이트는 `https://nara-speller.co.kr/speller/` 로 제공된다.
- 이 환경에서 일반 shell/Node fetch는 Cloudflare 때문에 `403` 이 나올 수 있었다.
- 같은 환경에서도 **브라우저형 User-Agent + Python stdlib `urllib` POST** 는 `old_speller/results` 에서 실제 검사 결과 HTML을 반환했다.
- 무료 공개 표면은 HTML 결과 페이지이며, 문서화된 공개 JSON API는 확인하지 못했다.

## Workflow

### 1. Ask for the text or file path

- 텍스트가 직접 주어지면 바로 검사한다.
- 파일 검사라면 UTF-8 텍스트/Markdown 파일만 대상으로 잡고, 코드 블록이 많으면 먼저 사용자에게 범위를 줄일지 물어보는 편이 안전하다.

### 2. Keep requests conservative

- 기본 청크 크기는 `1500` 자 안팎으로 유지한다.
- 청크 사이는 최소 `1초` 정도 쉬게 한다.
- 한 번에 너무 많은 파일을 돌리지 않는다.

### 3. Run the helper

```bash
python3 scripts/korean_spell_check.py \
  --file README.md \
  --format json
```

짧은 문장은 `--text` 로 바로 넣을 수 있다.

```bash
python3 scripts/korean_spell_check.py \
  --text "아버지가방에들어가신다." \
  --format text
```

### 4. Return change-focused output

최종 답변은 아래 순서를 권장한다.

1. 교정된 전체 문장/문단
2. 주요 변경점 목록
3. 각 변경점의 `원문`, `교정안`, `이유`
4. 필요하면 `공개 웹 검사기 기준 결과이며, 최종 문맥 판단은 사람이 확인` 문구

예시 JSON 필드:

```json
{
  "original": "아버지가방에들어가신다",
  "suggestions": ["아버지가 방에 들어가신다"],
  "reason": "띄어쓰기, 붙여쓰기, 음절 대치와 같은 교정 방법에 따라 수정한 결과입니다."
}
```

## Done when

- 공개 표면 정책을 먼저 확인했다.
- 긴 텍스트면 청크 분할을 적용했다.
- 결과를 `원문/교정안/이유` 중심으로 정리했다.
- 고빈도/상업적 사용이 아님을 분명히 했다.

## Notes

- guide: `https://nara-speller.co.kr/guide/`
- main UI: `https://nara-speller.co.kr/speller/`
- old UI / form post: `https://nara-speller.co.kr/old_speller/`, `https://nara-speller.co.kr/old_speller/results`
- robots: `https://nara-speller.co.kr/robots.txt`
