from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _naver_http import is_naver_url, urlopen

DEFAULT_OUTPUT_DIR = "./naver-images"
DEFAULT_MAX = 10
DEFAULT_TIMEOUT = 15

DEFAULT_HEADERS = {
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "ko,en-US;q=0.9,en;q=0.8",
    "Referer": "https://m.blog.naver.com/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    ),
}

CONTENT_TYPE_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
}


_MAGIC_BYTES = (
    (b"\x89PNG\r\n\x1a\n", ".png"),
    (b"GIF87a", ".gif"),
    (b"GIF89a", ".gif"),
    (b"RIFF", ".webp"),  # WebP: RIFF....WEBP (check first 4 bytes)
    (b"BM", ".bmp"),
)


def guess_extension(url: str, content_type: str | None = None, data: bytes | None = None) -> str:
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        if ct in CONTENT_TYPE_TO_EXT:
            return CONTENT_TYPE_TO_EXT[ct]

    lower_url = url.lower().split("?")[0]
    for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"):
        if lower_url.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext

    if data:
        for magic, ext in _MAGIC_BYTES:
            if data[:len(magic)] == magic:
                if ext == ".webp" and data[8:12] != b"WEBP":
                    continue
                return ext
        if data[:2] in (b"\xff\xd8",):
            return ".jpg"

    return ".jpg"


def download_image(url: str, output_path: str, output_dir: str, timeout: int = DEFAULT_TIMEOUT, *, insecure: bool = False) -> dict:
    """Download a single image from a Naver CDN URL.

    *output_dir* is used solely for path-traversal protection: the resolved
    *output_path* must reside inside *output_dir*.
    """
    if not is_naver_url(url):
        return {"url": url, "error": "Not a Naver CDN URL. Skipped."}

    real_dir = os.path.realpath(output_dir)
    if not os.path.realpath(output_path).startswith(real_dir + os.sep):
        return {"url": url, "error": "Output path escapes target directory. Skipped."}

    request = urllib.request.Request(url, headers=DEFAULT_HEADERS)

    try:
        with urlopen(request, timeout, insecure=insecure) as response:
            data = response.read()
            content_type = response.headers.get("Content-Type", "")
    except (urllib.error.HTTPError, urllib.error.URLError, OSError) as error:
        return {"url": url, "error": str(error)}

    ext = guess_extension(url, content_type, data)
    if not os.path.splitext(output_path)[1]:
        output_path += ext

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    with open(output_path, "wb") as f:
        f.write(data)

    size_kb = round(len(data) / 1024, 1)
    return {"url": url, "path": output_path, "size_kb": size_kb}


def download_images(
    urls: list[str],
    output_dir: str = DEFAULT_OUTPUT_DIR,
    max_count: int = DEFAULT_MAX,
    timeout: int = DEFAULT_TIMEOUT,
    *,
    insecure: bool = False,
) -> dict:
    os.makedirs(output_dir, exist_ok=True)

    max_count = max(1, max_count)
    targets = urls[:max_count]
    downloaded: list[dict] = []
    failed: list[dict] = []

    # index → result 순서를 보장하기 위해 dict로 매핑
    results_by_index: dict[int, dict] = {}

    with ThreadPoolExecutor(max_workers=min(4, max(1, len(targets)))) as executor:
        future_to_index = {}
        for i, url in enumerate(targets, start=1):
            filename = f"{i:03d}"
            output_path = os.path.join(output_dir, filename)
            future = executor.submit(download_image, url, output_path, output_dir, timeout, insecure=insecure)
            future_to_index[future] = i

        for future in as_completed(future_to_index):
            idx = future_to_index[future]
            try:
                results_by_index[idx] = future.result()
            except Exception as exc:
                results_by_index[idx] = {"url": targets[idx - 1], "error": str(exc)}

    # 원래 순서대로 정렬
    for idx in sorted(results_by_index):
        result = results_by_index[idx]
        if "error" in result:
            failed.append(result)
        else:
            downloaded.append(result)

    return {
        "downloaded": len(downloaded),
        "files": downloaded,
        "failed": failed,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download images from Naver blog CDN URLs."
    )
    parser.add_argument(
        "--urls", type=str, default="",
        help="Comma-separated image URLs.",
    )
    parser.add_argument(
        "--output", type=str, default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory. Default: {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--max", type=int, default=DEFAULT_MAX,
        help=f"Maximum number of images to download. Default: {DEFAULT_MAX}",
    )
    parser.add_argument(
        "--timeout", type=int, default=DEFAULT_TIMEOUT,
        help=f"HTTP request timeout in seconds. Default: {DEFAULT_TIMEOUT}",
    )
    parser.add_argument(
        "--insecure", action="store_true",
        help="Skip SSL certificate verification (use only when certificate errors occur).",
    )
    return parser.parse_args(argv)


def read_urls_from_stdin() -> list[str]:
    try:
        data = json.load(sys.stdin)
        if isinstance(data, dict) and "images" in data:
            return [img["url"] for img in data["images"] if isinstance(img, dict) and img.get("url")]
        if isinstance(data, list):
            return [
                u for item in data
                if (u := (item if isinstance(item, str) else item.get("url", "")))
            ]
        if isinstance(data, dict):
            print(
                "[warn] stdin JSON에 'images' 키가 없습니다. "
                "naver_read.py 실행 시 --no-images 플래그를 사용하지 않았는지 확인하세요.",
                file=sys.stderr,
            )
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        print(f"[warn] stdin JSON 파싱 실패: {exc}", file=sys.stderr)
        return []
    return []


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    urls: list[str] = []

    if args.urls:
        urls = [u.strip() for u in args.urls.split(",") if u.strip()]

    if not urls and not sys.stdin.isatty():
        urls = read_urls_from_stdin()

    if not urls:
        print(
            json.dumps({"error": "No image URLs provided. Use --urls or pipe naver_read.py output via stdin."}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1

    result = download_images(
        urls,
        output_dir=args.output,
        max_count=args.max,
        timeout=args.timeout,
        insecure=args.insecure,
    )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
