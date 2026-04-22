---
name: hwp
description: Use kordoc for agent-native HWP/HWPX document parsing, JSON extraction, diffing, form-field extraction, and Markdown→HWPX reverse conversion (read/convert only — for binary editing use rhwp-edit).
license: MIT
metadata:
  category: documents
  locale: ko-KR
  phase: v1
---

# HWP

## What this skill does

`kordoc`으로 `.hwp` / `.hwpx` / `.hwpml` 문서를 AI가 읽기 좋은 Markdown 또는 JSON으로 바꾸고,
필요하면 문서 비교, 양식 필드 추출, Markdown→HWPX 역변환까지 수행한다.

이 스킬의 기본 엔진은 **항상 `kordoc`** 이다. 문서 변환, 비교, 필드 추출, 역변환까지 같은 도구로 일관되게 처리한다.

> **스킬 라우팅** — 이 `hwp` 스킬은 **조회/변환(read-only)** 전용이다.
> HWP 바이너리 **편집**(본문 텍스트 삽입/삭제, 표 생성, 셀 수정, replace-all)은 [`rhwp-edit`](../rhwp-edit/SKILL.md) 스킬이,
> 레이아웃 디버깅·IR 덤프·썸네일·배포용 문서 잠금 해제 같은 **고급 검사**는 [`rhwp-advanced`](../rhwp-advanced/SKILL.md) 스킬이 맡는다.

## When to use

- "이 HWP 파일을 Markdown으로 바꿔줘"
- "공문서를 JSON 구조로 뽑아서 AI가 읽게 해줘"
- "두 버전 문서 차이점을 보고 싶어"
- "신청서 HWPX 안에 어떤 양식 필드가 있는지 뽑아줘"
- "AI가 만든 Markdown을 다시 HWPX로 저장해줘"
- "폴더 안 문서를 한 번에 변환해줘"

## When not to use

- OCR이 필수인데 OCR provider 연결이 전혀 없는 이미지 기반 PDF만 있는 경우
- `.docx`, `.xlsx`, `.pdf` 만 다루더라도 문서 파싱 자체가 아니라 편집기 GUI 자동화가 필요한 경우
- 원본 프로그램의 실시간 UI 제어가 반드시 필요한 경우
- **본문 텍스트 직접 삽입·삭제·치환 또는 표 구조 변경** — `rhwp-edit` 스킬의 `k-skill-rhwp` CLI 를 사용한다.
- **페이지 SVG 렌더 디버깅·IR 덤프·ir-diff·썸네일 추출** — `rhwp-advanced` 스킬의 업스트림 `rhwp` CLI 를 사용한다.

## Prerequisites

- Node.js 18+
- 출력 경로 쓰기 권한
- `kordoc`과 `pdfjs-dist`를 같은 전역/로컬 환경에 설치했거나, 둘 다 포함된 `npx --yes --package kordoc --package pdfjs-dist kordoc ...` 실행 환경
- 현재 배포된 `kordoc` CLI는 시작 시 `pdfjs-dist`를 바로 로드하므로 PDF를 안 써도 함께 설치해야 한다

## Inputs

- 원본 `.hwp`, `.hwpx`, `.hwpml` 파일 경로 또는 폴더/글롭 경로
- 원하는 결과 형태: `markdown`, `json`, `hwpx`
- 출력 파일/디렉터리 경로
- 페이지 범위 지정 여부
- 비교 / 양식 필드 추출 / 역변환 여부

## Routing policy

### Default: `kordoc`

다음 작업은 모두 기본적으로 `kordoc`으로 처리한다.

- HWP/HWPX/HWPML → Markdown
- HWP/HWPX/HWPML → JSON (`blocks`, `metadata`)
- 배치 변환
- 페이지 범위 파싱
- 이미지/표/양식이 포함된 공문서 구조 추출
- 디렉터리 감시 변환 (`watch`)
- Markdown→HWPX 역변환
- HWPX 양식 필드 추출

### Optional library path

CLI만으로 부족하면 Node API를 사용한다.

- `parse()` — Markdown + 구조화 블록
- `compare()` — 신구 문서 비교
- `extractFormFields()` — 파싱된 블록에서 양식 필드 추출
- `markdownToHwpx()` — Markdown→HWPX 역변환

## Workflow

### 1. Prepare the CLI runtime

