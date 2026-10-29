# KAMIS 농수축산물 가격 조회

## What this skill does

한국농수산식품유통공사 KAMIS의 `dailyPriceByCategoryList`를
`k-skill-proxy`의 좁은 read-only route로 호출한다. 농산물·축산물·수산물의
부류별 도매/소매 가격과 전일, 1주일, 1개월, 1년, 평년 비교값을 반환한다.

이 skill은 쇼핑몰 최저가나 투자 추천이 아니라 공식 유통가격 조회용이다.

## Inputs

- `p_product_cls_code`: `01` 소매, `02` 도매. 기본 `01`
- `p_item_category_code`: `100` 식량작물, `200` 채소류, `300` 특용작물,
  `400` 과일류, `500` 축산물, `600` 수산물. 기본 `100`
- `p_country_code`: 지역 코드(예: `1101` 서울). 생략하면 전체 지역
- `p_regday`: `YYYY-MM-DD`, 생략하면 최근 조사일
- `p_convert_kg_yn`: `Y` 또는 `N`. 기본 `N`

사용자가 문서식 별칭인 `p_product_cls_code`, `p_country_code`,
`p_item_category_code`를 주어도 proxy가 실제 upstream 계약명으로 정규화한다.

## Workflow

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/kamis/food-price/daily-category" \
  --data-urlencode "p_product_cls_code=01" \
  --data-urlencode "p_item_category_code=200" \
  --data-urlencode "p_country_code=1101" \
  --data-urlencode "p_convert_kg_yn=N"
```

응답의 `items` 각 항목에서 `item_name`, `kind_name`, `rank`, `unit`,
`dpr1`(조회일), `dpr2`(1일 전), `dpr3`(1주일 전), `dpr5`(1개월 전),
`dpr6`(1년 전), `dpr7`(평년)을 확인한다. 가격 문자열의 쉼표와 `-`를
숫자로 바꿀 때는 빈 값 여부를 먼저 보존한다.

## Access path and credentials

일반 사용자는 hosted `k-skill-proxy`를 사용하므로 KAMIS 키가 필요 없다.
proxy 운영자는 KAMIS에서 발급받은 `KAMIS_API_KEY`를 서버 runtime env에
보관한다. upstream의 `p_cert_id`는 별도 API key가 아니라 요청자 ID
파라미터이며, 현재 proxy는 live 계약에서 검증한 `TEST` 값을 사용한다.
키를 URL, 로그, 저장소, 사용자 응답에 노출하지 않는다.

공식 문서:
<https://www.kamis.or.kr/customer/reference/openapi_list.do?action=detail&boardno=1>

실제 upstream 경로는 `xml.do`이지만 `p_returntype=json`을 사용한다. 이는
KAMIS의 공식 계약이며 URL을 `json.do`로 바꾸지 않는다.

## Failure modes

- `400 bad_request`: 잘못된 날짜, 지역 코드, 부류 코드, 도소매 값
- `503 upstream_not_configured`: proxy runtime에 `KAMIS_API_KEY` 없음
- `400` 또는 `502 upstream_error`: KAMIS code `200`, `900`, 네트워크/상류 오류
- `items: []`, upstream code `001`: 해당 조건의 가격 없음
- KAMIS가 JSON 대신 점검 HTML/XML을 반환하면 `upstream_invalid_response`
- 가격은 조사 시점의 공식 데이터이며 구매 보장·법률 판단·투자 조언이 아니다

## Done when

- 조회 조건과 `query`가 응답에 남아 있다.
- 각 가격 항목의 조회일과 비교 기간을 구분했다.
- 답변에 KAMIS 원문 출처와 조회 조건을 함께 적었다.
