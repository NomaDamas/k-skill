# kakaotalk-mac — assembled instructions

Runtime mode: dolshoi (CloakBrowser available)

## Runtime rules

- Detect capabilities, not product names. Dolshoi credential mode is active only when `DOLSHOI_ACTION_BROKER_URL` is set and `vault-run` is available; CloakBrowser mode is active when the built-in browser tool identifies CloakBrowser or `CLOAKBROWSER_PEEK_TOKEN` is set.
- When the user asks for an action and the official surface supports it lawfully, continue beyond lookup through reversible preparation and execution. Do not declare completion at a result list, deep link, or handoff when the action can still be carried out.
- Immediately before an irreversible external side effect such as payment, message/email delivery, final submission, cancellation, account mutation, or public posting, call `clarify` with the exact target, amount/payload, and effect. Execute only after approval; do not ask again for already-approved reversible steps.
- Preserve hard boundaries for law, required physical presence, CAPTCHA, identity proofing, electronic signatures, and unsupported official surfaces. In those cases, complete the furthest lawful supported step and open or prepare the exact next official step for the user.
- This skill is lookup-oriented. Completion means the requested data is retrieved, summarized with its source (table/endpoint, period, unit), and any requested follow-up action is connected to the official surface that supports it.

# KakaoTalk katok Search

## What this skill does

`katok` CLI를 유일한 실행 표면으로 사용해 macOS 카카오톡 대화를 로컬 아카이브와 검색 인덱스로 동기화하고, keyword/BM25/semantic 검색과 chunk 조회를 수행한다.

이 스킬은 기존 `kakaotalk-mac` 설치 경로를 유지하지만 내부 동작은 `katok` 기반이다. 메시지 전송, 삭제, UI 자동화, 직접 DB 읽기, 인증 캐시 처리, 복호화 material 처리는 이 스킬의 범위가 아니다.

## Privacy Rules

- Do not inspect local database internals from this skill.
- Do not directly read KakaoTalk DB files.
- Do not handle auth caches or decryption material.
- Use `katok sync --source macos --json` for live macOS KakaoTalk ingestion.
- Search commands should return snippets and chunk ids first.
- Retrieve full chunk content only when the user explicitly asks to open a result or provides a chunk id.

## When to use

- "카카오톡에서 특정 키워드 검색해줘"
- "카톡에서 지난 회의/계약/약속 이야기 찾아줘"
- "이 검색 결과 chunk를 열어줘"
- "최근 대화가 반영됐는지 확인하고 검색해줘"

## When not to use

- macOS가 아닌 환경
- Intel Mac에서 로컬 EmbeddingGemma semantic index가 필요한 경우
- 카카오톡 메시지를 보내거나 삭제해야 하는 경우
- 카카오톡 DB 파일, 인증 캐시, 복호화 material을 직접 다루라는 요청
- 서버-투-서버 공식 Kakao API 연동 요청

## Prerequisites

- Apple Silicon macOS
- KakaoTalk for Mac 설치
- Homebrew 또는 Cargo
- `katok` CLI 설치
- 현재 터미널 앱에 Full Disk Access 권한

## Install katok

Homebrew:

```bash
brew tap NomaDamas/katok https://github.com/NomaDamas/katok.git
brew install katok
```

Cargo:

```bash
cargo install katok
export PATH="$HOME/.cargo/bin:$PATH"
```

설치 후 CLI가 보이는지 확인한다.

```bash
katok --help
katok doctor --json
```

## Workflow

### 1. Check readiness without prompting for app data

```bash
katok doctor --json
```

`doctor --json`의 `freshness` 섹션에서 마지막 sync/index 상태를 확인한다. 이 기본 doctor는 macOS app-data probe를 실행하지 않으므로 권한 prompt를 띄우지 않는 준비 상태 점검에 적합하다.

### 2. Open macOS permission settings when needed

Full Disk Access 설정이 필요하면 사용자가 직접 허용할 수 있도록 설정 화면을 연다.

```bash
katok permissions macos
```

KakaoTalk UI 자동화는 이 스킬 범위가 아니지만, upstream 진단을 위해 Accessibility 설정 화면까지 열어야 하는 경우에만 다음 명령을 쓴다.

