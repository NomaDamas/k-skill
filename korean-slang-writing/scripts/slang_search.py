#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from typing import Any, Iterable


DEFAULT_LIMIT = 10
MAX_LIMIT = 50

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DEFAULT_INDEX_PATH = SKILL_ROOT / "data" / "seed-slang.json"

MATCH_REASON_ORDER = {
    "exact": 0,
    "alias": 1,
    "substring": 2,
    "no-query": 3,
}


def load_index(path: str | None = None) -> dict:
    target = pathlib.Path(path) if path else DEFAULT_INDEX_PATH
    if not target.exists():
        raise FileNotFoundError(f"slang index not found at: {target}")
    with target.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or "entries" not in data:
        raise ValueError(f"invalid slang index (missing 'entries'): {target}")
    return data


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _collect_match(entry: dict, query_norm: str) -> str | None:
    term_norm = _normalize(entry.get("term", ""))
    if not query_norm:
        return "no-query"
    if term_norm == query_norm:
        return "exact"
    aliases = entry.get("aliases") or []
    alias_norms = [_normalize(a) for a in aliases]
    if query_norm in alias_norms:
        return "alias"
    if query_norm in term_norm:
        return "substring"
    for alias_norm in alias_norms:
        if query_norm and query_norm in alias_norm:
            return "substring"
    return None


def _ensure_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, Iterable):
        return [str(v) for v in value]
    return [str(value)]


def _has_overlap(entry_tags: list[str], requested: list[str]) -> bool:
    if not requested:
        return True
    entry_set = {t.strip().lower() for t in entry_tags}
    requested_set = {t.strip().lower() for t in requested}
    return bool(entry_set & requested_set)


def _matches_single(value: str | None, allowed: list[str]) -> bool:
    if not allowed:
        return True
    if value is None:
        return False
    return value.strip().lower() in {a.strip().lower() for a in allowed}


def _era_sort_key(era: str) -> int:
    digits = "".join(ch for ch in era if ch.isdigit())
    try:
        return -int(digits[:4]) if digits else 0
    except ValueError:
        return 0


def search(
    *,
    query: str | None = None,
    mood: list[str] | None = None,
    context: list[str] | None = None,
    safety: str | list[str] | None = None,
    intensity: str | list[str] | None = None,
    limit: int = DEFAULT_LIMIT,
    include_deprecated: bool = False,
    index: dict | None = None,
    index_path: str | None = None,
) -> dict:
    if index is None:
        index = load_index(index_path)

    entries: list[dict] = list(index.get("entries", []))

    mood_list = _ensure_list(mood)
    context_list = _ensure_list(context)
    safety_list = _ensure_list(safety)
    intensity_list = _ensure_list(intensity)

    query_norm = _normalize(query) if query else ""
    clamped_limit = max(1, min(int(limit), MAX_LIMIT))

    scored: list[tuple[int, int, str, dict]] = []

    for entry in entries:
        if not include_deprecated and not entry.get("still_usable", True):
            continue

        match_reason = _collect_match(entry, query_norm)
        if match_reason is None:
            continue

        if not _has_overlap(entry.get("mood_tags") or [], mood_list):
            continue
        if not _has_overlap(entry.get("usage_context") or [], context_list):
            continue
        if not _matches_single(entry.get("safety"), safety_list):
            continue
        if not _matches_single(entry.get("intensity"), intensity_list):
            continue

        order = MATCH_REASON_ORDER.get(match_reason, 9)
        era_rank = _era_sort_key(str(entry.get("era", "")))
        scored.append((order, era_rank, str(entry.get("term", "")), {**entry, "match_reason": match_reason}))

    scored.sort(key=lambda item: (item[0], item[1], item[2]))

    matched_before_limit = len(scored)
    candidates = [row[3] for row in scored[:clamped_limit]]

    return {
        "query": query,
        "filters_applied": {
            "mood": mood_list,
            "context": context_list,
            "safety": safety_list,
            "intensity": intensity_list,
            "limit": clamped_limit,
            "include_deprecated": include_deprecated,
        },
        "matched_before_limit": matched_before_limit,
        "total_candidates": len(candidates),
        "candidates": candidates,
        "source": index.get("source", ""),
        "last_reviewed": index.get("last_reviewed", ""),
    }


def _format_text(result: dict) -> str:
    if not result["candidates"]:
        return "No candidates found.\n"
    lines: list[str] = []
    query = result.get("query") or "(no query)"
    lines.append(f"Query: {query}")
    lines.append(
        f"Matched: {result['matched_before_limit']} -> showing {result['total_candidates']}"
    )
    lines.append("")
    for idx, entry in enumerate(result["candidates"], start=1):
        mood = ", ".join(entry.get("mood_tags") or []) or "-"
        context = ", ".join(entry.get("usage_context") or []) or "-"
        lines.append(
            f"{idx}. {entry['term']} ({entry.get('era', '?')}) "
            f"[{entry.get('safety', '?')}, {entry.get('intensity', '?')}]"
        )
        lines.append(f"   mood: {mood}")
        lines.append(f"   context: {context}")
        lines.append(f"   meaning: {entry.get('meaning_short', '')}")
        examples = entry.get("example_usage") or []
        if examples:
            lines.append(f"   example: {examples[0]}")
        lines.append(f"   match: {entry.get('match_reason', '?')}")
        lines.append(f"   url: {entry.get('namuwiki_url', '')}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Search curated Korean trending-slang index. "
            "Returns candidates the calling agent can use when writing text with slang."
        )
    )
    parser.add_argument(
        "--query", default=None, help="Keyword to match against term/aliases."
    )
    parser.add_argument(
        "--mood",
        default="",
        help="Comma-separated mood tags (긍정, 부정, 유머, 의지, ...).",
    )
    parser.add_argument(
        "--context",
        default="",
        help="Comma-separated context tags (SNS, 마케팅, 음식, 스포츠, ...).",
    )
    parser.add_argument(
        "--safety",
        default="",
        help="Comma-separated safety levels: safe, spicy, risky.",
    )
    parser.add_argument(
        "--intensity",
        default="",
        help="Comma-separated intensity levels: subtle, medium, strong.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Max candidates to return (1..{MAX_LIMIT}).",
    )
    parser.add_argument(
        "--include-deprecated",
        action="store_true",
        help="Include entries marked still_usable=false.",
    )
    parser.add_argument(
        "--index-path",
        default=None,
        help="Override path to a slang index JSON (defaults to bundled seed).",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format. Default: json.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    try:
        result = search(
            query=args.query,
            mood=_split_csv(args.mood),
            context=_split_csv(args.context),
            safety=_split_csv(args.safety),
            intensity=_split_csv(args.intensity),
            limit=args.limit,
            include_deprecated=args.include_deprecated,
            index_path=args.index_path,
        )
    except (FileNotFoundError, ValueError) as error:
        print(
            json.dumps({"error": str(error)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        sys.stdout.write(_format_text(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
