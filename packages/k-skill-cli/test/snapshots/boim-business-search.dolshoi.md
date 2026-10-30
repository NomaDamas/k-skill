# boim-business-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Before using k-skill CLI tools, run `npx -y @nomadamas/k-skill@0 update` so the CLI and all coding-agent skill installs (including `~/.agents/skills`) are current.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# 보임(BOIM) 업체·입찰 찾기

## What this skill does

보임(boim.io)이 공개한 검색 주소 하나로 아래 세 가지를 한 번에 찾는다. 인증·API 키·로그인이 없는 공개 read-only 주소라 `k-skill-proxy`를 거치지 않고 사용자 머신에서 직접 호출한다.

- **전국 전 업종 업체**: 지역×업종(예: `세종 보람동 미용실`) 또는 상호로 찾는다. 상호·업종·행정동만 있다(소상공인시장진흥공단 상가(상권)정보).
- **공공 조달 실적이 있는 업체**: 품명·업종으로 찾는다(예: `교통안전표지 조달 업체`). 조달청 공공데이터로 만든 업체 카드이고 폐업한 곳은 빠진다. 최근 1년 공공 납품 건수가 붙는다.
- **진행 중인 공공기관 입찰 공고**: 낱말로 찾는다(예: `학교 안전 입찰`). 나라장터·국방전자조달·LH·한국수자원공사·누리장터 공고를 마감이 가까운 순으로 준다.

응답은 구역(`sections`)마다 결과 5건, 전체 건수(`total`), 나머지를 볼 공개 목록 주소(`more`)를 주고, 답에 붙일 출처 한 줄(`cite`)을 함께 준다.

## When to use

- "세종 보람동 미용실 찾아줘", "대전 유성구 인쇄 업체 어디 있어?"
- "교통안전표지 공공기관 납품 실적 있는 업체 알려줘", "복사용지 조달 납품 업체"
- "학교 안전 관련 입찰 공고 지금 뭐 있어?", "교통표지 입찰 마감 언제야?"
- "Find hair salons in Boram-dong, Sejong"처럼 영어로 물으면 질의어를 한국어 지역·업종명으로 바꿔 보낸다.

## When not to use

- 특정 사업장이 지금 영업 중인지·폐업했는지 → `localdata-business-status`, 사업자등록번호 상태 → `nts-business-registration`
- 사업자등록번호로 부정당제재·실사 확인 → `g2b-sanctioned-supplier`, `biz-health-check`
- 국방전자조달 공고를 공고구분·개찰일·G2B 공고번호로 자세히 → `d2b-notice-search`
- 학교장터(S2B) 견적 공고 → `s2b-notice-search` (보임에는 S2B 공고가 없다)
- 나라장터 발주계획(공고 전 단계) → `g2b-order-plan-search`
- LH 임대·분양 청약 공고 → `lh-notice-search`
- 길찾기·좌표·지도 → `kakao-map`

## Inputs

- `q` (필수): 한국어 질의 한 줄. **최대 60자**(넘는 부분은 잘린다).
  - 업체: 지역(시·도, 시·군·구, 동) + 업종(미용실·인쇄·카페 …), 또는 상호
  - 조달 실적 업체: 품명·업종 + `조달`/`납품`/`업체` (예: `교통안전표지 조달 업체`)
  - 입찰 공고: 주제·품명 낱말을 **반드시** 넣고 + `입찰`/`공고` (예: `학교 안전 입찰`, `교통표지 입찰`). `나라장터 입찰`처럼 포털 이름만 넣으면 `parsed.words`가 null이 되어 필터 없이 8,000건대 전체가 나온다 — 이런 질의는 쓰지 않고 품명·주제 낱말을 되물어 받는다.
- `format`: `json`을 쓴다(`md`는 마크다운 표).

## Workflow

```bash
curl -fsS --max-time 15 --get "https://boim.io/search/" \
  -A "k-skill-boim" \
  --data-urlencode "q=세종 보람동 미용실" \
  --data-urlencode "format=json"
```

