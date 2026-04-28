#!/usr/bin/env python3
"""Utilities for the k-skill-cleaner skill.

The helper intentionally stays dependency-free: it scans root-level skill
folders, best-effort local agent logs, and optional interview choices to produce
a conservative cleanup shortlist. It never deletes files by itself.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

EXCLUDED_ROOT_DIRS = {
    ".changeset",
    ".claude",
    ".codex",
    ".cursor",
    ".git",
    ".github",
    ".omx",
    ".ouroboros",
    ".vscode",
    "docs",
    "examples",
    "node_modules",
    "packages",
    "python-packages",
    "scripts",
}

AGENT_USAGE_SOURCES = [
    {
        "agent": "Claude Code",
        "paths": ["~/.claude/projects/**/*.jsonl", "~/.claude/transcripts/**/*.jsonl"],
        "method": "Scan JSONL transcript lines for skill-trigger events, $skill mentions, and SKILL.md load markers.",
        "confidence": "best-effort",
    },
    {
        "agent": "Codex",
        "paths": ["~/.codex/sessions/**/*.jsonl", "~/.codex/log/**/*.log", ".omx/logs/**/*.log"],
        "method": "Scan Codex session/log lines for routed skill names, $skill invocations, and SKILL.md reads.",
        "confidence": "best-effort",
    },
    {
        "agent": "OpenCode",
        "paths": ["~/.local/share/opencode/**/*.jsonl", "~/.config/opencode/**/*.jsonl"],
        "method": "Scan OpenCode data/config logs when available; ask for an exported transcript otherwise.",
        "confidence": "best-effort",
    },
    {
        "agent": "OpenClaw/ClawHub",
        "paths": ["~/.openclaw/**/*.jsonl", "~/.clawhub/**/*.jsonl"],
        "method": "No stable public trigger-count schema is assumed; use local logs if present or imported JSON counts.",
        "confidence": "manual-confirm",
        "fallback": "Ask the user to export trigger stats or provide a usage JSON file.",
    },
    {
        "agent": "Hermes Agent",
        "paths": ["~/.hermes/**/*.jsonl", "~/.config/hermes/**/*.jsonl"],
        "method": "No stable public trigger-count schema is assumed; use local logs if present or imported JSON counts.",
        "confidence": "manual-confirm",
        "fallback": "Ask the user to export trigger stats or provide a usage JSON file.",
    },
]


def find_skill_dirs(root: Path | str) -> list[str]:
    """Return root-level directories that look like installable skills."""

    root_path = Path(root)
    skills: list[str] = []
    for child in root_path.iterdir():
        if not child.is_dir() or child.name in EXCLUDED_ROOT_DIRS:
            continue
        if (child / "SKILL.md").is_file():
            skills.append(child.name)
    return sorted(skills)


def _walk_strings(value: Any, key_hint: str | None = None) -> Iterable[tuple[str | None, str]]:
    if isinstance(value, str):
        yield key_hint, value
    elif isinstance(value, Mapping):
        for key, child in value.items():
            yield from _walk_strings(child, str(key))
    elif isinstance(value, list):
        for child in value:
            yield from _walk_strings(child, key_hint)


def _line_mentions_skill(line: str, skill: str) -> bool:
    escaped = re.escape(skill)
    patterns = [
        rf"(?<![\w-])\${escaped}(?![\w-])",
        rf"(?i)\bskill(?:[_ -]?name|[_ -]?id)?\s*[:=]\s*['\"]?{escaped}(?![\w-])",
        rf"(?<![\w-]){escaped}/SKILL\.md\b",
        rf"(?i)\bloaded skill\s*[:=]?\s*['\"]?{escaped}(?![\w-])",
        rf"(?i)\busing\s+\${escaped}(?![\w-])",
    ]
    return any(re.search(pattern, line) for pattern in patterns)


def _json_mentions_skill(record: Any, skill: str) -> bool:
    key_names = {"skill", "skillname", "skill_name", "skillid", "skill_id", "name"}
    for key, value in _walk_strings(record):
        normalized_key = (key or "").replace("-", "").replace("_", "").lower()
        if normalized_key in key_names and value == skill:
            return True
        if _line_mentions_skill(value, skill):
            return True
    return False


def collect_skill_usage(log_paths: Iterable[Path | str], skill_names: Iterable[str]) -> dict[str, int]:
    """Best-effort count of skill trigger mentions across local agent logs."""

    skills = sorted(set(skill_names))
    counts = {skill: 0 for skill in skills}
    for raw_path in log_paths:
        path = Path(raw_path).expanduser()
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            parsed: Any | None = None
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                parsed = None
            for skill in skills:
                if (parsed is not None and _json_mentions_skill(parsed, skill)) or _line_mentions_skill(line, skill):
                    counts[skill] += 1
    return counts


def load_usage_json(path: Path | str | None) -> dict[str, int]:
    if path is None:
        return {}
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, Mapping):
        raise ValueError("usage JSON must be an object mapping skill names to counts")
    counts: dict[str, int] = {}
    for key, value in data.items():
        try:
            counts[str(key)] = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"usage count for {key!r} must be an integer") from exc
    return counts


def rank_cleanup_candidates(
    skill_names: Iterable[str],
    usage_counts: Mapping[str, int] | None = None,
    never_use: Iterable[str] | None = None,
    keep: Iterable[str] | None = None,
    low_usage_threshold: int = 1,
) -> list[dict[str, Any]]:
    """Rank deletion/review candidates without touching the filesystem."""

    counts = usage_counts or {}
    never = set(never_use or [])
    protected = set(keep or [])
    candidates: list[dict[str, Any]] = []

    for skill in sorted(set(skill_names)):
        if skill in protected:
            continue
        count = int(counts.get(skill, 0))
        reasons: list[str] = []
        score = 0
        action = "keep"

        if skill in never:
            reasons.append("interview_never_use")
            score += 100
            action = "remove"
        if count == 0:
            reasons.append("zero_triggers")
            score += 50
        elif count <= low_usage_threshold:
            reasons.append("low_usage")
            score += 20
        if not reasons:
            continue
        if action != "remove":
            action = "review"

        candidates.append(
            {
                "skill": skill,
                "action": action,
                "trigger_count": count,
                "score": score,
                "reasons": reasons,
            }
        )

    return sorted(candidates, key=lambda item: (-item["score"], item["skill"]))


def expand_default_log_paths() -> list[Path]:
    paths: list[Path] = []
    for source in AGENT_USAGE_SOURCES:
        for pattern in source.get("paths", []):
            paths.extend(Path().glob(os.path.expanduser(pattern)) if not pattern.startswith("~") else Path.home().glob(pattern[2:]))
    return sorted({path for path in paths if path.is_file()})


def parse_csv(value: str | None) -> set[str]:
    if not value:
        return set()
    return {item.strip() for item in value.split(",") if item.strip()}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Suggest K-skill cleanup candidates from interviews and usage logs.")
    parser.add_argument("--skills-root", default=".", help="Repository root containing root-level skill directories")
    parser.add_argument("--usage-json", help="Optional JSON object mapping skill names to trigger counts")
    parser.add_argument("--log", action="append", default=[], help="Agent log file to scan; repeatable")
    parser.add_argument("--scan-default-logs", action="store_true", help="Best-effort scan known local agent log locations")
    parser.add_argument("--never-use", default="", help="Comma-separated skills the user says they never use")
    parser.add_argument("--keep", default="", help="Comma-separated skills to protect from suggestions")
    parser.add_argument("--low-usage-threshold", type=int, default=1, help="Counts at or below this threshold are review candidates")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    skill_names = find_skill_dirs(args.skills_root)
    usage_counts = {skill: 0 for skill in skill_names}
    usage_counts.update(load_usage_json(args.usage_json))

    log_paths = [Path(path) for path in args.log]
    if args.scan_default_logs:
        log_paths.extend(expand_default_log_paths())
    log_counts = collect_skill_usage(log_paths, skill_names)
    for skill, count in log_counts.items():
        usage_counts[skill] = usage_counts.get(skill, 0) + count

    report = {
        "skill_count": len(skill_names),
        "candidates": rank_cleanup_candidates(
            skill_names=skill_names,
            usage_counts=usage_counts,
            never_use=parse_csv(args.never_use),
            keep=parse_csv(args.keep),
            low_usage_threshold=args.low_usage_threshold,
        ),
        "agent_usage_sources": AGENT_USAGE_SOURCES,
        "safety": "No files were deleted. Review candidates and remove skills in a separate explicit edit.",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
