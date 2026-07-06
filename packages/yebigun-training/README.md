# yebigun-training

`yebigun-training` 은 공식 예비군 홈페이지(`https://www.yebigun1.mil.kr`)에서 **사용자가 직접 로그인한 Chrome / Playwright 세션**을 재사용해 훈련정보 조회와 연도별 비교를 돕는 helper 입니다.

## Important scope limits

- 이 패키지는 **logged-in browser session only** 입니다.
- PASS 본인인증/공동인증서/간편인증/ID-PW 를 자동 입력하지 않습니다.
- **조회 전용입니다.** 훈련 연기/보류·해소/훈련일정 자율선택 신청처럼 제출형 액션은 자동화하지 않습니다.
- `training-info` / `parseTrainingInfo` 는 2026-06-24 실제 로그인 세션으로 "나의 훈련정보"(`IvdTraScheDetail.do`) 페이지 구조를 확인한 뒤 구현됐습니다. 같은 페이지에 이미 표시되는 과거 연도 기록을 활용해 별도 저장 없이 작년 대비 비교까지 한 번에 돌려줍니다. 자세한 내용은 루트 `yebigun-training/SKILL.md`의 "Why this design" 참고.

## Install

```bash
npm install yebigun-training
```

이 패키지는 [`k-skill-browser-runtime`](../k-skill-browser-runtime) 런타임 어댑터로 브라우저에 붙는다. 기본 순서는 사용자가 띄운 BrowserOS CDP, Aside Browser REPL, Chrome/Chromium CDP다.

기본 provider 는 `auto` 로, BrowserOS CDP(`http://127.0.0.1:9100`) → Aside Browser(`aside repl`) → Chrome CDP(`http://127.0.0.1:9222`) 순서다. `KSKILL_BROWSER_PROVIDER=browseros`/`=aside`/`=chrome-cdp` 또는 `options.provider` 로 provider 를 고정할 수 있고, `--cdp-url`(`options.cdpUrl`)을 넘기면 그 URL(예: `yebigun-training chrome-command` 로 띄운 Chrome)에 직접 붙는다. `KSKILL_BROWSEROS_CDP_URL`/`KSKILL_CHROME_CDP_URL` 로 URL 을 덮어쓸 수 있고, `KSKILL_ASIDE_COMMAND` 로 Aside CLI 명령을 바꿀 수 있다. 런타임은 BrowserOS/Aside 를 launch 하거나 BrowserOS 를 headless 로 띄우지 않으며, 정리 시 automation client 와 adapter 생성 tab 만 정리하고 사용자 브라우저/프로필은 닫지 않는다.

## Start Chrome with a dedicated profile

```bash
yebigun-training chrome-command --profile-dir "$HOME/.cache/k-skill/yebigun-chrome" --debugging-port 9222
```

이 명령이 출력한 Chrome 실행문으로 브라우저를 띄우고, 사용자가 직접 `https://www.yebigun1.mil.kr/`에 로그인합니다.

## Inspect a page (discovery, works today)

```bash
yebigun-training inspect --cdp-url http://127.0.0.1:9222 --path /mypage/training.do --full
```

로그인된 세션에서 임의 경로를 조회해 실제 마크업/세션 상태를 확인하는 범용 명령입니다. 아직 알려지지 않은 "나의 훈련정보" 페이지 구조를 확인하는 데 씁니다.

## Record and compare years (works today, no login needed)

```bash
yebigun-training record --year 2026 --json '{"trainingType":"향방작계","startDate":"2026-05-18","endDate":"2026-05-18","location":"00동대","transportProvided":false}'
yebigun-training history --year 2026
yebigun-training diff --year 2026 --compare-year 2025
```

기록은 저장소 밖 `~/.cache/k-skill/yebigun-training/history.json`에만 저장됩니다.

## Fetch this year's training info + year-over-year comparison

```bash
yebigun-training training-info --cdp-url http://127.0.0.1:9222
```

소속 정보, 올해 훈련(기간/장소/구분), 같은 페이지에 이미 표시되는 과거 연도 기록, 그리고 올해 vs 작년 비교(`comparison`)를 한 번에 반환합니다. 세션이 만료됐으면 명확한 재로그인 에러로 막힙니다.

## Open an application screen (navigation only — never submits)

```bash
yebigun-training open-menu --menu delay --cdp-url http://127.0.0.1:9222
```