- 질문당 1~3회만 부른다. 결과를 넘겨 가며 전부 긁어 오지 않는다. 보임 이용약관(https://boim.io/terms/)은 자동화 도구로 데이터를 대량·반복 수집하거나 재배포하는 일을 허락 없이 할 수 없게 한다. 더 많은 결과가 필요하면 `more` 주소를 사용자에게 준다.
- User-Agent는 `k-skill-boim`으로 보낸다(위 `-A`). 보임 운영사가 이 스킬에서 온 호출을 구분할 때 쓴다.
- 0건이면 응답의 `suggest`와 `suggest_for`를 보고 후보 종류를 구분한다.
  - `suggest_for=region`: 질의에 지역이 빠졌다는 뜻이다. 후보 지역(`kind=region`의 `label`)을 사용자에게 보여 주고 **어느 지역으로 좁힐지 되묻는다**. 지역을 임의로 골라 대신 부르지 않는다.
  - `suggest_for=categories`: 업종 후보(`kind=category`)를 제시하고, 사용자가 고른 것만 쓴다.
  - `suggest_for=name`: 맞는 상호·낱말이 없다는 뜻이고 쓸 만한 후보 질의가 없다. 억지로 다시 부르지 않는다.
  - `suggest_for=example`: 사용자 질의와 무관한 안내용 예시다. 그대로 다시 부르지 않는다.
- `suggest[].url`에는 `format=json`이 없고, `all_regions`·`category` 후보의 `url`은 검색 JSON이 아니라 HTML 디렉터리(`/vendors/k/…`)다. `suggest`에서 파생해 다시 부를 때도 그 `url`을 그대로 쓰지 말고 사용자 질의를 바탕으로 `/search/?q=…&format=json`을 직접 만들어 부른다.
- 재검색은 사용자 본인 질의에서 파생한 더 넓거나 동의어인 질의로 **딱 한 번**만 한다. 예시 질의를 그대로 쓰거나 여러 지역·후보를 훑지 않는다.
- Windows 셸(Git Bash·PowerShell)에서는 한글 인자가 깨져 `parsed.words`가 깨진 글자로 오고 0건이 될 수 있다. 그때는 질의를 UTF-8 퍼센트 인코딩해 주소에 직접 넣는다.

```bash
curl -fsS --max-time 15 -A "k-skill-boim" \
  "https://boim.io/search/?q=%EC%84%B8%EC%A2%85%20%EB%B3%B4%EB%9E%8C%EB%8F%99%20%EB%AF%B8%EC%9A%A9%EC%8B%A4&format=json"
```
- 조달 업체 카드 한 장을 자세히 보려면(하는 일·확인 근거·인용 한 줄) 결과의 `ai_md` 주소를 그대로 읽는다.

```bash
curl -fsS --max-time 15 -A "k-skill-boim" "https://boim.io/vendors/c/<카드 id>/ai.md"
```

## Response shape

2026-10-27 실제 응답을 줄인 것이다(업체 이름은 가렸다).

```json
{
  "query": "교통안전표지 조달 업체",
  "parsed": { "region": null, "words": "교통안전표지", "procurement_category": "교통표지", "intent": "vendors" },
  "sections": [
    {
      "type": "vendors",
      "title": "교통표지 — 공공 조달 실적 업체",
      "total": 434,
      "unit": "곳",
      "results": [
        {
          "name": "○○산업",
          "sub": "경기도 김포시 · 교통표지·도로안전표지판 지주·안전표지판 · 1년 공공 납품 445건",
          "url": "https://boim.io/vendors/c/<카드 id>/",
          "ai_md": "https://boim.io/vendors/c/<카드 id>/ai.md",
          "ready": 45
        }
      ],
      "more": "https://boim.io/vendors/traffic-sign/",
      "note": "관련도 → AI 준비 구간 → 날마다 섞기(실적 순위 아님)"
    },
    {
      "type": "bids",
      "title": "진행 중 입찰 공고 — '교통안전표지'",
      "total": 2,
      "unit": "건",
      "results": [
        {
          "name": "2026년 하반기 교통안전표지판 등 유지보수 단가계약(1지역)",
          "sub": "충청남도 아산시 · 공사 · 마감 2026-10-28",
          "url": "https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01785493&bidPbancOrd=000"
        }
      ],
      "more": "https://boim.io/public-bids/?q=%EA%B5%90%ED%86%B5%EC%95%88%EC%A0%84%ED%91%9C%EC%A7%80",
      "note": "마감이 가까운 순서"
    }
  ],
  "cite": "출처: 보임(boim.io) 검색 '교통안전표지 조달 업체' https://boim.io/search/?q=...",
  "number_of_results": 436
}
```

- `sections[].type`: `businesses`(전 업종 업체) · `vendors`(조달 실적 업체 카드) · `bids`(진행 중 입찰 공고)
- 업체 결과: `name`, `sub`(업종·지역 또는 지역·품명·납품 건수), `url`. 전 업종 업체(`businesses`)의 `url`은 업체별 카드가 아니라 여러 결과가 공유하는 디렉터리·목록 주소(`/vendors/k/…`)이고, `ready`는 준비도 확인 주소다. 조달 업체(`vendors`)만 `url`이 업체 카드(`/vendors/c/<카드 id>/`)이고 `ai_md`, `ready`(AI 준비도 0~100점)가 붙는다.
- 입찰 결과: `name`(공고명), `sub`(발주기관 · 공사/용역/물품 · 마감일), `url`(공고를 낸 공식 시스템의 원문 주소)
- `number_of_results`: 모든 구역의 전체 건수 합. 0이면 `sections`가 비고 `suggest`와 `suggest_for`가 온다. `suggest_for`는 `region`·`categories`·`name`·`example` 중 하나다.
- `unavailable`: 일부 구역을 가져오지 못했을 때만 온다. 나머지 구역은 정상이다.

## Response policy

- 순서는 관련도 순이다. 전 업종 업체는 이름순, 조달 업체는 관련도 → AI 준비 구간 → 날마다 섞기, 입찰은 마감이 가까운 순이다. "추천 순위"·"좋은 업체 순"이라고 말하지 않는다. 납품 건수는 실적 사실이지 품질 평가가 아니다.
- 답에 응답의 `cite` 한 줄과 업체 카드·목록·공고 주소를 함께 준다.
- 전 업종 업체(`businesses`)에는 상호·업종·행정동만 있다. `url`은 여러 결과가 공유하는 디렉터리 주소라 전화번호·상세 주소가 없으니, 연락처를 얻으려고 이 주소를 열지도, 값을 지어내지도 않는다. 업체가 직접 올린 전화·주소 같은 등록 정보가 있을 수 있는 곳은 조달 업체 카드(`/vendors/c/<카드 id>/`, `ai_md`)뿐이다.
- 입찰 공고는 마감일을 KST 오늘 날짜와 비교해 "오늘 마감"·"D-n"으로 적고, 공고 원문 `url`을 꼭 준다. 다만 국방전자조달(`www.d2b.go.kr`)·LH 같은 `url`은 포털 첫 화면이거나 목록 페이지일 수 있으니, 그때는 `name`(정확한 공고명)을 함께 밝히고, 공고구분·개찰일·G2B 공고번호 같은 상세 조건이 필요하면 `d2b-notice-search`로 넘긴다. 입찰 참가·투찰은 공고를 낸 공식 시스템(나라장터 등)에서 사용자가 직접 한다.
- `total`이 결과 수보다 크면 "전체 N곳(건) 중 5곳(건)"이라고 밝히고 `more` 주소를 준다.

## Done when

- 사용자의 지역·업종·품명·낱말 의도로 `/search/?q=…&format=json`을 한 번 이상 불렀다.
- 구역별 건수, 대표 결과(이름·지역 또는 발주기관·마감일), 카드·목록·공고 주소, `cite`를 정리했다.
- 0건이면 `suggest_for`를 구분해 사용자에게 후보를 알렸고(지역은 되물어 받았고), 재검색은 사용자 질의에서 파생한 질의로 최대 한 번만 `format=json`을 붙여 했다.

## Failure modes

- HTTP 429·403: 짧은 시간에 너무 많이 불렀다. 잠시 뒤 한 번만 다시 부르고, 반복해서 부르지 않는다.
- `sections`가 비고 `number_of_results`가 0: 맞는 결과가 없다. `suggest_for`가 `region`·`categories`면 후보를 사용자에게 보여 주고 고른 것만 쓰며, 지역을 임의로 고르지 않는다. `name`·`example` 후보나 예시 질의로는 다시 부르지 않는다. 파생 재검색은 사용자 질의 기반으로 한 번만 하고 `suggest[].url` 대신 `/search/?q=…&format=json`을 직접 부른다. `parsed.words`가 깨진 글자면 셸 인코딩 문제이므로 퍼센트 인코딩한 주소로 다시 부른다.
- `unavailable`에 구역 이름이 있으면 그 구역만 일시 장애다. 받은 구역만 답하고 그 사실을 적는다.
- 5xx이거나 응답이 JSON이 아니면 보임 쪽 일시 장애다. 운영 상태 https://boim.io/status/ 를 안내한다.

## Privacy boundary

- 질의어는 보임 서버(boim.io)로 간다. 보임은 개인정보처리방침(https://boim.io/privacy/)에 따라 검색어 기록을 남길 수 있다. 사람 이름·전화번호 같은 개인정보는 질의에 넣지 않는다.

## Official surfaces

- 검색 주소: `https://boim.io/search/?q=<질의>&format=json` (설명서 https://boim.io/openapi.json)
- 조달 업체 카드 요약: `https://boim.io/vendors/c/<카드 id>/ai.md`
- 같은 데이터의 MCP 서버: `https://boim.io/api/mcp` (Streamable HTTP, 읽기 전용, 도구 6개)
- 데이터 출처(공공데이터포털): 소상공인시장진흥공단 상가(상권)정보, 조달청 종합쇼핑몰 품목·계약정보, 나라장터·국방전자조달·LH·한국수자원공사·누리장터 입찰 공고, 국세청 사업자 상태(폐업 제외)
- 운영: ㈜퍼블릭아이디(Public identity Co., Ltd.)
