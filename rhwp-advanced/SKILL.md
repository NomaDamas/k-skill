---
name: rhwp-advanced
description: Debug HWP layout, dump document IR, compare versions, extract thumbnails, and unlock read-only HWPs with the upstream rhwp Rust CLI (export-svg/dump/dump-pages/ir-diff/thumbnail/convert).
license: MIT
metadata:
  category: documents
  locale: ko-KR
  phase: v1.5
---

# rhwp-advanced

## What this skill does

**업스트림 `rhwp` CLI**(Rust 네이티브 바이너리)를 써서 HWP 파일의 **레이아웃 디버깅·IR 구조 검사·버전 비교·썸네일 추출·배포용 문서 잠금 해제** 를 수행한다.
`k-skill-rhwp`(Node 편집 CLI)가 다루지 못하는 구조 분석·렌더 문제 진단용이다.

이 스킬은 **편집을 하지 않는다**. 편집은 [`rhwp-edit`](../rhwp-edit/SKILL.md) 스킬, 문서 → Markdown/JSON 변환은 [`hwp`](../hwp/SKILL.md) 스킬(kordoc) 을 쓴다.

## When to use

- "표/셀이 이상하게 잘려. 어디서 깨지는지 IR 덤프를 보고 싶어"
- "두 HWP 파일 구조 차이를 줄 단위로 보고 싶어"
- "SVG 렌더가 이상해. 문단/표 경계선을 시각적으로 확인하고 싶어"
- "페이지가 몇 개이고 어느 문단이 몇 페이지에 걸쳐 있는지 보고 싶어"
- "배포용(읽기전용) HWP 파일 잠금을 풀고 싶어"
- "HWP 파일에서 PrvImage 썸네일을 꺼내고 싶어"

## When not to use

- **텍스트/표 편집** → `rhwp-edit` 스킬 (`k-skill-rhwp` CLI)
- **HWP → Markdown/JSON/양식필드 변환** → `hwp` 스킬 (`kordoc`)
- **GUI 자동화, 한컴 보안모듈 우회, Windows 레지스트리 제어** → 범위 밖이다.
- **Node 코드에서 라이브러리 API 로 편집** → `k-skill-rhwp` 를 Node API 로 쓴다.

## Prerequisites

- **rhwp CLI 바이너리**. 다음 중 하나:
  - `cargo install rhwp` (Rust toolchain 필요. Rust 1.75+. 네이티브 빌드이므로 PDF export 포함 전체 서브커맨드 가능)
  - 또는 업스트림 릴리스 페이지 https://github.com/edwardkim/rhwp/releases 에서 플랫폼별 사전 빌드 바이너리 다운로드(있는 플랫폼 한정)
- PATH 에 `rhwp` 실행 파일이 있는지 `rhwp --help` 로 먼저 확인한다.
- 출력 파일 쓰기 권한.
- 선택: PDF export 를 쓸 거면 업스트림 문서에서 해당 서브커맨드의 추가 요구사항 확인.

## Inputs

- 입력 HWP/HWPX 파일 경로
- 서브커맨드별 좌표(구역/문단 index) 또는 페이지 번호
- 출력 경로(일부 서브커맨드)

## Routing policy

| 목적 | 서브커맨드 | 대표 예시 |
| --- | --- | --- |
| 기본 메타(페이지/폰트/섹션 통계) | `rhwp info` | `rhwp info sample.hwp` |
| 페이지를 SVG 로 렌더 | `rhwp export-svg` | `rhwp export-svg sample.hwp -o out/ -p 0 --debug-overlay` |
| 페이지를 PDF 로 렌더(네이티브 빌드 한정) | `rhwp export-pdf` | `rhwp export-pdf sample.hwp -o out.pdf` |
| 문서 IR 구조 덤프 | `rhwp dump` | `rhwp dump sample.hwp -s 0 -p 3` |
| 페이지네이션 결과 덤프 | `rhwp dump-pages` | `rhwp dump-pages sample.hwp -p 2` |
| 원시 레코드 덤프 | `rhwp dump-records` | `rhwp dump-records sample.hwp` |
| 번호/글머리표/개요 진단 | `rhwp diag` | `rhwp diag sample.hwp` |
| 두 파일 IR 비교 | `rhwp ir-diff` | `rhwp ir-diff a.hwpx b.hwp` |
| PrvImage 썸네일 추출 | `rhwp thumbnail` | `rhwp thumbnail sample.hwp -o thumb.png` |
| 배포용(읽기전용) → 편집 가능 변환 | `rhwp convert` | `rhwp convert locked.hwp unlocked.hwp` |
| 빈 표 포함 문서 템플릿 생성 | `rhwp gen-table` | `rhwp gen-table out.hwp` |

> `rhwp` v0.7.3 CLI 에는 **편집(edit/insert-text/save) 서브커맨드가 없다.** 편집은 `rhwp-edit` 스킬 (`k-skill-rhwp` CLI) 을 쓴다.

## Workflow

