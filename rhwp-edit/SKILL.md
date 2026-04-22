---
name: rhwp-edit
description: Edit HWP documents — insert/delete text, replace-all, create tables, set cell text — with the k-skill-rhwp CLI that wraps the @rhwp/core WASM engine (rhwp by Edward Kim).
license: MIT
metadata:
  category: documents
  locale: ko-KR
  phase: v1.5
---

# rhwp-edit

## What this skill does

`k-skill-rhwp` CLI로 `.hwp` 문서의 **본문 텍스트**, **표 구조**, **셀 내용**을 round-trip 안전하게 수정한다.
CLI는 `@rhwp/core`(Rust + WebAssembly) 위에 얇은 Node 래퍼를 씌워 `insertText`, `deleteText`, `replaceAll`,
`createTable`, `setCellText` 같은 편집 동작을 서브커맨드로 노출한다. 결과는 항상 새 파일로 저장한다.

이 스킬은 **편집 전용**이다. 문서를 Markdown/JSON으로 변환하거나 필드만 추출하려면 [`hwp`](../hwp/SKILL.md) 스킬을 사용한다.
페이지 렌더링 디버깅이나 IR 비교가 필요하면 [`rhwp-advanced`](../rhwp-advanced/SKILL.md) 스킬을 사용한다.

## When to use

- "HWP 본문에 한 줄 추가해줘"
- "서식은 유지한 채로 2025를 2026으로 일괄 치환해줘"
- "3행 4열짜리 표를 HWP에 넣어줘"
- "표의 특정 셀 내용을 바꿔줘"
- "빈 HWP 새 파일을 만들어줘"

## When not to use

- **HWP → Markdown / JSON 변환** → `hwp` 스킬(kordoc)을 쓴다. rhwp-edit은 바이너리 편집 전용이다.
- **HWPX 원본을 다시 HWPX로 저장** → rhwp v0.7.3 기준 업스트림이 `#196`으로 HWPX 저장 경로를 막아둔 상태다.
  HWPX를 입력으로 주면 내부적으로 HWP IR로 올라온 뒤 **HWP 5.x 바이너리로만** 저장된다. HWPX 출력이 꼭 필요하면 kordoc `markdownToHwpx`를 쓴다.
- **레이아웃(페이지네이션·SVG 렌더) 디버깅** → `rhwp-advanced` 스킬로 업스트림 `rhwp` CLI(`export-svg --debug-overlay`, `dump-pages`, `ir-diff`)를 사용한다.
- **배포용(읽기전용) 잠금 해제 · IR 구조 덤프 · 썸네일 추출 등 고급 검사 명령** → `rhwp-advanced` 스킬 참조.
- **한컴 오피스 GUI 자동화, 보안모듈 통과, Windows 전용 서식** → 범위 밖이다. `rhwp`는 파일 포맷 엔진이지 GUI 제어가 아니다.

## Prerequisites

- Node.js 18+
- 쓰기 권한이 있는 출력 경로
- `k-skill-rhwp` 설치(셋 중 하나):
  - 일회성: `npx --yes k-skill-rhwp --help`
  - 전역: `npm install -g k-skill-rhwp`
  - 로컬: `npm install k-skill-rhwp`
- `k-skill-rhwp`는 `@rhwp/core@^0.7.3`을 peer 없이 dependency로 끌어온다. 별도 설치 불필요.
- Rust/Cargo toolchain 불필요. 업스트림 `rhwp` CLI를 같이 쓰고 싶으면 `rhwp-advanced` 스킬로.

## Inputs

- 입력 HWP / HWPX 경로 (절대 또는 상대)
- 출력 HWP 경로 (항상 별도 파일. 원본을 덮어쓰지 않는다.)
- 편집 좌표: `--section N --paragraph N --offset N`
- 표 좌표: `--section N --parent-paragraph N --control N --cell N [--cell-paragraph N]`
- 텍스트/쿼리: `--text "..."`, `--query "..."`, `--replacement "..."`
- `create-table`: `--rows N --cols N`
- 선택 플래그: `--case-sensitive`, `--no-replace` (`set-cell-text` 에서 기존 셀 내용 보존), `--format svg|html` (`render`)

## Routing policy

| 작업 | 기본 경로 |
| --- | --- |
| 본문 문단에 텍스트 삽입 | `k-skill-rhwp insert-text` |
| 본문 문단에서 텍스트 삭제 | `k-skill-rhwp delete-text` |
| 단순 전체 치환(같은 서식 유지, **본문 문단만**) | `k-skill-rhwp replace-all --query ... --replacement ...` |
| 치환 대상 위치 사전 조회(**본문 문단만**) | `k-skill-rhwp search --query ... --from-section N --from-paragraph N` |
| 표 셀 안의 텍스트 확인 | `k-skill-rhwp list-paragraphs` + 셀 좌표 확인 후 `k-skill-rhwp set-cell-text` 로 직접 쓰기 |
| 빈 표 삽입 | `k-skill-rhwp create-table --rows N --cols N` |
| 표 셀 내용 교체/채우기 | `k-skill-rhwp set-cell-text --control N --cell N --text "..."` |
| 빈 HWP 생성 | `k-skill-rhwp create-blank <output.hwp>` |
| 구조 파악(섹션/문단 수·길이) | `k-skill-rhwp info <file>` / `list-paragraphs` |
| 페이지 SVG/HTML 미리보기 | `k-skill-rhwp render <file> --page N --format svg` |

