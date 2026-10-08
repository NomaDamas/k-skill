# @nomadamas/k-skill

## 0.10.0

### Minor Changes

- f1a3b73: Add privacy-bounded PostHog CLI invocation analytics for unique-user, daily
  volume, DAU/WAU/MAU, and recurrent-use measurement, with a stable anonymous
  identifier, opt-out support, failure isolation, and usage-statistics-only
  documentation.
- 355edbe: `korean-bond-search` 스킬을 추가합니다. SEIBro 채권을 표준 Bond Instrument 필드로 정규화하고, 출처와 확인시각을 유지해 종목명·발행사·ISIN 검색과 조건 비교를 지원합니다.
- 5b159e7: `market-event-impact` 스킬을 추가합니다. 정례·비정형 사건의 핵심 변화와 시장 해석을 공식자료·당시 보도·검증 가격으로 조사하고, 교차자산 전달경로·보조 이벤트 스터디·유사사례·다음 촉매를 한국어로 설명합니다.

### Patch Changes

- d925f16: Bundle `company-analysis` for source-checked Korean and overseas company analysis in six chat sections. Include no-key public filing and quote workflows, three-statement and company-identity checks, deterministic evidence output, and offline edge-case tests.
- 5633c90: `express-bus-booking` KOBUS 시간표 파서가 HTML 주석의 `fnSatsChc(deprTime,...)` 템플릿을 가짜 운행편으로 파싱해 실제 편수를 2배로 반환하던 문제를 수정합니다. 주석과 인라인 템플릿을 먼저 제거하고, 따옴표 인자가 있는 실제 호출만 매칭하며, 필수 인자 수(14)를 못 채운 항목은 결과에서 제외합니다. 또한 `--select-index`가 범위를 벗어나면 `IndexError` 대신 명시적 오류로 종료합니다.
- c74a473: `foresttrip-vacancy`가 로그인 실패를 처리하지 않아 예약 페이지에서 `#srchSido.options`를 평가하다 Playwright `TypeError`로 죽던 문제를 수정합니다. 로그인 후 로그인 폼 잔존 여부로 실패를 판별해 `KSKILL_FORESTTRIP_ID`/`KSKILL_FORESTTRIP_PASSWORD` 확인, CAPTCHA 수동 처리, `--refresh-session` 재시도를 안내하는 `SystemExit`으로 종료하고, 조회 전에 `#srchSido`·`#srchInstt` 존재를 검증합니다.
- 7b5eae9: Bundle `government-bond-analysis` for verified Korean and U.S. Treasury yield comparisons, consistent chat and report output, official event schedules, and replayable evidence.
- 82a0f36: `korean-bond-search`가 실제 SEIBro 상세 화면의 `선후순위 구분` 헤더를 인식하지 못해 선후순위를 `미확인`으로 표시하던 문제를 수정하고, 상세 chat 출력의 채권 유형을 검색 표와 같이 한국어(`금융채` 등)로 표시합니다.

  또한 `options` 명령이 `convertible`/`exchangeable`/`warrant_attached`를 누락해 CB/EB/BW를 `미확인`으로 표시하던 문제를 수정합니다.

- 3bc0cd5: Make G2B sanction lookups auditable and conservative: preserve the successful upstream response and lookup timestamp, distinguish active sanctions, confirmed zero results, and lookup failures, and document that search/state results do not establish notice-specific participation eligibility.

## 0.9.2

### Patch Changes

- 27735af: Bundle `multi-asset-morning-briefing`: write a seven-section cross-asset morning briefing from verified public data. The stdlib helper independently resolves the latest completed U.S. and Korean sessions from Cboe and ECOS, adds U.S. Treasury yields and ECB FX reference rates, isolates source failures, limits response sizes, and ships offline parser, safety, session, and golden-contract tests.

## 0.9.1

### Patch Changes

- b1d9915: Add `update` so agents can refresh an outdated CLI and all coding-agent skill installs, including Vercel Agent Skills.

## 0.9.0

### Minor Changes

- 9798c2f: Add `version` / `--version` so the CLI reports its installed package version.

## 0.8.0

### Minor Changes

- c87b665: Add the religious-facility-search skill for Kakao Local church, cathedral, and temple lookup via k-skill-proxy.

### Patch Changes

