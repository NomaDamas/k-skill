"""Download and verify the latest store-longevity snapshot."""

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile

DATASET_PAGE = "https://www.data.go.kr/data/15083033/fileData.do"
DOWNLOAD_URL = "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId={fid}&fileDetailSn=1"
USER_AGENT = "Mozilla/5.0 (compatible; k-skill-store-longevity-radar)"
CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "k-skill", "store-longevity-radar")
CACHE_TTL = 24 * 3600
MIRROR_MANIFEST_URL = os.environ.get(
    "KSKILL_STORE_LONGEVITY_MIRROR_MANIFEST_URL",
    "https://pub-c974105a1e4840bcaa264cb2a55d99a1.r2.dev/store-longevity-radar/latest.json",
)


def log(message):
    print(message, file=sys.stderr, flush=True)


def http_get(url, timeout=60):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
    )
    return urllib.request.urlopen(req, timeout=timeout)


def discover_atch_file_id():
    html = http_get(DATASET_PAGE).read().decode("utf-8", "replace")
    ids = re.findall(r"FILE_[0-9]{6,}", html)
    if not ids:
        raise ValueError(f"현재 파일 ID를 찾지 못함. 수동 확인: {DATASET_PAGE}")
    return ids[0]


def download_to_path(url, path, timeout):
    with http_get(url, timeout=timeout) as response, open(path, "wb") as output:
        while chunk := response.read(1 << 20):
            output.write(chunk)


def validate_snapshot_zip(path):
    with zipfile.ZipFile(path) as archive:
        corrupt_member = archive.testzip()
        if corrupt_member is not None:
            raise ValueError(f"손상된 ZIP 항목: {corrupt_member}")
        if not any(info.filename.lower().endswith(".csv") for info in archive.infolist()):
            raise ValueError("스냅샷 ZIP에 CSV가 없음")


def sha256_path(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        while chunk := source.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def download_mirror_zip(path):
    with http_get(MIRROR_MANIFEST_URL, timeout=30) as response:
        manifest = json.load(response)
    if not isinstance(manifest, dict):
        raise TypeError("미러 manifest가 JSON object가 아님")
    object_url = manifest.get("object_url")
    expected_size = manifest.get("size_bytes")
    expected_sha256 = manifest.get("sha256")
    if (
        not isinstance(object_url, str)
        or not object_url.startswith("https://")
        or not isinstance(expected_size, int)
        or expected_size <= 0
        or not isinstance(expected_sha256, str)
        or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256)
    ):
        raise ValueError("미러 manifest 형식이 올바르지 않음")
    tmp = path + ".mirror.part"
    download_to_path(object_url, tmp, timeout=1800)
    if os.path.getsize(tmp) != expected_size:
        raise ValueError("미러 ZIP 크기 불일치")
    if sha256_path(tmp) != expected_sha256:
        raise ValueError("미러 ZIP SHA-256 불일치")
    validate_snapshot_zip(tmp)
    os.replace(tmp, path)
    log(f"mirror cache: {object_url}")
    return path


def download_latest_zip():
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, "sdc_latest.zip")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < CACHE_TTL:
        log(f"cache hit: {path}")
        return path
    try:
        fid = discover_atch_file_id()
        log(f"downloading {fid} (수백 MB, 수 분 소요) ...")
        tmp = path + ".part"
        download_to_path(DOWNLOAD_URL.format(fid=fid), tmp, timeout=1800)
        validate_snapshot_zip(tmp)
        os.replace(tmp, path)
    except (
        TimeoutError,
        urllib.error.URLError,
        OSError,
        ValueError,
        zipfile.BadZipFile,
    ) as direct_exc:
        log(f"direct download unavailable: {direct_exc}; trying verified mirror")
        try:
            return download_mirror_zip(path)
        except (
            TimeoutError,
            urllib.error.URLError,
            OSError,
            TypeError,
            ValueError,
            json.JSONDecodeError,
            zipfile.BadZipFile,
        ) as mirror_exc:
            note = (
                f"공공데이터포털 직접 다운로드 실패: {direct_exc}. "
                f"검증 미러 다운로드 실패: {mirror_exc}. 수동 확인: {DATASET_PAGE}"
            )
            raise SystemExit(json.dumps({
                "status": "unavailable",
                "note": note,
            }, ensure_ascii=False)) from None
    return path
