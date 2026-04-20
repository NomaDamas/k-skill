# 설치 방법

## 기본 설치 흐름

권장 순서는 아래와 같다.

1. `k-skill` 전체 스킬을 먼저 설치한다.
2. 설치가 끝나면 `k-skill-setup` 스킬을 사용해 공통 설정을 마친다.
3. 그 다음 필요한 기능 스킬을 호출한다.

인증이 필요한 기능만 따로 설치 흐름을 분기하지 않는다. 일단 전체 스킬을 설치해 두고, 실제 시크릿/환경 준비는 `k-skill-setup` 에 맡기는 것을 기본으로 한다.

## 에이전트에게 맡기기

Codex나 Claude Code에 아래 문장을 그대로 붙여 넣으면 된다.

```text
이 레포의 설치 문서를 읽고 k-skill 전체 스킬을 먼저 설치해줘. 설치가 끝나면 k-skill-setup 스킬을 사용해서 credential 확보와 환경변수 확인까지 이어서 진행해줘. 끝나면 설치된 스킬과 다음 단계만 짧게 정리해.
```

## 직접 설치

`skills` 설치 명령은 아래 셋 중 하나만 있으면 된다.

```bash
npx --yes skills add <owner/repo> --list
pnpm dlx skills add <owner/repo> --list
bunx skills add <owner/repo> --list
```

권장: 전체 스킬 먼저 설치

```bash
npx --yes skills add <owner/repo> --all -g
```

설치 후 `k-skill-setup` 을 호출해 공통 설정을 진행한다.

```text
k-skill-setup 스킬을 사용해서 공통 설정을 진행해줘.
```

선택 설치가 꼭 필요할 때만(예: 조회형만 먼저 테스트):

```bash
npx --yes skills add <owner/repo> \
  --skill hwp \
  --skill kbo-results \
  --skill kbl-results \
  --skill kleague-results \
  --skill lck-analytics \
  --skill toss-securities \
  --skill hipass-receipt \
  --skill lotto-results \
  --skill kakaotalk-mac \
  --skill korean-law-search \
  --skill korean-privacy-terms \
  --skill real-estate-search \
  --skill korean-scholarship-search \
  --skill korean-stock-search \
  --skill household-waste-info \
  --skill mfds-drug-safety \
  --skill mfds-food-safety \
  --skill joseon-sillok-search \
  --skill korean-patent-search \
  --skill korea-weather \
  --skill cheap-gas-nearby \
  --skill public-restroom-nearby \
  --skill fine-dust-location \
  --skill han-river-water-level \
  --skill subway-lost-property \
  --skill geeknews-search \
  --skill daiso-product-search \
  --skill market-kurly-search \
  --skill olive-young-search \
  --skill hola-poke-yeoksam \
  --skill blue-ribbon-nearby \
  --skill kakao-bar-nearby \
  --skill zipcode-search \
  --skill delivery-tracking \
  --skill coupang-product-search \
  --skill bunjang-search \
  --skill used-car-price-search \
  --skill korean-spell-check \
  --skill library-book-search \
  --skill k-schoollunch-menu \
  --skill korean-character-count
```

인증이 필요한 기능만 부분 설치할 때도 `k-skill-setup` 은 같이 넣는다.

```bash
npx --yes skills add <owner/repo> \
  --skill k-skill-setup \
  --skill srt-booking \
  --skill ktx-booking \
  --skill korean-law-search \
  --skill real-estate-search \
  --skill mfds-drug-safety \
  --skill mfds-food-safety \
  --skill cheap-gas-nearby \
  --skill joseon-sillok-search \
  --skill korean-patent-search \
  --skill hipass-receipt \
  --skill seoul-subway-arrival \
  --skill subway-lost-property \
  --skill geeknews-search \
  --skill korea-weather \
  --skill fine-dust-location
```

`korean-law-search` 는 skill 설치 후 upstream CLI/MCP도 준비해야 한다.

- 로컬 CLI/MCP 경로는 `LAW_OC` 를 채운다.
- remote endpoint는 `LAW_OC` 없이 `url`만 등록한다.
- 기존 `korean-law-mcp` 경로가 실패하면 `법망`(`https://api.beopmang.org`) fallback을 사용한다.

```bash
npm install -g korean-law-mcp
export LAW_OC=your-api-key
korean-law list
```