모든 편집 서브커맨드는 결과를 JSON 한 줄(CLI에서는 pretty-print)로 돌려준다. `ok: true`, 새 커서 위치(`charOffset`, `paraIdx`, `controlIdx`),
저장된 바이트 수(`bytesWritten`), 출력 경로(`outputPath`) 를 포함한다.

## Workflow

1. **입력 점검**: `k-skill-rhwp info <input>` 로 `sourceFormat`(hwp/hwpx), `sectionCount`, 섹션별 `paragraphCount`, 문단별 `length` 를 먼저 확인한다. 편집 좌표는 이 결과에서 뽑는다.
2. **검색이 필요한 경우**: `k-skill-rhwp search <input> --query "2025"` 로 섹션/문단/문자 오프셋을 먼저 얻고, 편집 명령에 그대로 넣는다.
3. **편집**: 아래 예시 중 해당하는 서브커맨드 하나로 실행한다. `--output` 은 항상 원본과 다른 경로를 지정한다.

   ```bash
   # 빈 문서 만들기
   npx k-skill-rhwp create-blank ./out/blank.hwp

   # 본문 첫 문단 앞에 제목 삽입
   npx k-skill-rhwp insert-text ./in.hwp ./out/with-title.hwp \
     --section 0 --paragraph 0 --offset 0 \
     --text "2026년 오픈소스 AI·SW 지원사업 신청서"

   # 2025 → 2026 일괄 치환
   npx k-skill-rhwp replace-all ./in.hwp ./out/2026.hwp \
     --query 2025 --replacement 2026

   # 3행 4열 표 삽입(본문 2번째 문단 끝)
   npx k-skill-rhwp create-table ./in.hwp ./out/with-table.hwp \
     --section 0 --paragraph 1 --offset 0 --rows 3 --cols 4

   # 방금 만든 표의 (0,0) 셀에 "합계" 삽입
   #  - create-table 결과의 paraIdx / controlIdx 를 그대로 재사용
   npx k-skill-rhwp set-cell-text ./out/with-table.hwp ./out/with-cell.hwp \
     --section 0 --parent-paragraph <paraIdx> --control <controlIdx> \
     --cell 0 --text "합계"
   ```

4. **round-trip 검증**: 편집 직후 `k-skill-rhwp info <output>` 를 다시 호출하고, 기대한 `paragraphs[].length` 또는 `paragraphCount` 변화를 직접 눈으로 확인한다.
   필요하면 `k-skill-rhwp render <output> --page 0 --format html` 로 첫 페이지 렌더 문자열이 생성되는지 sanity check 한다.
5. **민감 원본 보호**: 편집 대상이 개인정보/사업 신청서 등 비공개 문서라면 생성 파일을 레포에 커밋하지 않고, 로그에 남길 때도 본문을 요약·마스킹한다.

## Node API (선택)

CLI가 아니라 Node 코드에서 직접 편집하고 싶으면 같은 패키지를 라이브러리로 쓴다.

```js
const { insertText, getDocumentInfo } = require("k-skill-rhwp");

await insertText({
  input: "./in.hwp",
  output: "./out.hwp",
  section: 0,
  paragraph: 0,
  offset: 0,
  text: "안녕하세요"
});
console.log(await getDocumentInfo("./out.hwp"));
```

Node 18+, `@rhwp/core` WASM 은 첫 호출 시 한 번만 초기화된다. WASM 이 요구하는 `globalThis.measureTextWidth` 콜백은 자동 shim 되므로 별도 설정 없이 돌아간다(정밀 레이아웃이 필요하면 `node-canvas` 기반 shim을 먼저 주입한다).

## Verify outputs after every run

- `ok === true`, `bytesWritten` 가 수 KB 이상.
- `info` 재호출 결과에서 섹션/문단 수·길이 변화가 의도와 일치.
- 표 삽입의 경우 `paraIdx`/`controlIdx` 가 다음 `set-cell-text` 호출에 그대로 들어간다.
- 출력 파일이 원본과 다른 경로이며 원본은 그대로다.

## Done when

- 사용자가 요청한 편집이 HWP 바이너리에 반영되어 새 파일로 저장됐다.
- `k-skill-rhwp info <output>` 가 같은 혹은 늘어난 `sectionCount`/`paragraphCount` 와 기대 `length` 를 돌려준다.
- 원본 파일은 건드리지 않았다.