`--menu` 값:

| 값 | 화면 | 방식 |
|---|---|---|
| `selfSelect` | 훈련일정 자율선택 | training-info 페이지의 실제 버튼 클릭 |
| `nationalUnit` | 전국단위 훈련신청 | training-info 페이지의 실제 버튼 클릭 |
| `holiday` | 휴일예비군 훈련신청 | training-info 페이지의 실제 버튼 클릭 |
| `delay` | 훈련 연기신청 | 해당 URL로 직접 이동 |
| `hold` | 보류 신청 | 해당 URL로 직접 이동 |
| `holdCancel` | 해소 신청 | 해당 URL로 직접 이동 |
| `editProfile` | 개인정보수정 | 해당 URL로 직접 이동 |
| `honors` | 예비군 상훈 | 해당 URL로 직접 이동 |

어느 쪽이든 다음 화면으로 이동만 시키고 거기서 멈춥니다 — 날짜 선택, 사유 입력, 제출은 절대 하지 않습니다. 사용자는 같은(이미 떠 있는) Chrome 창에서 직접 마무리합니다. 표에 없는 메뉴는 `Unknown menu` 에러로 막힙니다.

> `훈련 연기신청`/`개인정보수정` 화면은 이름/주민등록번호 앞자리/주소/전화번호가 그대로 들어있을 만큼 training-info보다 훨씬 민감합니다. `예비군 상훈` 페이지 상단에도 군번/성명이 그대로 보입니다. `open-menu`는 이 화면들로 이동만 하고 내용을 읽지 않습니다.

## Read a 조회/목록 page (works today, identifiers-free pages only)

```bash
yebigun-training view --menu applicationResults --cdp-url http://127.0.0.1:9222
```

| 값 | 화면 |
|---|---|
| `applicationResults` | 훈련신청 결과 |
| `delayResults` | 연기신청 결과 |
| `holdResults` | 보류·해소 신청결과 |
| `holidaySchedule` | 휴일예비군 훈련일정 조회 |
| `unitNotices` | 소속부대 공지사항 |
| `trainingNotices` | 훈련안내 |
| `myQna` | 나의 질의응답 (다른 사용자의 마스킹된 글도 보이는 공개 게시판) |
| `unitFinder` | 예비군부대 찾기 |

이 메뉴들은 markup에 군번/이름/전화번호 같은 식별 정보가 없는 것을 확인한 뒤에만 여기 등록했습니다. 결과는 항상 `{ menu, label, headers, rows }` — 페이지마다 다른 필드명을 만들지 않고 일반화된 표로 돌려줍니다. 일부 페이지(`훈련신청 결과` 등)는 초기 HTML에 `Loading...` placeholder만 있고 실제 데이터는 AJAX로 채워지는데, `view`는 그게 사라질 때까지 짧게 기다린 뒤(최대 약 4.5초) 그래도 안 끝나면 명확한 에러로 멈춥니다 — placeholder를 실제 데이터처럼 반환하지 않습니다.

## Library helpers

- `buildChromeLaunchCommand()`
- `connectToChrome()`
- `inspectPage()`
- `detectSessionState()`
- `inspectYebigunPage()`
- `parseTrainingInfo()`
- `diffTrainings()` / `trainingsForYear()`
- `fetchTrainingInfo()`
- `parseGenericTable()` / `parseInquiry()` / `fetchInquiry()` (VIEW_MENUS only — identifiers-free pages)
- `openApplicationMenu()` (navigation only — see scope limits above)
- `recordYear()` / `getYear()` / `listYears()` / `diffYears()`

## Verification without a login session

```bash
node --test
```

`history.js`의 record/diff 로직과 `parse.js`의 세션 상태 분류기/`parseTrainingInfo`/`parseGenericTable`은 fixture(`test/fixtures/training-info-page.html`, `test/fixtures/view-list-page.html` — 둘 다 완전히 가상의 데이터)와 mocked-CDP `fetchTrainingInfo`/`fetchInquiry`/`openApplicationMenu`로 로그인 없이 검증됩니다. 2026-06-24, 사용자가 직접 로그인한 실제 세션으로 `training-info`/`open-menu`(전체 메뉴)/`view`(전체 메뉴) 흐름이 정확히 동작함을 한 번 더 확인했습니다.
