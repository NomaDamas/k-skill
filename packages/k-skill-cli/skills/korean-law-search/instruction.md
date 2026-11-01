# Korean Law Search

## What this skill does

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/korean-law/...` 로 요청해서 한국 법령/조문/판례/유권해석/자치법규를 조회한다. 법제처(국가법령정보센터) 공식 Open API(`open.law.go.kr` 의 DRF `lawSearch.do`/`lawService.do`)를 기반으로 하며, 설계는 `chrisryugj/korean-law-mcp` 의 read-only 도구 표면을 참고했다.

사용자는 별도 API key(`LAW_OC`)나 로컬 CLI 설치가 필요 없다. `LAW_OC` 와 브라우저 User-Agent/Referer 주입은 proxy 서버에서만 처리한다.

- 검색/목록: `GET /v1/korean-law/search`
- 본문/상세: `GET /v1/korean-law/detail`
- 신･구조문대비표 작성: `scripts/amendment_table.js` (현행 조문은 위 `search`/`detail` 로 자동 조회, 한글 `.hwpx` 저장)

## When to use

- "산업안전보건법 찾아줘"
- "관세법 제38조 보여줘"
- "부당해고 판례 찾아줘"
- "개인정보보호법 시행령 조문 확인해줘"
- "한국 법령/판례/자치법규 검색해줘"
- "건축법 제22조 개정안 신구조문대비표 만들어줘"
- "이 개정안으로 신구조문대비표 한글 파일로 저장해줘"

## When not to use

- 미국/일본/EU 등 비한국 법령 검색
- 실제 법률 자문·소송 전략을 단정적으로 제공해야 하는 경우
- 법령 원문이 아니라 일반 상식 설명만 필요한 경우

## Prerequisites

없음. 사용자는 별도 API key를 준비할 필요가 없다. upstream `LAW_OC` 는 proxy 서버에서만 주입한다.

## Default path

추가 client API 레이어는 불필요하다. 그냥 프록시 서버에 HTTP 요청만 넣으면 된다.

`KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을 사용하고, 없으면 기본 경로 `https://k-skill-proxy.nomadamas.org` 를 사용한다.

## Supported endpoints

### 검색/목록 조회

```
GET /v1/korean-law/search?target={target}&query={검색어}
```

`target` 은 read-only 법령정보 종류다.

| target | 설명 |
|---|---|
| `law` | 현행법령 |
| `eflaw` | 시행일 법령 |
| `elaw` | 영문법령 |
| `prec` | 판례 |
| `detc` | 헌재결정례 |
| `expc` | 법령해석례(유권해석) |
| `admrul` | 행정규칙 |
| `ordin` | 자치법규 |
| `trty` | 조약 |
| `lstrm` | 법령용어 |

지원 필터: `query`(검색어), `display`, `page`, `sort`, `date`, `prncYd`(선고일자), `nb`(사건번호), `datSrcNm`(데이터출처명), `curt`(법원), `org`, `knd`, `gana`, `nw`, `efYd`, `ancYd`. 응답은 법제처 DRF JSON 그대로에 `proxy` 메타데이터만 덧붙인다. 요약 전에 반환 메타데이터를 먼저 확인한다.

### 본문/상세 조회

```
GET /v1/korean-law/detail?target={target}&ID={일련번호}
```

검색 결과의 식별자(`ID` 또는 `MST`/`LID`)를 넘겨 상세 본문을 가져온다. 조문 지정은 `JO`(예: `000200` = 제2조), 언어는 `LANG` 로 넘긴다.

## Example requests

법령명 검색:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-law/search' \
  --data-urlencode 'target=law' \
  --data-urlencode 'query=관세법'
```

판례 검색:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-law/search' \
  --data-urlencode 'target=prec' \
  --data-urlencode 'query=부당해고'
```

판례 본문 조회:

```bash
curl -fsS --get 'https://k-skill-proxy.nomadamas.org/v1/korean-law/detail' \
  --data-urlencode 'target=prec' \
  --data-urlencode 'ID=228541'
```

## Response policy

- 한국 법령 관련 요청은 이 proxy endpoint로 처리한다. 별도 크롤러나 검색엔진 우회로 넘어가지 않는다.
- 약칭(`화관법`)이면 `target=law` 로 정식 법령명을 먼저 확인한다.
- 조문 요청이면 검색 결과의 식별자(`MST`/`ID`)를 확인한 뒤 `detail` 로 본문을 가져온다.
- 판례는 `target=prec`, 유권해석은 `target=expc`, 자치법규는 `target=ordin` 로 조회한다.
- 판례 본문이 필요하면 검색 결과의 판례 일련번호를 `detail?target=prec&ID=...` 로 이어서 조회한다.
- 검색 결과가 0건이어도 "관련 규범이 없다"고 단정하지 말고 검색어·법원·사건번호·선고일자·출처명을 바꿔 다시 시도한다.
- 일부 출처는 본문을 제공하지 않을 수 있다. 본문을 못 가져오면 목록 메타데이터(사건번호·법원·선고일자·출처·요지)까지만 제공하고 본문이 없다는 점을 명시한다(없는 본문을 지어내지 않는다).
- 법적 판단이 필요한 경우 `검색 결과 요약`과 `원문 출처`까지만 제공하고 법률 자문처럼 단정하지 않는다.

## 신･구조문대비표 작성

개정할 조문만 주면 현행 조문을 법제처에서 가져와 대조한 **신･구조문대비표 초안**을 만든다. 바뀐 부분은 밑줄(채팅 표에서는 굵은 글씨), 개정안 칸의 같은 부분은 `----`, 바뀌지 않은 항·호는 현행 칸 `(생  략)` / 개정안 칸 `(현행과 같음)`, 신설·삭제는 `<신  설>` / `<삭  제>` 로 적는다. 표기 규칙은 법제처 신구법비교 원문을 따른다.

