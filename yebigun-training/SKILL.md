---
name: yebigun-training
description: 사용자가 직접 로그인한 예비군 홈페이지(yebigun1.mil.kr) Chrome 세션을 재사용해 이번 훈련 일정/장소를 조회하고, 작년 이전 기록과 비교해 무엇이 달라졌는지 알려준다. 조회 전용이며 로그인이나 연기·보류 신청은 절대 자동화하지 않는다.
license: MIT
metadata:
  category: legal
  locale: ko-KR
  phase: v1
---

# 예비군 훈련정보 조회 & 작년 대비 비교

## What this skill does

공식 예비군 홈페이지(`https://www.yebigun1.mil.kr`)에서 **이미 로그인된 브라우저 세션**을 재사용해:

- "나의 훈련정보"(`IvdTraScheDetail.do`) 페이지를 조회해 소속 정보, 이번 훈련 기간/장소/훈련종류, 그리고 같은 페이지에 이미 표시되는 과거 연도 훈련 기록까지 한 번에 가져온다 (`training-info`).
- 올해와 작년(기본값) 기록을 필드 단위로 비교한 결과를 함께 돌려준다 — 별도 로컬 기록 단계 없이 페이지 자체에 있는 과거 기록을 바로 비교한다.
- 민감한 식별 정보(군번/이름/주민등록번호 앞자리/전화번호)가 없는 **조회/목록 화면**(훈련신청 결과, 연기신청 결과, 보류·해소 신청결과, 소속부대 공지사항, 훈련안내, 나의 질의응답, 예비군부대 찾기, 휴일예비군 훈련일정 조회)을 실제로 읽어서 표 형태로 돌려준다 (`view`).
- 그런 식별 정보가 화면에 그대로 노출되는 화면(훈련 연기신청/보류 신청/해소 신청/훈련일정 자율선택/전국단위 훈련신청/휴일예비군 훈련신청/개인정보수정/예비군 상훈)은 **화면만 열어주고 데이터는 절대 읽지 않는다** (`open-menu`) — 신청/제출도 절대 자동화하지 않는다.
- 필요하면 로컬에 연도별 기록을 추가로 저장(`record`)하고 비교(`diff`)할 수도 있다 (사이트가 더 오래된 기록을 보여주지 않게 되거나, 메모를 남기고 싶을 때를 위한 보조 기능).
- 범용 페이지 조회(`inspect`)로 아직 분류 안 된 다른 페이지 구조를 확인할 수도 있다.

`hipass-receipt`와 동일한 설계 원칙을 따른다: **로그인은 항상 사용자가 직접 하고, 이 스킬은 로그인된 세션에서 조회만 한다.**

## Hard limits

- **로그인은 반드시 사용자가 직접 한다.** PASS 본인인증, 공동인증서, 간편인증, ID/PW 중 어떤 것도 자동 입력하지 않는다.
- **조회 전용이다.** 훈련 연기 신청, 보류·해소 신청, 훈련일정 자율선택 신청처럼 제출형(side-effect) 액션은 절대 자동화하지 않는다 — 군 의무 관련 법적 효력이 있는 제출이고, 사유 작성처럼 사용자 본인의 판단이 필요한 입력이 끼어 있어서다.
- **`open-menu`는 "화면 열기"까지만이다.** 버튼 클릭이든(`selfSelect`/`nationalUnit`/`holiday`) 직접 이동이든(`delay`/`hold`/`holdCancel`/`editProfile`/`honors`) 화면으로 이동만 시켜주지만, 그 화면에서 날짜를 고르거나 사유를 입력하거나 제출 버튼을 누르는 것은 절대 하지 않는다. 다음 화면이 뜨면 즉시 멈추고 "여기서부터는 직접 진행하라"고 안내한다 — 사용자의 실제 화면(같은 Chrome 창)에 이미 그 화면이 열려 있다.
- **`view`는 식별 정보가 없는 페이지에만 쓴다.** `VIEW_MENUS`에 등록된 메뉴만 실제로 읽어서 표(headers/rows)로 돌려준다 — 이름/군번/주민등록번호/전화번호/주소가 마크업에 그대로 노출되는 페이지는 절대 `VIEW_MENUS`에 넣지 않고 `open-menu`(`APPLICATION_MENUS`)로 돌린다.
- 세션 만료/로그인 필요 응답을 감지하면 즉시 중단하고 재로그인을 안내한다.
- 개인정보(훈련기간/장소/소속부대/군번 등)가 담긴 기록은 **이 저장소 밖** `~/.cache/k-skill/yebigun-training/history.json`에만 저장한다. 절대 이 git 저장소에 실제 개인 데이터를 커밋하지 않는다 — `test/fixtures/`의 페이지 구조 fixture는 처음부터 끝까지 완전히 가상의 이름/날짜/장소로만 작성됐다(실제 로그인 세션에서 본 마크업 *구조*만 베껴서 재현했고, 그 세션에서 본 실제 값은 어디에도 옮기지 않았다).

