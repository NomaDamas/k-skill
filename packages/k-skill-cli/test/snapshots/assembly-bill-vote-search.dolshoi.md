# assembly-bill-vote-search — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- Plain lookups go through the hosted `k-skill-proxy` (`https://k-skill-proxy.nomadamas.org`) by default; no user API key is needed. Set `KSKILL_PROXY_BASE_URL` only for a self-hosted or alternate proxy. Direct upstream calls require the skill-documented API key.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# Assembly Bill Vote Search

## What this skill does

열린국회정보 Open API `https://open.assembly.go.kr/portal/openapi` 를 `k-skill-proxy` 경유로 호출한다.

지원 endpoint:

- `GET /v1/assembly/bills` → `ALLBILLV2` 의안정보 통합 API
- `GET /v1/assembly/bill-detail` → `BILLINFODETAIL` 의안 상세정보
- `GET /v1/assembly/votes` → `nojepdqqaweusdfbi` 국회의원 본회의 표결정보

## When to use

- "간호법 의안 검색해줘"
- "BILL_ID로 의안 상세 보여줘"
- "21대 국회 특정 의안 표결에서 의원별 찬반 알려줘"

## Prerequisites

- 인터넷 연결
- hosted/self-host `k-skill-proxy`의 `/v1/assembly/*` route 접근 가능

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org` 를 사용한다.
- `ASSEMBLY_API_KEY` 또는 `KSKILL_ASSEMBLY_API_KEY` 는 프록시 운영 서버 환경에만 둔다.

키 발급: <https://open.assembly.go.kr/portal/openapi/openApiActKeyIssPage.do>

## Inputs

의안 검색:

- `query`/`q`/`billName` → `BILL_NM`
- `billId`, `billNo`, `billKind`, `committeeName`, `proposalDate`, `result`
- `eraco`/`ageLabel` → `ERACO`, 기본 `제21대`
- `page`/`pIndex`, `limit`/`pSize`

의안 상세:

- `billId` 필수

표결 조회:

- `age` 필수 (`21` 등 숫자)
- `billId` 필수
- `memberName`, `party`, `memberNo`, `voteDate`, `billNo`, `billName`, `committee`, `voteResult`
- `page`/`pIndex`, `limit`/`pSize`

## Workflow

### 1. Search bills first

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "$BASE/v1/assembly/bills" \
  --data-urlencode "query=간호법" \
  --data-urlencode "eraco=제21대" \
  --data-urlencode "limit=10"
```

### 2. Fetch bill detail

```bash
curl -fsS --get "$BASE/v1/assembly/bill-detail" \
  --data-urlencode "billId=PRC_N2D0H0W9P2S3Z1Q2X0L8W4B1G8E3F4"
```

### 3. Fetch plenary votes

```bash
curl -fsS --get "$BASE/v1/assembly/votes" \
  --data-urlencode "age=21" \
  --data-urlencode "billId=PRC_N2D0H0W9P2S3Z1Q2X0L8W4B1G8E3F4" \
  --data-urlencode "limit=100"
```

## Failure modes

- `400 bad_request`: 필수 `billId`/`age` 누락, 페이지 크기 초과, 잘못된 숫자 형식.
- `503 upstream_not_configured`: 프록시 서버에 `ASSEMBLY_API_KEY`/`KSKILL_ASSEMBLY_API_KEY` 없음.
- 열린국회정보 `RESULT.CODE`:
  - `ERROR-290`: 키 누락/오류
  - `ERROR-300`: 필수 파라미터 누락
  - `ERROR-337`: 일일 트래픽 초과
  - `INFO-200`: 결과 없음
- 빈 결과: 대수(`ERACO`/`age`), 의안명, 의안번호, BILL_ID를 다시 확인한다.

## Done when

- 먼저 의안 검색으로 `BILL_ID`를 확정했다.
- 상세 또는 표결 조회 결과에 `BILL_ID`, 국회 대수, endpoint를 함께 적었다.
- 표결 요약은 찬성/반대/기권 등 upstream 원문 분류를 임의 변경하지 않았다.

## Maintainer review notes

키 없이 가능한 검증:

- `./scripts/validate-skills.sh`
- `node --test packages/k-skill-proxy/test/server.test.js`
- `curl -i --get "$KSKILL_PROXY_BASE_URL/v1/assembly/bills" --data-urlencode "query=간호법"` (키 미설정이면 503 확인)

Live smoke는 hosted/self-host proxy에 `ASSEMBLY_API_KEY`가 설정된 뒤 수행한다.

## Safety notes

- 조회 전용 스킬이다.
- 정치적 평가·추천을 자동 생성하지 않고, 공식 원천의 의안·표결 사실을 요약한다.
- 인증키는 프록시 서버에서만 다루며 repo/GitHub Actions/public docs에 저장하지 않는다.
