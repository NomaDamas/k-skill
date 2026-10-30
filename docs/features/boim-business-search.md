# 보임 업체·입찰 찾기 (boim-business-search)

`boim-business-search` 스킬은 보임(boim.io)의 공개 검색 주소 `https://boim.io/search/?q=<질의>&format=json` 하나로 한국 전국 업체, 공공 조달 실적이 있는 업체, 공공기관 진행 중 입찰 공고를 함께 찾는다.

## 제공 기능

- 전국 전 업종 업체: 지역×업종·상호로 찾기 — 상호·업종·행정동(소상공인시장진흥공단 상가(상권)정보, 약 276만 곳)
- 공공 조달 실적 업체: 품명·업종으로 찾기 — 조달청 공공데이터로 만든 업체 카드(약 7.6만 곳, 폐업 제외), 최근 1년 공공 납품 건수, 카드 요약(`ai.md`)
- 진행 중 입찰 공고: 낱말로 찾기 — 나라장터·국방전자조달·LH·한국수자원공사·누리장터(약 9,100건, 매일 07:35·19:35 KST 갱신), 마감이 가까운 순
- 구역마다 결과 5건 + 전체 건수(`total`) + 나머지 공개 목록 주소(`more`) + 출처 한 줄(`cite`)

건수는 2026-10-27 기준이다.

## 인증/시크릿

없다. 인증 없는 공개 read-only 주소라 `AGENTS.md`의 proxy 편입 규칙대로 `k-skill-proxy`를 거치지 않고 사용자 머신에서 직접 호출한다. helper·추가 의존성 없이 `curl`만 쓴다.

## 예시

```bash
# 지역×업종 업체
curl -fsS --max-time 15 --get "https://boim.io/search/" -A "k-skill-boim" \
  --data-urlencode "q=세종 보람동 미용실" --data-urlencode "format=json"

# 공공 조달 실적 업체 + 관련 입찰 공고
curl -fsS --max-time 15 --get "https://boim.io/search/" -A "k-skill-boim" \
  --data-urlencode "q=교통안전표지 조달 업체" --data-urlencode "format=json"

# 진행 중 입찰 공고
curl -fsS --max-time 15 --get "https://boim.io/search/" -A "k-skill-boim" \
  --data-urlencode "q=학교 안전 입찰" --data-urlencode "format=json"
```

## 응답 규칙

- 순서는 관련도 순이다(전 업종 업체는 이름순, 조달 업체는 관련도 → AI 준비 구간 → 날마다 섞기, 입찰은 마감순). 추천 순위나 품질 평가로 말하지 않는다.
- 답에 `cite` 한 줄과 카드·목록·공고 주소를 함께 준다.
- 전 업종 업체(`businesses`)의 `url`은 결과들이 공유하는 `/vendors/k/…` 디렉터리 주소라 전화번호·상세 주소가 없다. 연락처 확인용으로 열지 않고 지어내지도 않는다. 업체가 직접 올린 등록 정보가 있을 수 있는 곳은 조달 업체 카드(`/vendors/c/<카드 id>/`, `ai_md`)뿐이다.
- 입찰 결과의 `url`은 공고를 낸 공식 시스템 주소지만 국방전자조달(`www.d2b.go.kr`)·LH처럼 포털 첫 화면이나 목록일 수 있다. 그때는 정확한 공고명(`name`)을 함께 주고, 공고구분·개찰일·G2B 공고번호 같은 상세 조건은 `d2b-notice-search`로 넘긴다. 입찰 공고 마감일은 KST 기준으로 판정하고, 입찰 참가는 공식 시스템에서 사용자가 직접 한다.
- 입찰 질의에는 주제·품명 낱말을 반드시 넣는다(`q`는 최대 60자). `나라장터 입찰`처럼 포털 이름만 넣으면 `parsed.words`가 null이 되어 필터 없이 8,000건대 전체가 나오므로, 품명·주제를 되물어 받는다.
- 0건이면 `suggest`·`suggest_for`로 후보를 구분한다. `region`이면 지역을 임의로 고르지 말고 사용자에게 되묻고, `name`·`example` 후보나 예시 질의로는 다시 부르지 않는다. `suggest[].url`에는 `format=json`이 없고 `all_regions`·`category`는 HTML 디렉터리라서, 파생 재검색은 사용자 질의 기반 `/search/?q=…&format=json`으로 한 번만 한다.

## 범위 경계

- 영업/폐업 확인은 `localdata-business-status`·`nts-business-registration`, 사업자번호 실사는 `biz-health-check`
- 국방전자조달 상세 조건 검색은 `d2b-notice-search`, 학교장터(S2B)는 `s2b-notice-search`(보임에 없음), 발주계획은 `g2b-order-plan-search`
- 보임 이용약관(https://boim.io/terms/)은 자동화 도구로 대량·반복 수집하거나 재배포하는 일을 허락 없이 할 수 없게 한다. 질문당 필요한 만큼만 부른다.

## 실패 모드

- 429·403: 너무 자주 불렀다 — 잠시 뒤 한 번만 재시도
- 0건: `suggest_for`가 `region`·`categories`면 후보를 사용자에게 보여 주고 고른 것만 쓰며(지역은 되묻기), `name`·`example` 후보로는 다시 부르지 않는다 — 파생 재검색은 사용자 질의 기반으로 한 번만, `format=json`을 붙여서
- `unavailable`: 해당 구역만 일시 장애 — 받은 구역만 답한다
- 5xx·JSON 아님: 보임 일시 장애 — https://boim.io/status/

## 공식 출처

- 검색 주소: `https://boim.io/search/?q=<질의>&format=json` (설명서 https://boim.io/openapi.json)
- 업체 카드 요약: `https://boim.io/vendors/c/<카드 id>/ai.md`
- 같은 데이터의 MCP 서버: `https://boim.io/api/mcp` (Streamable HTTP, 읽기 전용)
- 운영: ㈜퍼블릭아이디(Public identity Co., Ltd.). 데이터는 공공데이터포털의 이용허락 범위 제한 없는 공공 데이터다.
