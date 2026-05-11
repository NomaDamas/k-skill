---
name: rhwp-edit
description: Edit HWP documents — insert/delete text, replace-all, create tables, set cell text — by calling @rhwp/core (WASM) directly via inline Node.js scripts (rhwp by Edward Kim).
license: MIT
metadata:
  category: documents
  locale: ko-KR
  phase: v2.0
---

# rhwp-edit

## What this skill does

`@rhwp/core`(Rust + WebAssembly)를 **직접** 호출하는 인라인 Node.js 스크립트로 `.hwp` 문서의 **본문 텍스트**, **표 구조**, **셀 내용**을 round-trip 안전하게 수정한다.
에이전트는 `node --input-type=module -e '...'` 형태의 일회성 스크립트를 작성해 `insertText`, `deleteText`, `replaceAll`, `createTable`, `insertTextInCell` 같은 WASM 메서드를 직접 호출한다. 결과는 항상 새 파일로 저장한다.

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
- **HWPX 원본을 다시 HWPX로 저장** → rhwp v0.7.x 기준 업스트림이 `#196`으로 HWPX 저장 경로를 막아둔 상태다.
  HWPX를 입력으로 주면 내부적으로 HWP IR로 올라온 뒤 **HWP 5.x 바이너리로만** 저장된다. HWPX 출력이 꼭 필요하면 kordoc `markdownToHwpx`를 쓴다.
- **레이아웃(페이지네이션·SVG 렌더) 디버깅** → `rhwp-advanced` 스킬로 업스트림 `rhwp` CLI(`export-svg --debug-overlay`, `dump-pages`, `ir-diff`)를 사용한다.
- **배포용(읽기전용) 잠금 해제 · IR 구조 덤프 · 썸네일 추출 등 고급 검사 명령** → `rhwp-advanced` 스킬 참조.
- **한컴 오피스 GUI 자동화, 보안모듈 통과, Windows 전용 서식** → 범위 밖이다. `rhwp`는 파일 포맷 엔진이지 GUI 제어가 아니다.

## Prerequisites

- Node.js 18+
- 쓰기 권한이 있는 출력 경로
- `@rhwp/core` 설치(셋 중 하나):
  - 로컬: `npm install @rhwp/core`
  - 전역: `npm install -g @rhwp/core`
  - 레포 루트에 이미 설치된 경우 그대로 사용
- Rust/Cargo toolchain 불필요. 업스트림 `rhwp` CLI를 같이 쓰고 싶으면 `rhwp-advanced` 스킬로.

## Inputs

- 입력 HWP / HWPX 경로 (절대 또는 상대)
- 출력 HWP 경로 (항상 별도 파일. 원본을 덮어쓰지 않는다.)
- 편집 좌표: `sectionIdx`, `paraIdx`, `charOffset`
- 표 좌표: `sectionIdx`, `parentParaIdx`, `controlIdx`, `cellIdx`, `cellParaIdx`
- 텍스트/쿼리: `text`, `query`, `newText`
- `createTable`: `rowCount`, `colCount`
- `replaceAll`: `caseSensitive` (boolean, 기본 `false`)

## WASM 초기화 보일러플레이트

모든 인라인 스크립트는 아래 초기화 블록으로 시작한다. **한 번만** 실행하면 된다.

```javascript
import fs from "node:fs";

// 1. measureTextWidth shim (headless Node용)
globalThis.measureTextWidth = (font, text) => {
  const match = String(font || "").match(/([0-9.]+)px/);
  const size = match ? parseFloat(match[1]) : 12;
  let width = 0;
  for (const ch of String(text || "")) {
    const cp = ch.codePointAt(0) ?? 0;
    width += (cp >= 0x1100 && cp <= 0xffdc) ? size : size * 0.55;
  }
  return width;
};

// 2. WASM 초기화 (한 번만)
const core = await import("@rhwp/core");
const wasmBytes = fs.readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
await core.default({ module_or_path: wasmBytes });

// 3. 문서 로드
const doc = new core.HwpDocument(new Uint8Array(fs.readFileSync("input.hwp")));

// 4. 편집 후 저장
fs.writeFileSync("output.hwp", Buffer.from(doc.exportHwp()));
doc.free();
```

