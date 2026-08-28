# 소비자 가격·안전 조회

`consumer-price-safety-search`는 참가격 가격정보와 소비자24 물품·리콜정보를
조회한다. 소비자24는 서비스별 인증키와 리콜 메뉴 매핑을 proxy 서버에서
분리해 관리한다.

```bash
npx -y @nomadamas/k-skill@0 exec consumer-price-safety-search scripts/run_consumer24.py -- \
  recalls --service-id 00000010 --product 전기장판 --text
```

`serviceKey`는 `CONSUMER24_SERVICE_KEY_<openapiSvcId>` 환경변수로만 등록한다.
`openapiSvcId`와 `cntntsId`는 공개 카탈로그 매핑이다.

공식 목록: https://www.consumer.go.kr/user/ftc/consumer/openApiSvcUser/120/selectOpenApiSvcList.do