1. **설치 확인**: `rhwp --help` 실행. 서브커맨드 리스트가 나오지 않으면 설치부터.

   ```bash
   command -v rhwp || cargo install rhwp
   rhwp --help | head
   ```

2. **메타 조회로 좌표 범위 확인**: 먼저 `rhwp info` 로 페이지 수, 섹션 수, 사용 폰트, 표/이미지 통계를 얻는다.

   ```bash
   rhwp info sample.hwp
   ```

3. **목적별 플로우**:

   - **SVG 렌더가 이상할 때** — 디버그 오버레이 포함 SVG 를 뽑는다.

     ```bash
     mkdir -p out
     rhwp export-svg sample.hwp -o out/ -p 0 --debug-overlay
     open out/page-0.svg    # 문단/표 경계선과 `s{sec}:pi={idx} y={y}` 라벨이 시각화됨
     ```

   - **특정 페이지 레이아웃을 더 자세히 보고 싶을 때** — 페이지네이션 덤프.

     ```bash
     rhwp dump-pages sample.hwp -p 2
     ```

   - **표가 깨져 보일 때** — IR 덤프에서 셀 구조·ParaShape·LINE_SEG 를 본다.

     ```bash
     rhwp dump sample.hwp -s 0 -p 3
     ```

   - **두 버전 비교** — IR diff 로 구조 변경만 추린다.

     ```bash
     rhwp ir-diff draft-v1.hwp draft-v2.hwp > ir-diff.txt
     ```

   - **썸네일 추출**:

     ```bash
     rhwp thumbnail sample.hwp -o cover.png
     # 또는 data URI 가 필요하면: --data-uri
     ```

   - **배포용(읽기전용) 문서 잠금 해제**:

     ```bash
     rhwp convert locked.hwp unlocked.hwp
     # 이후 편집은 rhwp-edit 스킬의 k-skill-rhwp CLI 로 수행
     ```

4. **결과를 PR/보고서에 붙일 때**: SVG/PDF/썸네일은 파일 자체를 첨부하고, 덤프 출력은 너무 길면 상위 200~500 줄만 인용하고 전체는 파일로 첨부한다. 개인정보가 포함된 문서의 본문 텍스트는 마스킹한다.

## Verify outputs

- `export-svg`: 지정한 `-o` 경로에 `page-N.svg` 파일이 생겼고, 열었을 때 텍스트/도형이 보이며 `--debug-overlay` 사용 시 빨강/파랑 가이드선이 나타난다.
- `dump` / `dump-pages` / `dump-records`: stdout 에 JSON/텍스트 구조가 최소 수십 줄 이상 나온다.
- `ir-diff`: 두 파일이 구조적으로 같으면 거의 비어 있고, 다르면 줄 단위 delta 가 보인다.
- `thumbnail`: 지정한 출력 경로의 PNG 가 실제 이미지 뷰어에서 열린다.
- `convert`: 출력 파일을 다시 `rhwp info` 로 열었을 때 read-only 플래그가 내려가 있다.

## Done when

- 디버깅/검사 목적이라면: 사용자가 원한 구조/렌더 정보가 찍혀 있고 어느 서브커맨드 어떤 플래그로 뽑았는지 명시돼 있다.
- `convert` 같은 one-shot 변환이라면: 산출 파일이 생성되었고 `rhwp info` 로 재확인 가능.

## Failure modes

- **`rhwp: command not found`** → `cargo install rhwp` 혹은 릴리스 바이너리 설치부터.
- **`export-pdf` 실패** → PDF 는 네이티브 빌드에서만 보장. `@rhwp/core` WASM 경로에서는 불가. 네이티브 `cargo install` 바이너리로 실행 중인지 확인.
- **HWPX 저장 경로 비활성화(rhwp #196)** → `rhwp` CLI 자체가 HWPX 를 다시 HWPX 로 내보내지 않도록 막아둔 상태. 저장이 필요한 작업은 HWP 5.x 로만 수행한다.
- **편집 서브커맨드 부재** → v0.7.3 기준 `rhwp` CLI 는 편집 명령을 제공하지 않는다. 편집은 `rhwp-edit` 스킬.
- **Windows 보안모듈/한컴 GUI 자동화** → 본 스킬 범위 밖. `rhwp` 는 파일 포맷 엔진이다.
- **버전 드리프트** → rhwp 는 활발히 개발 중이다. 서브커맨드 플래그가 바뀌거나 추가될 수 있으니 `rhwp <subcommand> --help` 를 먼저 확인한다.

## Notes

- 업스트림: https://github.com/edwardkim/rhwp
- 편집 경로(이 repo): [`rhwp-edit`](../rhwp-edit/SKILL.md)
- 조회/변환 경로(이 repo): [`hwp`](../hwp/SKILL.md)
- 이 스킬은 **설치 안내 + 실행 레시피**에 가까운 안내형 스킬이다. 프로그램적 제어가 필요하면 `rhwp-edit` 의 Node API(`k-skill-rhwp`)를 쓰고, 여기서는 빠른 디버깅용으로만 사용한다.
