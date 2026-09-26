# e뮤지엄 소장품 검색 / eMuseum Collection Search

`emuseum-collection-search`는 Search National Museum of Korea e뮤지엄 OpenAPI collection (소장품) metadata by object name, era, and owning museum, returning description, museum, image URL, and management number. Read-only research lookup with a user BYOK key or a proxy-routed base URL하는 스킬이다.

국립중앙박물관이 운영하는 **e뮤지엄 OpenAPI**에서 전국 박물관 소장품(유물) 메타데이터를
조회한다. 소장품명·시대·소장기관 키워드로 검색하고, 각 항목의 유물 설명, 소장기관,
이미지 URL, 관리번호, 상세 링크를 요약한다.

- 교육·리서치용 **read-only 조회 전용**이다. 대출, 열람 신청, 예약, 결제, 이미지
  대량 다운로드 같은 부작용은 수행하지 않는다.
- 공개 OpenAPI 응답만 근거로 쓴다. 소장품의 현재 전시 여부나 실물 상태를 추정하지 않는다.
- `joseon-sillok-search`(조선왕조실록 원문), `library-book-search`(도서관 장서)와
  대상이 다르다. 이 스킬은 **박물관 소장 유물 메타데이터**만 다룬다.

## 사용 예시

```bash
npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- search --query "청자" --limit 5
npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- search --era "고려" --museum "국립중앙박물관" --limit 10
npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- search --query "백자" --page 2 --limit 20 --json
```

## 실패 모드

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

## 참고

- 스킬 정의: `npx -y @nomadamas/k-skill@0 instruct emuseum-collection-search`
- CLI: `npx -y @nomadamas/k-skill@0 exec emuseum-collection-search scripts/emuseum_collection_search.py -- --help`