## Why this design (and how it was verified)

- 병무청은 예비군 훈련 일정을 공개 API로 제공하지 않는다. 개인 훈련정보는 `yebigun1.mil.kr`에 PASS/공동인증서/간편인증으로 로그인해야만 보인다 (도메인은 `mma.go.kr`이 아니라 `yebigun1.mil.kr`).
- v1 설계 당시엔 본인인증 없이 로그인 후 페이지를 미리 볼 방법이 없어 `parseTrainingInfo`를 비워뒀었다. **2026-06-24, 사용자가 직접 로그인한 세션으로 실제 "나의 훈련정보" 페이지(`/dmobis/rfh/rgt/edutrasubjpsn/IvdTraScheDetail.do`)를 `inspect`로 확인하고 구조를 확정했다:**
  - 소속 정보: `<caption>소속</caption>`이 있는 표 (예비군부대/소속/계급/군번/성명/군별/연차/동원구분/비고).
  - 올해 표시 연도: `<h4>훈련내용(YYYY년)</h4>` 헤딩.
  - 올해 훈련 목록: `<table id="detailTb">` — 첫 행은 "총계" 합계 행(건너뜀), 나머지 행에 `data-tra-id` 등 속성과 구분/훈련일자/계획시간/실시시간/잔여시간/훈련결과/훈련장/비고 8개 열.
  - **과거 연도 훈련 목록은 같은 페이지의 `<table id="detail2">`에 이미 들어있다** (화면에는 "이전 훈련내용 열기"를 눌러야 보이지만, `domcontentloaded` 시점에 이미 DOM에 존재함 — 추가 클릭 없이 바로 읽을 수 있다). 같은 8개 열 구조를 공유한다.
  - 이 발견 덕분에 "작년과 비교"가 별도 로컬 저장 없이 **한 번의 `training-info` 호출**로 끝난다: 페이지 자체가 여러 해의 기록을 동시에 보여준다.
  - 같은 페이지의 `goAction(mode)` 자바스크립트 함수가 `훈련일정 자율선택`/`전국단위 훈련신청`/`휴일예비군 훈련신청` 세 버튼을 각각 다른 신청서 URL로 연결한다는 것도 이때 확인했다 — 이게 `open-menu`가 클릭하는 정확한 버튼 레이블의 출처다. (이 페이지엔 `goAction`이 `TRASCHD`라는 네 번째 분기도 갖고 있었지만, 그 분기와 연결된 보이는 버튼을 이번 검증에서 찾지 못해 `APPLICATION_MENUS`에 포함하지 않았다 — 확인 안 된 걸 추측해서 넣지 않는다.)
- training-info 페이지의 전체 사이트 LNB(`<a href>` 목록)를 같은 `inspect`로 훑어서 `훈련 연기신청`(`/dmobis/rft/rgt/ivdTraDelayApplInForm.do`), `보류 신청`(`/dmobis/rfh/rrm/holdpsn/HoldPsnReqForm.do`), `해소 신청`(`/dmobis/rfh/rrm/holdpsn/HoldPsnCancelReqForm.do`)의 실제 경로도 확인했다 (2026-06-24). 이 셋은 `goAction` 버튼이 아니라 평범한 링크라서 클릭 시뮬레이션 없이 바로 `page.goto`로 이동한다 — `open-menu`가 `mode: "goto"`로 구분해서 처리한다.
  - `훈련 연기신청` 화면은 실제로 열어보니 이름/주민등록번호 앞자리/주소/휴대폰·집·직장 전화번호가 hidden input으로 그대로 박혀 있었다 — training-info보다 훨씬 민감한 페이지다. 이 값들은 어디에도 기록하지 않았고, 오직 페이지 URL(사이트 구조)만 `APPLICATION_MENUS`에 남겼다.
