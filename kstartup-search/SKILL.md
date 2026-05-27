---
name: kstartup-search
description: 공공데이터포털 창업진흥원 K-Startup Open API(15125364)로 통합 공고 사업 정보·지원사업 공고·창업 콘텐츠·통계보고서를 k-skill-proxy 경유로 조회한다. 검색 전용.
license: MIT
metadata:
  category: business
  locale: ko-KR
  phase: v1
---

# 창업진흥원 K-Startup 조회

## What this skill does

공공데이터포털의 **창업진흥원_K-Startup(사업소개,사업공고,콘텐츠 등)_조회서비스** (`kisedKstartupService01`, dataset `15125364`)를 `k-skill-proxy` 경유로 호출해 다음 4개 endpoint를 조회한다.

- `business-info` → `getBusinessInformation01` : 통합공고 지원사업 정보 (예산, 규모, 수행기관, 사업소개)
- `announcements` → `getAnnouncementInformation01` : 지원사업 공고 정보 (공고명, 접수기간, 지역, 신청대상, 모집진행여부 등 — **가장 활용도 높음**)
- `contents` → `getContentInformation01` : 창업관련 콘텐츠 (공지·뉴스·우수사례 등)
- `statistics` → `getStatisticalInformation01` : 창업관련 통계보고서

조회 전용 스킬이다. 사업 신청·지원금 청구·콘텐츠 게시 같은 쓰기 동작은 다루지 않는다.

## When to use

- "이번 달 마감 예정인 청년 창업지원 공고 찾아줘"
- "서울 소재 모집 진행 중인 1인 창조기업 지원사업 알려줘"
- "K-Startup에서 사업화 단계 통합공고 사업 목록 뽑아줘"
- "창업진흥원 최신 통계보고서 5건 보여줘"

## When not to use

- 사업 신청·결제·자동 지원·계좌 연계 같은 쓰기 동작 (지원 화면은 사용자가 K-Startup 웹에서 직접 진행한다)
- K-Startup 외부 사이트(중기부, 창조경제혁신센터, 지자체 단독 공고) 조회 — 통합공고에 등록된 일부만 K-Startup API로 노출된다
- 마감일·모집 상태를 분 단위로 추적해야 하는 작업 — 데이터 갱신은 공식 서비스설계서 기준 **일 1회**다 (공공데이터포털 dataset 메타데이터에는 "실시간"으로 표기되지만 두 표면이 일치하지 않는다)

## Prerequisites

- 인터넷 연결
- `python3` (stdlib only)
- 설치된 스킬 안의 `scripts/run_kstartup.py`
- hosted/self-host `k-skill-proxy`의 `/v1/kstartup/*` 라우트 접근 가능 (4개)

## Credential requirements

