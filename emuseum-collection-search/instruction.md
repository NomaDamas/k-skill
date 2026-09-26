# e뮤지엄 소장품 검색 / eMuseum Collection Search

## What this skill does

국립중앙박물관이 운영하는 **e뮤지엄 OpenAPI**에서 전국 박물관 소장품(유물) 메타데이터를
조회한다. 소장품명·시대·소장기관 키워드로 검색하고, 각 항목의 유물 설명, 소장기관,
이미지 URL, 관리번호, 상세 링크를 요약한다.

- 교육·리서치용 **read-only 조회 전용**이다. 대출, 열람 신청, 예약, 결제, 이미지
  대량 다운로드 같은 부작용은 수행하지 않는다.
- 공개 OpenAPI 응답만 근거로 쓴다. 소장품의 현재 전시 여부나 실물 상태를 추정하지 않는다.
- `joseon-sillok-search`(조선왕조실록 원문), `library-book-search`(도서관 장서)와
  대상이 다르다. 이 스킬은 **박물관 소장 유물 메타데이터**만 다룬다.

## When to use

- "청자 관련 소장품 찾아줘"
- "고려시대 유물을 국립중앙박물관 기준으로 검색해줘"
- "이 유물 설명이랑 관리번호 알려줘"
- "조선 백자 소장품 목록과 이미지 링크 정리해줘"
- "국립중앙박물관 소장품 검색" / "e뮤지엄에서 유물 찾아줘"

## When not to use

- 전시 관람 예약, 교육 프로그램 신청, 유물 대여·열람 신청 (이 스킬은 조회만 한다)
- 실물 상태, 현재 전시 위치, 입장료, 운영시간 확정
- 조선왕조실록 원문 검색(`joseon-sillok-search`)이나 도서관 장서 소장 여부(`library-book-search`)

## Official access path

### 선택한 공개 경로

1. **기본 경로(공개 endpoint 우선)**: 사용자가 직접 발급받은 e뮤지엄 OpenAPI 인증키(BYOK)로
   공식 상류를 직접 호출한다.
   - 기본 base URL: `https://www.emuseum.go.kr/openApi`
   - v1 기본 소장품 검색 operation: `/selectRelicList.do`
   - 요청 파라미터: `serviceKey`, `pageNo`, `numOfRows`, 선택 `relicName`, `eraName`, `museumName`
   - 공식 안내: <https://www.emuseum.go.kr/openApi>
2. **프록시 경유(선택)**: 자체/사설 프록시가 이 operation을 중계하도록 구성되어 있으면
   `KSKILL_EMUSEUM_BASE_URL`(또는 `--base-url`)과 `KSKILL_EMUSEUM_SEARCH_PATH`
   (또는 `--search-path`)로 base/path를 바꿔 호출한다. 이때 인증키는 프록시가 보관하므로
   사용자 키는 선택이다. hosted `k-skill-proxy`에는 v1 기준 이 route가 아직 없으므로
   기본값으로 쓰지 않는다.

### 왜 이 경로인가

- e뮤지엄 OpenAPI는 upstream 인증키를 요구하므로 `AGENTS.md`의 free API proxy policy상
  proxy 후보에 해당한다. 다만 오늘 범위에서는 프록시 코드를 수정하지 않으므로, 우선
  사용자가 직접 키를 넣는 BYOK 경로를 기본으로 하고, 프록시 route가 준비되면 base/path
  override만으로 전환할 수 있게 설계했다.
- 화면 스크래핑 대신 문서화된 OpenAPI를 쓴다. HTML 구조 변경에 덜 취약하고, 응답이
  공식 메타데이터라서 설명·관리번호를 그대로 신뢰할 수 있다.
- 응답은 JSON과 XML(data.go.kr 스타일 envelope)을 모두 파싱한다. 포털이 직렬화 형식을
  바꿔도 필드 정규화가 유지된다.

### endpoint 변경 대응

e뮤지엄 OpenAPI 안내 페이지의 operation 이름/파라미터가 바뀌면 코드를 고치지 않고
`--base-url` / `--search-path` (또는 `KSKILL_EMUSEUM_BASE_URL` /
`KSKILL_EMUSEUM_SEARCH_PATH`)로 조정한 뒤, 이 문서의 기본값을 갱신한다.

### fallback 순서

1. 기본값은 공식 상류 + BYOK 직접 호출이다.
2. 키가 없으면 즉시 중단하고 `--dry-run`으로 요청 URL을 확인한 뒤 키 발급 절차를 안내한다.
3. 사설 프록시 route가 설정되어 있으면 그 base/path로 호출하고 키는 선택으로 둔다.
4. 상류 장애·쿼터·파싱 오류가 나면 **다른 데이터셋이나 웹 스크래핑으로 대체하지 않고**
   typed failure를 그대로 보고한다.
5. 빈 결과는 성공(`items: []`)으로 유지하고 소장품명/시대/기관 조건을 바꾸도록 안내한다.

## 키 발급 / 인증

