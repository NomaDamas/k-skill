#!/usr/bin/env python3
"""Compatibility wrapper for the k-skill-cleaner skill-local helper.

The standalone skill install includes ``k-skill-cleaner/scripts/k_skill_cleaner.py``.
This repository-root wrapper preserves existing checkout workflows and tests while
keeping the executable payload inside the skill directory.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
_HELPER_PATH = Path(__file__).resolve().parents[1] / "k-skill-cleaner" / "scripts" / "k_skill_cleaner.py"
_SPEC = importlib.util.spec_from_file_location("_k_skill_cleaner_impl", _HELPER_PATH)
if _SPEC is None or _SPEC.loader is None:  # pragma: no cover - importlib defensive guard
    raise ImportError(f"Unable to load k-skill-cleaner helper from {_HELPER_PATH}")
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)

AGENT_USAGE_SOURCES = _MODULE.AGENT_USAGE_SOURCES
collect_skill_usage = _MODULE.collect_skill_usage
find_skill_dirs = _MODULE.find_skill_dirs
rank_cleanup_candidates = _MODULE.rank_cleanup_candidates
load_usage_json = _MODULE.load_usage_json
expand_default_log_paths = _MODULE.expand_default_log_paths
parse_csv = _MODULE.parse_csv
build_parser = _MODULE.build_parser
main = _MODULE.main

__all__ = [
    "AGENT_USAGE_SOURCES",
    "collect_skill_usage",
    "find_skill_dirs",
    "rank_cleanup_candidates",
    "load_usage_json",
    "expand_default_log_paths",
    "parse_csv",
    "build_parser",
    "main",
]

if __name__ == "__main__":
    raise SystemExit(main())
