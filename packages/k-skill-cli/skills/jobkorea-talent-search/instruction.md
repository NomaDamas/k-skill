# jobkorea-talent-search

## Use when

- 사용자가 잡코리아에서 후보를 찾아달라고 요청한다.
- 기업회원 로그인 세션에서 마스킹 이력서/목록을 비교해야 한다.
- 유료 열람 전 shortlist, 점수, 근거, 리스크, 후보 URL이 필요하다.

## Hard boundaries

Allowed:
- 잡코리아 기업회원 브라우저 세션 열기 및 검색 필터 입력
- 현재 보이는 마스킹 목록/이력서/프로필 읽기
- 후보 분석, 점수화, shortlist 작성, 유료 열람 추천

Never do without explicit user handoff/confirmation:
- 유료 이력서 열람, 마스킹 해제, 연락처 확인
- 포지션 제안 발송, 스크랩, 메모 저장, 후보 상태 변경
- 결제/유료 크레딧 사용
- 비밀번호, OTP, 인증번호, 세션 쿠키 요청/저장
- 후보 개인정보 장기 저장 또는 대량 수집

If a control may spend credits, reveal contact/private info, send a proposal, or mutate account state, stop before clicking it.

## Primary access

Open:

```text
https://www.jobkorea.co.kr/corp/person/find
```

If not logged in, pause and show:

```text
잡코리아 인재검색은 경력 상세/포트폴리오/마스킹 이력서 확인을 위해 기업회원 로그인이 필요합니다.
제가 브라우저로 잡코리아 기업 인재검색 페이지를 열어둘게요.
열린 브라우저에서 직접 로그인해 주세요. 비밀번호나 인증정보는 저에게 알려주지 마세요.
로그인이 끝나면 “로그인했어”라고 알려주시면, 같은 브라우저 세션에서 검색을 이어가겠습니다.
```

Resume only in the same browser session after the user confirms login.

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

1. Open the primary URL and verify corporate login.
2. Ask the user to log in manually only when required; never handle credentials.
3. Apply filters: keyword, 직무/스킬, 지역, 경력, recent activity/update, exclusions when supported.
4. Build a candidate pool from visible rows.
5. Before final Top N, open normal resume/detail links for promising candidates when this does not trigger paid unlock/contact/proposal actions.
6. Read only visible free/masked details: career, responsibilities, project/achievement evidence, skills, education/certs/languages, desired location/salary, portfolio links if visible, recent activity.
7. Score role-adaptively: must-have fit, career depth, concrete achievement/project evidence, location/activity fit, nice-to-have signals, and risk penalty.
8. Return Korean shortlist with direct URL per recommended candidate.

If detail pages are inaccessible or paid-walled, label results as `목록 기반 1차 shortlist` and lower confidence. If detail text was inspected, label as `상세 이력 확인 기반 shortlist`.

## No-login fallback

Use only when the user cannot or will not log in. It is low-confidence because it cannot inspect resume details.

```bash
python3 jobkorea-talent-search/scripts/jobkorea_talent_search.py   --keyword "퍼포먼스 마케터 GA4"   --work-area "서울"   --career-min 3   --career-max 7   --limit 20
```

## URL extraction guidance

Every recommended candidate needs a direct JobKorea resume/profile URL whenever available. If browser extraction fails, inspect anchors, onclick handlers, data attributes, card containers, and detail-page `location.href`. If still missing, write `URL: 추출 실패` and explain why.

## Output shape

```text
잡코리아 인재 shortlist

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
- Browser/session unavailable: explain that the agent needs browser/computer-use access; do not silently switch to low-confidence fallback.
- Paid wall/contact wall: stop and mark as manual paid review needed.
- Empty results: adjust keywords, career, region, update/relevance filters.
- UI changed: rediscover the visible form/data flow before updating scripts.