로컬 설치가 막히면 `https://korean-law-mcp.fly.dev/mcp` remote endpoint를 MCP 클라이언트에 등록한다. 그 경로도 응답하지 않거나 서비스 장애가 나면 `https://api.beopmang.org/mcp` 또는 `https://api.beopmang.org/api/v4/law?action=search` 를 fallback으로 사용한다.

`real-estate-search` 는 별도 설치 없이 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 통해 바로 사용할 수 있다. 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다. 원본 참고: `https://github.com/tae0y/real-estate-mcp/tree/main`. 자세한 사용법은 [한국 부동산 실거래가 조회 가이드](features/real-estate-search.md)를 본다.

`korean-scholarship-search` 는 스킬 이름 `장학금 검색 및 조회` 로 동작한다. 별도 API key 없이 최신 웹 검색과 공식 공고 확인으로 장학금을 찾고, 한국장학재단·전국 대학교 본부·단과대·학과·재단·기업·공공기관 공고를 모아 금액/지원자격/지원구간/공식 링크를 정리한다. 설치된 helper `python3 scripts/scholarship_filter.py` 로 사용자 조건 필터링, KST(`Asia/Seoul`) 현재 날짜 기준 마감 상태 분류, readable report, 지원 가능 여부 확인을 할 수 있고, `python3 scripts/university_search_plan.py` 로 학교별 또는 전국 대학 검색 쿼리 팩을 만들 수 있다. 자세한 사용법은 [장학금 검색 및 조회 가이드](features/korean-scholarship-search.md)를 본다.

`korean-stock-search` 는 별도 설치 없이 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 통해 바로 사용할 수 있다. 사용자 쪽 `KRX_API_KEY` 가 불필요하다. 원본 참고: `https://github.com/jjlabsio/korea-stock-mcp`. 자세한 사용법은 [한국 주식 정보 조회 가이드](features/korean-stock-search.md)를 본다.

`household-waste-info` 는 별도 설치 없이 `k-skill-proxy`의 `/v1/household-waste/info` 라우트를 호출하고, `serviceKey`(`DATA_GO_KR_API_KEY`)는 proxy 서버에서만 원본 API(`apis.data.go.kr/1741000/household_waste_info/info`)로 주입한다. 사용자 쪽 `DATA_GO_KR_API_KEY` 가 불필요하다. 자세한 사용법은 [생활쓰레기 배출정보 조회 가이드](features/household-waste-info.md)를 본다.

`library-book-search` 는 별도 설치 없이 기본 hosted proxy(`k-skill-proxy.nomadamas.org`)를 통해 바로 사용할 수 있다. 사용자 쪽 `DATA4LIBRARY_AUTH_KEY` 는 불필요하고, self-host proxy 운영자만 프록시 서버 환경변수로 설정한다. 자세한 사용법은 [도서관 도서 조회 가이드](features/library-book-search.md)를 본다.

### `korean-stock-search` proxy quickstart

`korean-stock-search` 는 로컬 MCP 설치 대신 **proxy first** 로 사용한다.

- 가장 빠른 smoke test 는 `curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/search' --data-urlencode 'q=삼성전자' --data-urlencode 'bas_dd=20260408'`
- 검색 결과에서 `market`, `code` 를 확인한 뒤 `base-info` 또는 `trade-info` 로 이어간다.
- 사용자 쪽 `KRX_API_KEY` 는 필요 없다. self-host proxy 운영자만 서버 환경변수 `KRX_API_KEY` 를 설정한다.

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/search' \
  --data-urlencode 'q=삼성전자' \
  --data-urlencode 'bas_dd=20260408'

curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-stock/base-info' \
  --data-urlencode 'market=KOSPI' \
  --data-urlencode 'code=005930' \
  --data-urlencode 'bas_dd=20260408'
```


### `olive-young-search` upstream CLI quickstart

`olive-young-search` 는 upstream 원본 [`hmmhmmhm/daiso-mcp`](https://github.com/hmmhmmhm/daiso-mcp) / npm package [`daiso`](https://www.npmjs.com/package/daiso) 를 그대로 사용한다.

- 기본 경로는 **MCP 서버 직접 설치가 아니라 CLI first** 다.
- 가장 빠른 smoke test 는 `npx --yes daiso health`
- 재고/매장/상품 조회는 `npx --yes daiso get /api/oliveyoung/...`
- public endpoint는 upstream 수집 상태에 따라 간헐적인 `5xx/503` 이 날 수 있으니 먼저 한두 번 재시도한다.
- 반복 사용이면 `npm install -g daiso`
- 재시도 후에도 불안정하거나 버전 고정/원본 확인이 필요하면 `git clone https://github.com/hmmhmmhm/daiso-mcp.git && cd daiso-mcp && npm install && npm run build` clone fallback으로 전환한 뒤 `node dist/bin.js ...` 로 실행한다. clone checkout 안에서 `npx daiso ...` 는 `Permission denied` 로 실패할 수 있다.

