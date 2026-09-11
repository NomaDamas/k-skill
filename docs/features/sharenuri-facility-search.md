# 공유누리 공공시설 검색 가이드

대상 사이트는 행정안전부 공유누리(공공개방자원 포털) `https://www.eshare.go.kr` 이다. 이 기능은 공유누리에 등록된 공공개방자원의 **조회 자동화**만 수행한다.

## 이 기능으로 할 수 있는 일

- 전국 공공개방자원 키워드 검색 (회의실, 강당, 체육시설, 숙소, 캠핑장, 물품 등)
- 시·도 / 시군구 / 자원 대분류 / 무료 여부 / 인터넷 예약 가능 여부 필터
- 자원 상세정보 조회: 자원분류, 장소, 제공기관, 담당자, 예약방법, 예약문의, 이용정원, 심사여부, 이용요금
- JSON 또는 사람이 읽기 좋은 텍스트 출력

API 키와 로그인이 모두 필요 없다. 예약 신청, 로그인, 결제, 신청서 제출은 하지 않는다. 예약은 조회 결과의 공식 상세 URL에서 사용자가 직접 진행한다.

## 먼저 필요한 것

- Python 3.9+ (표준 라이브러리만 사용, 별도 설치 없음)
- 시크릿·환경변수 없음

## 사용 예시

```bash
# 키워드 검색
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  search --query 회의실 --limit 10

# 서울 강남구 무료 회의실만 (시군구 코드는 sigungu 하위명령으로 조회)
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  sigungu --ctrd 11
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  search --query 회의실 --sido 서울특별시 --sigg 11680 --free --json

# 상세정보 (검색 결과의 rsrc_no / rsrc_dcd 사용)
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  detail --rsrc-no FF20O3200420 --rsrc-dcd CPS001.002

# 자원 대분류 코드 목록
npx -y @nomadamas/k-skill@0 exec sharenuri-facility-search scripts/sharenuri_search.py -- \
  categories
```

## 데이터 출처와 한계

- 출처는 공유누리 공개 통합검색이다 (2026-09-12 실측: `회의실` 5,828건, 서울 강남구 무료 회의실 8건).
- 공유누리에 등록된 자원만 검색된다. 지자체 자체 예약 시스템(예: 서울 공공서비스예약)에만 있는 시설은 나오지 않을 수 있다.
- 실시간 시간대별 예약 현황은 다루지 않는다. 예약 가능 여부의 최종 확인은 상세 페이지의 공식 예약 화면에서 한다.
- 같은 데이터의 키 기반 공식 API(공유누리 OPEN API, 공공데이터포털 15077523·15077518·15076186)도 존재한다. 대량 수집이 필요하면 인증키를 신청해 공식 API를 쓰는 편이 맞다.

## 주의

- 개인의 정보 조회 용도로만 사용한다. 대량 수집, 데이터베이스 구축, 재배포는 하지 않는다 ([DISCLAIMER](../../sharenuri-facility-search/references/DISCLAIMER.md)).
