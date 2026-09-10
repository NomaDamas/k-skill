---
title: BC카드 eat.pl 맛집 검색 가이드
description: 장소 주소와 업종 조건으로 eat.pl 잇플의 최근 1개월 BC카드 결제 데이터 기반 매출 상위 맛집을 조회하는 방법
---

# BC카드 eat.pl 맛집 검색 가이드

## 이 기능으로 할 수 있는 일

- `kakao-map` 스킬(k-skill-proxy가 중계하는 카카오 공식 Local REST API)로 확인한 장소 주소를 기준으로 주변 가맹점 조회. 카카오맵 웹 스크래핑이 아니다.
- eat.pl 잇플 API가 반환하는 최대 100건의 매출 상위 순 결과 확인
- 장르, 동네 맛집, 외국인 방문, 회식 적합성, 영업 예상 시간과 지도 정보 대조
- 모든 행에 `web.paybooc.ai` eat.pl 상세 링크 첨부

## 중요한 기준

결과는 별점이나 리뷰 순이 아니라 **최근 1개월 BC카드 결제 데이터 기반 매출 랭킹 상위 순**이다. 매출액(원)은 없고, `allSaleRnk`/`ccgSaleRnk` 백분위가 높낮이 정보다. 값이 낮을수록 상위이며 1% 미만은 `전국 매출 상위 0.04%`처럼 소수점을 보존한다. `srtTime`/`endTime`은 `영업 예상 시간 HH:MM–HH:MM`으로 정리한다. `merUrl`은 API 응답값을 그대로 모든 행에 링크로 첨부한다.

## 프록시 호출

```bash
curl -fsS --get "${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}/v1/bccard-eatpl/search" \
  --data-urlencode 'location=서울 중구 을지로30길 20' \
  --data-urlencode 'merTpbuzNm=카페'
```

프록시는 `BCCARD_EATPL_INST_NM`을 서버에서만 읽고 `trnsTrceNo`를 자동 생성한다. 운영자는 gpu01 `k-skill-proxy` `.env`에 기관코드와 승인된 `BCCARD_EATPL_API_BASE_URL`을 등록한다. 사용자는 credentials나 추적번호를 입력하지 않는다.

고정 outbound IP가 필요한 경우 gpu01 `k-skill-proxy` `.env`에
`BCCARD_EATPL_RELAY_URL`과 `BCCARD_EATPL_RELAY_TOKEN`을 넣는다.
Lightsail relay는 같은 값을 `EATPL_RELAY_TOKEN`으로 들고 `Authorization: Bearer`가
일치할 때만 검색을 받는다. 토큰이 없거나 틀리면 즉시 `401 unauthorized`다.
proxy에 relay URL만 있고 토큰이 없으면 릴레이를 호출하지 않고 `503`이다.
사용자는 Lightsail을 직접 호출하지 않으며, token은 로그·Git·클라이언트에 남기지 않는다.

## 입력 및 결과

- `location`/`address`: 주소 또는 지역 텍스트
- `merTpbuzNm`/`genre`: 명세의 대분류·소분류 업종
- `merNm`/`merchant_name`: 가맹점명 일부

표에는 가맹점명, 주소, 업종, 전국·지역 매출 상위 %, 동네 맛집 여부, 외국인·회식 적합 여부, 영업 예상 시간, 혼잡 시간, 주요 고객층, eat.pl 상세 링크를 표시한다. 상세 링크가 없는 행은 출력하지 않는다. 주소 텍스트 검색이므로 실제 반경은 지도 서비스로 교차 확인한다.

## 연동 전제와 실패 모드

운영 전에는 BC카드 제휴 승인, 기관코드 발급, 호출 IP 등록, 개발/운영 endpoint 승인을 완료해야 한다. `403/401`은 IP·기관코드·권한 문제일 수 있고, `503`은 proxy secret 미설정, `502`는 upstream 연결·응답 문제다. 개발 endpoint가 타임아웃이면 BC카드 측에 allowlist와 접근 정보를 확인한다.

## 출처 및 법적 고지

항상 `eat.pl 잇플 · BC카드 결제 데이터 기반`을 출처로 표시한다. 이 스킬은 BC카드 공식 제품 또는 지원 채널을 자칭하지 않으며, 실제 제휴 승인·표시 문구 검수 전에는 운영 노출하지 않는다. 전체 고지는 `bccard-eatpl-search/references/DISCLAIMER.md`를 읽는다.