- d7f45d4: korean-privacy-terms: install.sh가 pin된 업스트림의 0바이트 `.tmpl` 템플릿을 설치 시 경고로 표면화하고, 한글 이용약관 템플릿 누락(#660)을 Failure modes·기능 문서에 명시

## 0.7.0

### Minor Changes

- 98b7ee8: 철도 통합 시간표 조회 스킬로 KTX 조회 경로를 통합합니다.
- 28bac25: Add the komsa-ferry-info skill and hosted KOMSA MTIS ferry lookup route.

## 0.6.0

### Minor Changes

- 986e795: Add the official RTMS nationwide daily report helper to the real-estate-search CLI bundle.

## 0.5.0

### Minor Changes

- 505cfd0: Add the animal-pharmacy-search skill for regional animal pharmacy directories, veterinary product search, and recent distributor-purchase-based pharmacy lookup.

## 0.4.3

### Patch Changes

- 4bdd770: daiso-product-search와 market-kurly-search의 Prerequisites에 npm 패키지 설치법을 명시하고, daiso의 표면 직접 호출이 조용히 실패하는 조건을 Failure modes에 추가한다.
- f901df6: Add structured coverage metadata to the NTS delinquency, G2B sanction, and FSC corporate-info skill results.

## 0.4.2

### Patch Changes

- 10756d3: biz-health-check, court-payment-order-assistant, national-pension-workplace에 법적 안전 운영 기준을 명시한다.

## 0.4.1

### Patch Changes

- 23641ea: Remove the `yebigun-training` skill and its bundled CLI metadata.
- 632742f: corporate-registration-consulting, iros-registry-automation, korean-jangbu-for에 법적 안전 운영 기준을 명시한다.
- 1555b6c: mfds-drug-safety와 nhis-care-checkup-search에 공식 공개자료 조회 범위와 전문가 판단을 대체하지 않는다는 짧은 안내 문구를 추가한다.
- af6de30: Remove the `local-election-candidate-search` skill from bundled CLI assets.

## 0.4.0

### Minor Changes

- 4b82040: `toss-securities` 스킬과 npm 패키지 이름을 `toss-investment`로 바꾼다. 조회 범위와 공식 Open API 경로는 그대로다.

### Patch Changes

- fc01be1: Fix proxy rate-limit buckets behind Cloudflare Tunnel, retry idempotent GET upstream failures, and accept mcp SDK 2.x in myrealtrip-search.
- 1710b51: Remove the `lovebug-report` skill from bundled CLI assets.

## 0.3.0

### Minor Changes

- a46fa66: Convert KTX to credential-free official public timetable lookup and SRT to credential-free live timetable and seat-availability lookup. Remove login, internal KTX mobile APIs, anti-bot bypasses, reservation, payment, cancellation, exact seat selection, and automated monitoring behavior.

### Patch Changes

- 30d8ed4: seoul-weather-risk helper를 hosted k-skill proxy 전용으로 고정하고, 등록 전 local-direct·Marketplace API key fallback을 제거한다.
- 47e0922: seoul-weather-risk 일반 조회에 metadata 왕복을 생략하는 `query --fast` 경로를 추가해 hosted data 요청을 한 번으로 줄인다.
- afc16a9: fix(k-skill-cli): honor Python runner overrides and use a Windows-compatible default

## 0.2.5

### Patch Changes

- ed21f93: Rewrite the setup workflow around skill installation, Claude Code plugin support, the unified CLI runtime, credential resolution, verification, and strictly approved update checks.
- e145763: Remove the deprecated `used-car-price-search` skill from bundled CLI assets.
- 79e57d5: store-longevity-radar가 공공데이터포털 직접 다운로드 실패 시 SHA-256 검증된 R2 미러를 fallback으로 사용하도록 한다.

## 0.2.4

### Patch Changes

- cd546c5: Use the official Kakao Local API for nearby bar candidates and return Kakao Map detail-page handoffs for menu, opening-hour, and seating enrichment.
- 1644058: Remove the unofficial `tossctl` fallback and expose only the official Toss Securities Open API client. Calls now require official OAuth credentials and do not fall back to CLI sessions, scraping, or undocumented HTTP routes.
- efaeee8: Remove the discontinued Catchtable and Hi-Pass skills from the bundled CLI.
- ddcae69: seoul-weather-risk 스킬과 ASK 서울 기상 위험 조회 helper를 CLI 번들에 추가한다. 장소별 폭염·한파·호우·대설·강풍 후보 예보 시간대와 판정 근거를 인증된 읽기 전용 HTTPS API로 조회한다.

## 0.2.3

### Patch Changes

- 0aa0a2d: Remove a discontinued clinic-search skill from the bundled CLI assets.
- 7daf89a: store-longevity-radar 스킬과 상가업소 시계열 장수 점포 추출 helper를 CLI 번들에 추가한다.

## 0.2.2

### Patch Changes

- 38a3121: hankookilbo-news 스킬을 CLI 번들에 추가한다. 한국일보 공식 원격 MCP 서버를 인증 없이 직접 호출해 기사 메타데이터를 조회한다.
- 9a206b2: naver-blog-research: 검색 결과 제목·스니펫에서 숨김 접근성 라벨 "새 창 열림" 제거

## 0.2.1

### Patch Changes

- Bundle and migrate the remaining fine-dust, KTX, and setup root helpers found
  by the registry E2E suite.

## 0.2.0

### Minor Changes

- c556b5e: k-skill 통합 CLI를 추가하고 122개 스킬 전체를 runtime-aware adapter로 전환한다.
  generic/Dolshoi instruction 조립(`instruct`), 82개 helper script 실행(`exec`),
  8개 reference 조회(`read`), 안전한 asset 경로 확인(`path`), 전체 목록(`list`)을
  제공하며 모든 bundled asset을 npm 패키지에 포함한다.