- 사용자 측 필수 시크릿 없음.
- `KSKILL_PROXY_BASE_URL` — self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org`.
- `KSKILL_KSTARTUP_API_KEY` — `--direct`로 K-Startup을 직접 호출할 때만 필요. 공공데이터포털에서 `창업진흥원_K-Startup(사업소개,사업공고, 콘텐츠 등)_조회서비스` (`15125364`) 활용신청이 본인 계정으로 승인돼 있어야 한다(자동승인, 무료).
- 프록시 운영자는 `DATA_GO_KR_API_KEY` 환경변수에 같은 조건의 키를 두고 활용신청을 추가해 둔다.

### Credential resolution order (`--direct` 전용)

1. 이미 환경변수에 있으면 그대로 사용한다.
2. 에이전트 vault(1Password CLI, Bitwarden CLI, macOS Keychain 등)에서 꺼내 환경변수로 주입.
3. `~/.config/k-skill/secrets.env` (plain dotenv, 권한 `0600`).
4. 아무것도 없으면 사용자에게 묻고 2 또는 3에 저장.

일반 조회 helper는 proxy URL만 읽고, K-Startup 인증키는 프록시 서버에서만 주입한다. `--direct` 호출에서만 `KSKILL_KSTARTUP_API_KEY`를 읽는다.

## Inputs

서브커맨드: `business-info`, `announcements`, `contents`, `statistics`.

공통 옵션:

- `--page N` (기본 1, ≥ 1)
- `--per-page N` (기본 10, 1–100)
- `--text` 사람용 요약 / `--json` 구조화 결과(기본)
- `--dry-run` 인증키 없이 요청 URL/파라미터만 출력
- `--timeout N` HTTP 타임아웃 초 (기본 30)
- `--proxy-base-url URL` 기본 hosted proxy 대신 self-host/alternate proxy
- `--direct` proxy 우회, `KSKILL_KSTARTUP_API_KEY`로 직접 호출

서브커맨드별 필터:

- `business-info`
  - `--biz-yr 2024` (사업 연도, 4자리)
  - `--biz-category-cd cmrczn_Tab3` (사업 구분 코드)
  - `--supt-biz-titl-nm "1인 창조기업"` (사업 명)
- `announcements`
  - `--biz-pbanc-nm "키워드"` (지원 사업 공고 명)
  - `--supt-regin 서울특별시` (지역명. **K-Startup upstream이 이 필터를 서버 측에서 적용하지 않는 사례가 있다** — 응답을 받은 뒤 client에서 `supt_regin` 으로 한 번 더 거른다)
  - `--supt-biz-clsfc 사업화` (지원 분야)
  - `--pbanc-rcpt-bgng-dt 20240101` / `--pbanc-rcpt-end-dt 20241231` (공고 접수 시작/종료, YYYYMMDD)
  - `--aply-trgt 일반인,예비창업자` (신청 대상)
  - `--biz-enyy 예비창업자,1년미만` (창업 기간)
  - `--biz-trgt-age "만 20세 이상 ~ 만 39세 이하"` (대상 연령)
  - `--rcrt-prgs-yn Y|N` (모집진행여부)
  - `--intg-pbanc-yn Y|N` (통합 공고 여부)
- `contents`
  - `--clss-cd notice_matr` (콘텐츠 구분 코드: notice_matr 등)
  - `--titl-nm "공모전"` (제목 키워드)
- `statistics`
  - `--titl-nm "창업기업 실태조사"` (통계 자료 명)
  - `--file-nm "PDF"` (파일 명/내용 키워드)

## Workflow

### 1. Ensure proxy access is available

일반 조회는 기본 hosted `k-skill-proxy`를 사용하므로 사용자 K-Startup 키가 필요 없다. self-host를 쓰면 `KSKILL_PROXY_BASE_URL`을 설정한다. `--direct`가 필요할 때만 `KSKILL_KSTARTUP_API_KEY`를 credential resolution order에 따라 확보한다.

### 2. Pick the right operation

- 마감 임박/지역 필터/대상별 공고 추천 → `announcements`
- 사업의 전반적 소개·예산 규모 → `business-info`
- 정책 공지·우수사례 → `contents`
- 보고서/통계 데이터 → `statistics`

### 3. Fetch a small bounded slice first

`--per-page 10` 정도로 먼저 한 페이지를 받아 응답 스키마를 확인한 뒤, 필터를 좁히거나 페이지를 넘긴다.

```bash
python3 scripts/run_kstartup.py announcements \
  --supt-regin 서울특별시 --rcrt-prgs-yn Y --per-page 5 --text
```

### 4. Filter on the client side for richer questions

API는 단순 필드 매칭만 지원하고, **그중 `supt_regin` 같은 일부 필터는 upstream이 서버 측에서 적용하지 않는 사례가 관측된다.** `--supt-regin 서울특별시`로 호출해도 타 지역 공고가 섞여 돌아오는 경우가 있어서, `supt_regin`·`aply_trgt`·`biz_enyy` 필드는 helper가 받은 응답을 client에서 한 번 더 거른다.

- 응답 `supt_regin`은 upstream이 축약형(`서울`, `경기`, `충북`)으로 돌려준다. helper는 사용자가 `--supt-regin 서울특별시` 같은 표준 광역지자체명을 줘도 17개 광역시·도(+ `전국`) 매핑 테이블로 자동 정규화해 매치한다.
- client filter가 적용되면 응답 JSON에 `client_filter: {fields, upstream_returned, after_filter}` 블록이 함께 붙는다. `upstream_returned`는 같지만 `after_filter`가 작으면 첫 페이지로는 부족하니 `--page`를 늘려 추가 페이지를 받는다.
- 쉼표로 여러 값을 주면 AND 매치다 (`--aply-trgt 예비창업자,1년미만` → 두 토큰 모두 row에 있어야 통과).
- `pbanc_rcpt_end_dt`는 `YYYYMMDD` 문자열이라 KST 기준으로 직접 비교한다. "이번 주 마감", "30대 대상", "특정 키워드 포함" 같은 복합 조건은 helper가 안 거르므로 응답 JSON에서 agent가 직접 처리한다.

### 5. Cite the source

응답을 요약할 때는 endpoint 이름, 호출 page/perPage, 응답의 `pbanc_sn` 또는 `detl_pg_url`을 함께 적는다. 상세는 https://www.k-startup.go.kr 의 해당 URL로 안내한다.

## CLI examples

```bash
# 서울 모집 중 공고 5건
python3 scripts/run_kstartup.py announcements \
  --supt-regin 서울특별시 --rcrt-prgs-yn Y --per-page 5 --text