1. 법령명과 개정할 조문을 확인한다. 사용자가 **개정 후 조문 전문**을 주지 않았으면 `detail` 로 현행 조문을 읽고, 사용자가 말한 개정 내용만 반영해 개정 후 조문 전문을 쓴다. 사용자가 말하지 않은 내용은 바꾸지 않는다.
2. 아래 JSON 을 파일(또는 stdin)로 만든다.

   ```json
   {
     "lawName": "건축법",
     "title": "건축법 일부개정법률안",
     "amendments": [
       { "jo": "제22조", "text": "제22조(건축물의 사용승인) ① …개정 후 모습 그대로…\n② ∼ ⑥ (현행과 같음)" }
     ]
   }
   ```

   - `text`: 개정 후 모습 그대로 조 머리·항·호·목을 한 줄에 한 단위로 쓴다. 바뀌지 않는 항·호는 그대로 적거나 `② ∼ ⑤ (현행과 같음)` · `1.·2. (현행과 같음)` 으로 줄여 쓴다. **적지 않은 현행 항·호는 삭제로 본다.** 지우는 항·호는 `③ 삭제`, 조 전체 삭제는 `제5조 삭제`.
   - `jo`: 생략하면 `text` 첫머리의 조 번호를 쓴다. 한 번에 30개 조문까지, 같은 조는 한 번만 넣는다.
   - `lawName`(정확한 법령명) 또는 `mst`/`lawId`. 조례·행정규칙처럼 자동 조회가 안 되는 현행은 조문마다 `currentText` 에 현행 원문을 직접 넣는다(신설 조는 빈 문자열). 모든 조문에 `currentText` 가 있으면 법령을 조회하지 않는다.
3. 실행한다. 한글 파일이 필요하면 `--output` 에 `.hwpx` 경로를 준다(`~/` 는 홈 디렉터리). 한글 파일은 사용자가 달라고 했을 때만 만든다.

   ```bash
   npx -y @nomadamas/k-skill@0 exec korean-law-search scripts/amendment_table.js -- --input amendment.json --output ~/Desktop/건축법_신구조문대비표.hwpx
   ```

4. stdout 의 표와 `확인할 점` 을 그대로 사용자에게 보여 준다. `.hwpx` 를 저장했으면 저장 경로를 알린다. 표는 직접 고쳐 쓰지 않는다(`----` 개수·밑줄이 틀어진다) — 고칠 곳이 있으면 JSON 을 고쳐 다시 실행한다.
5. 결과는 **초안**이다. 공포·제출 전에 법제처 원문과 대조해 검수해야 한다고 알린다.

## Failure modes

- `target` 이 없거나 허용되지 않은 값이면 400 응답
- 검색어/식별자가 없으면 400 응답
- 프록시 서버에 `LAW_OC` 가 없으면 503 응답
- 법제처 API가 사용자 검증 실패(`사용자 정보 검증 실패`)를 반환하면 502 + `law_user_verification_failed` (서버 OC/UA/Referer 점검)
- 법제처 API가 일시적으로 빈/HTML 응답이면 proxy가 재시도 후 502 + `upstream_unstable`
- 대비표 `[NOT_FOUND] 법령명이 정확히 같은 법령을 찾지 못했습니다` → 검색 후보를 보여 주고 정확한 법령명을 다시 받거나 `currentText` 를 쓴다. 부분 일치(예: 「민법」→「난민법」)로 넘어가지 않는다.
- 대비표 `[UPSTREAM]` (proxy 연결 실패·법제처 점검) → 잠시 뒤 다시 실행한다. 표를 손으로 만들어 대신하지 않는다.
- 대비표 `[INVALID_PARAM]` (JSON 형식·`.hwpx` 확장자·중복 조문·31개 이상) → 메시지대로 JSON 을 고쳐 다시 실행한다.
- 대비표 `[NO_CHANGE]` → 개정안이 현행과 모두 같다는 뜻이다. 입력한 개정 내용을 사용자와 확인한다.

## Done when

- 한국 법령 관련 질의를 proxy endpoint로 라우팅했다.
- 법령/조문은 `target=law` + 필요 시 `detail`, 판례는 `target=prec`, 유권해석은 `target=expc`, 자치법규는 `target=ordin` 로 맞는 종류를 조회했다.
- 판례/조문 본문이 필요하면 식별자로 `detail` 본문까지 연결했다.
- 결과를 요약하고 원문 출처(법제처 국가법령정보센터)를 함께 남겼다.
- 신･구조문대비표 요청이면 `scripts/amendment_table.js` 결과(표·`확인할 점`)를 그대로 전달했고, 한글 파일을 요청받았다면 저장 경로를 알렸으며, 초안이라 검수가 필요하다고 안내했다.

## Notes

- 설계 참고(upstream): `https://github.com/chrisryugj/korean-law-mcp`
- official data source: 법제처 Open API (`https://open.law.go.kr`, DRF `lawSearch.do`/`lawService.do`)
- 운영자(proxy) 전용 시크릿: `LAW_OC` (사용자는 불필요). 무료 발급: `https://open.law.go.kr`
- 신･구조문대비표 엔진(`scripts/amendment/`)은 `chrisryugj/korean-law-mcp`(MIT)의 `amendment_table` 을 이식했다. 현행 조문 조회만 사용자 키가 필요 없는 k-skill-proxy 호출로 바꿨고, 라이선스 전문은 `scripts/amendment/LICENSE-korean-law-mcp` 에 둔다.
- 이 저장소 안에는 한국 법령 전용 npm package나 python package를 추가하지 않는다.
