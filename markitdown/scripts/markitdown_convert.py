#!/usr/bin/env python3
"""markitdown_convert.py — convert files to Markdown using Microsoft MarkItDown."""

import argparse
import sys
from pathlib import Path


def check_markitdown():
    try:
        from markitdown import MarkItDown  # noqa: F401
    except ImportError:
        print(
            "Error: markitdown is not installed.\n"
            "Install with: pip install 'markitdown[all]'",
            file=sys.stderr,
        )
        sys.exit(1)


def convert_file(input_path: Path, output_path: Path | None = None) -> str:
    from markitdown import MarkItDown

    md = MarkItDown()
    result = md.convert(str(input_path))
    text = result.text_content

    if output_path:
        output_path.write_text(text, encoding="utf-8")
        print(f"Saved: {output_path}", file=sys.stderr)

    return text


def convert_directory(input_dir: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    supported = {
        ".pdf", ".docx", ".xlsx", ".pptx", ".html", ".htm",
        ".csv", ".json", ".xml", ".epub", ".zip",
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
    }
    files = [f for f in input_dir.iterdir() if f.suffix.lower() in supported]
    if not files:
        print(f"No supported files found in {input_dir}", file=sys.stderr)
        return

    for f in sorted(files):
        out = output_dir / (f.stem + ".md")
        print(f"Converting: {f.name} -> {out.name}", file=sys.stderr)
        try:
            convert_file(f, out)
        except Exception as e:
            print(f"  Error: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        description="Convert files to Markdown using Microsoft MarkItDown"
    )
    parser.add_argument("--input", "-i", required=True, help="Input file or directory")
    parser.add_argument("--output", "-o", help="Output file (single file mode)")
    parser.add_argument(
        "--output-dir", help="Output directory (directory mode)"
    )
    args = parser.parse_args()

    check_markitdown()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: {input_path} does not exist", file=sys.stderr)
        sys.exit(1)

    if input_path.is_dir():
        output_dir = Path(args.output_dir) if args.output_dir else input_path / "markdown_output"
        convert_directory(input_path, output_dir)
    else:
        output_path = Path(args.output) if args.output else None
        text = convert_file(input_path, output_path)
        if not output_path:
            print(text)


if __name__ == "__main__":
    main()
