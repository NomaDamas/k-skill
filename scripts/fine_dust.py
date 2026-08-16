"""Shim for repo tests. Canonical helper: fine-dust-location/scripts/fine_dust.py."""

from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[1] / "fine-dust-location" / "scripts" / "fine_dust.py"
exec(compile(_CANONICAL.read_text(encoding="utf-8"), str(_CANONICAL), "exec"), globals())