> `require.resolve("@rhwp/core/rhwp_bg.wasm")`으로 WASM 바이너리 경로를 찾는다. 설치 위치에 관계없이 동작한다.
> `doc.free()`는 WASM 힙 메모리를 즉시 해제한다. 스크립트 끝에 반드시 호출한다.

## Routing policy

| 작업 | `@rhwp/core` 메서드 |
| --- | --- |
| 본문 문단에 텍스트 삽입 | `doc.insertText(sectionIdx, paraIdx, charOffset, text)` |
| 본문 문단에서 텍스트 삭제 | `doc.deleteText(sectionIdx, paraIdx, charOffset, count)` |
| 단순 전체 치환(같은 서식 유지, **본문 문단만**) | `doc.replaceAll(query, newText, caseSensitive)` |
| 치환 대상 위치 사전 조회(**본문 문단만**) | `doc.searchText(query, fromSec, fromPara, fromChar, forward, caseSensitive)` |
| 표 셀 안의 텍스트 삽입 | `doc.insertTextInCell(sectionIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, charOffset, text)` |
| 표 셀 안의 텍스트 삭제 | `doc.deleteTextInCell(sectionIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, charOffset, count)` |
| 빈 표 삽입 | `doc.createTable(sectionIdx, paraIdx, charOffset, rowCount, colCount)` |
| 빈 HWP 생성 | `core.HwpDocument.createEmpty()` 또는 `doc.createBlankDocument()` |
| 구조 파악(섹션/문단 수·길이) | `doc.getDocumentInfo()`, `doc.getSectionCount()`, `doc.getParagraphCount(sectionIdx)`, `doc.getParagraphLength(sectionIdx, paraIdx)` |
| 특정 범위 텍스트 읽기 | `doc.getTextRange(sectionIdx, paraIdx, charOffset, count)` |
| 셀 문단 길이 확인 | `doc.getCellParagraphLength(sectionIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx)` |
| 페이지 SVG/HTML 미리보기 | `doc.renderPageSvg(pageNum)` / `doc.renderPageHtml(pageNum)` |

모든 편집 메서드는 JSON 문자열을 반환한다. `ok: true`, 새 커서 위치(`charOffset`, `paraIdx`, `controlIdx`) 등을 포함한다.

## Workflow