```bash
npx --yes daiso health
npx --yes daiso get /api/oliveyoung/stores --keyword 명동 --limit 5 --json
npx --yes daiso get /api/oliveyoung/products --keyword 선크림 --size 5 --json
npx --yes daiso get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --size 5 --json
```

clone fallback 예시:

```bash
git clone https://github.com/hmmhmmhm/daiso-mcp.git
cd daiso-mcp
npm install
npm run build
node dist/bin.js health
node dist/bin.js get /api/oliveyoung/stores --keyword 명동 --limit 5 --json
node dist/bin.js get /api/oliveyoung/products --keyword 선크림 --size 5 --json
node dist/bin.js get /api/oliveyoung/inventory --keyword 선크림 --storeKeyword 명동 --size 5 --json
```

### `bunjang-search` upstream CLI quickstart

`bunjang-search` 는 upstream 원본 [`pinion05/bunjangcli`](https://github.com/pinion05/bunjangcli) / npm package [`bunjang-cli`](https://www.npmjs.com/package/bunjang-cli) 를 그대로 사용한다.

- 기본 경로는 **CLI first** 다.
- 가장 빠른 smoke test 는 `npx --yes bunjang-cli --help`
- 검색/상세조회는 로그인 없이도 먼저 검증할 수 있다.
- `favorite` / `chat` / `purchase` 는 로그인 세션이 필요하므로 **선택적 로그인 플로우**로만 안내한다.
- `auth login` 은 headful 브라우저 + TTY(interactive 터미널) 가 필요하다.
- 대량 수집은 `--start-page`, `--pages`, `--max-items`, `--with-detail`, `--output` 조합을 우선 쓴다.
- AI 분석용 chunk 는 `--ai --output <directory>` 로 만든다.

```bash
npx --yes bunjang-cli --help
npx --yes bunjang-cli --json auth status
npx --yes bunjang-cli --json search "아이폰" --max-items 3 --sort date
npx --yes bunjang-cli --json item get 354957625
npx --yes bunjang-cli search "아이폰" --start-page 1 --pages 2 --max-items 20 --with-detail --output artifacts/bunjang-iphone.json
npx --yes bunjang-cli search "아이폰" --start-page 1 --pages 2 --max-items 20 --with-detail --ai --output artifacts/bunjang-iphone-ai
```

로그인된 interactive 세션에서만 아래 액션을 진행한다.

```bash
npx --yes bunjang-cli auth login
npx --yes bunjang-cli --json favorite list
npx --yes bunjang-cli --json favorite add 354957625
npx --yes bunjang-cli --json favorite remove 354957625
npx --yes bunjang-cli --json chat list
npx --yes bunjang-cli --json chat start 354957625 --message "안녕하세요"
npx --yes bunjang-cli --json chat send 84191651 --message "상품 상태 괜찮을까요?"
```


`korean-patent-search` 는 설치된 skill payload 안의 helper를 그대로 쓴다.

- helper 환경변수는 `KIPRIS_PLUS_API_KEY`
- 실제 API 요청에서는 이 값을 `ServiceKey` 쿼리 파라미터로 보낸다
- 공공데이터포털에서 복사한 percent-encoded key를 그대로 넣어도 helper가 한 번 정규화해서 double-encoding 없이 보낸다
- KIPRIS Plus / 공공데이터포털 안내 기준으로 개발계정은 자동승인, 운영계정은 심의승인 대상이다

```bash
export KIPRIS_PLUS_API_KEY=your-service-key
python3 scripts/patent_search.py --query "배터리" --year 2024 --num-rows 5
python3 scripts/patent_search.py --application-number 1020240001234
```

로컬 저장소에서 바로 전체 설치 테스트:

```bash
npx --yes skills add . --all -g
```

## 로컬 테스트

현재 디렉터리에서 바로 확인:

```bash
npx --yes skills add . --list
```

설치 반영 확인:

```bash
npx --yes skills ls -g
```

유지보수자가 패키지/릴리스 설정까지 같이 검증하려면:

```bash
npm install
npm run ci
```

## 패키지가 없을 때의 기본 동작

스킬 실행에 필요한 Node/Python 패키지가 없으면 다른 방법으로 우회하지 말고 전역 설치를 먼저 시도하는 것을 기본으로 합니다.

### Node 패키지

```bash
npm install -g kordoc pdfjs-dist kbo-game kbl-results kleague-results lck-analytics toss-securities hipass-receipt k-lotto coupang-product-search used-car-price-search cheap-gas-nearby public-restroom-nearby korean-law-mcp market-kurly-search daiso bunjang-cli
export NODE_PATH="$(npm root -g)"
```

HWP Node API 예시는 전역 `NODE_PATH` 대신 로컬 프로젝트에 `npm install kordoc pdfjs-dist` 후 실행한다.
`kordoc` CLI를 일회성으로만 쓸 때는 `npx --yes --package kordoc --package pdfjs-dist kordoc ...` 형태를 사용한다.

### macOS 바이너리

카카오톡 Mac CLI는 npm 패키지가 아니라 Homebrew tap 설치를 사용한다.

```bash
brew install silver-flight-group/tap/kakaocli
brew tap JungHoonGhae/tossinvest-cli
brew install tossctl
```

### Python 패키지

```bash
python3 -m pip install SRTrain korail2 pycryptodome
```

조선왕조실록 검색 helper는 설치된 `joseon-sillok-search` skill 안의 `scripts/sillok_search.py` 를 그대로 쓰면 되고, 별도 외부 패키지 없이 표준 라이브러리 `python3` 만 있으면 된다.

```bash
python3 scripts/sillok_search.py --query "훈민정음" --king 세종 --year 1443
```

한국 특허 정보 검색 helper는 설치된 `korean-patent-search` skill 안의 `scripts/patent_search.py` 를 그대로 쓰면 되고, 별도 외부 패키지 없이 표준 라이브러리 `python3` 만 있으면 된다.

```bash
export KIPRIS_PLUS_API_KEY=your-service-key
python3 scripts/patent_search.py --query "배터리"
```

장학금 검색 및 조회 helper는 설치된 `korean-scholarship-search` skill 안의 `scripts/scholarship_filter.py` 를 그대로 쓰면 되고, 별도 외부 패키지 없이 표준 라이브러리 `python3` 만 있으면 된다. `--today` 를 생략하거나 잘못 넣으면 host local time 이 아니라 KST 오늘 날짜를 기준으로 마감 상태를 계산한다.

```bash
python3 scripts/scholarship_filter.py report --input scholarships.json --today 2026-04-14 --only-open-now
```

한국어 맞춤법 검사 helper는 별도 외부 패키지 없이 표준 라이브러리 `python3` 만 있으면 된다.

```bash
python3 scripts/korean_spell_check.py --text "아버지가방에들어가신다."
```

한국어 글자 수 세기 helper는 별도 외부 패키지 없이 `node` 18+ 만 있으면 된다.

```bash
node scripts/korean_character_count.js --text "가나다"
node scripts/korean_character_count.js --text $'첫 줄\n둘째 줄🙂' --profile neis --format text
```

운영체제 정책이나 권한 때문에 전역 설치가 막히면, 임의의 대체 구현으로 넘어가지 말고 그 차단 사유를 사용자에게 설명한 뒤 다음 설치 단계를 정합니다.

## npx도 없으면

`npx`, `pnpm dlx`, `bunx` 중 아무것도 없으면 먼저 Node.js 계열 런타임을 설치해야 한다.

- `npx`를 쓰려면 Node.js + npm
- `pnpm dlx`를 쓰려면 pnpm
- `bunx`를 쓰려면 Bun

## setup이 필요한 기능

먼저 `k-skill-setup`을 따라야 하는 스킬:

- `srt-booking`
- `ktx-booking`
- `seoul-subway-arrival`
- `korea-weather`
- `fine-dust-location`
- `korean-law-search`
- `real-estate-search`
- `korean-patent-search`
- `hipass-receipt`
- `korean-stock-search`
- `household-waste-info`
- `cheap-gas-nearby`
- `public-restroom-nearby`
- `k-schoollunch-menu` (hosted proxy에 `KEDU_INFO_KEY`가 배포된 경우 사용자 시크릿 불필요)
- `library-book-search` (hosted proxy에 `DATA4LIBRARY_AUTH_KEY`가 배포된 경우 사용자 시크릿 불필요)

관련 문서:

- [공통 설정 가이드](setup.md)
- [보안/시크릿 정책](security-and-secrets.md)
