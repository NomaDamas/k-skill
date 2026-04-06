from __future__ import annotations

from pathlib import Path


_BUNDLED_HELPER = (
    Path(__file__).resolve().parent.parent / "korean-spell-check" / "scripts" / "korean_spell_check.py"
)

if not _BUNDLED_HELPER.exists():  # pragma: no cover - defensive import guard
    raise FileNotFoundError(f"Bundled spell-check helper not found: {_BUNDLED_HELPER}")

exec(compile(_BUNDLED_HELPER.read_text(encoding="utf-8"), str(_BUNDLED_HELPER), "exec"), globals())