```bash
katok permissions macos --accessibility
```

### 3. Run explicit macOS setup diagnostics only when needed

카카오톡 앱 설치, container, DB 파일 접근 같은 macOS source adapter 상태를 확인해야 할 때만 probe를 실행한다. 이 명령은 macOS가 app-data 접근 prompt를 띄울 수 있다.

```bash
katok doctor --macos-probe --json
```

### 4. Sync local KakaoTalk archives

최신 대화가 중요하거나 `freshness.recommendation.sync_before_search`가 true이면 검색 전에 sync한다.

```bash
katok sync --source macos --json
```

설정 파일의 기본 source adapter를 쓰는 경우:

```bash
katok sync --json
```

### 5. Build or refresh the semantic index

semantic search 전 `freshness.recommendation.index_before_semantic_search`가 true이거나 방금 sync한 내용을 semantic 검색에 반영해야 하면 index를 만든다.

```bash
katok index --json
```

`katok index`는 기본적으로 로컬 `embeddinggemma-300m-q4` embedder를 사용한다. Python, Jina, TEI, 별도 HTTP embedding server를 요구하지 않는다.

### 6. Search with the narrowest useful mode

정확한 문자열, 이름, 계좌번호, 고유명사는 keyword search를 먼저 쓴다.

```bash
katok search keyword "검색어" --json
```

여러 단어가 섞인 일반 질의는 BM25를 쓴다.

```bash
katok search bm25 "지난주 미팅 자료" --json
```

표현이 정확히 기억나지 않는 의미 기반 질의는 semantic search를 쓴다.

```bash
katok search semantic "최근에 논의한 세금 신고 일정" --json
```

### 7. Retrieve explicit chunks only when needed

검색 결과는 먼저 snippet과 chunk id 중심으로 요약한다. 사용자가 특정 결과를 열어 달라고 하거나 chunk id를 제공했을 때만 원문 chunk를 조회한다.

```bash
katok chunk get <chunk-id> --json
katok chunk context <chunk-id> --json
katok chunk parent <chunk-id> --json
```

- `katok chunk get <chunk-id> --json`: 해당 chunk 원문 조회
- `katok chunk context <chunk-id> --json`: 같은 채팅방의 직전/직후 micro chunk 조회
- `katok chunk parent <chunk-id> --json`: semantic search parent window 조회

## Synthetic QA only

실제 카카오톡 설치 없이 upstream fixture로 테스트할 때만 fixture source와 deterministic embedder를 사용한다.

```bash
katok sync --source fixture tests/fixtures/kakao/replies.jsonl --json
KATOK_EMBEDDER=local-test katok index --json
KATOK_EMBEDDER=mock katok index --json
```

실사용 경로에서는 fixture, mock embedder, 원격 embedding endpoint를 사용하지 않는다.

## Done when

- readiness 요청이면 `katok doctor --json` 결과와 freshness 권장사항을 요약했다.
- 최신 검색 요청이면 필요한 경우 `katok sync --source macos --json`과 `katok index --json` 실행 여부를 명확히 했다.
- 검색 요청이면 keyword/BM25/semantic 중 선택한 이유와 JSON 검색 결과 요약을 제공했다.
- chunk 조회 요청이면 사용자가 지정한 chunk id에 대해서만 `katok chunk get/context/parent` 결과를 요약했다.

## Failure modes

- `katok` 미설치 또는 Cargo binary PATH 누락
- Apple Silicon macOS가 아님
- KakaoTalk for Mac 미설치
- Full Disk Access 미부여
- `katok doctor --macos-probe --json`에서 container 또는 DB 파일 접근 실패
- sync 전이라 local archive가 비어 있음
- semantic index가 오래되었거나 아직 생성되지 않음
- 검색 결과가 snippet/chunk id만으로 충분하지 않아 명시적 chunk 조회가 필요함

## Notes

- 이 스킬은 read/search/retrieve 전용이다.
- 메시지 전송과 삭제는 지원하지 않는다.
- DB 내부 구조, auth cache, decryption material은 직접 다루지 않는다.
- 기존 설치 이름은 `kakaotalk-mac`이지만 실행 표면은 `katok`이다.
