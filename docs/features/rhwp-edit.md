# HWP 문서 편집 (rhwp-edit)

`rhwp-edit` 스킬은 **`.hwp` 문서를 실제로 편집**하는 스킬이다. 본문에 텍스트를 넣고, 표를 만들고, 특정 셀 내용을 바꾸고, 전체 치환을 하는 식의 round-trip 편집을 Node CLI 한 줄로 돌린다.

엔진은 이 레포에서 새로 발행하는 npm 패키지 **`k-skill-rhwp`** 이다. `k-skill-rhwp` 는 업스트림 `@rhwp/core` (Rust + WebAssembly, MIT, [edwardkim/rhwp](https://github.com/edwardkim/rhwp)) 의 편집 API 를 얇게 래핑해 `insert-text`, `delete-text`, `replace-all`, `create-table`, `set-cell-text`, `render` 같은 CLI 서브커맨드로 노출한다. Rust toolchain 설치는 필요 없고, 번들된 WASM 이 그대로 돌아간다.

이 스킬은 **편집 전용**이다.

- 조회/Markdown·JSON 변환·양식 필드 추출은 → [`hwp` 스킬](hwp.md) (kordoc)
- 페이지 SVG 디버깅·IR 덤프·ir-diff·썸네일·배포용 문서 잠금 해제 는 → [`rhwp-advanced` 스킬](rhwp-advanced.md) (업스트림 `rhwp` Rust CLI)

## 준비

- Node.js 18+
- `k-skill-rhwp` 설치 — 셋 중 하나

  ```bash
  # 일회성
  npx --yes k-skill-rhwp --help

  # 전역
  npm install -g k-skill-rhwp

  # 프로젝트 로컬
  npm install k-skill-rhwp
  ```

- `@rhwp/core@^0.7.3` 는 `k-skill-rhwp` 가 dependency 로 함께 끌어온다. 별도 설치 불필요.
- 업스트림 Rust `rhwp` 바이너리는 이 스킬이 요구하지 않는다(`rhwp-advanced` 스킬에서 따로 설치).

## 주요 시나리오

### 1) 빈 HWP 한 장 만들기

```bash
npx k-skill-rhwp create-blank ./out/blank.hwp
# => { "bytesWritten": 12800, "outputPath": "/abs/path/out/blank.hwp" }
```

### 2) 본문 첫 문단 맨 앞에 제목 삽입

```bash
npx k-skill-rhwp insert-text ./draft.hwp ./out/draft-with-title.hwp \
  --section 0 --paragraph 0 --offset 0 \
  --text "2026년 오픈소스 AI·SW 지원사업 신청서"
```

### 3) `2025` → `2026` 일괄 치환

```bash
npx k-skill-rhwp replace-all ./draft.hwp ./out/2026.hwp \
  --query 2025 --replacement 2026
```

대소문자 구분이 필요하면 `--case-sensitive` 를 붙인다. 길이가 다른 치환(예: `2026` → `이천이십칠`)도 문제없이 동작한다.

**스코프 주의** — `replace-all` 은 **본문(body) 문단만** 스캔한다. 업스트림 `searchText` 가 본문만 커버하기 때문에 같은 스코프를 따른다. 표 셀, 머리말/꼬리말, 각주 본문의 텍스트는 `replace-all` 이 건드리지 않는다. 셀 내용을 바꾸려면 아래 4) 의 `set-cell-text` 를 쓴다.

**Unicode 대소문자 무시 주의** — 기본(`--case-sensitive` 없이) 모드는 `String.prototype.toLowerCase()` 의 UTF-16 길이 보존을 전제한다. 본문이나 쿼리에 터키어 `İ`(U+0130) 처럼 소문자화 시 길이가 늘어나는 문자가 섞여 있으면, 오프셋 드리프트로 인한 조용한 손상을 막기 위해 `replace-all` 은 exit code 1 과 함께 `case-insensitive matching is unsafe because case folding changes the UTF-16 length` 를 돌려준다. 이 경우 `--case-sensitive` 로 재실행하거나 입력을 미리 정규화한다. 한글·ASCII 본문에는 해당하지 않는다.

### 4) 표 추가 후 특정 셀 채우기

`create-table` 은 만든 표의 `paraIdx` / `controlIdx` 를 같이 돌려준다. 그 두 값을 `set-cell-text` 에 그대로 넣으면 된다.

```bash
# (1) 3행 4열 표 삽입
npx k-skill-rhwp create-table ./report.hwp ./out/with-table.hwp \
  --section 0 --paragraph 1 --offset 0 --rows 3 --cols 4

# (2) 위 결과의 paraIdx / controlIdx 로 (0,0) 셀 채우기
npx k-skill-rhwp set-cell-text ./out/with-table.hwp ./out/with-header.hwp \
  --section 0 --parent-paragraph <paraIdx> --control <controlIdx> \
  --cell 0 --text "합계"
```

### 5) 편집 전 구조 조회

좌표를 잘못 주면 WASM 이 "구역 인덱스 … 범위 초과" 같은 오류로 거절한다. 편집 전에 먼저 구조를 확인한다.

```bash
npx k-skill-rhwp info ./draft.hwp
npx k-skill-rhwp list-paragraphs ./draft.hwp --section 0
npx k-skill-rhwp search ./draft.hwp --query "2025"
```

`search` 도 `replace-all` 과 마찬가지로 **본문 문단만** 스캔한다. 표 셀/머리말/꼬리말/각주 안의 텍스트는 `search` 가 찾지 않는다. 셀 내용은 `info` 또는 `list-paragraphs` 로 표 좌표(`paraIdx` / `controlIdx`) 를 확인한 뒤 `set-cell-text` 로 직접 쓴다.

## Node API

CLI 가 아니라 스크립트에서 직접 호출할 수도 있다.

```js
const { insertText, createTable, setCellText, getDocumentInfo } = require("k-skill-rhwp");

await insertText({
  input: "./draft.hwp",
  output: "./draft-with-title.hwp",
  section: 0,
  paragraph: 0,
  offset: 0,
  text: "2026년 신청서"
});

const info = await getDocumentInfo("./draft-with-title.hwp");
console.log(info.sections[0].paragraphs[0].length);
```

WASM 은 첫 호출 때 한 번만 초기화되고, Node 기본 환경에서도 동작하도록 `globalThis.measureTextWidth` shim 이 자동으로 설치된다. 픽셀 정밀 레이아웃이 필요하면 `node-canvas` 기반 shim 을 첫 호출 전에 주입한다.

## 검증 포인트

- 편집 직후 `k-skill-rhwp info <output>` 결과의 `sections[N].paragraphs[M].length` 가 기대와 일치한다.
- 새 표는 `sections[N].paragraphCount` 를 최소 1 이상 증가시킨다(위치에 따라 표 내부 문단도 합산됨).
- `k-skill-rhwp render <output> --page 0 --format svg` 가 `<svg>` 로 시작하는 문자열을 반환한다.
- 출력 파일 크기는 blank 기준 최소 12 KB 이상, 편집 후에도 비슷하거나 더 크다.
- 원본 파일 경로는 CLI 가 절대 덮어쓰지 않는다(항상 별도 `<output>` 를 지정한다).

## 제약 / 주의

- **HWPX 원본 저장은 업스트림 `rhwp` 가 `#196` 으로 비활성화 상태**다. HWPX 파일을 입력으로 줘도 저장은 HWP 5.x 바이너리로만 된다. HWPX 출력이 반드시 필요하면 `hwp` 스킬의 kordoc `markdownToHwpx` 경로를 사용한다.
- **rhwp v0.7.x 는 베타**이다. 복잡한 표/이미지/차트/양식 필드가 많은 실제 사업 신청서를 round-trip 할 때 드물게 형식 손실이 발생할 수 있다. 편집 직후 `info` + `render` 로 빠른 육안 검증을 권장한다.
- **배포용(읽기전용) 문서** — `rhwp-edit` CLI 는 아직 `convert` 를 노출하지 않는다. 잠금 해제는 `rhwp-advanced` 스킬의 `rhwp convert` 를 먼저 거친다.
- **개인정보가 포함된 원본** — 편집 산출물을 레포에 커밋하지 말고, 로그에 남길 때 본문 텍스트는 요약·마스킹한다.
- **한컴 보안모듈 / Windows GUI 자동화** — 이 스킬은 파일 포맷 엔진을 다룰 뿐, GUI 제어를 하지 않는다.

## 참고

- `k-skill-rhwp` 패키지 소스: `packages/k-skill-rhwp/`
- 업스트림 rhwp: https://github.com/edwardkim/rhwp
- `@rhwp/core` npm: https://www.npmjs.com/package/@rhwp/core
- 스킬 정의: [`rhwp-edit/SKILL.md`](../../rhwp-edit/SKILL.md)
