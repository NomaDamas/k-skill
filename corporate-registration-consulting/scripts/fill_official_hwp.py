#!/usr/bin/env python3
"""Fill the bundled official Korean stock-company incorporation HWP form.

This script intentionally writes to a caller-provided output path and never
modifies the bundled official source form in place.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
OFFICIAL_DIR = SKILL_DIR / "templates" / "official"
DEFAULT_FORM = OFFICIAL_DIR / "form-65-1-stock-company-incorporation-promoter.hwp"
DEFAULT_MAP = OFFICIAL_DIR / "form-65-1-fill-map.json"
HELPER = SCRIPT_DIR / "_rhwp_set_cell.mjs"


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def stringify(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(str(item) for item in value if item is not None)
    if isinstance(value, (int, float)):
        return f"{value:,.0f}"
    return str(value)


def fill_form(data: dict, form_path: Path, map_path: Path, output_path: Path, cwd: Path) -> list[str]:
    fill_map = load_json(map_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    ops: list[dict] = []

    for field_name, spec in fill_map["fields"].items():
        if field_name in data:
            text = stringify(data[field_name])
        elif "default" in spec:
            text = stringify(spec["default"])
        else:
            continue
        ops.append(
            {
                "section": spec["section"],
                "parentParagraph": spec["parentParagraph"],
                "control": spec["control"],
                "cell": spec["cell"],
                "cellParagraph": spec.get("cellParagraph", 0),
                "text": text,
            }
        )
        written.append(field_name)

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as f:
        json.dump(ops, f, ensure_ascii=False)
        ops_json_path = Path(f.name)

    try:
        cmd = ["node", str(HELPER), str(form_path), str(output_path), str(ops_json_path)]
        result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip())
        summary = json.loads(result.stdout)
        if not summary.get("ok"):
            raise RuntimeError(result.stdout.strip())
    finally:
        ops_json_path.unlink(missing_ok=True)

    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fill official form 65-1 HWP with JSON data")
    parser.add_argument("--input-json", required=True, type=Path, help="JSON file with form field values")
    parser.add_argument("--output", required=True, type=Path, help="Output HWP path outside the repository")
    parser.add_argument("--form", type=Path, default=DEFAULT_FORM, help="Official HWP source form")
    parser.add_argument("--map", dest="map_path", type=Path, default=DEFAULT_MAP, help="HWP cell fill map")
    parser.add_argument("--cwd", type=Path, default=Path.cwd(), help="Directory where Node can resolve @rhwp/core")
    args = parser.parse_args(argv)

    data = load_json(args.input_json)
    written = fill_form(data, args.form, args.map_path, args.output, args.cwd)
    print(json.dumps({"ok": True, "output": str(args.output), "fields_written": written}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        print(f"fill_official_hwp.py: {exc}", file=sys.stderr)
        raise SystemExit(1)
