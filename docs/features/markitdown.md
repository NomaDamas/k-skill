# 문서 → Markdown 변환 가이드 (MarkItDown)

## 이 기능으로 할 수 있는 일

- PDF, Word(.docx), Excel(.xlsx), PowerPoint(.pptx), HTML, CSV, JSON, XML, EPUB 등을 Markdown 텍스트로 변환
- ZIP 아카이브 내부 파일 일괄 변환
- 이미지 파일에서 OCR로 텍스트 추출 (선택 설치 필요)
- 디렉토리 내 파일 전체 일괄 변환 및 저장
- LLM 처리에 최적화된 구조 유지 (테이블, 제목, 목록 등)

## 설치

```bash
# 모든 포맷 지원 (권장)
pip install 'markitdown[all]'

# 기본 포맷만 (PDF, DOCX, XLSX, PPTX, HTML 등)
pip install markitdown
```

## 지원 포맷

| 포맷 | 확장자 |
|------|--------|
| PDF | `.pdf` |
| Word | `.docx` |
| Excel | `.xlsx` |
| PowerPoint | `.pptx` |
| HTML | `.html`, `.htm` |
| CSV | `.csv` |
| JSON | `.json` |
| XML | `.xml` |
| EPUB | `.epub` |
| ZIP | `.zip` |
| 이미지 (OCR) | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp` |

## 사용 예시

단일 파일 변환 (stdout 출력):

```bash
python3 scripts/markitdown_convert.py --input report.pdf
```

파일로 저장:

```bash
python3 scripts/markitdown_convert.py --input report.docx --output report.md
```

디렉토리 일괄 변환:

```bash
python3 scripts/markitdown_convert.py --input docs/ --output-dir markdown_docs/
```

## 출력 예시

Excel 파일 변환 결과:

```markdown
## Sheet1

| 이름 | 나이 | 직책 |
|------|------|------|
| 김철수 | 30 | 개발자 |
| 이영희 | 28 | 디자이너 |
```

PowerPoint 슬라이드 변환 결과:

```markdown
## 슬라이드 1: 프로젝트 개요

- 프로젝트 목표: ...
- 일정: 2026년 Q2

## 슬라이드 2: 팀 구성

...
```

## CLI 옵션

```
--input, -i    변환할 파일 또는 디렉토리 경로 (필수)
--output, -o   출력 파일 경로 (단일 파일, 기본: stdout)
--output-dir   출력 디렉토리 (디렉토리 모드)
```

## 직접 CLI 사용

markitdown 자체 CLI도 사용 가능:

```bash
markitdown path/to/file.pdf > output.md
markitdown path/to/file.docx
```

## 주의 사항

- 복잡한 테이블/수식이 있는 문서는 Markdown 변환 시 일부 서식 손실 가능
- 스캔 PDF(이미지 PDF)는 OCR 옵션 없이 텍스트 추출 불가
- 이미지 OCR은 `markitdown[all]` 또는 `markitdown[image]` 설치 필요
- 민감한 문서를 외부 서비스(Azure AI 연동 등)로 보내는 경우 보안 검토 필요
  - 기본 설치는 로컬 처리만 하므로 일반적으로 안전

## 참고

- 저장소: `https://github.com/microsoft/markitdown`
- 라이선스: MIT (Microsoft)
- Python 3.10+ 필요
