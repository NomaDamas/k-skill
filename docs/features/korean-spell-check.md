# 한국어 맞춤법 검사 가이드

## 이 기능으로 할 수 있는 일

- 바른한글(구 부산대 맞춤법/문법 검사기)로 한국어 문장 최종 교정
- 긴 텍스트를 청크 단위로 나눠 순차 검사
- 오류별 `원문`, `교정안`, `이유` 추출
- Markdown/텍스트 파일 검수

## 먼저 알아둘 점

- 공개 메인 화면은 `https://nara-speller.co.kr/speller/` 이다.
- 무료 공개 경로는 사용자용 웹 서비스이며, 문서화된 공개 JSON API는 확인하지 못했다.
- 이전 버전 `https://nara-speller.co.kr/old_speller/` 는 **비상업적 용도**, **개인이나 학생만 무료**라는 안내를 표시한다.
- `https://nara-speller.co.kr/robots.txt` 는 `/` 를 허용하지만 `/test_speller/` 는 금지한다.
- 따라서 이 기능은 **사용자 주도 저빈도 교정** 용도로만 사용한다.

## 현재 구현 방식

이 저장소는 브라우저형 헤더를 사용하는 Python stdlib helper `scripts/korean_spell_check.py` 를 제공한다.

- 검사 요청: `POST https://nara-speller.co.kr/old_speller/results`
- 응답 형식: 결과 HTML 내부의 `data = [...]` payload
- 출력 형식: 교정문 + 이슈 목록(JSON 또는 텍스트)

이 환경에서는 일반 shell/Node fetch가 Cloudflare 때문에 `403` 을 반환할 수 있었고, Python `urllib` + 브라우저형 User-Agent 조합은 실제 결과 HTML을 반환했다. 그래서 helper는 Python 경로를 기본값으로 사용한다.

## 사용 예시

짧은 문장:

```bash
python3 scripts/korean_spell_check.py \
  --text "아버지가방에들어가신다." \
  --format text
```

Markdown 파일:

```bash
python3 scripts/korean_spell_check.py \
  --file README.md \
  --max-chars 1500 \
  --throttle-seconds 1.2 \
  --format json
```

## 출력 예시

```json
{
  "corrected_text": "아버지가 방에 들어가신다.",
  "issues": [
    {
      "original": "아버지가방에들어가신다",
      "suggestions": ["아버지가 방에 들어가신다"],
      "reason": "띄어쓰기, 붙여쓰기, 음절 대치와 같은 교정 방법에 따라 수정한 결과입니다."
    }
  ]
}
```

## 긴 텍스트 운영 규칙

1. 기본 청크는 `1500` 자 안팎으로 나눈다.
2. 빈 줄 기준 문단 경계를 먼저 보존한다.
3. 문단이 너무 길면 문장 단위로 다시 나눈다.
4. 청크 사이에 `1초` 내외 대기 시간을 둔다.
5. 대량 파일 일괄 실행이나 병렬 폭주는 피한다.

## 응답 정리 규칙

- 전체 교정문을 먼저 보여준다.
- 그다음 변경점 목록을 붙인다.
- 각 변경점은 `원문 → 교정안` 형태로 보여준다.
- 가능한 경우 `이유` 또는 도움말 문장을 함께 넣는다.

예:

- 원문: `왠지 않되요`
- 교정안: `왠지 안 돼요`
- 이유: 띄어쓰기/활용형 오류 교정

## 라이브 확인 메모

2026-04-03 기준으로 아래 사실을 확인했다.

- `GET https://nara-speller.co.kr/speller/` 는 브라우저형 User-Agent에서 정상 HTML을 반환했다.
- `GET https://nara-speller.co.kr/old_speller/` 는 브라우저형 User-Agent에서 정상 HTML을 반환했다.
- `GET https://nara-speller.co.kr/robots.txt` 는 `/` 허용, `/test_speller/` 금지를 반환했다.
- `POST https://nara-speller.co.kr/old_speller/results` 에 `text1=아버지가방에들어가신다.` 를 보내면 `아버지가 방에 들어가신다` 교정 후보가 포함된 결과 HTML을 반환했다.

## 주의 사항

- 서비스 안내상 비상업적/개인·학생 무료 경로이므로, 상업적 대량 자동화에는 사용하지 않는다.
- 외부 웹 서비스에 원문이 전송되므로 민감정보/개인정보 문서는 먼저 마스킹 여부를 판단한다.
- 공개 웹 검사기 결과도 문맥에 따라 사람이 최종 확인해야 한다.