- 2026-06-24, "모든 조회를 추가하고 민감한 건 안내까지만"이라는 요청에 따라 training-info 페이지의 전체 사이트 LNB(`<a href>` 목록, `사이트맵`과 동일 출처)를 훑어서 10개 후보 페이지를 찾고, 각각 `<thead>` 헤더와 hidden field를 스캔해서 둘로 분류했다:
  - **`VIEW_MENUS`(실제로 읽음)**: 훈련신청 결과(`NationalUnitResevForcesTraRltList.do`), 연기신청 결과(`ivdTraDelayApplRltList.do`), 보류·해소 신청결과(`HoldPsnReqRsltList.do`), 휴일예비군 훈련일정 조회(`HolidayTrainingScheduleList.do`), 소속부대 공지사항(`MyPubAnnounList.do`), 훈련안내(`TraNoticeList.do`), 나의 질의응답(`MyQuestAnsList.do`), 예비군부대 찾기(`listAdminAddr.do`). 헤더에 군번/이름 같은 식별 컬럼이 없는 것만 골랐다.
  - **`APPLICATION_MENUS`로 추가(절대 안 읽음)**: 개인정보수정(`ReserveForceForm.do` — 편집 폼이고 hidden field에 `cellPhone` 등 직접 노출 확인), 예비군 상훈(`ReserveForcePrzdcr.do` — 페이지 상단에 training-info의 "소속" 표와 똑같이 군번/성명이 그대로 들어있는 걸 확인, 그 아래 실제 상훈 목록은 따로 검증하지 않았다).
  - **포함하지 않음**: 카드뉴스/국방영상/공지사항(전체)/자주 묻는 질문/사이버 설문조사/혁신 아이디어 공모전/예비군 제도안내/관련 법령/개인정보처리방침처럼 로그인·개인 계정과 무관한 일반 공개 게시판·안내 페이지는 이 스킬의 목적(내 예비군 신상 조회)과 거리가 멀어 추가하지 않았다. 필요하면 같은 패턴으로 더 추가할 수 있다.
  - `나의 질의응답`(`myQna`)은 실제로 열어보니 "내가 쓴 글"이 아니라 **다른 사용자들의 질문도 함께 보이는 공개 게시판**이었다 (작성자 이름은 사이트 자체가 이미 "민\*연"처럼 마스킹해서 보여준다). 마스킹된 이름만 노출되므로 `VIEW_MENUS`에 남겼지만, 다른 사용자의 (마스킹된) 글 내용을 답변에 과도하게 인용하지 않는다.
  - 여러 `VIEW_MENUS` 페이지(예: 훈련신청 결과)는 초기 HTML에 `Loading...` placeholder 행만 있고 실제 데이터는 AJAX로 나중에 채워진다는 것도 이때 확인했다 — `fetchInquiry`가 이 placeholder를 실제 데이터로 착각해 반환하지 않도록, 사라질 때까지 짧게 폴링한 뒤(최대 약 4.5초) 그래도 안 사라지면 명확한 에러로 멈춘다.
- 병무청 디지털서비스개방의 "청년 동원훈련 일정조회"(`openservice.go.kr/youthMilTrainSch`)는 이번 검증에서 비교 대상으로 시도하지 않았다. 이미 `yebigun1.mil.kr` 쪽 구조가 안정적으로 파싱돼서 추가 검증이 급하지 않다고 판단했다 — 필요해지면 같은 방식(`inspect`)으로 비교해본다.
- 사이트가 마크업을 바꾸면 `trainings`가 빈 배열로 나올 수 있다. 이 경우 "훈련이 없다"로 해석하지 말고 구조가 바뀌었다고 보고 재검증한다 (`Failure modes` 참고). `view`도 마찬가지: `headers`가 비어 있으면 "내용이 없다"가 아니라 그 페이지에 `<thead>`가 없다는 뜻이므로 구조 변경을 의심한다.

## Prerequisites

- macOS 또는 Chrome 실행 가능한 환경
- `packages/yebigun-training`에서 `npm install` (`playwright-core` 포함)
- Chrome 원격 디버깅 포트 사용 가능
- 사용자가 직접 예비군 홈페이지 로그인 가능 (PASS/공동인증서/간편인증 중 본인이 쓰는 방식)

## Workflow