## Failure modes

- **HWPX 원본 저장 불가(rhwp #196)**: HWPX → HWPX round-trip 은 upstream에서 비활성화 상태다. HWPX 입력이라도 출력은 HWP로만 저장된다. 원본 확장자에 의존하지 말고 항상 `.hwp` 로 저장한다.
- **좌표 범위 초과**: `section/paragraph/offset` 이 실제 문서 범위를 벗어나면 WASM에서 `렌더링 오류: 구역 인덱스 0 범위 초과` 같은 에러를 던지고 CLI는 exit code 1 + stderr 에 메시지를 찍는다. 편집 전에 `info` 로 좌표를 확인한다.
- **복잡한 표·이미지·양식 필드 round-trip**: 현재 업스트림 rhwp v0.7.x 는 베타다. 복잡한 표·이미지·차트·양식필드가 많은 실제 사업 신청서를 HWP round-trip 할 경우 드물게 형식 손실이 발생할 수 있다. round-trip 이 끝나면 `k-skill-rhwp render <output>` + 육안 확인을 권장한다.
- **배포용(읽기전용) 문서**: rhwp 자체는 `convertToEditable` 로 잠금 해제를 지원하지만 `k-skill-rhwp` CLI 서브커맨드는 아직 노출하지 않는다. 필요하면 `rhwp-advanced` 스킬의 업스트림 `rhwp convert` 경로를 쓴다.
- **WASM 초기화**: `@rhwp/core` 번들 WASM(~4 MB) 은 최초 호출 시 한 번 파싱한다. 첫 호출은 수십 ms~수백 ms 지연될 수 있다.
- **파일 인코딩**: 한국어 텍스트는 UTF-8 로 그대로 CLI 에 넘기면 된다. 셸에서 인용부호가 깨질 경우 `--text=$'...'` 같은 형식을 쓴다.
- **`search` / `replace-all` 은 본문 문단만 스캔한다**: 업스트림 `searchText` 가 본문(body) 범위로 제한되어 있고, `k-skill-rhwp replace-all` 도 같은 스코프를 그대로 따른다. **표(cell) 안의 텍스트, 머리말/꼬리말, 각주 본문**에서는 `search` 가 `found:false` 를 돌려주고 `replace-all` 도 해당 위치를 건드리지 않는다. 셀 내용이 대상이라면 `list-paragraphs` 또는 `info` 로 표 좌표를 잡고 `set-cell-text` 로 직접 쓴다.
- **문단 경계 / 개행 치환 금지**: `replace-all` 은 한 문단 안에서의 치환만 보장한다. `--replacement` 에 개행(`\n`, `\r`, U+2028, U+2029) 이 들어오면 CLI 는 exit code 1 과 "replacement must not contain newline or paragraph-break characters" 메시지를 돌려준다. 여러 문단을 만들고 싶으면 `insert-text` 를 여러 번 호출한다.
- **치환은 원본 매칭 기준 non-overlapping**: 예를 들어 query `a` / replacement `aa` / 원본 `aaa` 는 원본의 각 `a` 를 한 번씩 교체해 `aaaaaa` 가 된다. 치환으로 새로 들어온 문자열은 다시 매칭하지 않는다.
- **대소문자 무시 매칭은 UTF-16 길이가 보존되는 문자에만 안전하다**: 기본값인 대소문자 무시(`--case-sensitive` 없이) 모드는 `String.prototype.toLowerCase()` 가 UTF-16 길이를 그대로 유지한다는 전제 위에서 오프셋을 계산한다. 터키어 `İ`(U+0130) 처럼 소문자화 시 `i` + 결합 점(U+0307) 로 길이가 늘어나는 문자가 본문 또는 쿼리에 포함되면, 조용한 문서 손상을 방지하기 위해 `replace-all` 이 exit code 1 과 함께 `case-insensitive matching is unsafe because case folding changes the UTF-16 length` 메시지를 돌려준다. 이런 문서에는 `--case-sensitive` 로 다시 실행하거나, 입력을 미리 정규화한다. 한글·ASCII 본문에는 해당하지 않으며, `2025 → 2026` 같은 실제 사업 신청서 워크플로우는 아무 영향을 받지 않는다.

## Notes

- 업스트림 rhwp: https://github.com/edwardkim/rhwp
- 업스트림 `@rhwp/core` npm: https://www.npmjs.com/package/@rhwp/core
- 업스트림은 활발히 개발 중이다(v0.7.3 2026-04-19 기준). breaking change 가능성을 고려해 `k-skill-rhwp` dependency 는 semver caret 으로 고정한다.
- 이 스킬은 **편집 전용** 스킬이다. 조회/변환은 `hwp`, 고급 디버깅은 `rhwp-advanced` 가 담당한다.
