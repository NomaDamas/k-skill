# government-support-survey — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- Use `k-skill-browser-runtime` (provider `auto`) for logged-in or rendered-page automation. On macOS it tries Aside Browser first, then BrowserOS CDP, then user-launched Chrome/Chromium CDP; on other platforms it tries BrowserOS CDP, then Aside Browser, then user-launched Chrome/Chromium CDP. Do not launch or close the user's browser, and never solve CAPTCHA, identity proofing, or e-signature flows.
- Prepare form data, documents, and the exact official form link that the documented portable workflow supports, then hand the final submission to the user. Do not automate submission here.

## Bundled asset access

- Execute bundled helpers only through `npx -y @nomadamas/k-skill@0 exec government-support-survey scripts/<file> -- <args>`; do not assume a repository-relative or installed-skill-relative path.
- Resolve an asset path with `npx -y @nomadamas/k-skill@0 path government-support-survey <relative-path>` only when another tool explicitly requires a filesystem path.
- Read bundled references through `npx -y @nomadamas/k-skill@0 read government-support-survey references/<file>`.

# 정부지원 전수조사

## What this skill does

`k-skill-proxy`의 `/v1/government-support/survey`를 호출해 다음 공개 공고를 하나의 스키마로 조사한다.

- K-Startup Open API
- 기업마당
- 정보통신산업진흥원(NIPA)
- 한국콘텐츠진흥원(KOCCA)
- 중소기업기술개발사업 종합관리시스템(SMTECH)

이 스킬은 현재 모집 공고의 제목·분야·주관기관·접수기간·공식 URL을 수집하고, 사용자의 프로젝트 조건과 대조해 `즉시 지원 가능`, `요건 충족 시 가능`, `사업 변형 시 가능`, `부적합`으로 보수적으로 분류한다.

## Required workflow

1. 회사·팀·프로젝트의 업력, 소재지, 업종, 기술, 대표자 연령, 기업 형태, 매출·투자 단계, 원하는 지원 유형을 확인한다.
2. 먼저 5개 소스를 모두 조회한다. 사용자가 범위를 좁힌 경우에만 `--sources`를 제한한다.
3. 응답의 `complete`와 소스별 `ok`를 확인한다. 하나라도 실패하면 “전수조사 완료”라고 표현하지 말고 누락 소스를 명시한다.
4. 제목만으로 자격을 확정하지 않는다. 후보의 공식 상세 URL과 첨부 공고문에서 신청대상·제외조건·지역·업력·중복수혜 제한을 확인한다.
5. 결과마다 공식 출처 URL, 접수 마감일, 판정 근거, 추가 확인사항을 표시한다.
6. 실제 신청은 공식 사이트에서 진행한다. 최종 제출 직전에는 사용자 승인을 받는다.

## Command

```bash
npx -y @nomadamas/k-skill@0 exec government-support-survey scripts/run_survey.py -- \
  --sources kstartup bizinfo nipa kocca smtech \
  --keyword "AI 바우처" \
  --max-pages 3
```

전체 공고를 넓게 조사할 때는 `--keyword`를 생략한다. 응답이 너무 클 때만 공고 유형별 키워드로 여러 번 나눠 조회한다.

## Output contract

- `complete`: 요청한 모든 소스가 정상 조사됐는지
- `sources`: 소스별 성공 여부, 조회 페이지, 수집 건수, 오류
- `items`: `source`, `id`, `title`, `field`, `org`, `apply_start`, `apply_end`, `reg_date`, `url`
- `attribution`: upstream 코드와 공식 데이터 출처, 재배포 범위

## Failure modes

- `complete=false`: 일부 소스 실패. 수집된 결과는 부분 결과이며 누락 소스를 수동 확인한다.
- `401/403` 또는 차단 신호: 우회하지 말고 공식 브라우저 화면으로 전환한다.
- `0 items parsed; site layout may have changed`: 파서 개편 가능성이므로 해당 소스를 성공 처리하지 않는다.
- K-Startup 키 미설정: 나머지 공개 포털 결과는 유지하되 K-Startup 누락을 명시한다.
- CAPTCHA·로그인·본인인증: 자동 우회하지 않는다.

## Legal and redistribution boundary

이 스킬의 조사 로직은 `djfksjd/ir-search`의 MIT 라이선스 구현을 참고해 재작성했으며 저작권·라이선스 고지는 `npx -y @nomadamas/k-skill@0 read government-support-survey references/NOTICE.md`에 보존한다. 정부 포털 공고 원문과 첨부는 포털별 이용조건이 다르므로 k-skill은 이를 미러링하거나 재배포하지 않고 구조화 메타데이터와 공식 링크만 제공한다.
