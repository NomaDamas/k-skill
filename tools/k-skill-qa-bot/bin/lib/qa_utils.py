from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable


DEFAULT_TEST_LOCATION = "서울역 (37.5665,126.9780)"

VERDICT_INSTRUCTION = (
    "After your answer, end with a single line that is exactly one of: "
    "VERDICT: PASS or VERDICT: FAIL."
)

_STRIKE_RE = re.compile(r"~~\s*`?([A-Za-z0-9][A-Za-z0-9_.\-]*)`?\s*~~")
_DEPRECATION_MARK_RE = re.compile(r"지원\s*중단")


def load_overrides(path):
    p = Path(path)
    if not p.is_file():
        return {}
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError(
            "PyYAML is required to load skill-overrides.yml — `pip install pyyaml`"
        ) from exc

    data = yaml.safe_load(p.read_text(encoding="utf-8"))
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(
            f"skill-overrides.yml must be a YAML mapping at top level, got {type(data).__name__}"
        )
    return {k: v for k, v in data.items() if isinstance(v, dict)}


def parse_readme_deprecations(readme_path):
    p = Path(readme_path)
    if not p.is_file():
        return set()
    try:
        text = p.read_text(encoding="utf-8")
    except OSError:
        return set()

    deprecated = set()
    for line in text.splitlines():
        if not _DEPRECATION_MARK_RE.search(line):
            continue
        for match in _STRIKE_RE.finditer(line):
            name = match.group(1).strip()
            if name:
                deprecated.add(name)
    return deprecated


def _first_non_empty(values: Iterable[str]):
    for v in values:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def synthesize_test_prompt(name, when_to_use, description, category_flags, default_inputs):
    flags = category_flags or {}
    inputs = default_inputs or {}

    override_prompt = inputs.get("test_prompt") if isinstance(inputs, dict) else None
    if isinstance(override_prompt, str) and override_prompt.strip():
        body = override_prompt.strip()
        if VERDICT_INSTRUCTION in body or "VERDICT: PASS" in body:
            return body
        return f"{body} Use the `{name}` skill to answer this. {VERDICT_INSTRUCTION}"

    query = (
        _first_non_empty(when_to_use or [])
        or (description.strip() if isinstance(description, str) and description.strip() else None)
        or f"Demonstrate the {name} skill."
    )

    parts = []
    if flags.get("location"):
        loc = inputs.get("location") or DEFAULT_TEST_LOCATION
        parts.append(f"내 현재 위치는 {loc} 이야.")
    parts.append(query)
    parts.append(f"Use the `{name}` skill to answer this. {VERDICT_INSTRUCTION}")
    return " ".join(parts)


__all__ = [
    "DEFAULT_TEST_LOCATION",
    "VERDICT_INSTRUCTION",
    "load_overrides",
    "parse_readme_deprecations",
    "synthesize_test_prompt",
]