1. e뮤지엄 OpenAPI 페이지(<https://www.emuseum.go.kr/openApi>)에서 **이용신청** 절차를 따른다.
2. 안내에 따라 인증키를 발급받는다. 포털이 공공데이터포털(data.go.kr) 키를 요구하면 그 키를 쓴다.
3. 발급키는 저장소/GitHub Actions에 절대 넣지 않고 다음 중 하나에만 둔다.
   - `KSKILL_EMUSEUM_API_KEY` 환경변수 (호환: `EMUSEUM_API_KEY`)
   - `~/.config/k-skill/secrets.env` (mode `0600`)
4. 돌쇠 런타임에서는 provisioned `vault-run` capability를 우선하고, 값이 없으면
   `request_vault_credential`로 요청한다. 평문 키를 채팅/파일/셸 인자에 출력하지 않는다.

## Credentials

키 해석 순서:

1. `KSKILL_EMUSEUM_API_KEY`
2. `EMUSEUM_API_KEY` (compat)
3. `--secrets-path`(기본 `~/.config/k-skill/secrets.env`)의 같은 이름 변수

프록시 mode(base URL이 기본값과 다름)에서는 키가 없어도 실행된다. `--dry-run`은 키가
없어도 요청 URL을 확인할 수 있게 하며 `serviceKey`를 `REDACTED`로 표시한다.

```bash
npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- search --query "청자" --dry-run
```

## Inputs

- 선택 `--query`: 소장품명 키워드 (`relicName`)
- 선택 `--era`: 시대 키워드 (`eraName`), 예: `고려`, `조선`, `삼국시대`
- 선택 `--museum`: 소장기관 키워드 (`museumName`), 예: `국립중앙박물관`, `국립경주박물관`
- 선택 `--page`: 페이지 번호 (기본 1, 1 이상)
- 선택 `--limit`: 페이지당 결과 수 (기본 10, 1~100)
- 선택 `--json`: 정규화된 JSON payload 출력
- 선택 `--base-url`, `--search-path`, `--secrets-path`, `--timeout`

세 필터는 모두 선택이며 하나 이상 주는 것을 권장한다. 필터 없이 호출하면 상류 기본
목록을 페이지 단위로 반환한다.

## Commands

```bash
npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- search --query "청자" --limit 5
npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- search --era "고려" --museum "국립중앙박물관" --limit 10
npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- search --query "백자" --page 2 --limit 20 --json
```

## Output

기본은 사람이 읽는 요약이다.

```
e뮤지엄 소장품 검색 — 소장품명 "청자" · 시대 고려
총 2건 중 2건 표시
조회 시각: 2026-01-01T00:00:00+00:00
출처: https://www.emuseum.go.kr/openApi/selectRelicList.do

1. 청자 상감운학문 매병
   시대: 고려 · 소장: 국립중앙박물관 · 관리번호: 덕수 1234
   설명: 고려시대 청자 매병이다. ...
   이미지: https://www.emuseum.go.kr/image/1001.jpg
   상세: https://www.emuseum.go.kr/relic/1001
```

`--json`은 다음 구조다.

```json
{
  "total_count": 2,
  "page": 1,
  "page_size": 10,
  "items": [
    {
      "id": "1001",
      "name": "청자 상감운학문 매병",
      "era": "고려",
      "museum": "국립중앙박물관",
      "management_number": "덕수 1234",
      "description": "고려시대 청자 매병이다. ...",
      "image_url": "https://www.emuseum.go.kr/image/1001.jpg",
      "detail_url": "https://www.emuseum.go.kr/relic/1001"
    }
  ],
  "query": {"name": "청자", "era": "고려", "museum": ""},
  "source": {"endpoint": "https://www.emuseum.go.kr/openApi/selectRelicList.do", "url": "...", "fetched_at": "..."}
}
```

`source.url`에는 키가 포함되지 않는다. 응답에 없는 값(설명·이미지·관리번호 등)은 빈
문자열로 두고 추정하지 않는다.

## Done when

- 검색 조건(소장품명/시대/기관, 페이지, 결과 수)이 명시되어 있다.
- 소장품명·시대·소장기관·관리번호·설명·이미지 URL·상세 링크가 공식 응답 기준으로 정리되어 있다.
- 응답에 공식 endpoint와 조회 시각(`fetched_at`)이 포함되어 있다.
- 결과가 없으면 빈 결과임을 명시하고 조건 변경을 안내했다.
- 실패했다면 아래 failure mode 중 하나로 typed failure를 보고했다.

## Failure modes

- **missing key**: `KSKILL_EMUSEUM_API_KEY`/`EMUSEUM_API_KEY`/secrets.env에 키가 없음.
  exit 1 + e뮤지엄 OpenAPI 발급 안내. `--dry-run`으로 URL 확인 가능.
- **invalid input**: `page < 1` 또는 `limit`이 1~100 밖. exit 2 + 검증 메시지.
- **auth failure**: HTTP 401/403 또는 `resultCode` 20/21/30/32. exit 1 + 키/이용신청 상태 안내.
- **quota exceeded**: HTTP 429 또는 `resultCode` 22. exit 1 + 쿼터/재시도 안내.
- **upstream failure**: HTTP 5xx, timeout, network 오류. exit 1 + 재시도 안내. traceback 없음.
- **endpoint moved**: HTTP 404. `--base-url`/`--search-path` 조정 안내.
- **empty/malformed response**: 빈 body, 잘못된 JSON/XML. exit 1 + 파싱 오류 메시지.
- **API error code**: `resultCode` 01/02/04/05/10/11/12/31 등. exit 1 + 코드/메시지.
- **empty result**: 성공이지만 `items: []`. exit 0 + 조건 변경 안내.
- **현재 전시/실물 상태**: 응답에 없다. 추정하지 않고 공식 안내로 넘긴다.

## Notes

- 조회 전용이며 어떤 부작용도 일으키지 않는다. 이미지 대량 다운로드나 systematic/bulk
  crawling을 하지 않는다.
- 소장품 설명·연대·관리번호는 공식 응답 그대로 요약하고, 학술적 감정이나 가치 판단을
  덧붙이지 않는다.
- 응답 필드는 camelCase/snake_case/한글 변형을 정규화하되, 없는 값은 비워 둔다.