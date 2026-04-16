# HWP 문서 처리 가이드

## 이 기능으로 할 수 있는 일

- `.hwp`, `.hwpx`, `.hwpml` 문서를 Markdown으로 변환
- 문서를 JSON으로 구조화해 `blocks`, `metadata`까지 AI에 넘기기
- 폴더 단위 배치 변환
- `watch`로 폴더를 감시하며 새 문서를 계속 변환
- 두 버전 문서 비교
- HWPX 양식 필드 추출
- Markdown을 다시 HWPX로 역변환

## 먼저 필요한 것

- Node.js 18+
- CLI를 한 번만 쓸 때: `npx --yes --package kordoc --package pdfjs-dist kordoc --help`
- 반복 실행용 전역 설치: `npm install -g kordoc pdfjs-dist`
- Node API 예시를 따라갈 로컬 작업 디렉터리: `npm init -y && npm install kordoc pdfjs-dist`
- 현재 배포된 `kordoc` CLI는 시작 시 `pdfjs-dist`를 바로 불러오므로 PDF를 안 다뤄도 함께 설치해야 한다
- `import { markdownToHwpx } from "kordoc"` 같은 ESM 예시는 전역 `NODE_PATH`가 아니라 로컬 설치 기준으로 실행해야 한다

## 어떤 경로를 선택하나

이 스킬의 기본 경로는 **항상 `kordoc`** 이다.

- 문서 읽기/변환 → `kordoc`
- 구조화 JSON 추출 → `kordoc --format json`
- 연속 입력 폴더 처리 → `kordoc watch`
- 양식 필드 추출 → `parse()` + `extractFormFields()`
- 역변환 → `markdownToHwpx()`
- 문서 비교 → `compare()`

이 스킬은 단일한 `kordoc` 경로를 표준 흐름으로 유지한다.

## 기본 흐름

1. `kordoc`이 없으면 설치한다.
2. `.hwp`/`.hwpx`/`.hwpml`을 Markdown 또는 JSON으로 변환한다.
3. 표·이미지·메타데이터가 필요하면 JSON의 `blocks` / `metadata`를 확인한다.
4. 반복 입력 폴더는 `watch`, 양식 문서는 `extractFormFields`, 편집 roundtrip은 `markdownToHwpx` 경로로 이어간다.
5. 결과 파일 생성 여부와 구조를 확인한다.

## 예시

### Markdown 변환

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc 보고서.hwp -o 보고서.md
```

### JSON 변환

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc 검토서.hwpx --format json > 검토서.json
```

### 배치 처리

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc ./문서함/* -d ./변환결과
```

### 페이지 범위 지정

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc 보고서.hwp --pages 1-3
```

### 디렉터리 감시 변환

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc watch ./문서함
```

### 양식 필드 추출

아래 Node API 예시는 `package.json`이 있는 로컬 작업 디렉터리에서:

```bash
npm init -y
npm install kordoc pdfjs-dist
```

이미 `package.json`이 있으면 `npm install kordoc pdfjs-dist`만 추가로 실행하면 된다.

```bash
node --input-type=module - <<'EOF'
import { parse, extractFormFields } from "kordoc";

const result = await parse("신청서.hwpx");
if (!result.success) {
  console.error(result.error);
  process.exit(1);
}

console.log(JSON.stringify(extractFormFields(result.blocks), null, 2));
EOF
```

### Markdown → HWPX 역변환

```bash
node --input-type=module - <<'EOF'
import { markdownToHwpx } from "kordoc";
import { writeFileSync } from "node:fs";

const hwpx = await markdownToHwpx("# 제목\n\n본문\n\n| 항목 | 값 |\n| --- | --- |\n| 성명 | 홍길동 |");
writeFileSync("출력.hwpx", Buffer.from(hwpx));
EOF
```

### 문서 비교

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

## 결과 확인 포인트

- Markdown 출력: 제목/본문/표가 기대한 순서로 정리됐는지 확인한다.
- JSON 출력: `success`, `blocks`, `metadata`가 있는지 확인한다.
- 이미지/표 구조: `blocks` 안 `image`, `table` 타입이 필요한 만큼 잡혔는지 확인한다.
- 배치 처리: 입력 개수와 출력 개수가 크게 어긋나지 않는지 확인한다.
- 양식 필드 추출: `extractFormFields(result.blocks)` 결과가 비어 있지 않은지 확인한다.
- 역변환: 생성된 `.hwpx` 가 열리고 기본 서식/테이블이 유지되는지 확인한다.
- 문서 비교: `diff.stats` 의 added / removed / modified 값이 입력 변화와 맞는지 확인한다.

## 주의할 점

- 손상된 문서나 일부 특수 양식은 경고가 섞일 수 있다.
- 이미지 기반 PDF는 OCR provider가 없으면 품질이 제한될 수 있다.
- 양식 필드 추출은 템플릿 라벨 품질에 따라 일부 필드가 인식되지 않을 수 있다.
- 공문서 자동화 목적이면 Markdown만 보는 것보다 JSON `blocks`를 같이 확인하는 편이 안전하다.
- 현재 배포본 기준으로 문서화된 CLI 명령은 기본 변환과 `watch` 이며, 양식 처리와 비교는 Node API 예시를 기준으로 잡는 편이 안전하다.
