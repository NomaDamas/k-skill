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
from datetime import datetime, timedelta, timezone
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


def resolve_skills_root(root: Path | str) -> Path:
    """Resolve the directory that contains installable skill directories.

    Standalone installs tell users to run this helper from inside the
    ``k-skill-cleaner`` directory with ``--skills-root .``. In that layout, the
    current directory is itself a skill, while sibling skill directories live in
    the parent directory. Treat that self-skill root as shorthand for its parent
    so the advertised standalone command scans the installed skill bundle.
    """

    root_path = Path(root).expanduser().resolve()
    if (root_path / "SKILL.md").is_file():
        parent = root_path.parent
        if any(
            child.is_dir()
            and child.name not in EXCLUDED_ROOT_DIRS
            and (child / "SKILL.md").is_file()
            for child in parent.iterdir()
        ):
            return parent
    return root_path


def find_skill_dirs(root: Path | str) -> list[str]:
    """Return root-level directories that look like installable skills."""

    root_path = resolve_skills_root(root)
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


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None or isinstance(value, datetime):
        parsed = value
    else:
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            try:
                parsed = datetime.fromisoformat(f"{raw}T00:00:00")
            except ValueError as exc:
                raise ValueError("since must be an ISO date or datetime") from exc
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _line_datetime_from_json(record: Any) -> datetime | None:
    timestamp_keys = {"timestamp", "time", "created_at", "createdat", "date", "datetime", "ts"}
    if not isinstance(record, Mapping):
        return None
    for key, value in record.items():
        normalized_key = str(key).replace("-", "").replace("_", "").lower()
        if normalized_key in timestamp_keys and isinstance(value, str):
            try:
                return _parse_datetime(value)
            except ValueError:
                return None
    return None


def _line_datetime_from_text(line: str) -> datetime | None:
    match = re.search(r"\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b", line)
    if not match:
        return None
    raw = match.group(0)
    if "T" not in raw and " " not in raw:
        raw = f"{raw}T00:00:00"
    if re.search(r"[+-]\d{4}$", raw):
        raw = f"{raw[:-2]}:{raw[-2:]}"
    try:
        return _parse_datetime(raw.replace(" ", "T", 1))
    except ValueError:
        return None


def _mtime_datetime(path: Path) -> datetime:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)


def _line_is_in_window(path: Path, line: str, parsed: Any | None, since: datetime | None) -> bool:
    if since is None:
        return True
    line_dt = _line_datetime_from_json(parsed) if parsed is not None else None
    if line_dt is None:
        line_dt = _line_datetime_from_text(line)
    if line_dt is None:
        line_dt = _mtime_datetime(path)
    return line_dt >= since


def collect_skill_usage(
    log_paths: Iterable[Path | str],
    skill_names: Iterable[str],
    since: str | datetime | None = None,
) -> dict[str, int]:
    """Best-effort count of skill trigger mentions across local agent logs.

    When ``since`` is provided, timestamped records older than the cutoff are
    skipped. Lines without parseable timestamps fall back to the log file mtime,
    which keeps the selected interview window enforceable even for mixed log
    formats.
    """

    since_dt = _parse_datetime(since)
    skills = sorted(set(skill_names))
    counts = {skill: 0 for skill in skills}
    for raw_path in log_paths:
        path = Path(raw_path).expanduser()
        if not path.is_file():
            continue
        try:
            with path.open(encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    parsed: Any | None = None
                    try:
                        parsed = json.loads(line)
                    except json.JSONDecodeError:
                        parsed = None
                    if not _line_is_in_window(path, line, parsed, since_dt):
                        continue
                    for skill in skills:
                        if (parsed is not None and _json_mentions_skill(parsed, skill)) or _line_mentions_skill(line, skill):
                            counts[skill] += 1
        except OSError:
            continue
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


def _resolve_since(days: int | None, since: str | None, now: datetime | None = None) -> datetime | None:
    explicit_since = _parse_datetime(since)
    if explicit_since is not None:
        return explicit_since
    if days is None:
        return None
    if days < 0:
        raise ValueError("days must be zero or greater")
    base = now or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    else:
        base = base.astimezone(timezone.utc)
    return base - timedelta(days=days)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Suggest K-skill cleanup candidates from interviews and usage logs.")
    parser.add_argument(
        "--skills-root",
        default=".",
        help="Directory containing root-level skills; a skill directory with SKILL.md auto-scans its parent",
    )
    parser.add_argument("--usage-json", help="Optional JSON object mapping skill names to trigger counts")
    parser.add_argument("--log", action="append", default=[], help="Agent log file to scan; repeatable")
    parser.add_argument("--scan-default-logs", action="store_true", help="Best-effort scan known local agent log locations")
    parser.add_argument("--never-use", default="", help="Comma-separated skills the user says they never use")
    parser.add_argument("--keep", default="", help="Comma-separated skills to protect from suggestions")
    parser.add_argument("--low-usage-threshold", type=int, default=1, help="Counts at or below this threshold are review candidates")
    parser.add_argument("--days", type=int, help="Only count log records from the last N days; untimestamped lines use file mtime fallback")
    parser.add_argument("--since", help="Only count log records on or after this ISO date/datetime; overrides --days")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    skill_names = find_skill_dirs(args.skills_root)
    usage_counts = {skill: 0 for skill in skill_names}
    usage_counts.update(load_usage_json(args.usage_json))

    log_paths = [Path(path) for path in args.log]
    if args.scan_default_logs:
        log_paths.extend(expand_default_log_paths())
    since = _resolve_since(args.days, args.since)
    scanned_log_paths = sorted({str(path.expanduser()) for path in log_paths if path.expanduser().is_file()})
    log_counts = collect_skill_usage(log_paths, skill_names, since=since)
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
        "time_window": {
            "since": since.isoformat() if since is not None else None,
            "days": args.days if args.since is None else None,
            "scope": "Applies to scanned logs only; usage JSON counts are merged as already aggregated/pre-windowed input.",
            "fallback": "Untimestamped log lines are included or skipped by log file mtime.",
        },
        "usage_json": {
            "applied": args.usage_json is not None,
            "path": args.usage_json,
            "caveat": "Usage JSON counts are treated as already aggregated/pre-windowed and are not filtered by --days or --since.",
        },
        "scanned_logs": {
            "count": len(scanned_log_paths),
            "paths": scanned_log_paths,
            "caveat": "Unreadable log files are skipped; trigger detection is best-effort.",
        },
        "safety": "No files were deleted. Review candidates and remove skills in a separate explicit edit.",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
