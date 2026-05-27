# 한국 마라톤 일정 조회 가이드

`korean-marathon-schedule` 스킬은 공개 웹 표면을 읽어 한국 마라톤/러닝 대회 일정을 조회하고, 요청 시 철인3종 대회도 함께 확인합니다.

## 제공 정보

각 결과는 가능한 범위에서 아래 정보를 반환합니다.

- 대회명
- 개최일
- 지역과 장소
- 신청 마감일 및 접수 기간
- 종목/코스
- 주최자
- 공식 웹사이트 또는 공개 상세 링크

## 공개 접근 경로

| 구분 | 공개 표면 | 사용 정보 | 인증 |
| --- | --- | --- | --- |
| 마라톤/러닝 | `https://gorunning.kr/races/` 및 `/races/<id>/<slug>/` 상세 페이지 | 일정, 장소, 접수 기간, 종목, 주최자, 웹사이트 | 불필요 |
| 철인3종 | `https://triathlon.or.kr/events/tour/?sYear=<YYYY>&vType=list` 및 상세 페이지 | 일정, 장소, 접수 기간, 코스, 주최자 | 불필요 |

두 표면 모두 API 키가 필요 없는 공개 읽기 경로이므로 `k-skill-proxy`를 사용하지 않습니다.

## 사용 예시

```js
const { searchEvents } = require("korean-marathon-schedule")

const result = await searchEvents({
  query: "서울",
  from: "2026-05-01",
  to: "2026-12-31",
  includeTriathlon: true,
  limit: 10
})

console.log(result.items)
```

CLI:

```bash
node packages/korean-marathon-schedule/src/cli.js 서울 --from 2026-05-01 --to 2026-12-31 --include-triathlon --limit 10
```

## 응답 작성 원칙

```text
- 대회명: 소아암환우돕기 제23회 서울시민마라톤
  일정: 2026-05-10
  장소: 서울 여의도 한강 물빛광장
  신청 마감: 2026-02-28 (접수기간 2026-01-12 ~ 2026-02-28)
  종목: Half, 10km, 5km, 3km 걷기
  링크: https://gorunning.kr/races/...
```

신청 마감일이 공개 페이지에서 확인되지 않으면 추정하지 말고 `신청 마감일 미확인`으로 표시합니다.

## 실패/주의 사항

- 일정과 접수 상태는 수시로 바뀌므로 조회 시각 기준 참고값으로 안내합니다.
- 공개 HTML 구조가 바뀌면 일부 필드가 비거나 파싱이 실패할 수 있습니다.
- 접수/결제/로그인/CAPTCHA가 필요한 경로는 자동화하지 않습니다.
- 행사별 공식 사이트가 없으면 GoRunning 또는 대한철인3종협회 상세 링크를 대신 제공합니다.
