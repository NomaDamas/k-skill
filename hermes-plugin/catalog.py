"""Offline search over the generated skill catalog (``catalog.json``)."""

from __future__ import annotations

import difflib
import json
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

CATALOG_PATH = Path(__file__).resolve().parent / "catalog.json"


@lru_cache(maxsize=1)
def _load() -> tuple:
    return tuple(json.loads(CATALOG_PATH.read_text(encoding="utf-8")))


def load_catalog() -> List[dict]:
    return [dict(entry) for entry in _load()]


def _score(entry: dict, tokens: List[str]) -> int:
    name = entry["name"].lower()
    description = entry["description"].lower()
    category = (entry.get("category") or "").lower()
    triggers = [t.lower() for t in entry.get("triggers", [])]
    total = 0
    for token in tokens:
        hit = 0
        if name == token:
            hit += 1000
        elif token in name:
            hit += 50
        if any(token in t for t in triggers):
            hit += 20
        if token in description:
            hit += 10
        if token in category:
            hit += 5
        if hit == 0:
            return 0  # every token must match somewhere
        total += hit
    return total


def search(query: str = "", category: Optional[str] = None, limit: int = 8) -> List[dict]:
    entries = load_catalog()
    if category:
        entries = [e for e in entries if e.get("category") == category]
    tokens = [t for t in (query or "").lower().split() if t]
    if not tokens:
        return sorted(entries, key=lambda e: e["name"])[:limit]
    scored = [(s, e) for e in entries if (s := _score(e, tokens)) > 0]
    scored.sort(key=lambda pair: (-pair[0], pair[1]["name"]))
    return [e for _, e in scored[:limit]]


def suggest(name: str, n: int = 3) -> List[str]:
    names = [e["name"] for e in _load()]
    return difflib.get_close_matches(str(name), names, n=n, cutoff=0.7)


def categories() -> List[str]:
    return sorted({e["category"] for e in _load() if e.get("category")})
