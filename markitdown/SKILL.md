---
name: markitdown
description: Use Microsoft MarkItDown to convert PDF, Word, Excel, PowerPoint, HTML, images, and other file formats into clean Markdown text for LLM processing.
license: MIT
metadata:
  category: document
  locale: ko-KR
  phase: v1
---

# MarkItDown 문서 변환

## What this skill does

[Microsoft MarkItDown](https://github.com/microsoft/markitdown)을 사용해 다양한 파일 포맷을 **Markdown 텍스트로 변환**한다.

- PDF, Word(.docx), Excel(.xlsx), PowerPoint(.pptx), HTML, CSV, JSON, XML 등 지원
- 이미지에서 OCR 추출 가능 (선택적 옵션)
- 변환 결과를 stdout 또는 파일로 출력
- LLM 처리에 최적화된 토큰 효율적 포맷 유지

## When to use

- "이 PDF 파일을 마크다운으로 변환해줘"
- "Word 문서 내용을 텍스트로 추출해줘"
- "Excel 파일을 마크다운 테이블로 바꿔줘"
- "PowerPoint 슬라이드 내용을 정리해줘"
- "HTML 파일에서 본문만 추출해줘"
- 여러 형식 문서를 Claude가 읽을 수 있도록 전처리할 때

## When not to use

- 문서 서식/레이아웃 보존이 중요한 경우 (Markdown으로 변환 시 서식 손실 가능)
- 이미지 내 텍스트가 핵심인데 OCR 없이 처리하려는 경우
- 대용량 파일을 실시간으로 반복 변환해야 하는 프로덕션 배치 파이프라인

## Prerequisites

- Python 3.10+
- markitdown 설치:
  ```bash
  pip install 'markitdown[all]'
  ```
  특정 포맷만 필요하면 선택 설치:
  ```bash
  pip install markitdown          # 기본 (PDF, DOCX, XLSX, PPTX, HTML 등)
  pip install 'markitdown[pdf]'   # PDF 전용
  ```

## Workflow

### 1. 파일 경로 확인

- 변환할 파일 경로를 확인한다.
- 지원 포맷: `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.html`, `.htm`, `.csv`, `.json`, `.xml`, `.zip`, `.epub`, 이미지(`.jpg`, `.png` 등)

### 2. 변환 실행

```bash
python3 scripts/markitdown_convert.py --input path/to/file.pdf
```

출력 파일로 저장:

```bash
python3 scripts/markitdown_convert.py --input path/to/file.docx --output output.md
```

여러 파일 일괄 변환:

```bash
python3 scripts/markitdown_convert.py --input dir/ --output-dir out/
```

### 3. 결과 반환

변환된 Markdown 텍스트를 그대로 사용자에게 보여주거나, 이후 분석/요약 작업에 활용한다.

## Done when

- 지정된 파일이 Markdown 텍스트로 변환됐다.
- 변환 결과가 읽을 수 있는 텍스트를 포함하고 있다.
- 출력 파일이 요청된 경우 저장됐다.

## Notes

- 저장소: `https://github.com/microsoft/markitdown`
- 라이선스: MIT (Microsoft)
- OCR 기능은 `markitdown[all]` 또는 `markitdown[image]` 필요
- Azure Document Intelligence 연동은 별도 자격증명 필요
