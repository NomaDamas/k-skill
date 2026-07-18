---
name: ev-subsidy-status
description: 한국 지자체별 전기차 구매보조금 민간공고·접수·출고·출고잔여 대수와 공고 상태를 환경부 무공해차 통합누리집에서 조회한다. 사용자가 사는 지역의 전기승용·전기화물·전기승합 보조금 잔여 현황, 접수 가능 여부, 마감·소진·추경 예정, 특정 모델 기준 보조금 환산치를 물을 때 사용한다.
license: MIT
metadata:
  category: local-info
  locale: ko-KR
  phase: v1
---

# EV Subsidy Status

환경부 무공해차 통합누리집의 공개 지급현황을 로그인이나 사용자 실행 브라우저 없이 직접 읽는다. 조회만 수행하고 보조금 신청이나 로그인 흐름은 자동화하지 않는다.

## Prerequisites

- Node.js 18+
- `ev-subsidy-status` npm package

기본 조회에는 브라우저, API 키, 로그인, 프록시가 필요하지 않다. 공식 화면 구조 변경을 진단할 때만 사용자가 실행한 Aside Browser, BrowserOS 또는 Chrome/Chromium CDP 세션을 선택적으로 사용한다.

## Public access path

기본 화면:

```text
https://ev.or.kr/nportal/buySupprt/initSubsidyPaymentCheckAction.do
```

모델별 보조금 화면:

```text
POST /nportal/buySupprt/psPopupLocalCarModelPrice.do
year=<year>&local_cd=<region-code>&car_type=<11|12|13>
```

확인된 DOM:

- 시도: `#localDo_cd`
- 시군구: `#local_cd1`
- 결과 열: 시도, 지역구분, 차종구분, 공고파일, 접수방법, 민간공고대수, 접수대수, 출고대수, 출고잔여대수, 비고

페이지는 로그인 없이 공개되지만 `pnp4web`/`penc`가 본문을 보호한다. 기본 경로는 공개 응답에서 공식 `pnp4web.js` 문자표를 파싱하고 원격 코드를 실행하지 않은 채 HTML을 복원한다. 전국 행이 포함된 지급현황 표에서 요청 지역만 선택한다. 공개 keyless 화면이므로 `k-skill-proxy`를 사용하지 않는다.

## Workflow

### 1. 지역과 차종을 정규화한다

- 지역은 가능하면 `시도 + 시군구`로 받는다. 예: `경기 성남시`
- `중구`, `강서구`처럼 중복되는 이름이면 `regions`로 후보를 찾고 사용자가 시도를 고르게 한다.
- 차종 기본값은 `passenger`/`전기승용`이다.
- 지원 차종: `passenger`/`승용`, `cargo`/`화물`, `bus`/`승합`
- 연도 기본값은 Asia/Seoul 기준 현재 연도다.

```bash
npx ev-subsidy-status regions --query 중구
```

### 2. 공식 지급현황을 조회한다

```bash
npx ev-subsidy-status status \
  --region "경기 성남시" \
  --vehicle passenger \
  --year 2026 \
  --json
```

결과의 `transport`가 `direct-http`인지 확인한다. 기본 경로는 사용자 브라우저가 없어도 동작해야 한다.

반환값에서 다음을 우선 확인한다.

- `status.notice_count`: 민간공고대수
- `status.application_count`: 접수대수
- `status.delivered_count`: 출고대수
- `status.delivery_remaining_count`: 출고잔여대수
- `availability.label`: 공고 상태 판정
- `status.note`: 지자체 비고 원문
- `source.fetched_at`: KST 조회 시각

숫자 셀은 `전체 / 우선순위 / 법인·기관 / 예약 대상군 / 일반`으로 보존한다. 승용의 예약 대상군은 `taxi`, 화물은 `small_business` alias도 함께 반환한다.

### 3. 비고를 숫자보다 우선한다

다음 우선순위로 설명한다.

1. `마감`, `소진`, `접수 종료` → `closed`
2. `접수 예정`, `추경 예정`, `추가 공고 예정` → `scheduled`
3. `접수 중`, `신청 기간`, `신청 가능` → `open`
4. 명시 문구 없이 잔여 대수만 양수 → `unknown_with_remaining_count`
5. 판단 근거 없음 → `unknown`

잔여 대수가 양수여도 비고가 마감이면 신청 가능하다고 말하지 않는다.

### 4. 모델을 지정했을 때만 원화 환산치를 조회한다

```bash
npx ev-subsidy-status status \
  --region "서울 강남구" \
  --vehicle passenger \
  --model "모델명" \
  --json
```

직접 HTTP 경로에서도 공식 모델별 보조금 POST 표면을 조회한다. 입력한 이름이 여러 세부 모델과 일치하면 임의로 하나를 고르지 않고 `model_subsidy_candidates`에 모든 후보와 후보별 환산치를 반환한다. 정확한 세부 모델과 하나만 일치할 때는 `model_subsidy`와 `remaining_budget.model_equivalent_estimate_krw`도 함께 반환한다.

