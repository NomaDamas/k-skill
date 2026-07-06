# 예비군 훈련정보 조회 가이드

## 이 기능으로 할 수 있는 일

- 공식 예비군 홈페이지(`yebigun1.mil.kr`)에서 로그인된 Chrome 세션 재사용
- "나의 훈련정보" 조회: 소속 정보, 이번 훈련 기간/장소/훈련종류
- 같은 페이지에 이미 표시되는 과거 연도 훈련 기록까지 한 번에 조회
- 올해 vs 작년(기본값) 필드 단위 비교(`comparison.changes`)
- 식별 정보(군번/이름/주민등록번호/전화번호)가 없는 조회/목록 화면 8종을 실제로 읽어 표로 반환(`view`)
- 식별 정보가 노출되는 신청/편집 화면은 열기만 하고 데이터는 절대 읽지 않음(`open-menu`)
- (선택) 사이트가 보여주지 않는 더 오래된 기록을 로컬에 저장/비교(`record`/`diff`)

## 먼저 알아둘 점

- 이 기능은 **로그인된 브라우저 세션에서만 동작**한다. PASS 본인인증/공동인증서/간편인증/ID·PW 어떤 것도 자동 입력하지 않는다.
- **조회 전용이다.** 훈련 연기 신청, 보류·해소 신청, 훈련일정 자율선택/전국단위/휴일예비군 신청처럼 제출형(side-effect) 액션은 절대 자동화하지 않는다.
- `open-menu`는 신청 화면으로 **이동만** 시킨다 — 날짜 선택, 사유 입력, 제출 버튼 클릭은 하지 않는다.
- `view`는 `VIEW_MENUS`에 등록된, 마크업에 식별 정보가 없는 화면만 읽는다. 이름/군번/주민등록번호/전화번호가 노출되는 화면은 전부 `open-menu`(`APPLICATION_MENUS`)로 분류돼 있다.
- 개인정보가 담긴 로컬 기록은 이 저장소 밖 `~/.cache/k-skill/yebigun-training/history.json`에만 저장한다. `test/fixtures/`의 페이지 구조 fixture는 처음부터 끝까지 완전히 가상의 값으로 작성됐다.

## 설치

```bash
npm install yebigun-training
```

배포 패키지에는 CDP 연결용 `playwright-core`가 함께 들어 있다. 별도 Playwright 브라우저를 내려받지 않고, 사용자가 직접 연 Chrome/Chromium 세션에 붙는다.

이 레포를 clone한 유지보수자라면 루트에서 `npm install`로 workspace 패키지까지 함께 설치해도 된다.

## 로그인 브라우저 준비

전용 Chrome 프로필 + CDP 포트로 브라우저를 띄운다.

```bash
node packages/yebigun-training/src/cli.js chrome-command --profile-dir "$HOME/.cache/k-skill/yebigun-chrome" --debugging-port 9222
```

출력된 실행문으로 Chrome을 띄운 뒤, 사용자가 직접 `https://www.yebigun1.mil.kr/`에 로그인한다.

## 이번 훈련정보 + 작년 비교 조회

```bash
node packages/yebigun-training/src/cli.js training-info --cdp-url http://127.0.0.1:9222
```

결과 JSON: `member`(소속 정보), `currentDisplayYear`, `trainings`(올해+과거 연도 훈련 기록 배열), `comparison`(`currentDisplayYear` vs `currentDisplayYear - 1` 필드별 비교).

세션이 만료됐으면 "session is not authenticated or has expired" 에러가 즉시 뜬다 — 재로그인을 안내하고 중단한다.

## 조회 전용 화면 읽기 (`view`)

```bash
node packages/yebigun-training/src/cli.js view --menu applicationResults --cdp-url http://127.0.0.1:9222
```

`--menu` 값: `applicationResults`(훈련신청 결과), `delayResults`(연기신청 결과), `holdResults`(보류·해소 신청결과), `holidaySchedule`(휴일예비군 훈련일정 조회), `unitNotices`(소속부대 공지사항), `trainingNotices`(훈련안내), `myQna`(나의 질의응답 — 다른 사용자의 마스킹된 글도 함께 보이는 공개 게시판), `unitFinder`(예비군부대 찾기).

결과는 항상 `{ menu, label, headers, rows }` 형태다.

## 신청/편집 화면 열기 (`open-menu`)

```bash
node packages/yebigun-training/src/cli.js open-menu --menu delay --cdp-url http://127.0.0.1:9222
```

`--menu` 값: `selfSelect`/`nationalUnit`/`holiday`(training-info 페이지 버튼 클릭), `delay`/`hold`/`holdCancel`/`editProfile`/`honors`(직접 URL 이동). 어느 방식이든 다음 화면이 뜨면 그 자리에서 멈추고, 사용자에게 "여기서부터는 직접 진행하라"고 안내한다.

## (선택) 로컬 기록/비교

```bash
node packages/yebigun-training/src/cli.js record --year 2026 --json '{"trainingType":"...","startDate":"...","endDate":"...","location":"..."}'
node packages/yebigun-training/src/cli.js diff --year 2026
```

사이트가 보여주는 과거 연도 범위를 벗어나는 기록을 남겨두고 싶을 때만 사용한다.

## 세션 만료 처리

다음 신호 중 하나가 보이면 즉시 실패시키고 재로그인을 요구한다.

- `pageType: "login"` 분류
- "session is not authenticated or has expired" 에러

## 검증 전략

### 자동 검증

- `detectSessionState`/`inspectYebigunPage` 세션·페이지 분류 테스트
- 완전히 가상의 데이터로 작성한 fixture 기반 `parseTrainingInfo`/`parseGenericTable` 단위 테스트
- mocked-CDP `inspect`/`fetchTrainingInfo`/`fetchInquiry`(AJAX `Loading...` 폴링 포함)/`openApplicationMenu` 테스트
- `record`/`history`/`diff` 로컬 JSON 로직 단위 테스트

```bash
npm test --workspace yebigun-training
```

### 로그인 세션이 필요한 최종 확인

- 실제 계정으로 로그인된 전용 Chrome 프로필 준비
- `training-info`, `view`(8개 메뉴), `open-menu`(전체 메뉴) 순서로 실행해 정확한 화면으로 이동/조회되는지 확인
- 세션 만료 후 다시 실행해 재로그인 요구 메시지 확인

## 보안 원칙

- 예비군 홈페이지 ID/PW/인증 정보를 새 env var나 repo 문서에 추가하지 않는다.
- 로그인은 반드시 사용자가 브라우저 안에서 직접 수행한다.
- 이 기능은 조회/비교 보조까지만 다루며, 신청·제출 자동화는 절대 하지 않는다.
