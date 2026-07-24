# job-posting-match — assembled instructions

Runtime mode: generic

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# job-posting-match

## What this skill does

`job-posting-match`는 구직자가 제공한 이력서/경력요약, 희망 직무, 지역, 제외 조건을 바탕으로 잡코리아와 사람인의 공개 채용공고 검색 결과를 조회하고, 공고별 적합도·추천 이유·주의점·지원 전략을 정리한다.

기존 `jobkorea-talent-search`, `saramin-talent-search`가 채용담당자 관점의 인재검색이라면, 이 스킬은 구직자 관점의 공고 매칭이다. 개발자 전용이 아니며 마케팅, 영업, 운영, 디자인, 기획, 회계, 인사 등 모든 직무에 role-adaptive하게 적용한다.

## When to use

- 사용자가 “내 이력서에 맞는 공고를 찾아줘”, “지원할 만한 잡코리아/사람인 공고를 추천해줘”라고 요청한다.
- 이력서/경력기술서/자기소개서 요약에서 직무·스킬·산업 키워드를 뽑아 공개 채용공고를 검색해야 한다.
- 공고 링크 목록만이 아니라 적합도, 추천 이유, 주의점, 지원 전략이 필요하다.

## Hard boundaries

Allowed:
- 사용자가 제공한 이력서/경력요약 텍스트 읽기
- 잡코리아·사람인 공개 채용공고 검색 결과 조회
- 공고 제목/회사/목록 요약/공개 상세 링크 기반 매칭 점수화
- 지원 우선순위, 이력서 보완 포인트, 자기소개서 방향 제안

Never do without explicit user handoff/confirmation:
- 입사지원 버튼 클릭, 지원서 제출, 개인정보 입력
- 로그인, 스크랩/관심공고 저장, 메시지 발송, 파일 업로드
- 비밀번호, OTP, 인증번호, 세션 쿠키 요청/저장
- 주민등록번호, 상세 주소, 연락처 등 민감정보 장기 저장 또는 대량 수집

The result is a recommendation aid, not a guarantee of hiring or interview success. Salary, deadline, employment type, and detailed requirements must be checked on the original posting before applying.

## Site-dependent access path

v1 uses public, no-login search result pages only:

- JobKorea: `https://www.jobkorea.co.kr/Search/?stext=<검색어>`
  - Result links are public anchors like `/Recruit/GI_Read/<id>`.
  - Modern JobKorea pages may include Next.js data and repeated anchors; dedupe by posting id.
- Saramin: `https://www.saramin.co.kr/zf_user/search/recruit?searchword=<검색어>`
  - Result cards contain `rec_idx` links such as `/zf_user/jobs/relay/view?...&rec_idx=<id>`.
  - Dedupe by `rec_idx`.

No proxy is used because both surfaces are public and do not require an API key.

## Inputs

Extract or ask only if missing and necessary:

- resume_text: 이력서, 경력기술서, 자기소개서, 포트폴리오 요약
- desired_role: 희망 직무/포지션
- must_have / nice_to_have: 필수·우대 스킬, 도구, 산업 경험
- desired_location: 희망 지역
- career_years: 경력 연차
- negative_keywords: 피하고 싶은 직무/산업/조건
- limit: 추천받을 공고 수

Do not block on missing fields when a reasonable first search is possible. If the user gives only a resume, infer search queries from role/tool/industry terms.

## Workflow

1. Normalize the user input.
   - Remove or ignore unnecessary personal identifiers such as phone, email, exact address if they are not needed for matching.
   - Extract role terms, tools/skills, industry/domain, years of experience, desired locations, negative keywords.

2. Build 1-3 focused search queries.
   - Prefer role + key tool: `퍼포먼스 마케터 GA4 Meta Ads`.
   - Add role + domain when useful: `커머스 퍼포먼스 마케터`.
   - Avoid one huge query that over-filters results.

3. Run both public sources by default:

```bash
python3 job-posting-match/scripts/job_posting_match.py   --resume-text "퍼포먼스 마케터 5년. GA4, Google Ads, Meta Ads, SQL, 커머스 경험. 서울 희망."   --location 서울   --negative 보험영업   --limit 10
```

Use explicit keywords when the user already knows target roles:

```bash
python3 job-posting-match/scripts/job_posting_match.py   --resume-file /path/to/resume.txt   --keyword "CRM 마케터 Braze"   --keyword "그로스 마케터 SQL"   --location 서울   --json
```

4. Score postings conservatively.
   - Match role keywords, tools/skills, industry/domain, location, and career hints.
   - Penalize explicit negative keywords such as `보험영업`, `대출영업`, `텔레마케팅`.
   - Treat list-page summaries as low/medium confidence; do not invent requirements not visible in the source text.

5. Return a Korean shortlist.
   - Include source, company, direct URL, score, reasons, cautions, matched keywords, and support strategy.
   - Tell the user to verify deadline/salary/employment type on the original posting.

## Output shape

```text
이력서 기반 채용공고 추천

검색 조건
- 이력서 요약: ...
- 생성 검색어: ...
- 희망 지역/제외 조건: ...
- 조회 소스: 잡코리아, 사람인

추천 공고 Top N
1. [사람인] 회사명 - 공고 제목
   - 점수: 87/100
   - URL: ...
   - 추천 이유: 직무 키워드, GA4/SQL, 커머스 경험 일치
   - 주의점: 연봉은 목록에서 확인 안 됨, 상세 공고 확인 필요
   - 지원 전략: 이력서 상단 요약에 ... 경험을 먼저 강조

제외/주의 후보
- ...

검색 한계
- 공개 검색 결과 요약 기반이며 상세 요건은 원문 확인 필요
- 로그인, 지원, 스크랩, 개인정보 입력은 수행하지 않음
```

## Failure modes

- Empty results: broaden query, remove tools, search role only, or try alternate role names.
- Blocked or login wall: stop and report which source failed; continue with the other public source if possible.
- UI changed: rediscover the public search result structure before changing selectors.
- Too many irrelevant postings: add negative keywords and tighter role/domain terms.
- Personal data in resume: use it only for the current matching task; do not store it.

## Done when

- At least one source was queried, or the reason both sources failed is reported.
- Recommended postings include direct original URLs.
- Each recommendation has score, reason, caution or verification note, and support strategy.
- The response states that applying/submitting is not automated.