`remaining_budget.model_equivalent_estimate_krw`는 다음 가정의 환산치다.

```text
공식 출고잔여대수 × 선택 모델의 국비+지방비
```

이를 지자체의 정확한 예산 잔액이라고 표현하지 않는다. 모델별 금액, 구매자 추가지원, 물량 전환, 접수 후 예약·취소가 달라 실제 가용 예산과 다르다. 모델 조회가 실패해도 지역별 대수 결과는 유지하고 `model_lookup_error`와 경고를 보여준다.

### 5. 사용자에게 보수적으로 답한다

최종 답변에 포함한다.

- 지역, 차종, 기준년도
- 민간공고·접수·출고·출고잔여 대수
- 공고 상태와 비고의 핵심 문구
- 모델 환산치가 있으면 계산 가정
- “출고잔여대수는 실제 신청 가능 대수 및 정확한 원화 잔액과 다를 수 있음” 경고
- 공식 출처 URL과 KST 조회 시각

## Direct HTTP behavior

- `POST initSubsidyPaymentCheckAction.do`에 `year1`, `car_type`, 전국 지역 조건을 전송한다.
- 응답의 `pnp4web.js` URL과 보호 payload를 추출한다.
- 원격 JavaScript를 `eval`/`vm`으로 실행하지 않는다.
- 스크립트에 선언된 조각 문자표만 파싱해 payload를 UTF-8 HTML로 복원한다.
- 지급현황 표의 공식 행과 비고를 파싱하고 지역 코드는 공고 다운로드 함수 인자에서 읽는다.
- 모델이 있으면 `psPopupLocalCarModelPrice.do`를 같은 연도·지역 코드·차종으로 호출하고 모델별 국비·지방비·합계를 파싱한다.
- 공식 스크립트나 표 구조가 바뀌면 `UPSTREAM_DECODE_FAILED` 또는 `DOM_CHANGED`로 중단한다.

## Optional browser behavior

- `domcontentloaded` 후 목표 selector와 지역 행을 명시적으로 기다린다.
- `networkidle`은 pnp4web 백그라운드 요청 때문에 사용하지 않는다.
- 렌더링된 `<option>` label/value로 지역 코드를 동적으로 해석한다.
- 기존 사용자 탭과 프로필을 닫지 않는다.
- 스킬이 만든 페이지·컨텍스트만 정리하고 지원되는 client만 disconnect한다.
- 로그인, CAPTCHA, 결제, 전자서명, 최종 제출 경계를 우회하지 않는다.

공식 화면 변경을 진단하거나 모델별 환산을 조회하기 위해 브라우저 경로를 선택할 때:

```bash
npx ev-subsidy-status status --region "경기 성남시" --transport browser --provider aside
npx ev-subsidy-status status --region "경기 성남시" --transport browser --provider browseros
npx ev-subsidy-status status --region "경기 성남시" --transport browser --provider chrome-cdp
```

## Done when

- 요청 지역과 차종이 공식 표의 행과 일치한다.
- 공고·접수·출고·출고잔여 수치와 지자체 비고를 반환한다.
- 명시적 마감 문구를 양수 잔여 대수보다 우선한다.
- 정확한 원화 예산 잔액을 알 수 없으면 `exact_available=false`와 이유를 반환한다.
- 출처 URL과 KST 조회 시각을 표시한다.

## Failure modes

- `REGION_REQUIRED`: 지역 입력이 없다.
- `REGION_AMBIGUOUS`: 같은 시군구 이름이 여러 시도에 있다.
- `REGION_NOT_FOUND`: 공식 지역 옵션에 없다.
- `YEAR_NOT_AVAILABLE`: 요청 연도가 선택 목록에 없다.
- `VEHICLE_TYPE_NOT_AVAILABLE`: 요청 차종을 지원하지 않거나 화면에서 찾지 못했다.
- `BROWSER_UNAVAILABLE`: 연결 가능한 사용자 실행 브라우저가 없다.
- `UPSTREAM_BLOCKED`: 빈 껍데기, 차단 또는 비정상 페이지다.
- `CAPTCHA_DETECTED`: CAPTCHA가 나타났다. 우회하지 않는다.
- `AUTH_REQUIRED`: 공개 화면이 로그인 흐름으로 바뀌었다. 우회하지 않는다.
- `RESULT_EMPTY`: 목표 지역의 결과 행이 없다.
- `DOM_CHANGED`: 공식 페이지의 선택자나 표 구조가 바뀌었다.
- `UPSTREAM_DECODE_FAILED`: `pnp4web` 문자표 또는 보호 payload 형식이 바뀌었다.
- `MODEL_LOOKUP_FAILED`: 모델별 보조금 표를 읽지 못했다.

대상군 값이 음수이거나 전체와 부분합이 다르면 값을 0으로 고치지 않는다. 원본 수치와 경고를 함께 반환한다.
