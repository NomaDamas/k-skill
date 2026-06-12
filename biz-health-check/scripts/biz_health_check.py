"""Business due-diligence composite — runs the sibling k-skill providers at once.

사업자등록번호(+상호/지역) 하나로 "이 사업자, 실제 문제 없나"를 무료 공공 데이터로
교차 조회해 실사 리포트 한 장을 만든다. 점수·등급·"위험" 라벨을 만들지 않고,
각 항목의 사실 + 출처 + 조회시각만 병렬한다. 판단은 사용자 몫이다.

이 복합 스킬은 같은 레포의 단품 스킬 helper들을 그대로 재사용한다(단일 진실원천):

- nts-business-registration   상태조회        (k-skill-proxy)
- national-pension-workplace  국민연금 사업장  (k-skill-proxy)
- fsc-corporate-info          금융위 법인개요  (k-skill-proxy)
- g2b-sanctioned-supplier     부정당제재       (k-skill-proxy)
- nts-tax-delinquency         체납 명단        (무인증 직접)
- localdata-business-status   인허가 영업상태  (무인증 직접, --region 필요)

단품 helper를 찾지 못하면 해당 항목만 정직하게 강등하고 나머지는 계속 진행한다.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import pathlib
import re
import sys
from typing import Any, Callable

KST = dt.timezone(dt.timedelta(hours=9))
_REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent

# (섹션 키, 사람이 읽는 라벨, 단품 스킬 디렉토리, helper 파일명)
_SIBLINGS = {
    "nts_status": ("국세청 사업자등록 상태", "nts-business-registration", "nts_business_registration.py"),
    "national_pension": ("국민연금 가입 사업장", "national-pension-workplace", "national_pension_workplace.py"),
    "fsc_corp": ("금융위 기업기본정보", "fsc-corporate-info", "fsc_corporate_info.py"),
    "g2b_sanction": ("조달청 부정당제재", "g2b-sanctioned-supplier", "g2b_sanctioned_supplier.py"),
    "tax_delinquency": ("국세 체납 명단공개", "nts-tax-delinquency", "nts_tax_delinquency.py"),
    "localdata": ("지방행정 인허가 영업상태", "localdata-business-status", "localdata_business_status.py"),
}


def _now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="seconds")


def _normalize_b_no(value: Any) -> str:
    normalized = re.sub(r"\D", "", str(value or ""))
    if not re.fullmatch(r"\d{10}", normalized):
        raise ValueError("사업자등록번호는 숫자 10자리여야 합니다 (하이픈 허용).")
    return normalized


def _unavailable(module_key: str, note: str) -> dict:
    label, skill_dir, _ = _SIBLINGS[module_key]
    return {"provider": label, "skill": skill_dir, "status": "unavailable",
            "looked_up_at": _now_iso(), "data": None, "note": note}

def _load(module_key: str) -> Any | None:
    """단품 스킬 helper를 레포 레이아웃 기준 파일 경로로 로드. 없으면 None."""
    _, skill_dir, filename = _SIBLINGS[module_key]
    path = _REPO_ROOT / skill_dir / "scripts" / filename
    if not path.exists():
        return None
    spec = importlib.util.spec_from_file_location(f"_bhc_{module_key}", path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _section(module_key: str, caller: Callable[[Any], dict]) -> dict:
    """단품 helper 하나를 호출해 섹션 결과로 감싼다. 어떤 오류든 강등."""
    label, skill_dir, _ = _SIBLINGS[module_key]
    base = {"provider": label, "skill": skill_dir, "looked_up_at": _now_iso()}
    try:
        module = _load(module_key)
    except Exception as err:
        return {**base, "status": "unavailable", "data": None,
                "note": f"단품 스킬 '{skill_dir}' helper import 실패({type(err).__name__}: {err})."}
    if module is None:
        return {**base, "status": "unavailable", "data": None,
                "note": f"단품 스킬 '{skill_dir}' helper를 찾지 못해 건너뜀 (개별 설치 시 함께 두세요)."}
    try:
        data = caller(module)
        status = "unavailable" if isinstance(data, dict) and (data.get("status") == "unavailable" or data.get("error")) else "ok"
        return {**base, "status": status, "data": data}
    except Exception as err:  # 경계 계약: 한 항목 실패가 전체를 막지 않는다
        return {**base, "status": "unavailable", "data": None, "note": f"조회 실패({type(err).__name__}: {err})."}


def run(b_no: str | None, name: str | None = None, region: str | None = None,
        industries: list[str] | None = None, *, base_url: str | None = None) -> dict:
    no = _normalize_b_no(b_no) if b_no else None
    name = (name or "").strip() or None
    sections: dict[str, dict] = {}

    if no:
        sections["nts_status"] = _section(
            "nts_status", lambda m: m.query_status([no], base_url=base_url))
    else:
        sections["nts_status"] = _unavailable("nts_status", "사업자등록번호가 없어 상태조회 생략.")

    sections["national_pension"] = _section(
        "national_pension",
        lambda m: m.query_workplace(name, no, base_url=base_url)) if name else \
        _unavailable("national_pension", "상호(--name)가 없어 국민연금 조회 생략.")

    sections["fsc_corp"] = _section(
        "fsc_corp",
        lambda m: m.query_corp_outline(name, no, base_url=base_url)) if name else \
        _unavailable("fsc_corp", "법인명(--name)이 없어 금융위 조회 생략.")

    sections["g2b_sanction"] = _section(
        "g2b_sanction", lambda m: m.query_sanctions(no, base_url=base_url)) if no else \
        _unavailable("g2b_sanction", "사업자등록번호가 없어 부정당제재 조회 생략.")

    sections["tax_delinquency"] = _section(
        "tax_delinquency", lambda m: m.lookup(name)) if name else \
        _unavailable("tax_delinquency", "상호(--name)가 없어 체납 명단 조회 생략.")

    if name and region:
        sections["localdata"] = _section(
            "localdata", lambda m: m.lookup(name, region, industries))
    else:
        sections["localdata"] = _unavailable("localdata", "동네 사업장 인허가 조회는 상호(--name)와 지역(--region)이 함께 필요.")

    return {
        "query": {"b_no": no, "name": name, "region": region, "industries": industries},
        "generated_at": _now_iso(),
        "disclaimer": ("무료 공공 데이터의 사실만 병렬한 실사 리포트다. 점수·등급·위험 판정은 "
                       "하지 않으며, 동일성·해석은 사용자가 판단한다."),
        "sections": sections,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="사업자 실사 복합 조회 (단품 k-skill 6종 묶음)")
    parser.add_argument("b_no", nargs="?", default=None, help="사업자등록번호 10자리(하이픈 허용)")
    parser.add_argument("--name", help="상호·법인명 — 국민연금/금융위/체납/인허가 조회에 필요")
    parser.add_argument("--region", help="시군구 (동네 사업장 인허가 조회용 — 예: 제주제주시)")
    parser.add_argument("--industry", action="append", dest="industries", help="인허가 업종(여러 번 지정 가능)")
    parser.add_argument("--proxy-base-url")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = run(args.b_no, args.name, args.region, args.industries, base_url=args.proxy_base_url)
    except ValueError as err:
        print(json.dumps({"error": str(err)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
