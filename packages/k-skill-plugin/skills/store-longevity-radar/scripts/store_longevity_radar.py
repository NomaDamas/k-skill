# -*- coding: utf-8 -*-
"""store-longevity-radar — 상가(상권)정보 스냅샷 기반 업종 전수 추출 + 장수 점포 매칭.

python3 stdlib만 사용한다.

subcommands:
  current  최신 공개 스냅샷(무인증 zip)에서 업종코드/상호 키워드로 점포 전수 추출
  match    current 결과에 과거 스냅샷 CSV를 매칭해 장수 점포 추출

데이터 출처: 공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」 파일데이터
(https://www.data.go.kr/data/15083033/fileData.do) — 비회원 다운로드 가능.
"""
import argparse
import csv
import io
import json
import math
import re
import sys
import zipfile
from store_longevity_download import download_latest_zip

DEFAULT_CODES = ["G21302", "G21306"]          # 문구/회화용품 소매업, 장난감 소매업 (2022~ 코드체계)
DEFAULT_KEYWORDS = ["문구", "문방구", "완구", "장난감"]
LEGACY_CODES_BY_CURRENT = {
    "G21302": {"D08A01"},
    "G21306": {"D04A01", "D04A02"},
}
COLS = ["상가업소번호", "상호명", "상권업종소분류코드", "상권업종소분류명",
        "시도명", "시군구명", "행정동명", "도로명주소", "지번주소", "경도", "위도"]


def log(msg):
    print(msg, file=sys.stderr)


def norm_name(s):
    s = re.sub(r"[\s()\[\]{}\-_.·&']", "", s or "")
    return re.sub(r"(점|본점|지점)$", "", s)


def row_matches(d, codes, keywords):
    if d.get("상권업종소분류코드") in codes:
        return True
    name = d.get("상호명", "")
    return any(k in name for k in keywords)


def historical_codes(codes):
    expanded = set(codes)
    for code in codes:
        expanded.update(LEGACY_CODES_BY_CURRENT.get(code, ()))
    return expanded


def iter_csv(fobj, delimiter):
    reader = csv.reader(io.TextIOWrapper(fobj, encoding="utf-8", errors="replace"),
                        delimiter=delimiter)
    header = next(reader)
    idx = {h: i for i, h in enumerate(header)}
    for row in reader:
        yield {h: (row[i] if i < len(row) else "") for h, i in idx.items() if h in COLS}


def extract_current(args):
    path = args.zip or download_latest_zip()
    rows = []
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            if not info.filename.endswith(".csv"):
                continue
            if args.sido and not any(s in info.filename for s in args.sido):
                continue
            with z.open(info) as f:
                for d in iter_csv(f, ","):
                    if row_matches(d, set(args.code), args.keyword):
                        rows.append(d)
    return rows


def load_old(paths, codes, keywords):
    rows = []
    for p in paths:
        with open(p, "rb") as f:
            head = f.read(4096).decode("utf-8", "replace")
        delim = "|" if head.count("|") > head.count(",") else ","
        with open(p, "rb") as f:
            for d in iter_csv(f, delim):
                if row_matches(d, codes, keywords):
                    rows.append(d)
    return rows


def dist_m(a, b):
    try:
        return math.hypot((float(a["경도"]) - float(b["경도"])) * 88800,
                          (float(a["위도"]) - float(b["위도"])) * 111000)
    except (ValueError, KeyError):
        return float("inf")


def match_longevity(current, old, max_dist):
    old_by_id = {o["상가업소번호"]: o for o in old if o.get("상가업소번호")}
    old_by_name = {}
    for o in old:
        old_by_name.setdefault(norm_name(o.get("상호명")), []).append(o)
    out = []
    for c in current:
        o, how = old_by_id.get(c.get("상가업소번호")), "상가업소번호"
        if not o:
            best = None
            for cand in old_by_name.get(norm_name(c.get("상호명")), []):
                d = dist_m(cand, c)
                if d <= max_dist and (best is None or d < best[1]):
                    best = (cand, d)
            if best:
                o, how = best[0], f"상호+좌표({best[1]:.0f}m)"
        if o:
            rec = dict(c)
            rec["과거상호"] = o.get("상호명", "")
            rec["과거업종"] = o.get("상권업종소분류명", "")
            rec["매칭방법"] = how
            out.append(rec)
    return out


def write_out(rows, out, fmt):
    if fmt == "json" or not out:
        payload = json.dumps({"count": len(rows), "rows": rows}, ensure_ascii=False)
        if out:
            with open(out, "w", encoding="utf-8") as f:
                f.write(payload)
        else:
            print(payload)
        return
    cols = list(rows[0].keys()) if rows else COLS
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(json.dumps({"count": len(rows), "saved": out}, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--code", action="append", default=None,
                        help="상권업종소분류코드 (반복 지정, 기본 G21302/G21306)")
    common.add_argument("--keyword", action="append", default=None,
                        help="상호 키워드 (반복 지정, 기본 문구/문방구/완구/장난감)")
    common.add_argument("--sido", action="append", default=None,
                        help="시도명 부분 문자열 필터 (예: 서울, 부산). 생략 시 전국")
    common.add_argument("--zip", help="이미 받아둔 최신 스냅샷 zip 경로 (생략 시 자동 다운로드+캐시)")
    common.add_argument("--out", help="출력 파일 경로 (생략 시 stdout JSON)")
    common.add_argument("--format", choices=["csv", "json"], default="csv")

    sub.add_parser("current", parents=[common], help="최신 스냅샷 업종 전수 추출")
    mp = sub.add_parser("match", parents=[common], help="과거 스냅샷과 매칭해 장수 점포 추출")
    mp.add_argument("--old-csv", action="append", required=True,
                    help="과거 상가업소 CSV 경로 (반복 지정 가능, '|'/',' 자동 감지)")
    mp.add_argument("--max-dist", type=float, default=150.0,
                    help="상호 동일 시 허용 좌표 거리(m), 기본 150")

    args = p.parse_args()
    args.code = args.code or DEFAULT_CODES
    args.keyword = args.keyword or DEFAULT_KEYWORDS

    current = extract_current(args)
    log(f"current: {len(current)}건")
    if args.cmd == "current":
        write_out(current, args.out, args.format)
        return
    old = load_old(args.old_csv, historical_codes(set(args.code)), args.keyword)
    log(f"old: {len(old)}건")
    write_out(match_longevity(current, old, args.max_dist), args.out, args.format)


if __name__ == "__main__":
    main()
