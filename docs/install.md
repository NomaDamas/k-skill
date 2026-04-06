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
  --skill kleague-results \
  --skill lck-analytics \
  --skill toss-securities \
  --skill lotto-results \
  --skill kakaotalk-mac \
  --skill korean-law-search \
  --skill real-estate-search \
  --skill joseon-sillok-search \
  --skill cheap-gas-nearby \
  --skill fine-dust-location \
  --skill han-river-water-level \
  --skill daiso-product-search \
  --skill olive-young-search \
  --skill blue-ribbon-nearby \
  --skill kakao-bar-nearby \
  --skill zipcode-search \
  --skill delivery-tracking \
  --skill coupang-product-search \
  --skill used-car-price-search \
  --skill korean-spell-check
```

인증이 필요한 기능만 부분 설치할 때도 `k-skill-setup` 은 같이 넣는다.

```bash
npx --yes skills add <owner/repo> \
  --skill k-skill-setup \
  --skill srt-booking \
  --skill ktx-booking \
  --skill korean-law-search \
  --skill real-estate-search \
  --skill cheap-gas-nearby \
  --skill joseon-sillok-search \
  --skill seoul-subway-arrival \
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
npm install -g @ohah/hwpjs kbo-game kleague-results lck-analytics toss-securities k-lotto coupang-product-search used-car-price-search cheap-gas-nearby korean-law-mcp daiso
export NODE_PATH="$(npm root -g)"
```

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

한국어 맞춤법 검사 helper는 별도 외부 패키지 없이 표준 라이브러리 `python3` 만 있으면 된다.

```bash
python3 scripts/korean_spell_check.py --text "아버지가방에들어가신다."
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
- `fine-dust-location`
- `korean-law-search`
- `real-estate-search`
- `cheap-gas-nearby`

관련 문서:

- [공통 설정 가이드](setup.md)
- [보안/시크릿 정책](security-and-secrets.md)
