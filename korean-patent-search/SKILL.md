---
name: korean-patent-search
description: Search Korean patent and utility-model publications through the official KIPRIS Plus Open API with keyword search plus application-number detail lookup.
license: MIT
metadata:
  category: ip
  locale: ko-KR
  phase: v1
---

# 한국 특허 정보 검색

## What this skill does

KIPRIS Plus(키프리스 플러스) 공식 Open API로 한국 특허/실용신안 공개·공고 데이터를 검색한다.

v1 범위:

- 키워드 검색 (`getWordSearch`)
- 출원번호 기준 서지 상세 조회 (`getBibliographyDetailInfoSearch`)
- 구조화된 JSON 출력
- 표준 `python3` helper 동봉

## When to use

- "배터리 관련 한국 특허 찾아줘"
- "출원번호 1020240001234 특허 요약 보여줘"
- "KIPRIS API로 특허 검색 결과를 JSON으로 받고 싶어"
- "출원인/IPC/초록까지 포함한 한국 특허 검색 결과가 필요해"

## Prerequisites

- 인터넷 연결
- `python3`
- KIPRIS Plus에서 발급받은 API 키
  - helper 환경변수: `KIPRIS_PLUS_API_KEY`
  - 실제 요청 쿼리 파라미터명: `ServiceKey`
- 설치된 skill payload 안에 `scripts/patent_search.py` helper 포함

## Inputs

- 키워드 검색
  - 필수: `--query`
  - 선택: `--year`
  - 선택: `--page-no`
  - 선택: `--num-rows`
  - 선택: `--exclude-patent`
  - 선택: `--exclude-utility`
- 상세 조회
  - 필수: `--application-number`

## Workflow

1. `KIPRIS_PLUS_API_KEY` 또는 `--service-key` 로 ServiceKey를 확보한다. 공공데이터포털에서 복사한 percent-encoded 값도 helper가 한 번 정규화해서 그대로 받을 수 있다.
2. 키워드 검색이면 `getWordSearch` endpoint를 호출한다.
3. 출원번호 상세 조회면 `getBibliographyDetailInfoSearch` endpoint를 호출한다.
4. XML 응답의 header/body/items 구조를 파싱한다.
5. 출원번호, 발명의명칭, 출원인, 초록, 공개/공고/등록 메타데이터를 JSON으로 정리한다.

## CLI examples

```bash
export KIPRIS_PLUS_API_KEY=your-service-key
python3 scripts/patent_search.py --query "배터리"
python3 scripts/patent_search.py --query "배터리" --year 2024 --num-rows 5
python3 scripts/patent_search.py --application-number 1020240001234
```

## Response policy

- 공식 KIPRIS Plus Open API 응답만 사용한다.
- 키가 없으면 `KIPRIS_PLUS_API_KEY` 또는 `--service-key` 를 정확히 안내한다.
- 검색 결과는 최소한 출원번호, 발명의명칭, 출원일자, 출원인, 초록을 포함해 정리한다.
- 상세 조회는 `getBibliographyDetailInfoSearch` 기준으로 공개/공고/등록 메타데이터를 함께 정리한다.
- API 에러 코드는 숨기지 말고 그대로 surfaced 한다.

## Done when

- 유효한 ServiceKey로 `getWordSearch` 또는 `getBibliographyDetailInfoSearch` 호출이 가능하다.
- helper가 JSON을 출력한다.
- 에러 시 `KIPRIS_PLUS_API_KEY` / `ServiceKey` 관련 안내가 분명하다.
- 응답에 출원번호와 발명의명칭이 포함된다.

## Notes

- KIPRIS Plus 포털: `https://plus.kipris.or.kr/portal/data/service/List.do?subTab=SC001&entYn=N&menuNo=200100`
- 공공데이터포털 문서: `https://www.data.go.kr/data/15058788/openapi.do`
- v1 helper는 `getWordSearch`, `getBibliographyDetailInfoSearch` 두 operation에 집중한다.
- 공공데이터포털 안내 기준으로 개발계정은 자동승인, 운영계정은 별도 심의 대상이다.