### 1. 전용 Chrome 프로필로 로그인 브라우저를 띄운다

```bash
node packages/yebigun-training/src/cli.js chrome-command --profile-dir "$HOME/.cache/k-skill/yebigun-chrome" --debugging-port 9222
```

위 명령이 출력한 Chrome 실행문으로 브라우저를 띄운 뒤, 사용자가 직접 `https://www.yebigun1.mil.kr/`에서 로그인한다.

### 2. 이번 훈련정보 + 작년 비교를 한 번에 조회한다

```bash
node packages/yebigun-training/src/cli.js training-info --cdp-url http://127.0.0.1:9222
```

결과 JSON의 구조:

- `member`: 예비군부대/소속/계급/군번/성명/군별/연차/동원구분.
- `currentDisplayYear`: 사이트가 "올해"로 표시하는 연도.
- `trainings`: 올해 + 과거 연도 훈련 기록 배열(최신순), 각 항목에 `trainingType`/`startDate`/`endDate`/`plannedHours`/`actualHours`/`remainingHours`/`result`/`location`.
- `comparison`: `currentDisplayYear` vs `currentDisplayYear - 1`을 자동 비교한 `{ hasCurrentRecord, hasPreviousRecord, current, previous, changes }`.

세션이 만료됐으면 "session is not authenticated or has expired" 에러가 즉시 뜬다 — 이때는 사용자에게 재로그인을 안내하고 중단한다.

사용자에게 결과를 전달할 때: 올해 훈련의 기간/장소/구분과 `comparison.changes`(필드별 변경점)를 한국어로 자연스럽게 요약한다. `comparison.hasPreviousRecord`가 `false`면 "비교할 작년 기록이 없다"고 그대로 말한다 — 추측하지 않는다.

### 3. 그 외 조회 화면을 보고 싶다고 하면: `view`로 실제 데이터를 읽어온다

```bash
node packages/yebigun-training/src/cli.js view --menu applicationResults --cdp-url http://127.0.0.1:9222
```

`--menu`로 지정 가능한 값 (모두 `VIEW_MENUS`, 식별 정보 없는 조회 전용):

| menu 값 | 화면 |
|---|---|
| `applicationResults` | 훈련신청 결과 |
| `delayResults` | 연기신청 결과 |
| `holdResults` | 보류·해소 신청결과 |
| `holidaySchedule` | 휴일예비군 훈련일정 조회 |
| `unitNotices` | 소속부대 공지사항 |
| `trainingNotices` | 훈련안내 |
| `myQna` | 나의 질의응답 (다른 사용자의 마스킹된 글도 함께 보이는 공개 게시판이다 — 응답에서 남의 글을 과도하게 인용하지 않는다) |
| `unitFinder` | 예비군부대 찾기 |

결과는 항상 `{ menu, label, headers, rows }` 형태의 일반 표다 (페이지마다 다른 필드명을 따로 만들지 않았다). `headers`는 채워져 있는데 `rows`가 빈 배열이면 "등록된 게 없다"는 뜻이고, `headers`까지 비어 있으면 페이지 구조가 바뀐 것으로 보고 `inspect`로 재확인한다. `예비군부대 찾기`/`휴일예비군 훈련일정 조회`처럼 검색 조건 없이 처음 들어가면 비어 있는 게 정상인 페이지도 있다.

### 4. 사용자가 연기/보류/일정선택/개인정보수정 등을 하고 싶다고 하면: 화면까지만 열어준다

```bash
node packages/yebigun-training/src/cli.js open-menu --menu delay --cdp-url http://127.0.0.1:9222
```

`--menu`로 지정 가능한 값과 동작 방식 (모두 `APPLICATION_MENUS`, 데이터는 절대 읽지 않는다):

| menu 값 | 화면 | 방식 |
|---|---|---|
| `selfSelect` | 훈련일정 자율선택 | training-info 페이지의 실제 버튼을 클릭 |
| `nationalUnit` | 전국단위 훈련신청 | training-info 페이지의 실제 버튼을 클릭 |
| `holiday` | 휴일예비군 훈련신청 | training-info 페이지의 실제 버튼을 클릭 |
| `delay` | 훈련 연기신청 | `/dmobis/rft/rgt/ivdTraDelayApplInForm.do`로 직접 이동 |
| `hold` | 보류 신청 | `/dmobis/rfh/rrm/holdpsn/HoldPsnReqForm.do`로 직접 이동 |
| `holdCancel` | 해소 신청 | `/dmobis/rfh/rrm/holdpsn/HoldPsnCancelReqForm.do`로 직접 이동 |
| `editProfile` | 개인정보수정 | `/dmobis/rfh/rrm/reserveforce/ReserveForceForm.do`로 직접 이동 |
| `honors` | 예비군 상훈 | `/dmobis/rfh/rrm/reserveforce/ReserveForcePrzdcr.do`로 직접 이동 |

