---
name: naver-blog-research
description: Search Naver blogs, read full post content, and download images using only python3 stdlib — no API key required.
license: MIT
metadata:
  category: research
  locale: ko-KR
  phase: v1
---

# 네이버 블로그 리서치

## What this skill does

네이버 블로그를 검색하고, 개별 포스트의 원문을 읽고, 이미지를 로컬에 다운로드한다.

- API 키 없이 `python3` 표준 라이브러리만으로 동작한다.
- 검색 결과를 구조화된 JSON으로 출력한다.
- 모바일 버전(`m.blog.naver.com`)을 이용해 iframe 없이 본문을 직접 추출한다.
- 블로그 이미지 CDN(`blogfiles.naver.net`, `postfiles.pstatic.net`)에서 이미지를 다운로드한다.

## When to use

- "네이버 블로그에서 결혼식 체크리스트 검색해줘"
- "네이버 블로그 리서치 해줘"
- "한국 블로그에서 관련 정보 조사해줘"
- "네이버 블로그 글 읽어줘"
- "이 네이버 블로그 포스트에서 이미지 다운로드해줘"
- 한국어 콘텐츠 리서치에서 구글 외 네이버 블로그 소스가 필요한 상황

## When not to use

- 네이버 뉴스, 카페, 지식iN 등 블로그 외 네이버 서비스 검색
- 대량 크롤링/스크래핑 (한 세션에 수십 건 이상의 요청)
- 상업적 데이터 수집

## Prerequisites

- 인터넷 연결
- `python3` 3.8+
- 이 스킬 디렉토리의 `scripts/` 안에 포함된 helper 스크립트

## Workflow

### 1. 네이버 블로그 검색

```bash
python3 scripts/naver_search.py "검색어" --count 10 --sort sim
```

| 인자 | 필수 | 설명 | 기본값 |
|------|------|------|--------|
| query | O | 검색어 | - |
| --count | X | 결과 수 (최대 30) | 10 |
| --sort | X | sim(관련도), date(최신) | sim |
| --timeout | X | 요청 타임아웃(초) | 15 |

출력 예시:

```json
{
  "query": "결혼식 체크리스트",
  "total_results": 7,
  "results": [
    {
      "title": "결혼식 체크리스트 총정리",
      "url": "https://blog.naver.com/user123/224212849946",
      "mobile_url": "https://m.blog.naver.com/user123/224212849946",
      "snippet": "결혼식 1주일 전에 반드시 확인해야 할...",
      "author": "user123"
    }
  ]
}
```

### 2. 블로그 원문 읽기

검색 결과에서 관심 있는 포스트의 URL을 선택하여 원문을 읽는다.

```bash
python3 scripts/naver_read.py "https://blog.naver.com/user123/224212849946"
```

| 인자 | 필수 | 설명 | 기본값 |
|------|------|------|--------|
| url | O | 블로그 포스트 URL (PC 또는 모바일) | - |
| --no-images | X | 이미지 URL 제외 | false |
| --max-length | X | 본문 최대 글자 수 (0=무제한) | 0 |
| --timeout | X | 요청 타임아웃(초) | 20 |

PC URL을 넣어도 자동으로 모바일 URL로 변환하여 요청한다.

### 3. 이미지 다운로드 (필요 시)

```bash
python3 scripts/naver_download_images.py --urls "url1,url2,url3" --output ./images/
```

또는 `naver_read.py` 결과를 파이프로 전달:

```bash
python3 scripts/naver_read.py "https://..." | python3 scripts/naver_download_images.py --output ./images/
```

| 인자 | 필수 | 설명 | 기본값 |
|------|------|------|--------|
| --urls | X | 쉼표 구분 이미지 URL | - |
| --output | X | 저장 디렉토리 | ./naver-images/ |
| --max | X | 최대 다운로드 수 | 10 |
| --timeout | X | 요청 타임아웃(초) | 15 |

### 추천 워크플로우

1. `naver_search.py`로 검색 → 상위 3~5개 결과 확인
2. 관련도 높은 포스트를 `naver_read.py`로 원문 읽기
3. 필요 시 `naver_download_images.py`로 이미지 저장
4. WebSearch(구글) 결과와 교차 검증하여 정보 신뢰도 높이기

## Response policy

- 검색 결과와 본문은 사용자에게 요약하여 전달한다.
- 블로그 출처(URL, 작성자)를 반드시 함께 안내한다.
- 한 세션에 과도한 요청(수십 건 이상)을 자제한다.
- 이미지 다운로드 시 사용자에게 저장 경로를 안내한다.

## Done when

- 검색 결과가 JSON으로 정상 출력된다.
- 블로그 원문 텍스트가 추출된다.
- 필요한 이미지가 로컬에 저장된다.
- 출처가 명시된다.

## Notes

- 네이버 검색엔진을 직접 요청하므로 대량/자동화 사용 시 IP 차단 가능성이 있다.
- 이 스킬은 소량, 비상업적 콘텐츠 리서치 용도로 설계되었다.
- 네이버 HTML 구조는 변경될 수 있어, 파싱 실패 시 에러 메시지를 확인하고 스크립트 업데이트가 필요할 수 있다.
- PC 버전(`blog.naver.com`)은 iframe 구조여서 모바일 버전(`m.blog.naver.com`)을 사용한다.
