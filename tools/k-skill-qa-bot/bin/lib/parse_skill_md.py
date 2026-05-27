#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(\n|$)", re.S)
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_BULLET_RE = re.compile(r"^\s*[-*]\s+(.+?)\s*$")


def parse_frontmatter(text: str) -> dict:
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}
    try:
        import yaml
        data = yaml.safe_load(m.group(1)) or {}
    except ImportError:
        return _parse_simple_yaml(m.group(1))
    if isinstance(data, dict):
        flat = {}
        for k, v in data.items():
            if isinstance(v, dict):
                for sk, sv in v.items():
                    if sk not in flat:
                        flat[sk] = sv
            else:
                flat[k] = v
        return flat
    return {}


def _parse_simple_yaml(text: str) -> dict:
    out = {}
    for line in text.splitlines():
        if ":" in line and not line.lstrip().startswith("#"):
            k, _, v = line.partition(":")
            v = v.strip().strip('"').strip("'")
            out[k.strip()] = v
    return out


def strip_body(text: str) -> str:
    m = _FRONTMATTER_RE.match(text)
    if m:
        return text[m.end():]
    return text


def extract_section_bullets(body: str, heading_keywords: list) -> list:
    lines = body.splitlines()
    in_section = False
    section_depth = 0
    bullets = []
    for ln in lines:
        h = _HEADING_RE.match(ln)
        if h:
            depth = len(h.group(1))
            title = h.group(2).lower()
            if any(kw.lower() in title for kw in heading_keywords):
                in_section = True
                section_depth = depth
                continue
            if in_section and depth <= section_depth:
                break
        elif in_section:
            b = _BULLET_RE.match(ln)
            if b:
                bullets.append(b.group(1).strip())
    return bullets


def discover(clone_root: Path) -> list:
    entries = []
    for child in sorted(clone_root.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        skill_md = child / "SKILL.md"
        if not skill_md.is_file():
            continue
        text = skill_md.read_text(encoding="utf-8-sig", errors="replace")
        fm = parse_frontmatter(text)
        body = strip_body(text)
        entry = {
            "name": fm.get("name") or child.name,
            "dir": str(child),
            "skill_md_path": str(skill_md),
            "frontmatter": fm,
            "when_to_use": extract_section_bullets(body, ["When to use"]),
            "done_when": extract_section_bullets(body, ["Done when"]),
            "failure_modes": extract_section_bullets(body, ["Failure modes"]),
            "prerequisites": extract_section_bullets(body, ["Prerequisites", "Credential requirements"]),
        }
        entries.append(entry)
    return entries


def main():
    if len(sys.argv) < 2:
        print("usage: parse_skill_md.py <clone-root>", file=sys.stderr)
        sys.exit(2)
    root = Path(sys.argv[1])
    if not root.is_dir():
        print(f"not a directory: {root}", file=sys.stderr)
        sys.exit(2)
    json.dump(discover(root), sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
