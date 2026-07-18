# 전기차 보조금 현황 조회 가이드

`ev-subsidy-status`는 환경부 무공해차 통합누리집의 공개 구매보조금 지급현황에서 지자체별 민간공고·접수·출고·출고잔여 대수와 공고 상태를 조회하는 read-only 스킬입니다.

## 공개 접근 경로

- 지급현황: `https://ev.or.kr/nportal/buySupprt/initSubsidyPaymentCheckAction.do`
- 모델별 보조금: `https://ev.or.kr/nportal/buySupprt/psPopupLocalCarModelPrice.do`
- 인증/시크릿: 불필요
- 프록시: 사용하지 않음
- 기본 전송 방식: 브라우저가 필요 없는 `direct-http`

공식 응답은 `pnp4web`으로 보호되어 있습니다. 패키지는 공개 `pnp4web.js`에 선언된 문자표만 파싱하고 원격 JavaScript를 `eval` 또는 `vm`으로 실행하지 않은 채 HTML을 복원합니다.

## 설치

Node.js 18 이상이 필요합니다.

```bash
npm install -g ev-subsidy-status
```

일회성 조회는 별도 전역 설치 없이 `npx`를 사용할 수 있습니다.

```bash
npx ev-subsidy-status status \
  --region "경기도 화성시 동탄" \
  --vehicle passenger \
  --model "모델명" \
  --year 2026
```

## 사용 예시

지역별 현황을 JSON으로 조회합니다.

```bash
npx ev-subsidy-status status \
  --region "경기 화성시" \
  --vehicle passenger \
  --year 2026 \
  --json
```

중복되는 시군구 이름은 먼저 후보를 검색합니다.

```bash
npx ev-subsidy-status regions --query "중구"
```

차종은 `passenger`/`승용`, `cargo`/`화물`, `bus`/`승합`을 지원합니다. 연도를 생략하면 Asia/Seoul 기준 현재 연도를 사용합니다.

## 출력 해석

- `notice_count`: 민간공고대수
- `application_count`: 접수대수
- `delivered_count`: 출고대수
- `delivery_remaining_count`: 공식 출고잔여대수
- `availability.label`: 비고와 잔여 대수를 함께 고려한 상태
- `model_subsidy_candidates`: 입력한 모델명과 일치하는 세부 모델별 국비·지방비·합계
- `remaining_equivalent_estimate_krw`: 공식 출고잔여대수에 해당 세부 모델의 1대당 보조금을 곱한 환산치

입력한 이름이 여러 세부 모델과 일치하면 한 모델을 임의로 고르지 않고 모든 일치 후보를 반환합니다.

## 정확한 예산 잔액과의 차이

환경부 공개 지급현황은 지자체 회계상 정확한 원화 예산 잔액을 제공하지 않습니다. 따라서 스킬은 항상 `remaining_budget.exact_available=false`와 `exact_amount_krw=null`을 유지합니다.

모델 기준 환산치는 다음 계산일 뿐입니다.

```text
공식 출고잔여대수 × 선택 모델의 국비+지방비
```

구매자별 추가지원, 접수 후 예약·취소, 차종 간 물량 전환과 실제 집행 시차 때문에 실제 신청 가능 대수나 가용 예산과 다를 수 있습니다. 잔여 대수가 양수여도 지자체 비고가 `마감`, `소진`, `접수 종료`라면 신청 가능하다고 안내하지 않습니다.

## 선택적 브라우저 진단

공식 DOM 변경을 진단할 때만 `k-skill-browser-runtime`을 통해 사용자가 실행한 Aside Browser, BrowserOS 또는 Chrome CDP 세션을 선택적으로 사용할 수 있습니다.

```bash
npx ev-subsidy-status status \
  --region "경기 화성시" \
  --transport browser \
  --provider auto
```

스킬이 브라우저를 직접 실행하거나 로그인·CAPTCHA를 우회하지 않으며, 사용자의 기존 탭과 프로필을 닫지 않습니다.

## 실패 처리

- 지역 누락·중복·미발견: `REGION_REQUIRED`, `REGION_AMBIGUOUS`, `REGION_NOT_FOUND`
- 지원하지 않는 연도·차종: `YEAR_NOT_AVAILABLE`, `VEHICLE_TYPE_NOT_AVAILABLE`
- 공개 응답 차단·구조 변경: `UPSTREAM_BLOCKED`, `DOM_CHANGED`
- 보호 응답 복원 실패: `UPSTREAM_DECODE_FAILED`
- 모델 미발견 또는 모델 표 변경: `MODEL_LOOKUP_FAILED`
- 로그인·CAPTCHA 등장: `AUTH_REQUIRED`, `CAPTCHA_DETECTED`

모델 조회만 실패한 경우에는 지역별 현황을 버리지 않고 `model_lookup_error`와 경고를 함께 반환합니다.
