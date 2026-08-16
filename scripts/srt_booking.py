"""Shim for repo tests. Canonical helper: srt-booking/scripts/srt_booking.py."""

from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[1] / "srt-booking" / "scripts" / "srt_booking.py"
exec(compile(_CANONICAL.read_text(encoding="utf-8"), str(_CANONICAL), "exec"), globals())
