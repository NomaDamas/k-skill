# 지방선거 후보자 조회 가이드

`local-election-candidate-search`는 중앙선거관리위원회 선거통계시스템(`info.nec.go.kr`)의 공개 **통합검색** HTML 표면을 직접 조회하는 read-only 스킬이다. upstream이 인증/키 없이 열려 있는 공개 표면이므로 `k-skill-proxy`를 사용하지 않는다.

## 공개 접근 경로

- 진입점: `https://info.nec.go.kr/search/searchCandidate.xhtml`
- 방식: `POST searchKeyword=<정확한 후보자 성명>`
- 기본 정책: 지방선거 관련 선거코드만 반환
  - `3` 시·도지사선거
  - `4` 구·시·군의 장선거
  - `5` 시·도의회의원선거
  - `6` 구·시·군의회의원선거
  - `8` 광역의원비례대표선거
  - `9` 기초의원비례대표선거
  - `11` 교육감선거

이 경로는 NEC 화면에 공개된 후보자 성명 기반 통합검색이며, 선거별 메뉴에서 모든 시도/구시군/선거구 조합을 먼저 선택하는 방식보다 조회 진입점이 좁고 안정적이다.

## CLI 사용

```bash
node packages/local-election-candidate-search/src/cli.js 오세훈 --election 시도지사 --region 서울 --limit 5
node packages/local-election-candidate-search/src/cli.js 김동연 --date 2014 --election 기초의원 --region 동작
node packages/local-election-candidate-search/src/cli.js 이재명 --all --limit 20
```

패키지 설치 후에는 bin 이름을 사용할 수 있다.

```bash
local-election-candidate-search 오세훈 --election 시도지사 --region 서울
```

## Node API

```js
const { searchCandidates } = require("local-election-candidate-search")

const result = await searchCandidates({
  name: "오세훈",
  election: "시도지사",
  region: "서울",
  limit: 5
})
```

## 출력 필드

반환 JSON의 `items[]`에는 upstream HTML에 있는 범위에서 다음 필드가 포함된다.

- `name`, `hanja`, `birth_date`, `gender`
- `election_date`, `election_name`, `election_code`, `election_type`
- `party`, `district`, `votes`, `vote_share`, `elected`
- `job`, `education`, `career[]`
- `city_code`, `sgg_city_code`, `town_code`

## 실패 모드와 주의사항

- NEC 통합검색은 정확한 후보자명을 기준으로 동작하므로 동명이인이 나올 수 있다. 결과를 보여줄 때는 선거일·선거종류·지역을 함께 표시한다.
- 사용자가 범위를 좁히면 `--election`, `--date`, `--region` 필터를 적용한다.
- `--all`을 주지 않으면 지방선거 관련 선거코드만 반환한다.
- 빈 결과, NetFunnel 대기열, 점검/로그인/차단 페이지, upstream HTML 변경은 `warnings[]`에 명시한다.
- 로그인, CAPTCHA, 후보 등록/신고, 파일 다운로드, 정치 자금/선거 사무 자동화는 하지 않는다.
