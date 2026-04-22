# HWP 레이아웃·IR 디버깅 (rhwp-advanced)

`rhwp-advanced` 스킬은 **업스트림 `rhwp` Rust CLI** 를 실제로 설치해서 HWP 파일의 **구조·레이아웃·버전 차이·썸네일**을 꺼내 보는 디버깅/검사 스킬이다. 편집은 하지 않는다.

- 편집 → [`rhwp-edit` 스킬](rhwp-edit.md) (`k-skill-rhwp` CLI + `@rhwp/core` WASM)
- 조회/변환 → [`hwp` 스킬](hwp.md) (kordoc)

## 준비

`rhwp` 네이티브 바이너리가 `PATH` 에 있어야 한다. 두 가지 설치 경로가 있다.

```bash
# (1) Rust toolchain 으로 직접 빌드 설치 — 서브커맨드 전체(PDF export 포함) 사용 가능
cargo install rhwp

# (2) 업스트림 릴리스 바이너리 — 플랫폼별 사전 빌드 제공 여부 확인
# https://github.com/edwardkim/rhwp/releases
```

설치 후 확인:

```bash
command -v rhwp && rhwp --help | head
```

## 서브커맨드 매트릭스 (v0.7.3 기준)

| 목적 | 서브커맨드 | 예시 |
| --- | --- | --- |
| 기본 메타 | `rhwp info` | `rhwp info sample.hwp` |
| 페이지 SVG 렌더(디버그 오버레이) | `rhwp export-svg` | `rhwp export-svg sample.hwp -o out/ -p 0 --debug-overlay` |
| 페이지 PDF 렌더 (네이티브 빌드 한정) | `rhwp export-pdf` | `rhwp export-pdf sample.hwp -o out.pdf` |
| 문서 IR 구조 덤프 | `rhwp dump` | `rhwp dump sample.hwp -s 0 -p 3` |
| 페이지네이션 덤프 | `rhwp dump-pages` | `rhwp dump-pages sample.hwp -p 2` |
| 원시 레코드 덤프 | `rhwp dump-records` | `rhwp dump-records sample.hwp` |
| 번호·글머리표·개요 진단 | `rhwp diag` | `rhwp diag sample.hwp` |
| 두 파일 IR 비교 | `rhwp ir-diff` | `rhwp ir-diff a.hwpx b.hwp > ir-diff.txt` |
| PrvImage 썸네일 추출 | `rhwp thumbnail` | `rhwp thumbnail sample.hwp -o thumb.png` |
| 배포용(읽기전용) 잠금 해제 | `rhwp convert` | `rhwp convert locked.hwp unlocked.hwp` |
| 표 템플릿 신규 문서 생성 | `rhwp gen-table` | `rhwp gen-table out.hwp` |

> **편집 서브커맨드는 없다.** v0.7.3 기준 업스트림 `rhwp` CLI 에는 `edit` / `insert-text` / `save` 같은 in-place 편집 명령이 없다. 편집은 `rhwp-edit` 스킬 (`k-skill-rhwp` CLI) 이 맡는다.

## 자주 쓰는 플로우

### SVG 렌더가 이상하게 보일 때

디버그 오버레이를 붙인 SVG 를 뽑아 문단/표 경계 라벨(`s{sec}:pi={idx} y={y}`) 로 문제 위치를 좁힌다.

```bash
mkdir -p out
rhwp export-svg sample.hwp -o out/ -p 0 --debug-overlay
open out/page-0.svg
```

### 페이지 레이아웃이 궁금할 때

```bash
rhwp dump-pages sample.hwp -p 2
```

### 표 구조/ParaShape 가 이상할 때

```bash
rhwp dump sample.hwp -s 0 -p 3
```

### 두 버전 비교

```bash
rhwp ir-diff draft-v1.hwp draft-v2.hwp > ir-diff.txt
wc -l ir-diff.txt
```

### 썸네일 꺼내기

```bash
rhwp thumbnail sample.hwp -o cover.png
# 또는 data URI 로 바로 쓰려면
rhwp thumbnail sample.hwp --data-uri
```

### 배포용(읽기전용) 잠금 해제

```bash
rhwp convert locked.hwp unlocked.hwp
# 이후 편집은 `k-skill-rhwp` CLI (rhwp-edit 스킬) 로
```

## 검증 포인트

- `export-svg`: `-o` 경로에 `page-N.svg` 생성, 뷰어로 열어 텍스트·도형·오버레이 확인.
- `dump*`: stdout 에 수십 줄 이상 구조 출력.
- `ir-diff`: 파일 간 차이가 없으면 거의 빈 출력, 있으면 줄 단위 delta.
- `thumbnail`: PNG 가 이미지 뷰어에서 정상 표시.
- `convert`: 산출 파일을 다시 `rhwp info` 로 열었을 때 read-only 표시 해제.

## 제약 / 주의

- **PDF export 는 네이티브 빌드 한정**. `@rhwp/core` WASM 경로에서는 불가. `cargo install rhwp` 로 설치한 네이티브 바이너리로 돌려야 한다.
- **HWPX 저장 비활성화(rhwp #196)**: `rhwp` 자체가 HWPX → HWPX round-trip 을 막아 둔 상태. 저장이 필요한 작업은 HWP 5.x 로만.
- **버전 드리프트**: rhwp 는 빠르게 개발 중이다(v0.7.3 2026-04-19). 각 서브커맨드의 flag 는 `rhwp <subcommand> --help` 로 먼저 확인.
- **개인정보 보호**: `dump*` / `ir-diff` 출력에 원문 텍스트가 그대로 섞일 수 있다. PR/보고서에 붙일 때 필요 구간만 인용하고 민감한 본문은 마스킹.
- **Windows GUI/보안모듈**: `rhwp` 는 파일 포맷 엔진이다. 한컴 GUI 자동화·보안모듈 우회는 범위 밖.

## 참고

- 업스트림: https://github.com/edwardkim/rhwp
- CLI 서브커맨드 소스: https://github.com/edwardkim/rhwp/blob/main/src/main.rs
- 편집 경로(이 repo): [`rhwp-edit`](rhwp-edit.md)
- 조회 경로(이 repo): [`hwp`](hwp.md)
- 스킬 정의: [`rhwp-advanced/SKILL.md`](../../rhwp-advanced/SKILL.md)
