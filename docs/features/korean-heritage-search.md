# 한국 국가유산 검색 가이드

## 이 기능으로 할 수 있는 일

- 국가유산청 공식 Open API에서 국가유산명·지역 기준 목록 검색
- 국가유산 상세 설명, 유형, 주소, 좌표, 지정일, 관리기관, 이미지 조회
- 연도·월별 국가유산 활용 행사 조회
- 행사 결과를 시도·시군구 문자열로 좁혀 보기

## 먼저 필요한 것

- 인터넷 연결
- Python 3.10+
- 설치된 `korean-heritage-search` skill 안에 `scripts/korean_heritage_search.py` helper 포함

별도 API key, 로그인, 프록시, 외부 Python 패키지는 필요 없다.

## 공식 API

국가유산청 Open API의 공개 XML endpoint를 사용한다.

- 목록: `https://www.khs.go.kr/cha/SearchKindOpenapiList.do`
- 상세: `https://www.khs.go.kr/cha/SearchKindOpenapiDt.do`
- 행사: `https://www.khs.go.kr/cha/openapi/selectEventListOpenapi.do`
- 안내: `https://www.khs.go.kr/html/HtmlPage.do?mn=NS_04_04_03&pg=%2Fpublicinfo%2Fpbinfo3_0201.jsp`

목록 API 검색어는 `ccbaMnm1`, 시도 필터는 `ccbaCtcd`, 상세 API는 `ccbaKdcd`·`ccbaAsno`·`ccbaCtcd` 조합을 사용한다. 행사 API는 `searchYear`·`searchMonth`를 사용한다.

## 기본 흐름

1. 사용자의 국가유산명·지역 조건을 확인한다.
2. 목록 API로 후보를 조회한다.
3. 선택된 후보의 세 식별자를 이용해 상세 API를 조회한다.
4. 행사 요청이면 연도·월을 행사 API로 조회하고 지역 문자열을 후처리한다.
5. 공식 출처 URL과 조회 시각을 포함해 결과를 요약한다.

## CLI 예시

### 국가유산명 검색

```bash
python3 scripts/korean_heritage_search.py search --query "경복궁" --region 서울 --limit 5
```

### 지역 검색

```bash
python3 scripts/korean_heritage_search.py search --region 전북 --limit 10
```

### 상세 조회

```bash
python3 scripts/korean_heritage_search.py detail \
  --ccba-kdcd 11 \
  --ccba-asno 0000010000000 \
  --ccba-ctcd 11
```

### 월별 행사 조회

```bash
python3 scripts/korean_heritage_search.py events \
  --year 2026 \
  --month 7 \
  --region 서울 \
  --limit 10
```

## 응답 예시 형태

```json
{
  "total_results": 11,
  "page": 1,
  "page_size": 5,
  "items": [
    {
      "name": "경복궁 근정전",
      "heritage_type": "국보",
      "province": "서울",
      "district": "종로구",
      "latitude": 37.578342,
      "longitude": 126.976953,
      "heritage_code": {
        "kind": "11",
        "number": "0002230000000",
        "province": "11"
      }
    }
  ],
  "source": {
    "url": "https://www.khs.go.kr/cha/SearchKindOpenapiList.do",
    "fetched_at": "2026-07-15T00:00:00+00:00"
  }
}
```

## 범위와 한계

- 국가유산 API의 공식 등록 정보와 설명을 조회한다.
- API에 없는 입장료, 운영시간, 현재 통제·혼잡도·주차 가능 여부는 추정하지 않는다.
- 행사 설명에는 원문 HTML이 섞일 수 있어 helper가 태그를 제거한 텍스트를 반환한다.
- 이미지 URL이나 일부 선택 필드는 upstream 데이터에 따라 비어 있을 수 있다.
- 현재 위치 주변 검색은 v1 범위에 포함하지 않는다. 목록 API가 전국 데이터를 페이지 단위로 반환하고 안정적인 반경 필터를 제공하지 않으므로, 근거 없이 모든 데이터를 내려받아 근처 결과라고 표시하지 않는다.

## 실패 시 처리

- 결과가 없으면 국가유산명 표기나 지역 조건을 넓혀 재검색한다.
- 상세 결과가 없으면 목록 API에서 최신 식별자를 다시 얻는다.
- HTTP 오류, timeout, 잘못된 XML은 upstream 장애로 보고 재시도하거나 공식 사이트 링크를 안내한다.
- 행사 기간 문자열이 비어 있으면 `sDate`·`eDate`와 행사 페이지 링크를 우선 표시한다.

## 라이브 검증 메모

2026-07-15 기준 다음 공식 endpoint에서 XML 응답을 확인했다.

- 목록 API에서 `ccbaMnm1=경복궁`, `ccbaCtcd=11` 조건으로 11건 반환
- 상세 API에서 서울 숭례문의 설명, 주소, 좌표, 이미지 반환
- 행사 API에서 2026년 7월 행사 목록 반환
