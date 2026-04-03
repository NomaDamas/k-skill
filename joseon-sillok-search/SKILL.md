---
name: joseon-sillok-search
description: Search Joseon Dynasty Annals records from the official sillok.history.go.kr site with keyword search plus optional king/year narrowing.
license: MIT
metadata:
  category: history
  locale: ko-KR
  phase: v1
---

# 조선왕조실록 검색

## What this skill does

국사편찬위원회 조선왕조실록 사이트(`https://sillok.history.go.kr`)에서 **공식 검색 결과 HTML과 기사 상세 페이지를 직접 읽어** 조선왕조실록 기록을 찾는다.

v1 범위는 단순 스크래핑이다.

- 키워드 검색
- 선택적 왕별 필터(`--king`)
- 선택적 서기 연도 필터(`--year`)
- 검색 결과 제목/요약/원문 링크 정리
- 기사 상세 페이지에서 국역/원문 excerpt 추출

## When to use

- "조선왕조실록에서 훈민정음 찾아줘"
- "세종 때 실록에서 측우기 관련 기사 검색해줘"
- "1443년 조선왕조실록 기록 찾아줘"
- "정조실록에서 수원 관련 기록 몇 개 보여줘"

## Prerequisites

- 인터넷 연결
- `python3`
- 별도 API 키 없음
- 설치된 skill payload 안에 `scripts/sillok_search.py` helper가 함께 들어 있다.

## Inputs

- 필수: 검색어
- 선택: 왕 이름 (`세종`, `정조`, `세종실록` 등)
- 선택: 서기 연도 (`1443` 같이 Gregorian year)
- 선택: 결과 수 (`--limit`)
- 선택: 검색 타입 (`--type k|w`)
  - `k`: 국역 검색
  - `w`: 원문 검색

## Workflow

1. `python3 scripts/sillok_search.py --query "..."` 로 공식 검색 endpoint를 호출한다.
2. 검색 결과 HTML에서 결과 수, 왕별 분류, 기사 링크, 요약을 파싱한다.
3. 필요하면 `--king`, `--year` 로 결과를 추가로 좁힌다.
4. 선택된 기사마다 `/id/<article_id>` 상세 페이지를 열어 국역/원문 excerpt를 가져온다.
5. 구조화된 JSON으로 반환한다.

## CLI examples

```bash
python3 scripts/sillok_search.py --query "훈민정음"
python3 scripts/sillok_search.py --query "훈민정음" --king "세종" --year 1443 --limit 3
python3 scripts/sillok_search.py --query "측우기" --king "세종실록" --limit 5
python3 scripts/sillok_search.py --query "임진왜란" --type w --limit 5
```

## Response policy

- 결과는 공식 실록 사이트에서 확인한 **기사 제목 + 링크 + 요약 + 상세 excerpt** 중심으로 답한다.
- `--year` 는 서기 연도 기준으로 필터링한다.
- 입력한 왕 이름은 `세종`, `세종실록`처럼 조금 달라도 canonical 왕명으로 정규화한다.
- v1 에서는 semantic search, embedding, 대규모 색인 구축을 하지 않는다.
- 결과가 없으면 억지로 추정하지 말고 빈 결과를 그대로 알려준다.

## Done when

- 공식 사이트에서 실제 검색 결과가 1건 이상 조회되었다.
- 필요 시 왕/연도 필터가 적용되었다.
- 적어도 하나 이상의 기사 detail excerpt가 포함되었다.
- 링크가 `https://sillok.history.go.kr/id/...` 형태로 정리되었다.

## Notes

- 공식 메인: `https://sillok.history.go.kr`
- 검색 endpoint: `https://sillok.history.go.kr/search/searchResultList.do`
- 기사 상세: `https://sillok.history.go.kr/id/<article_id>`
- 이 저장소 v1 은 공개 HTML 표면만 사용한다.