어느 방식이든 **다음 화면이 뜨면 그 자리에서 멈춘다** — 날짜 선택, 사유 입력, 제출은 절대 하지 않는다. `훈련 연기신청`/`개인정보수정` 화면은 실제로 들어가보면 이름/주민등록번호 앞자리/주소/휴대폰·집·직장 전화번호가 그대로 보일 만큼 training-info보다 훨씬 민감하다 — 이 정보를 답변이나 파일에 옮기지 않는다.

호출 후 사용자에게는 정확히 이렇게 안내한다: "지금 보고 계신 Chrome 창에 `<label>` 화면이 열렸습니다. 여기서부터 입력과 제출은 직접 해주세요." 표에 없는 메뉴는 `open-menu`/`view` 둘 다 지원하지 않으므로(`Unknown menu` 에러), 사이트맵(`/dmobis/rfh/rgt/sitemap/sitemap.jsp`)이나 `inspect`로 먼저 실제 경로/구조를 확인한 뒤 어느 쪽(조회 vs 안내만)에 넣을지 식별 정보 노출 여부로 판단해서 사용자와 상의한다.

### 5. (다른 페이지 구조를 더 봐야 할 때) 범용 조회

```bash
node packages/yebigun-training/src/cli.js inspect --cdp-url http://127.0.0.1:9222 --path <경로> --full
```

`pageInfo.pageType`이 `login`이면 재로그인을 안내한다.

### 6. (선택) 로컬에도 따로 기록해두고 비교하기

사이트의 `이전 훈련내용` 표가 보여주는 연도 범위를 벗어나는 기록을 직접 남겨두고 싶을 때만 쓴다. `training-info`의 `trainings` 배열에서 원하는 연도의 항목을 골라 그대로 저장하면 된다.

```bash
node packages/yebigun-training/src/cli.js record --year 2026 --json '{"trainingType":"동원훈련Ⅱ형 1차","startDate":"2026-08-10","endDate":"2026-08-12","location":"OO과학화예비군훈련장"}'
node packages/yebigun-training/src/cli.js diff --year 2026
```

기본 비교 대상은 `year - 1`이다 (`--compare-year`로 다른 연도 지정 가능). 결과의 `hasPreviousRecord`가 `false`면 "작년 기록이 없어 비교할 수 없다"고 명확히 말한다.

## Response policy

- "로그인 필수", "세션 만료 시 재로그인 필요"를 항상 명확히 적는다.
- 훈련 연기/보류/자율선택 같은 제출형 신청은 절대 자동화하지 않고, 사용자가 브라우저에서 직접 하도록 안내한다. `open-menu`로 화면까지 열어준 경우에도 "여기서부터는 직접 진행하세요"를 빼지 않는다.
- 군번/전화번호 등 식별 정보를 답변에 그대로 길게 인용하지 말고, 훈련 기간/장소/달라진 점 위주로 요약한다.
- `view`(`myQna` 등) 결과에 다른 사용자의 마스킹된 이름/글이 섞여 있으면, 사용자가 직접 물어본 본인 관련 내용에 집중하고 남의 글을 장문으로 인용하지 않는다.
- 비교 결과를 보여줄 때 추측을 섞지 않는다 — 기록되지 않은 연도는 "기록 없음"으로만 말한다.
- `view`가 빈 `rows`를 반환하면 "등록된 게 없다"고 그대로 말한다 (검색 조건이 필요한 페이지일 수도 있음을 함께 안내). `headers`까지 비어 있으면 페이지 구조가 바뀐 것으로 보고 `inspect`로 재확인을 제안한다.
- 페이지 구조가 바뀐 것으로 보이면(`trainings`가 비정상적으로 비어 있는 등) 그 가능성을 사용자에게 알리고 `inspect`로 재확인을 제안한다.

## Verification