1. **입력 점검**: `doc.getDocumentInfo()`로 `sectionCount`, 섹션별 `paragraphCount`, 문단별 `length`를 먼저 확인한다. 편집 좌표는 이 결과에서 뽑는다.
2. **검색이 필요한 경우**: `doc.searchText("2025", 0, 0, 0, true, false)`로 섹션/문단/문자 오프셋을 먼저 얻고, 편집 메서드에 그대로 넣는다.
3. **편집**: 아래 예시 중 해당하는 메서드 하나로 실행한다. 출력은 항상 원본과 다른 경로에 저장한다.

   ```bash
   # 빈 문서 만들기
   node --input-type=module -e '
   import fs from "node:fs";
   globalThis.measureTextWidth = (font, text) => {
     const match = String(font || "").match(/([0-9.]+)px/);
     const size = match ? parseFloat(match[1]) : 12;
     let w = 0;
     for (const ch of String(text || "")) {
       const cp = ch.codePointAt(0) ?? 0;
       w += (cp >= 0x1100 && cp <= 0xffdc) ? size : size * 0.55;
     }
     return w;
   };
   const core = await import("@rhwp/core");
   const wasmBytes = fs.readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
   await core.default({ module_or_path: wasmBytes });
   const doc = core.HwpDocument.createEmpty();
   fs.writeFileSync("./out/blank.hwp", Buffer.from(doc.exportHwp()));
   doc.free();
   console.log("done");
   '
   ```

   ```bash
   # 본문 첫 문단 앞에 제목 삽입
   node --input-type=module -e '
   import fs from "node:fs";
   globalThis.measureTextWidth = (font, text) => {
     const match = String(font || "").match(/([0-9.]+)px/);
     const size = match ? parseFloat(match[1]) : 12;
     let w = 0;
     for (const ch of String(text || "")) {
       const cp = ch.codePointAt(0) ?? 0;
       w += (cp >= 0x1100 && cp <= 0xffdc) ? size : size * 0.55;
     }
     return w;
   };
   const core = await import("@rhwp/core");
   const wasmBytes = fs.readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
   await core.default({ module_or_path: wasmBytes });
   const doc = new core.HwpDocument(new Uint8Array(fs.readFileSync("./in.hwp")));
   const result = JSON.parse(doc.insertText(0, 0, 0, "2026년 오픈소스 AI·SW 지원사업 신청서"));
   console.log(result);
   fs.writeFileSync("./out/with-title.hwp", Buffer.from(doc.exportHwp()));
   doc.free();
   '
   ```

   ```bash
   # 2025 → 2026 일괄 치환 (본문 문단만)
   node --input-type=module -e '
   import fs from "node:fs";
   globalThis.measureTextWidth = (font, text) => {
     const match = String(font || "").match(/([0-9.]+)px/);
     const size = match ? parseFloat(match[1]) : 12;
     let w = 0;
     for (const ch of String(text || "")) {
       const cp = ch.codePointAt(0) ?? 0;
       w += (cp >= 0x1100 && cp <= 0xffdc) ? size : size * 0.55;
     }
     return w;
   };
   const core = await import("@rhwp/core");
   const wasmBytes = fs.readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
   await core.default({ module_or_path: wasmBytes });
   const doc = new core.HwpDocument(new Uint8Array(fs.readFileSync("./in.hwp")));
   const result = JSON.parse(doc.replaceAll("2025", "2026", false));
   console.log(result); // { ok: true, count: N }
   fs.writeFileSync("./out/2026.hwp", Buffer.from(doc.exportHwp()));
   doc.free();
   '
   ```

   ```bash
   # 3행 4열 표 삽입 (본문 2번째 문단 끝)
   node --input-type=module -e '
   import fs from "node:fs";
   globalThis.measureTextWidth = (font, text) => {
     const match = String(font || "").match(/([0-9.]+)px/);
     const size = match ? parseFloat(match[1]) : 12;
     let w = 0;
     for (const ch of String(text || "")) {
       const cp = ch.codePointAt(0) ?? 0;
       w += (cp >= 0x1100 && cp <= 0xffdc) ? size : size * 0.55;
     }
     return w;
   };
   const core = await import("@rhwp/core");
   const wasmBytes = fs.readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
   await core.default({ module_or_path: wasmBytes });
   const doc = new core.HwpDocument(new Uint8Array(fs.readFileSync("./in.hwp")));
   const result = JSON.parse(doc.createTable(0, 1, 0, 3, 4));
   console.log(result); // { ok: true, paraIdx: N, controlIdx: N }
   // 표의 (0,0) 셀에 "합계" 삽입 — createTable 결과의 paraIdx/controlIdx 재사용
   const cellResult = JSON.parse(
     doc.insertTextInCell(0, result.paraIdx, result.controlIdx, 0, 0, 0, "합계")
   );
   console.log(cellResult);
   fs.writeFileSync("./out/with-table.hwp", Buffer.from(doc.exportHwp()));
   doc.free();
   '
   ```

4. **round-trip 검증**: 편집 직후 `doc.getDocumentInfo()`를 다시 호출하고, 기대한 `paragraphCount` 변화를 확인한다.
   필요하면 `doc.renderPageHtml(0)`으로 첫 페이지 렌더 문자열이 생성되는지 sanity check 한다.
5. **민감 원본 보호**: 편집 대상이 개인정보/사업 신청서 등 비공개 문서라면 생성 파일을 레포에 커밋하지 않고, 로그에 남길 때도 본문을 요약·마스킹한다.

## Verify outputs after every run

- 편집 메서드 반환값에서 `ok === true` 확인.
- `doc.getDocumentInfo()` 재호출 결과에서 섹션/문단 수·길이 변화가 의도와 일치.
- 표 삽입의 경우 `paraIdx`/`controlIdx`가 다음 `insertTextInCell` 호출에 그대로 들어간다.
- 출력 파일이 원본과 다른 경로이며 원본은 그대로다.
- `doc.free()` 호출 후 스크립트가 정상 종료됐다.

## Done when

