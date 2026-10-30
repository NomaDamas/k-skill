# KAMIS 농수축산물 가격 조회 가이드

`kamis-food-price`는 한국농수산식품유통공사 KAMIS의
`dailyPriceByCategoryList`를 `k-skill-proxy` 경유로 조회한다.

- 도매/소매 구분
- 식량작물·채소류·특용작물·과일류·축산물·수산물 부류
- 지역 코드와 조사일
- 조회일·전일·1주일·1개월·1년·평년 가격 비교

일반 사용자는 KAMIS API 키를 입력하지 않는다. hosted proxy 운영자만
`KAMIS_API_KEY`를 서버 환경에 보관한다.

```bash
npx -y @nomadamas/k-skill@0 exec kamis-food-price scripts/run_kamis.py -- \
  --product-class 01 --category 200 --county 1101 --text
```

공식 계약 파라미터는 underscored 이름(`p_product_cls_code`,
`p_item_category_code`, `p_country_code`)이며, 구식 별칭
(`p_productclscode`, `p_itemcategorycode`, `p_countycode`)도 빈 값일 때만
대체로 받는다.

주요 실패 모드:

- `400 bad_request`: 날짜·지역·부류·도소매 값이 계약과 다름
- `503 upstream_not_configured`: 프록시에 `KAMIS_API_KEY` 없음
- `502 upstream_category_mismatch`: upstream이 요청한 부류/도소매 필터를
  적용하지 않아(응답 `condition` echo가 요청과 다름) 다른 데이터를 반환함.
  Python helper도 같은 echo/query 검증을 하고 `[error]`와 종료코드 `5`로 멈춘다.
- `items: []`, upstream code `001`: 조건에 해당하는 가격 없음

공식 출처: https://www.kamis.or.kr/customer/reference/openapi_list.do?action=detail&boardno=1