- 자동 검증: `npm run lint && npm test` — `detectSessionState`/`inspectYebigunPage` 분류, **완전히 가상의 데이터로 작성한 fixture**(`test/fixtures/training-info-page.html`, `test/fixtures/view-list-page.html`) 기반 `parseTrainingInfo`/`parseGenericTable` 단위 테스트, mocked-CDP `inspect`/`fetchTrainingInfo`/`fetchInquiry`(AJAX `Loading...` 폴링 포함)/`openApplicationMenu`, 그리고 `record`/`history`/`diff`의 로컬 JSON 로직 단위 테스트.
- smoke 검증(로그인 불필요): `chrome-command`로 출력된 명령이 실제 Chrome을 올바른 프로필/포트로 띄우는지 확인.
- 실서비스 검증: 2026-06-24, 사용자가 직접 로그인한 세션에서 `training-info`(소속 정보 · 올해 훈련(2026.06.22~2026.06.25, 동원훈련Ⅱ형 1차) · 과거 3개 연도 기록 · 작년 대비 비교), `open-menu`(`selfSelect`/`delay`/`honors`/`editProfile` 모두 정확한 화면으로 이동, 데이터 미추출 확인), `view`(8개 메뉴 전부 실행 — `delayResults`/`myQna`는 실제 데이터, 나머지는 빈 목록 또는 "검색된 데이터가 없습니다" 확인)까지 전부 실행해 정확히 동작하는 것을 확인했다.

## Failure modes

- 세션 만료/미로그인: `inspect`/`training-info`/`view`/`open-menu`가 `pageType: "login"` 또는 "session is not authenticated or has expired" 에러를 반환한다 — 즉시 중단하고 재로그인 안내.
- `trainings`가 비정상적으로 비어 있거나 `member`가 `null`: 사이트가 마크업을 바꿨을 가능성이 높다. "훈련이 없다"고 단정하지 말고 `inspect --full`로 실제 HTML을 다시 확인하라고 안내한다.
- `diff`(로컬 기록)에서 비교 연도 기록이 없음: 추측하지 말고 "작년 기록이 없다"고 그대로 전달한다.
- CDP 연결 실패: 사용자가 `chrome-command`로 띄운 디버깅 포트 Chrome이 켜져 있는지, `--cdp-url`이 맞는지 확인하라고 안내한다.
- `open-menu`/`view`에 알 수 없는 `--menu` 값: 브라우저를 건드리기 전에 `Unknown menu` 에러로 막는다 (각자 `APPLICATION_MENUS`/`VIEW_MENUS`의 키만 허용).
- `open-menu`가 버튼을 못 찾음: "Could not find the ... button" 에러를 반환한다 — 사이트가 버튼 레이블/구조를 바꿨을 가능성이 높으므로 `inspect`로 재확인하라고 안내한다.
- `view`가 AJAX 로딩을 끝내 못 기다림: "did not finish loading in time" 에러를 반환한다 — 한 번 더 `view`를 시도하거나, 계속 반복되면 `inspect`로 실제 응답을 확인하라고 안내한다.

## Done when

- 로그인된 세션으로 `training-info`가 소속 정보, 올해 훈련 기간/장소/종류, 과거 연도 기록, 작년 대비 비교를 한 번에 정확히 반환한다.
- 세션 만료 시 명확한 재로그인 에러로 즉시 중단된다.
- `open-menu`가 화면까지만 이동시키고(클릭이든 직접 이동이든), 그 화면의 입력/제출은 절대 건드리지 않는다 — 신청형 화면뿐 아니라 식별 정보가 노출되는 조회형 화면(개인정보수정/예비군 상훈)도 같은 원칙으로 막는다.
- `view`가 `VIEW_MENUS`에 등록된, 식별 정보 없는 화면만 실제로 읽어서 일반화된 headers/rows로 돌려준다. AJAX로 늦게 채워지는 목록을 placeholder 상태로 잘못 반환하지 않는다.
- (로컬 기록을 쓴 경우) `record`로 저장한 연도별 기록이 `~/.cache/k-skill/yebigun-training/history.json`에만 남고 저장소에는 커밋되지 않는다.
- 어떤 단계에서도 로그인 입력이나 신청/제출 액션이 자동화되지 않았다.
- 저장소에 커밋된 fixture/테스트 데이터에 실제 개인정보가 한 글자도 섞여 있지 않다.
