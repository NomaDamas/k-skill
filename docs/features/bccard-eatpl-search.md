---
title: BC카드 eat.pl 맛집 검색 가이드
description: 장소 주소와 업종 조건으로 eat.pl 잇플의 최근 1개월 BC카드 결제 데이터 기반 매출 상위 맛집을 조회하는 방법
---

# BC카드 eat.pl 맛집 검색 가이드

## 이 기능으로 할 수 있는 일

- 카카오맵 등으로 확인한 장소의 정확한 주소를 기준으로 주변 가맹점 조회
- eat.pl 잇플 API가 반환하는 최대 100건의 매출 상위 순 결과 확인
- 장르, 동네 맛집, 외국인 방문, 회식 적합성, 관측 시간대와 지도 정보 대조
- `web.paybooc.ai`의 eat.pl 상세 링크 제공

## 중요한 기준

결과는 별점이나 리뷰 순이 아니라 **최근 1개월 BC카드 결제 데이터 기반 매출 랭킹 상위 순**이다. `allSaleRnk`와 `ccgSaleRnk`는 백분위(%)이며 낮을수록 상위다. `merUrl`은 API 응답값을 그대로 사용한다.

## 프록시 호출

```bash
curl -fsS --get "${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}/v1/bccard-eatpl/search" \
  --data-urlencode 'location=서울 중구 을지로30길 20' \
  --data-urlencode 'merTpbuzNm=카페'
```

프록시는 `BCCARD_EATPL_INST_NM`을 서버에서만 읽고 `trnsTrceNo`를 자동 생성한다. 운영자는 gpu01 `k-skill-proxy` `.env`에 기관코드와 승인된 `BCCARD_EATPL_API_BASE_URL`을 등록한다. 사용자는 credentials나 추적번호를 입력하지 않는다.

## 입력 및 결과

- `location`/`address`: 주소 또는 지역 텍스트
- `merTpbuzNm`/`genre`: 명세의 대분류·소분류 업종
- `merNm`/`merchant_name`: 가맹점명 일부

표에는 가맹점명, 주소, 업종, 전국·지역 매출 백분위, 동네 맛집 여부, 외국인·회식 적합 여부, 관측 시간, 혼잡 시간, 주요 고객층, eat.pl 상세 링크를 표시한다. 주소 텍스트 검색이므로 실제 반경은 지도 서비스로 교차 확인한다.

## 연동 전제와 실패 모드

운영 전에는 BC카드 제휴 승인, 기관코드 발급, 호출 IP 등록, 개발/운영 endpoint 승인을 완료해야 한다. `403/401`은 IP·기관코드·권한 문제일 수 있고, `503`은 proxy secret 미설정, `502`는 upstream 연결·응답 문제다. 개발 endpoint가 타임아웃이면 BC카드 측에 allowlist와 접근 정보를 확인한다.

## 출처 및 법적 고지

항상 `eat.pl 잇플 · BC카드 결제 데이터 기반`을 출처로 표시한다. 이 스킬은 BC카드 공식 제품 또는 지원 채널을 자칭하지 않으며, 실제 제휴 승인·표시 문구 검수 전에는 운영 노출하지 않는다. 전체 고지는 `bccard-eatpl-search/references/DISCLAIMER.md`를 읽는다.