# 2024년 사업화 분야 통합공고
python3 scripts/run_kstartup.py business-info \
  --biz-yr 2024 --biz-category-cd cmrczn_Tab3 --json

# 정책·공지 최신 콘텐츠
python3 scripts/run_kstartup.py contents \
  --clss-cd notice_matr --per-page 10 --text

# 창업기업 실태조사 통계보고서
python3 scripts/run_kstartup.py statistics \
  --titl-nm "창업기업 실태조사" --per-page 5 --json

# 인증키 없이 dry-run 으로 요청 점검
python3 scripts/run_kstartup.py announcements \
  --supt-regin 부산광역시 --dry-run
```

## Direct proxy examples

```bash
curl -fsS "$KSKILL_PROXY_BASE_URL/v1/kstartup/announcements?supt_regin=$(python3 -c 'import urllib.parse;print(urllib.parse.quote(\"서울특별시\"))')&rcrt_prgs_yn=Y&perPage=5"
```

## Failure modes

- `400 bad_request`: 잘못된 날짜(`YYYYMMDD` 아님), 잘못된 `Y/N`, perPage 범위 초과, 시작일 > 종료일 → 메시지대로 입력 보정.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY`가 없거나 해당 데이터셋 활용신청이 미승인.
- `502 upstream_error`: data.go.kr 응답이 `resultCode != "00"` 또는 `errMsg`/`SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 등 인증/한도 오류.
  - data.go.kr 에러 코드: 10(잘못된 파라미터), 20(접근거부), 22(요청제한 초과), 30(미등록 키), 31(만료), 32(미등록 IP).
- `502 upstream_invalid_response`: data.go.kr이 JSON 대신 HTML/XML 본문을 보낸 경우(점검·차단 등). `upstream_body` 앞 500자가 함께 반환된다.
- 빈 `data` 배열: 필터에 일치하는 공고/콘텐츠 없음. 키워드/지역/대상 범위를 완화한다.
- 일 갱신 1회(서비스설계서 기준): 같은 날 같은 공고의 마감일·상태가 갱신되지 않을 수 있으므로, 마감/접수 상태는 응답의 `detl_pg_url` 페이지에서 최종 확인한다.

## Done when

- 사용자가 찾는 endpoint (`business-info` / `announcements` / `contents` / `statistics`)를 골랐다.
- 작은 슬라이스로 첫 페이지를 받아 응답 스키마/필드를 확인했다.
- 필터를 좁히거나 클라이언트에서 후처리해 답변에 필요한 핵심 행만 남겼다.
- 결과에 출처(endpoint, page/perPage, `detl_pg_url` 또는 `pbanc_sn`)를 명시했다.

## Maintainer review notes

K-Startup 인증키 없이도 다음 검증이 가능하다.

- `./scripts/validate-skills.sh`
- `python3 -m py_compile kstartup-search/scripts/run_kstartup.py kstartup-search/tests/test_run_kstartup.py`
- `python3 kstartup-search/scripts/run_kstartup.py --help`
- `python3 kstartup-search/scripts/run_kstartup.py announcements --supt-regin 서울특별시 --dry-run`
- `PYTHONPATH=kstartup-search/scripts python3 -m unittest discover -s kstartup-search/tests -p 'test_*.py' -v`
- `node --test packages/k-skill-proxy/test/server.test.js` (K-Startup 라우트 5개 신규 케이스 포함)
- `npm run ci`

라이브 스모크는 hosted proxy 환경에 `DATA_GO_KR_API_KEY` 가 설정되고 `15125364` 활용신청이 승인된 뒤에 수행한다.

## Safety notes

- 조회 전용 스킬. 사업 신청·계좌 연결·결제 자동화는 하지 않는다.
- 응답에 K-Startup 사이트 URL이 있으면 그대로 안내하고, 실제 신청은 사용자가 브라우저에서 직접 진행한다.
- 인증키는 프록시 서버에서만 다루며, `--dry-run` 시에도 helper는 `<DRY-RUN>`로 대체한다.