- 사용자가 요청한 편집이 HWP 바이너리에 반영되어 새 파일로 저장됐다.
- `doc.getDocumentInfo()` 재호출이 같은 혹은 늘어난 `sectionCount`/`paragraphCount`와 기대 `length`를 돌려준다.
- 원본 파일은 건드리지 않았다.

## Failure modes

- **HWPX 원본 저장 불가(rhwp #196)**: HWPX → HWPX round-trip은 upstream에서 비활성화 상태다. HWPX 입력이라도 출력은 HWP로만 저장된다. 원본 확장자에 의존하지 말고 항상 `.hwp`로 저장한다.
- **좌표 범위 초과**: `sectionIdx/paraIdx/charOffset`이 실제 문서 범위를 벗어나면 WASM에서 예외를 던진다. 편집 전에 `getDocumentInfo()`로 좌표를 확인한다.
- **복잡한 표·이미지·양식 필드 round-trip**: 현재 업스트림 rhwp v0.7.x는 베타다. 복잡한 표·이미지·차트·양식필드가 많은 실제 사업 신청서를 HWP round-trip 할 경우 드물게 형식 손실이 발생할 수 있다. round-trip이 끝나면 `doc.renderPageHtml(0)` + 육안 확인을 권장한다.
- **배포용(읽기전용) 문서**: rhwp 자체는 `convertToEditable`로 잠금 해제를 지원하지만 `@rhwp/core` WASM API에서 직접 노출되지 않는 경우 `rhwp-advanced` 스킬의 업스트림 `rhwp convert` 경로를 쓴다.
- **WASM 초기화**: `@rhwp/core` 번들 WASM(~4 MB)은 최초 호출 시 한 번 파싱한다. 첫 호출은 수십 ms~수백 ms 지연될 수 있다.
- **파일 인코딩**: 한국어 텍스트는 UTF-8로 그대로 넘기면 된다. 셸 인라인 스크립트에서 인용부호가 깨질 경우 스크립트를 별도 `.mjs` 파일로 저장해 `node script.mjs`로 실행한다.
- **`searchText` / `replaceAll`은 본문 문단만 스캔한다**: 업스트림 `searchText`가 본문(body) 범위로 제한되어 있고, `replaceAll`도 같은 스코프를 따른다. **표(cell) 안의 텍스트, 머리말/꼬리말, 각주 본문**에서는 `searchText`가 `found: false`를 돌려주고 `replaceAll`도 해당 위치를 건드리지 않는다. 셀 내용이 대상이라면 `getCellParagraphLength`로 좌표를 잡고 `insertTextInCell`/`deleteTextInCell`로 직접 쓴다.
- **문단 경계 / 개행 치환 금지**: `replaceAll`은 한 문단 안에서의 치환만 보장한다. `newText`에 개행 문자가 들어오면 예기치 않은 결과가 발생할 수 있다. 여러 문단을 만들고 싶으면 `insertText`를 여러 번 호출한다.
- **치환은 원본 매칭 기준 non-overlapping**: 예를 들어 query `a` / newText `aa` / 원본 `aaa`는 원본의 각 `a`를 한 번씩 교체해 `aaaaaa`가 된다. 치환으로 새로 들어온 문자열은 다시 매칭하지 않는다.
- **비 ASCII 대소문자 무시 매칭 주의**: `caseSensitive: false` 모드는 `String.prototype.toLowerCase()`가 UTF-16 길이를 유지한다는 전제 위에서 오프셋을 계산한다. 터키어 `İ`(U+0130)처럼 소문자화 시 길이가 늘어나는 문자가 포함된 문서에는 `caseSensitive: true`로 실행하거나 입력을 미리 정규화한다. 한글·ASCII 본문에는 해당하지 않으며, `2025 → 2026` 같은 실제 사업 신청서 워크플로우는 아무 영향을 받지 않는다.

## Notes

- 업스트림 rhwp: https://github.com/edwardkim/rhwp
- 업스트림 `@rhwp/core` npm: https://www.npmjs.com/package/@rhwp/core
- 업스트림은 활발히 개발 중이다(v0.7.10 2026-05 기준). breaking change 가능성을 고려해 `@rhwp/core` dependency는 semver caret으로 고정한다.
- 이 스킬은 **편집 전용** 스킬이다. 조회/변환은 `hwp`, 고급 디버깅은 `rhwp-advanced`가 담당한다.
