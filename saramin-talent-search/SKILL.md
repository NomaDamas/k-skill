---
name: saramin-talent-search
description: 사람인 기업회원 인재풀 로그인 세션에서 마스킹된 후보 정보를 검색·비교해 유료 열람 전 shortlist를 만듭니다. 돌쇠에서는 공식 표면을 통한 후속 액션까지 진행한다.
license: MIT
metadata:
  category: recruiting
  locale: ko-KR
  phase: v1
---

# saramin-talent-search

## Runtime contract (required)

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- In Dolshoi credential mode, never ask for, print, read, or store plaintext secrets in chat or files. Use a provisioned `vault-run` capability; if the needed credential is missing, call `request_vault_credential` and retry the intended action in the same turn when provisioned.
- In CloakBrowser mode, use the built-in browser tool backed by CloakBrowser first. Use `k-skill-browser-runtime`, Aside, BrowserOS, Chrome CDP, or manual handoff only as non-Dolshoi or unavailable-provider fallbacks.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Outside Dolshoi, preserve the skill's existing portable workflow: use declared environment variables or `~/.config/k-skill/secrets.env`, use the documented generic browser/runtime path, and request sensitive values through the safest mechanism the host provides instead of exposing them unnecessarily.

## Dolshoi action path

- Use the documented lookup path to identify the exact recipient/account and prepare the requested message, application, inquiry, or contact payload.
- In Dolshoi, open the official account surface in CloakBrowser or use an available `vault-run` action, use vault-backed login, and populate the draft instead of stopping at contact information.
- Immediately before sending, applying, revealing paid contact details, or mutating account state, call `clarify` with the recipient and complete payload/effect. After approval, execute and verify the resulting sent/submitted state.
- Any later no-send, no-chat, no-application, or handoff wording applies to generic fallback unless it records a hard boundary.



사람인 인재풀에서 유료 열람/연락처 확인/제안 발송 전에 현재 보이는 마스킹 후보 정보를 비교해 “열람할 만한 후보”를 추천한다. 개발자 전용이 아니며 모든 직무에 role-adaptive하게 적용한다.

## Use when

- 사용자가 사람인 인재풀에서 후보를 찾아달라고 요청한다.
- 기업회원 로그인/2차 인증이 완료된 브라우저 세션에서 후보를 검색해야 한다.
- 유료 열람 전 shortlist, 점수, 근거, 리스크, 후보 URL이 필요하다.

## Hard boundaries

Allowed:
- 사람인 인재풀 브라우저 세션 열기 및 검색 필터 입력
- 현재 보이는 마스킹 후보 목록/프로필/이력서 읽기
- 후보 분석, 점수화, shortlist 작성, 유료 열람 추천

Never do without explicit user handoff/confirmation:
- 유료 이력서 열람, 연락처 확인, 마스킹 해제
- 포지션/입사 제안 발송
- 스크랩, 관심후보 등록, 메모, 후보 상태 변경
- 결제/유료 상품 사용
- 비밀번호, OTP, 인증번호, 세션 쿠키 요청/저장
- 후보 개인정보 장기 저장 또는 대량 수집

If a control may spend credits, reveal contact/private info, send a proposal, or mutate account state, stop before clicking it.

## Primary access

Open:

```text
https://www.saramin.co.kr/zf_user/memcom/talent-pool/main/search
```

If login or first-device verification is required, pause and show:

```text
사람인 인재풀 검색은 기업회원 로그인과, 처음 사용하는 브라우저/기기에서는 2차 인증이 필요할 수 있습니다.
제가 브라우저로 사람인 인재풀 검색 페이지를 열어둘게요.
열린 브라우저에서 직접 로그인과 필요한 경우 2차 인증을 완료해 주세요.
비밀번호, 인증번호, 세션 쿠키는 저에게 알려주지 마세요.
인재풀 검색 화면이 보이면 “인증 완료했어”라고 알려주세요.
그 다음 같은 브라우저 세션에서 검색을 이어가겠습니다.
```

Resume only in the same browser session after the user confirms the search UI is visible.

## Input normalization

Extract or infer:

- role_title
- must_have / nice_to_have
- negative_keywords
- career min/max
- location/work_area
- role-specific evaluation signals
- limit / requested Top N

Do not block on missing details when a reasonable first search is possible.

## Workflow

1. Open the primary URL and verify corporate login plus search UI visibility.
2. Ask the user to log in/verify manually only when required; never handle credentials.
3. Apply filters: keyword, 직무/직종, 경력, 지역, recent update/activity/relevance sorting, exclusions when supported.
4. Build a candidate pool from visible rows.
5. Before final Top N, open normal profile/resume detail links for promising candidates when this does not trigger paid unlock/contact/proposal actions.
6. Read only visible free/masked details: career, responsibilities, project/achievement evidence, skills, education/certs/languages, desired location/salary/job-seeking state, portfolio links if visible, recent activity.
7. Score role-adaptively: must-have fit, career depth, concrete achievement/project evidence, location/activity fit, nice-to-have signals, and risk penalty.
8. Return Korean shortlist with direct URL per recommended candidate.

Do not finalize Top N from list rows only unless details are inaccessible or paid-walled. If so, label results as `목록 기반 1차 shortlist` and lower confidence. If detail text was inspected, label as `상세 이력 확인 기반 shortlist`.

## Permission guidance

Safe after normal tool/browser approval: opening the search page, typing filters, pressing search/apply, scrolling results, opening normal candidate detail links, reading currently visible masked/free text.

Must stop/handoff: paid unlock, contact reveal, proposal/send, scrap/interest, memo/status changes, payment, credential/OTP/cookie handling.

## URL extraction guidance

Every recommended candidate needs a direct Saramin profile/resume URL whenever available. If browser extraction fails, inspect anchors, onclick handlers, data attributes, card containers, and detail-page `location.href`. If still missing, write `URL: 추출 실패` and explain why.

## Output shape

```text
사람인 인재풀 shortlist

검색 조건
- 포지션: ...
- 필수/우대/제외 조건: ...
- 경력/지역: ...
- 모드: 상세 이력 확인 기반 shortlist / 목록 기반 1차 shortlist

유료 열람 추천 Top N
1. 후보 A
   - 점수: 88/100
   - 근거: ...
   - 보이는 경력/성과: ...
   - 리스크: ...
   - 추천 액션: 채용 담당자가 유료 열람 검토
   - URL: ...

보류 후보
- ...

검색 한계
- 마스킹/현재 표시 정보만 분석했음
- 연락처/실명/비공개 정보는 열람하지 않음
- 유료 액션은 실행하지 않음
```

## Failure modes

- Login/2FA required: open the page and let the user complete it manually.
- Browser/session unavailable: explain that the agent needs browser/computer-use access; do not silently switch to no-login scraping.
- Paid wall/contact wall: stop and mark as manual paid review needed.
- Empty results: adjust keywords, career, region, update/relevance filters.
- UI changed: rediscover the visible form/data flow before updating instructions.
