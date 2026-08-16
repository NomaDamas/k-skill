# 한국 공휴일·특일 조회 가이드

## 이 기능으로 할 수 있는 일

- 한국천문연구원 특일 정보 API를 `k-skill-proxy`로 호출해 공휴일·국경일·기념일·24절기·잡절을 조회
- 사용자 쪽 API 키 없이 hosted proxy로 바로 사용

## 가장 중요한 규칙

조회는 `GET /v1/korean-holiday/calendar`로 처리한다. `DATA_GO_KR_API_KEY`는 프록시 서버에만 두고, 공공데이터포털 `15012690` 활용신청이 승인돼 있어야 한다.

법정 영업일·금융/법률 마감 산정에는 원천 API 결과와 관계 법령/기관 공지를 함께 확인한다.

## operation

| operation | upstream |
| --- | --- |
| `rest` (기본) | `getRestDeInfo` 공휴일 |
| `national` | `getHoliDeInfo` 국경일 |
| `anniversary` | `getAnniversaryInfo` 기념일 |
| `solarTerm` | `get24DivisionsInfo` 24절기 |
| `sundry` | `getSundryDayInfo` 잡절 |

응답 핵심 필드: `locdate`(`YYYYMMDD`), `dateName`, `isHoliday`(`Y`/`N`).

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/korean-holiday/calendar" \
  --data-urlencode "operation=rest" \
  --data-urlencode "year=2026" \
  --data-urlencode "month=08"
```

"오늘이 공휴일인지"는 KST 날짜를 `YYYYMMDD`로 만든 뒤 해당 `locdate`의 `isHoliday`를 확인한다.

## 실패 모드

- `400`: 연도/월/operation/page 값 오류
- `503`: 프록시에 `DATA_GO_KR_API_KEY`가 설정되지 않음
- `502 upstream_forbidden`: data.go.kr가 키를 거부하거나 `15012690` 활용신청이 승인되지 않음
- 빈 결과: 해당 연월/operation에 특일 없음. operation을 바꿔 재조회

## 출처

- 공공데이터포털 한국천문연구원 특일 정보: https://www.data.go.kr/data/15012690/openapi.do
- 프록시 엔드포인트 목록: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
