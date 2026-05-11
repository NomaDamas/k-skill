# HWP 문서 편집 (rhwp-edit)

`rhwp-edit` 스킬은 **`.hwp` 문서를 실제로 편집**하는 스킬이다. 본문에 텍스트를 넣고, 표를 만들고, 특정 셀 내용을 바꾸고, 전체 치환을 하는 식의 round-trip 편집을 Node 인라인 스크립트 한 줄로 돌린다.

엔진은 업스트림 `@rhwp/core` (Rust + WebAssembly, MIT, [edwardkim/rhwp](https://github.com/edwardkim/rhwp)) 를 직접 호출한다. Rust toolchain 설치 불필요.

이 스킬은 **편집 전용**이다.

- 조회/Markdown·JSON 변환·양식 필드 추출은 → [`hwp` 스킬](hwp.md) (kordoc)
- 페이지 SVG 디버깅·IR 덤프·ir-diff·썸네일·배포용 문서 잠금 해제는 → [`rhwp-advanced` 스킬](rhwp-advanced.md) (업스트림 `rhwp` Rust CLI)

## 준비

- Node.js 18+
- `@rhwp/core` 설치

  ```bash
  npm install @rhwp/core
  ```

- 업스트림 Rust `rhwp` 바이너리는 이 스킬이 요구하지 않는다(`rhwp-advanced` 스킬에서 따로 설치).

## 주요 시나리오

모든 예시는 `node --input-type=module -e '...'` 형태의 인라인 스크립트로 실행한다.

### 0) WASM 초기화 (공통 보일러플레이트)

첫 번째 예시에 아래 초기화 코드를 포함한다. 이후 예시에서는 초기화 부분을 생략한다.

```bash
node --input-type=module -e '
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");

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

const core = await import("@rhwp/core");
const wasmBytes = fs.readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
await core.default({ module_or_path: wasmBytes });

// 이후 core.HwpDocument 등 API 사용
console.log("WASM 초기화 완료");
'
```

### 1) 빈 HWP 한 장 만들기

```bash
node --input-type=module -e '
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("node:fs");

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
const core = await import("@rhwp/core");
const wasmBytes = fs.readFileSync(require.resolve("@rhwp/core/rhwp_bg.wasm"));
await core.default({ module_or_path: wasmBytes });

const doc = core.HwpDocument.createBlank();
const bytes = doc.save();
doc.free();
fs.writeFileSync("./out/blank.hwp", bytes);
console.log("bytesWritten:", bytes.length);
'
```

### 2) 본문 첫 문단 맨 앞에 제목 삽입

이후 예시에서는 초기화 부분을 생략한다.

```bash
node --input-type=module -e '
// ... (WASM 초기화 생략) ...
const input = fs.readFileSync("./draft.hwp");
const doc = core.HwpDocument.fromBytes(input);
doc.insertText({ section: 0, paragraph: 0, offset: 0, text: "2026년 오픈소스 AI·SW 지원사업 신청서" });
const bytes = doc.save();
doc.free();
fs.writeFileSync("./out/draft-with-title.hwp", bytes);
'
```

### 3) `2025` → `2026` 일괄 치환

```bash
node --input-type=module -e '
// ... (WASM 초기화 생략) ...
const input = fs.readFileSync("./draft.hwp");
const doc = core.HwpDocument.fromBytes(input);
doc.replaceAll({ query: "2025", replacement: "2026", caseSensitive: false });
const bytes = doc.save();
doc.free();
fs.writeFileSync("./out/2026.hwp", bytes);
'
```

대소문자 구분이 필요하면 `caseSensitive: true` 로 설정한다. 길이가 다른 치환(예: `2026` → `이천이십칠`)도 문제없이 동작한다.

**스코프 주의** — `replaceAll` 은 **본문(body) 문단만** 스캔한다. 업스트림 `searchText` 가 본문만 커버하기 때문에 같은 스코프를 따른다. 표 셀, 머리말/꼬리말, 각주 본문의 텍스트는 `replaceAll` 이 건드리지 않는다. 셀 내용을 바꾸려면 아래 4) 의 `setCellText` 를 쓴다.

**줄바꿈 주의** — `query` 에 `\n` 을 포함하면 업스트림이 예상대로 동작하지 않을 수 있다. 줄바꿈을 포함한 치환은 피하고, 단일 문단 내 텍스트만 대상으로 한다.

**Unicode 대소문자 무시 주의** — `caseSensitive: false` 모드는 `String.prototype.toLowerCase()` 의 UTF-16 길이 보존을 전제한다. 본문이나 쿼리에 터키어 `İ`(U+0130) 처럼 소문자화 시 길이가 늘어나는 문자가 섞여 있으면, 오프셋 드리프트로 인한 조용한 손상이 발생할 수 있다. 이 경우 `caseSensitive: true` 로 재실행하거나 입력을 미리 정규화한다. 한글·ASCII 본문에는 해당하지 않는다.

### 4) 표 추가 후 특정 셀 채우기

`createTable` 은 만든 표의 `paraIdx` / `controlIdx` 를 같이 돌려준다. 그 두 값을 `setCellText` 에 그대로 넣으면 된다.

```bash
node --input-type=module -e '
// ... (WASM 초기화 생략) ...
const input = fs.readFileSync("./report.hwp");
const doc = core.HwpDocument.fromBytes(input);

// (1) 3행 4열 표 삽입
const tableInfo = doc.createTable({ section: 0, paragraph: 1, offset: 0, rows: 3, cols: 4 });

// (2) 위 결과의 paraIdx / controlIdx 로 (0,0) 셀 채우기
doc.setCellText({
  section: 0,
  parentParagraph: tableInfo.paraIdx,
  control: tableInfo.controlIdx,
  cell: 0,
  text: "합계"
});

const bytes = doc.save();
doc.free();
fs.writeFileSync("./out/with-header.hwp", bytes);
'
```

### 5) 편집 전 구조 조회

좌표를 잘못 주면 WASM 이 "구역 인덱스 … 범위 초과" 같은 오류로 거절한다. 편집 전에 먼저 구조를 확인한다.

```bash
node --input-type=module -e '
// ... (WASM 초기화 생략) ...
const input = fs.readFileSync("./draft.hwp");
const doc = core.HwpDocument.fromBytes(input);
const info = doc.getInfo();
doc.free();
console.log(JSON.stringify(info, null, 2));
'
```

`getInfo()` 결과의 `sections[N].paragraphs` 배열로 문단 좌표를 확인한 뒤 편집 명령을 구성한다. 표 셀 내용은 `info` 로 표 좌표(`paraIdx` / `controlIdx`) 를 확인한 뒤 `setCellText` 로 직접 쓴다.

## 검증 포인트

- 편집 직후 `getInfo()` 결과의 `sections[N].paragraphs[M].length` 가 기대와 일치한다.
- 새 표는 `sections[N].paragraphCount` 를 최소 1 이상 증가시킨다(위치에 따라 표 내부 문단도 합산됨).
- 아래 인라인 스크립트로 SVG 렌더링이 정상 반환되는지 확인한다.

  ```bash
  node --input-type=module -e '
  // ... (WASM 초기화 생략) ...
  const input = fs.readFileSync("./out/result.hwp");
  const doc = core.HwpDocument.fromBytes(input);
  const svg = doc.renderPage(0);
  doc.free();
  console.log(svg.startsWith("<svg") ? "OK" : "FAIL");
  '
  ```

- 출력 파일 크기는 blank 기준 최소 12 KB 이상, 편집 후에도 비슷하거나 더 크다.
- 원본 파일은 절대 덮어쓰지 않는다. 항상 별도 출력 경로에 `save()` 결과를 쓴다.
- `HwpDocument` 사용 후 반드시 `doc.free()` 를 호출해 WASM 메모리를 해제한다.

## 제약 / 주의

- **HWPX 원본 저장은 업스트림 `rhwp` 가 `#196` 으로 비활성화 상태**다. HWPX 파일을 입력으로 줘도 저장은 HWP 5.x 바이너리로만 된다. HWPX 출력이 반드시 필요하면 `hwp` 스킬의 kordoc `markdownToHwpx` 경로를 사용한다.
- **rhwp v0.7.x 는 베타**이다. 복잡한 표/이미지/차트/양식 필드가 많은 실제 사업 신청서를 round-trip 할 때 드물게 형식 손실이 발생할 수 있다. 편집 직후 `getInfo()` + `renderPage()` 로 빠른 육안 검증을 권장한다.
- **배포용(읽기전용) 문서** — `convertToEditable()` 메서드가 `HwpDocument` 에 있어 잠금 해제가 가능하지만, 복잡한 보안 문서는 `rhwp-advanced` 스킬의 `rhwp convert` 를 먼저 거치는 편이 안전하다.
- **개인정보가 포함된 원본** — 편집 산출물을 레포에 커밋하지 말고, 로그에 남길 때 본문 텍스트는 요약·마스킹한다.
- **한컴 보안모듈 / Windows GUI 자동화** — 이 스킬은 파일 포맷 엔진을 다룰 뿐, GUI 제어를 하지 않는다.

## 참고

- 업스트림 rhwp: https://github.com/edwardkim/rhwp
- `@rhwp/core` npm: https://www.npmjs.com/package/@rhwp/core
- 스킬 정의: [`rhwp-edit/SKILL.md`](../../rhwp-edit/SKILL.md)
