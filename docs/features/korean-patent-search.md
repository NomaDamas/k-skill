# 한국 특허 정보 검색 가이드

## 이 기능으로 할 수 있는 일

- KIPRIS Plus 공식 Open API로 한국 특허/실용신안 키워드 검색
- 출원번호 기준 서지 상세 조회
- 출원번호, 발명의명칭, 출원인, IPC, 초록, 공개/공고/등록 메타데이터 정리
- JSON 형태로 후속 자동화에 넘기기

## 먼저 필요한 것

- 인터넷 연결
- `python3`
- KIPRIS Plus API key
  - helper 환경변수: `KIPRIS_PLUS_API_KEY`
  - 실제 요청 쿼리 파라미터: `ServiceKey`
- 설치된 `korean-patent-search` skill 안에 `scripts/patent_search.py` helper 포함

공공데이터포털 안내 기준으로 이 API는 개발계정은 자동승인, 운영계정은 심의승인 대상이다.

## 공식 표면

- KIPRIS Plus 포털: `https://plus.kipris.or.kr/portal/data/service/List.do?subTab=SC001&entYn=N&menuNo=200100`
- 공공데이터포털 문서: `https://www.data.go.kr/data/15058788/openapi.do`
- helper 기본 endpoint: `https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch`
- 상세 endpoint: `https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getBibliographyDetailInfoSearch`

## 기본 흐름

1. `KIPRIS_PLUS_API_KEY` 또는 `--service-key` 로 ServiceKey를 확보한다. 공공데이터포털에서 복사한 percent-encoded 값이어도 helper가 한 번 정규화한 뒤 요청한다.
2. 키워드 검색이면 `getWordSearch` 를 호출한다.
3. 출원번호 상세 조회면 `getBibliographyDetailInfoSearch` 를 호출한다.
4. XML `response/header/body/items/item` 구조를 파싱한다.
5. JSON으로 출력한다.

## CLI 예시

### 키워드 검색

```bash
export KIPRIS_PLUS_API_KEY=your-service-key
python3 scripts/patent_search.py --query "배터리"
```

### 연도 + 페이지 지정

```bash
python3 scripts/patent_search.py --query "배터리" --year 2024 --page-no 1 --num-rows 5
```

### 출원번호 상세 조회

```bash
python3 scripts/patent_search.py --application-number 1020240001234
```

## 응답 예시 포맷

```json
{
  "query": "배터리",
  "page_no": 1,
  "num_of_rows": 5,
  "total_count": 24,
  "items": [
    {
      "index_no": 1,
      "application_number": "1020240001234",
      "invention_title": "이차 전지 배터리 팩",
      "register_status": "공개",
      "application_date": "2024/01/02 00:00:00",
      "open_number": "1020250005678",
      "open_date": "2025/07/09 00:00:00",
      "publication_number": "1020250005678",
      "publication_date": "2025/07/09 00:00:00",
      "ipc_number": "H01M 10/00",
      "applicant_name": "주식회사 오픈에이아이코리아",
      "abstract_text": "배터리 수명 향상을 위한 열 관리 구조."
    }
  ]
}
```

## 구현 메모

- `getWordSearch` 요청 파라미터 핵심은 `word`, `year`, `patent`, `utility`, `ServiceKey` 이다.
- `getBibliographyDetailInfoSearch` 는 `applicationNumber`, `ServiceKey` 를 사용한다.
- helper는 표준 라이브러리 `urllib` + `xml.etree.ElementTree` 만 사용한다.
- 에러 응답의 `resultCode` / `resultMsg` 는 감추지 않고 그대로 surfaced 한다.

## Done when

- `python3 scripts/patent_search.py --query "배터리"` 형태의 검색 명령이 준비된다.
- `python3 scripts/patent_search.py --application-number 1020240001234` 형태의 상세 조회 명령이 준비된다.
- 키가 없거나 잘못됐을 때 `KIPRIS_PLUS_API_KEY` / `ServiceKey` 안내가 분명하다.
- 출력 JSON에 출원번호와 발명의명칭이 포함된다.

## 검증 메모

2026-04-05 기준 로컬에서 아래 항목을 실제 실행해 helper 동작을 검증했다.

- `python3 scripts/patent_search.py --help`
- dummy `ServiceKey` 로 KIPRIS Plus endpoint 호출 시 인증 오류가 명시적으로 surfaced 되는지 확인
- 단위 테스트로 `getWordSearch` / `getBibliographyDetailInfoSearch` XML 파싱 회귀 검증

유효한 `KIPRIS_PLUS_API_KEY` 가 준비된 환경에서는 바로 실검색으로 이어서 검증할 수 있다.
