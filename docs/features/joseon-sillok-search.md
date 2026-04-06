# 조선왕조실록 검색 가이드

## 이 기능으로 할 수 있는 일

- 조선왕조실록 공식 사이트에서 키워드 검색
- 검색 결과를 왕별로 좁혀 보기
- 서기 연도(`1443`처럼 Gregorian year) 기준으로 결과 필터링
- 기사 상세에서 국역/원문 excerpt 가져오기
- JSON 형태로 후속 자동화에 넘기기

## 먼저 필요한 것

- 인터넷 연결
- `python3`
- 설치된 `joseon-sillok-search` skill 안에 `scripts/sillok_search.py` helper 포함

별도 API 키나 로그인은 필요 없다.

## 공식 표면

- 메인: `https://sillok.history.go.kr`
- 검색 결과: `https://sillok.history.go.kr/search/searchResultList.do`
- 기사 상세: `https://sillok.history.go.kr/id/<article_id>`

## 기본 흐름

1. 검색어를 받는다.
2. 공식 검색 결과 HTML을 POST로 가져온다.
3. 검색 결과에서 기사 링크, 왕별 분류, 요약을 파싱한다.
4. `--king`, `--year`가 있으면 결과를 좁힌다.
5. 선택된 기사 상세 페이지를 열어 국역/원문 excerpt를 붙인다.
6. 최종 결과를 JSON으로 출력한다.

## CLI 예시

### 기본 검색

```bash
python3 scripts/sillok_search.py --query "훈민정음"
```

### 왕 + 연도 필터

```bash
python3 scripts/sillok_search.py --query "훈민정음" --king "세종" --year 1443 --limit 3
```

### 원문 검색

```bash
python3 scripts/sillok_search.py --query "훈민정음" --type w --limit 3
```

## 응답 예시 포맷

```json
{
  "query": "훈민정음",
  "type": "k",
  "filters": {
    "king": "세종",
    "year": 1443,
    "limit": 3
  },
  "total_results": 21,
  "type_count": 11,
  "returned_count": 1,
  "items": [
    {
      "article_id": "kda_12512030_002",
      "url": "https://sillok.history.go.kr/id/kda_12512030_002",
      "title": "세종실록 102권, 세종 25년 12월 30일 경술 2번째기사 / 훈민정음을 창제하다",
      "king": "세종",
      "gregorian_year": 1443,
      "excerpt": "이달에 임금이 친히 언문(諺文) 28자(字)를 지었는데..."
    }
  ]
}
```

## 구현 메모

- v1 은 검색 결과 HTML과 기사 상세 HTML만 읽는다.
- `--year` 는 실록 title metadata의 왕대 연차를 accession year와 합쳐 서기 연도로 변환한 뒤 필터링한다.
- `--king` 는 `세종`, `세종실록` 같은 입력을 canonical king label로 정규화한다.
- 결과가 적으면 detail page를 바로 열어 excerpt를 붙이는 편이 가장 단순하고 안정적이다.

## 라이브 검증 메모

2026-04-03 기준 live smoke run에서 `훈민정음` 검색으로 실결과가 반환되었고, `--king 세종 --year 1443` 필터로 `kda_12512030_002` 기사(「훈민정음을 창제하다」)를 안정적으로 다시 찾을 수 있었다.