일회성 변환이면 둘 다 포함한 `npx` 형태를 바로 쓴다.

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc --help
```

반복 실행용 전역 설치가 필요하면:

```bash
npm install -g kordoc pdfjs-dist
```

현재 배포된 `kordoc` CLI는 `pdfjs-dist`가 없으면 `kordoc --help` 단계부터 실패하므로
깨끗한 환경에서는 두 패키지를 같이 설치한 뒤 실행한다.

### 2. Prepare a local project for Node API examples

`parse()`, `compare()`, `extractFormFields()`, `markdownToHwpx()` 같은 ESM 예시는
전역 `NODE_PATH`가 아니라 **로컬 프로젝트 설치** 기준으로 실행한다.

```bash
mkdir -p ./kordoc-local && cd ./kordoc-local
npm init -y
npm install kordoc pdfjs-dist
```

이미 `package.json`이 있는 작업 디렉터리라면 `npm install kordoc pdfjs-dist`만 추가로 실행하면 된다.

### 3. Convert a document to Markdown

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc 보고서.hwp -o 보고서.md
```

여러 문서를 한 번에 처리하려면:

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc ./문서함/* -d ./변환결과
```

특정 페이지 범위만 읽고 싶으면:

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc 보고서.hwp --pages 1-3
```

### 4. Extract structured JSON for AI/automation

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc 검토서.hwpx --format json > 검토서.json
```

JSON 결과에서는 `success`, `markdown`, `blocks`, `metadata`를 우선 확인한다.
표나 이미지가 중요하면 `blocks` 안의 `table`, `image` 타입을 확인한다.

### 5. Inspect HWPX form fields from parsed blocks

```bash
node --input-type=module - <<'EOF'
import { parse, extractFormFields } from "kordoc";

const result = await parse("신청서.hwpx");
if (!result.success) {
  console.error(result.error);
  process.exit(1);
}

const fields = extractFormFields(result.blocks);
console.log(JSON.stringify(fields, null, 2));
EOF
```

자동 변환이 계속 들어오는 폴더면 CLI의 `watch` 명령을 쓴다.

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc watch ./문서함
```

### 6. Reverse-convert Markdown back to HWPX

```bash
node --input-type=module - <<'EOF'
import { markdownToHwpx } from "kordoc";
import { writeFileSync } from "node:fs";

const hwpx = await markdownToHwpx("# 제목\n\n본문\n\n| 항목 | 값 |\n| --- | --- |\n| 성명 | 홍길동 |");
writeFileSync("출력.hwpx", Buffer.from(hwpx));
EOF
```

### 7. Compare two document versions when diff matters

```bash
node --input-type=module - <<'EOF'
import { compare } from "kordoc";
import { readFileSync } from "node:fs";

const before = readFileSync("이전버전.hwp");
const after = readFileSync("최신버전.hwpx");
const diff = await compare(before, after);
console.log(diff.stats);
EOF
```

## Verify outputs after every run

- Markdown: 파일이 생성되었고 제목/본문/표 구조가 깨지지 않았는지 확인
- JSON: `success: true` 와 `blocks` / `metadata` 존재 여부 확인
- 배치 처리: 입력 수와 출력 수가 크게 어긋나지 않는지 확인
- 양식 필드 추출: `extractFormFields(result.blocks)` 결과가 비어 있지 않은지 확인
- 역변환: 생성된 `.hwpx` 파일이 열리고 기본 서식/테이블 구조가 유지되는지 확인
- 비교: `diff.stats` 에 added / removed / modified 값이 합리적인지 확인

## Done when

- 요청한 Markdown / JSON / HWPX 결과물이 생성되어 있다
- 공문서 표·이미지·메타데이터가 필요한 수준으로 확인되어 있다
- 양식 필드 추출이나 역변환 요청이 있었다면 결과/출력 구조까지 검증되어 있다
- 배치 요청이면 처리 범위와 실패 건수가 정리되어 있다

## Failure modes

- 손상된 HWP/HWPX/HWPML 파일
- 암호화/배포 제한 문서에서 일부 파싱 한계 발생
- 이미지 기반 PDF인데 OCR provider가 없음
- 출력 디렉터리 권한 부족
- 양식 라벨이 템플릿 안에서 예상과 다르게 배치되어 일부 필드가 인식되지 않음

## Notes

- `kordoc`은 HWP/HWPX뿐 아니라 HWPML, PDF, XLSX, DOCX도 함께 다룬다.
- 기본 목적은 **AI가 읽을 수 있는 Markdown/JSON 변환** 이다.
- 현재 배포본 기준으로 문서화된 CLI 명령은 기본 변환과 `watch` 이며, 양식 처리는 `extractFormFields()` 같은 Node API로 연결한다.
