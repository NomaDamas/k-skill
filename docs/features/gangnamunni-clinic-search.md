# 강남언니 병원 조회 가이드

`gangnamunni-clinic-search`는 강남언니 공개 검색 페이지에서 병원 후보를 조회하는 read-only 스킬입니다.

## 공개 접근 경로

- 검색 URL: `https://www.gangnamunni.com/search?q=<keyword>`
- 데이터 위치: HTML 안의 `__NEXT_DATA__` JSON (`props.pageProps.hospitals`)
- 인증/시크릿: 불필요
- 프록시: 사용하지 않음

## 예시

```bash
npx gangnamunni-clinic-search "강남 성형외과" --limit 5
```

```js
const { searchClinics } = require("gangnamunni-clinic-search")
const result = await searchClinics({ query: "코성형", limit: 3 })
```

## 출력

각 후보는 공개 검색 페이지에 포함된 병원명, 평점, 리뷰 수, 지원 언어, 이미지 URL, 공개 병원 링크를 포함합니다.

## 제한사항

- 조회 시점 공개 검색 결과 기준입니다.
- 로그인, 상담, 예약, 결제, 찜, 리뷰 작성은 자동화하지 않습니다.
- CAPTCHA/차단/로그인벽/빈 shell 페이지는 실패 모드로 처리합니다.
- 의료 판단이나 병원 선택 보증을 대신하지 않습니다.
