#!/usr/bin/env python3
"""등기부등본(등기사항증명서) PDF → 사실 요약 (판단 없음).

iros-registry-automation 스킬의 **발급 후 단계** 전용. 사용자가 직접 로그인·결제해
받은 PDF에서 근저당·가압류·소유권 변동 등 핵심 항목을 "PDF에 이렇게 적혀 있다"는
사실만 뽑아 사람이 읽기 쉬운 요약으로 만든다.

지켜야 할 것 (기존 스킬 hard limit 승계):
- 로그인/결제는 사람이 직접 — 이 스크립트는 발급 후에만 관여한다.
- **법률 자문·권리관계 해석·안전/위험 판단을 하지 않는다.** 사실 추출까지만.
- 개인정보: 이 스크립트는 **어디에도 전송하지 않는다**(로컬 처리 전용). 주민등록번호는
  마스킹한다. 요약 결과는 저장소·PR·로그에 남기지 말고 $workdir/output 등 비공개 폴더에만 둔다.

입력:
- PDF 경로 → 로컬 텍스트 추출(pdfplumber → pypdf). 텍스트 레이어가 있는 등기 PDF에 적합.
- 이미 변환된 텍스트/마크다운(`--from-text`) → 스캔 PDF를 사용자가 self-host 변환기
  (예: marker, https://github.com/NomaDamas/marker-api-server)로 변환한 결과를 그대로 요약.
  ※ marker는 로컬에서 사용자가 직접 실행하며, 이 스크립트가 원격으로 PDF를 보내지 않는다.

사용 예:
  python iros_pdf_summary.py "$workdir/downloads/등기.pdf" --out "$workdir/output"
  python iros_pdf_summary.py 변환결과.md --from-text
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ── 개인정보 마스킹 ──────────────────────────────────────────────
RRN_RE = re.compile(r"\b\d{6}[-\s]?[1-4]\d{6}\b")  # 주민등록번호


def mask_pii(text: str) -> str:
    """주민등록번호를 마스킹한다. 요약/로그 어디서도 원문 노출 금지."""
    return RRN_RE.sub("******-*******", text)


# ── 텍스트 추출 (로컬 전용, 무전송) ──────────────────────────────
def extract_text_from_pdf(pdf_path: Path) -> str:
    """PDF에서 텍스트 레이어를 로컬로 추출. 네트워크 사용 없음."""
    try:
        import pdfplumber  # 표(근저당 목록) 추출에 유리
        with pdfplumber.open(str(pdf_path)) as pdf:
            return "\n".join((page.extract_text() or "") for page in pdf.pages)
    except ImportError:
        pass
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(pdf_path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except ImportError:
        raise SystemExit(
            "PDF 텍스트 추출 라이브러리가 없습니다. `pip install pypdf`(권장) 또는 "
            "`pip install pdfplumber` 후 다시 실행하세요.\n"
            "스캔(이미지) PDF라면, 로컬에 self-host한 변환기(예: marker)로 먼저 "
            "텍스트/마크다운으로 바꾼 뒤 `--from-text <파일>`로 요약하세요."
        )


def load_input_text(input_path: Path, from_text: bool) -> str:
    """입력을 텍스트로 로드. PDF면 로컬 추출, 아니면(또는 --from-text) 파일을 그대로 읽는다."""
    is_pdf = input_path.suffix.lower() == ".pdf"
    if is_pdf and not from_text:
        return extract_text_from_pdf(input_path)
    return input_path.read_text(encoding="utf-8", errors="replace")


# ── 파싱 헬퍼 ────────────────────────────────────────────────────
DATE_RE = re.compile(r"(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일")
AMOUNT_RE = re.compile(r"채권최고액\s*금?\s*([\d,]+)\s*원")


def _iso_date(m: "re.Match") -> str:
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def detect_doc_type(text: str) -> str:
    """부동산 / 법인 / 불명. 사실 판별(구조 마커 기반)."""
    real = any(k in text for k in ("표제부", "표 제 부", "집합건물", "【갑구】", "【 갑 구 】", "갑        구", "을        구"))
    corp = any(k in text for k in ("법인등기", "상        호", "임원에 관한 사항", "본        점", "발행할 주식"))
    if real and not corp:
        return "부동산"
    if corp and not real:
        return "법인"
    if real:
        return "부동산"
    if corp:
        return "법인"
    return "불명"


def find_issued_at(text: str) -> str | None:
    """열람/발급 일시 (사실). 없으면 None."""
    for label in ("열람일시", "발급일시", "출력일시", "발행일시"):
        idx = text.find(label)
        if idx != -1:
            m = DATE_RE.search(text[idx:idx + 60])
            if m:
                return _iso_date(m)
    return None


def count_owner_changes(text: str) -> int:
    """갑구 소유권이전 등기 건수 (소유자 변동 건수, 사실). 청구권가등기는 제외."""
    return len(re.findall(r"소유권이전(?!청구권)", text))


def _section(text: str, start_markers, end_markers) -> str:
    """지정 구간 텍스트만 잘라낸다(없으면 전체)."""
    lo = -1
    for mk in start_markers:
        i = text.find(mk)
        if i != -1:
            lo = i
            break
    if lo == -1:
        return text
    hi = len(text)
    for mk in end_markers:
        j = text.find(mk, lo + 1)
        if j != -1:
            hi = min(hi, j)
    return text[lo:hi]


def extract_mortgages(text: str) -> list:
    """근저당권 목록: 채권최고액·설정일·말소여부 (사실 나열, 판단 없음).

    을구 구간에서 '근저당권설정'마다 인접 채권최고액·접수일을 뽑고,
    'N번근저당권설정등기말소'로 언급된 순위번호는 말소로 표시한다.
    구조가 흐트러진 추출 텍스트에선 누락될 수 있어 원문 대조를 권한다.
    """
    eul = _section(text, ("【을구】", "【 을 구 】", "을        구", "을   구"),
                   ("【갑구】", "【표제부】"))
    # 말소된 순위번호 수집
    canceled_ranks = set(int(n) for n in re.findall(r"(\d+)\s*번\s*근저당권설정(?:등기)?\s*말소", text))

    mortgages = []
    for m in re.finditer(r"근저당권설정(?!등기말소|\s*등기\s*말소)", eul):
        window = eul[m.start(): m.start() + 500]
        amt_m = AMOUNT_RE.search(window)
        date_m = DATE_RE.search(window)
        # 순위번호: '근저당권설정' 직전의 숫자(줄 시작 순위)
        before = eul[max(0, m.start() - 40): m.start()]
        rank_m = re.search(r"(\d+)\D*$", before)
        rank = int(rank_m.group(1)) if rank_m else None
        amount_won = int(amt_m.group(1).replace(",", "")) if amt_m else None
        mortgages.append({
            "rank": rank,
            "amount_won": amount_won,
            "amount_text": (f"채권최고액 금 {amt_m.group(1)}원" if amt_m else None),
            "registered_date": (_iso_date(date_m) if date_m else None),
            "canceled": (rank in canceled_ranks) if rank is not None else False,
        })
    return mortgages


def count_encumbrances(text: str) -> dict:
    """가압류·가처분·압류·경매개시결정 언급 건수 (사실)."""
    return {
        "가압류": len(re.findall(r"가압류", text)),
        "가처분": len(re.findall(r"가처분", text)),
        "압류": len(re.findall(r"(?<!가)압류", text)),  # '가압류'의 압류 중복 제외
        "경매개시결정": len(re.findall(r"경매개시결정", text)),
    }


# ── 요약 (테스트 대상 순수 함수) ─────────────────────────────────
def summarize_registry(text: str, source: str = "local-pdf") -> dict:
    """등기부 텍스트 → 사실 요약 dict. 판단·해석 없음. PII(주민번호)는 마스킹된 텍스트 전제."""
    text = mask_pii(text)
    mortgages = extract_mortgages(text)
    active = sum(1 for x in mortgages if not x["canceled"])
    return {
        "doc_type": detect_doc_type(text),
        "issued_at": find_issued_at(text),
        "owner_change_count": count_owner_changes(text),
        "mortgages": mortgages,
        "mortgage_count": len(mortgages),
        "active_mortgage_count": active,
        "canceled_mortgage_count": len(mortgages) - active,
        "encumbrances": count_encumbrances(text),
        "source": source,
        "notes": [
            "PDF 텍스트에서 자동 추출한 사실입니다. 판단·법률자문이 아니며, 원문과 대조하세요.",
            "말소 여부·순위번호는 추출 텍스트 구조에 따라 부정확할 수 있습니다.",
        ],
    }


# ── 사람이 읽는 요약 (사실만) ────────────────────────────────────
def render_markdown(summary: dict) -> str:
    lines = ["# 등기부등본 요약 (사실 추출 · 판단 없음)", ""]
    lines.append(f"- 종류: {summary['doc_type']}")
    lines.append(f"- 열람/발급 일시: {summary['issued_at'] or '미상'}")
    lines.append(f"- 소유권 변동(소유권이전) 건수: {summary['owner_change_count']}건")
    lines.append(f"- 근저당권: 총 {summary['mortgage_count']}건 "
                 f"(유효 {summary['active_mortgage_count']} / 말소 {summary['canceled_mortgage_count']})")
    for i, mo in enumerate(summary["mortgages"], 1):
        amt = f"{mo['amount_won']:,}원" if mo["amount_won"] else "금액 미상"
        state = "말소" if mo["canceled"] else "유효"
        rank = f"순위 {mo['rank']}" if mo["rank"] else "순위 미상"
        lines.append(f"  {i}. {rank} · 채권최고액 {amt} · 설정일 {mo['registered_date'] or '미상'} · {state}")
    enc = summary["encumbrances"]
    enc_str = ", ".join(f"{k} {v}건" for k, v in enc.items() if v) or "없음(텍스트 기준)"
    lines.append(f"- 가압류·가처분·압류 등: {enc_str}")
    lines.append("")
    for n in summary["notes"]:
        lines.append(f"> {n}")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description="등기부등본 PDF → 사실 요약(판단 없음)")
    ap.add_argument("input", help="등기부 PDF 경로 또는 (--from-text 시) 텍스트/마크다운 파일")
    ap.add_argument("--from-text", action="store_true",
                    help="입력을 이미 텍스트/마크다운으로 취급(스캔 PDF를 로컬 변환기로 바꾼 결과 등)")
    ap.add_argument("--out", help="요약 저장 폴더($workdir/output 권장). 없으면 표준출력만.")
    ap.add_argument("--json", action="store_true", help="표준출력을 JSON으로")
    args = ap.parse_args(argv)

    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"입력 파일이 없습니다: {input_path}")

    text = load_input_text(input_path, args.from_text)
    source = "text-file" if (args.from_text or input_path.suffix.lower() != ".pdf") else "local-pdf"
    summary = summarize_registry(text, source=source)

    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print(render_markdown(summary))

    if args.out:
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "registry-summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (out_dir / "registry-summary.md").write_text(render_markdown(summary), encoding="utf-8")
        print(f"\n[저장] {out_dir}/registry-summary.(json|md)  ※ 개인정보 포함 가능 — 저장소/PR에 커밋 금지",
              file=sys.stderr)


if __name__ == "__main__":
    main()
