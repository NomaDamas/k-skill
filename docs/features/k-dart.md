# 금감원 DART 전자공시 조회 가이드

## 이 기능으로 할 수 있는 일

- 공시검색 (최근 공시 목록, 기업별 공시 이력)
- 기업개황 (대표자, 업종, 주소, 결산월 등)
- 재무제표 (매출액, 영업이익, 당기순이익, 자산/부채/자본 등)
- 배당에 관한 사항
- 증자(감자) 현황
- 자기주식 취득 및 처분 현황
- 회계감사인의 명칭 및 감사의견
- 직원 현황 (부문별/성별 정규직·계약직 인원)
- 주요사항보고서: 유무상증자 결정, 소송, 해외 상장/상장폐지, 전환사채, 교환사채, 회사분할합병

## 먼저 필요한 것

`API_K_DART` 환경변수에 DART OpenAPI 인증키를 설정해야 한다.

키 발급: <https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do>

## 추천 조회 순서

1. `corpCode.xml` ZIP을 다운로드해 회사명 또는 종목코드로 `corp_code`(8자리 고유번호)를 찾는다.
2. `corp_code`로 기업개황, 재무제표, 감사의견 등 원하는 API를 호출한다.
3. 주요사항보고서는 날짜 범위(`bgn_de`, `end_de`)가 필요하다.

## 검색 예시

공시검색:

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/list.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bgn_de=20260101' \
  --data-urlencode 'end_de=20260419' \
  --data-urlencode 'page_count=5'
```

재무제표 (연결, 사업보고서):

```bash
curl -fsS --get 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json' \
  --data-urlencode "crtfc_key=$API_K_DART" \
  --data-urlencode 'corp_code=00126380' \
  --data-urlencode 'bsns_year=2024' \
  --data-urlencode 'reprt_code=11011' \
  --data-urlencode 'fs_div=CFS'
```

## 응답 해석 팁

- `status: "000"`이 정상. 그 외는 에러 (010=미등록 키, 011=사용 불가 키, 012=접근 불가 IP, 013=조회된 데이터 없음, 020=요청 제한 초과, 100=필드 오류).
- 재무제표의 `thstrm_amount`=당기, `frmtrm_amount`=전기, `bfefrmtrm_amount`=전전기.
- `reprt_code`: 11011(사업보고서), 11012(반기), 11013(1분기), 11014(3분기).
- `fs_div`: CFS(연결), OFS(개별).

## 답변 템플릿 권장

- 회사명 / 시장 / 종목코드
- 회계연도 / 보고서 종류
- 핵심 재무 수치 (매출, 영업이익, 순이익, 자산/부채/자본)
- 마지막 한 줄: `금감원 DART 공시 데이터 기준이며 투자 조언은 아닙니다.`

## 에러/제약

- `API_K_DART` 미설정 시 API 호출 불가 → 키 발급 안내
- DART API 요청 한도: 공식 가이드(020 메시지) 기준 "일반적으로 20,000건 이상의 요청"에 대해 020 (요청 제한 초과)이 발생하며, 키별로 별도 한도가 설정된 경우 다른 임계치에서도 동일 코드가 반환될 수 있음. 분당 throttle 등 세부 수치는 공개 가이드에 명시되지 않음. 본인 키의 정확한 사용 현황은 로그인 후 OpenDART 사이트의 [오픈API 이용현황](https://opendart.fss.or.kr/mng/apiUsageStatusView.do) 페이지에서 확인 가능.
- 상장폐지·오래된 비상장 법인은 데이터가 없을 수 있음
- DART OpenAPI `list.json` 의 공식 요청 파라미터 표에 `corp_name` 은 존재하지 않는다. 회사명 기준으로 좁히려면 `corpCode.xml` ZIP을 받아 `corp_code`(8자리 고유번호)를 먼저 확보한 뒤 `corp_code` 로 호출한다. `corp_code` 자체는 선택사항(공식 가이드: N)이지만, 공식 spec 기준 미지정 시 `bgn_de`~`end_de` 검색 기간이 3개월 이내로 제한된다.

## 참고 링크

- 공식 DART OpenAPI: <https://opendart.fss.or.kr/intro/main.do>
- API 목록: <https://opendart.fss.or.kr/intro/infoApiList.do>
