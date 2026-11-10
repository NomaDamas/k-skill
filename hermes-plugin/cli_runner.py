"""Locate and run the real ``@nomadamas/k-skill`` CLI.

The plugin never re-implements skill logic: instructions, bundled helper
scripts and references all come from the same CLI that every other agent uses,
so behaviour cannot drift from the repository.
"""

from __future__ import annotations

import os
import shlex
import shutil
import signal
import subprocess
from typing import Mapping, Optional, Sequence

NPX_PACKAGE = "@nomadamas/k-skill@0"
MAX_OUTPUT_CHARS = 80_000
MAX_STDERR_CHARS = 8_000
NO_CLI_MESSAGE = (
    "Cannot run the k-skill CLI: neither `k-skill` nor `npx` was found on PATH. "
    "Install Node.js 18+ (https://nodejs.org) or set KSKILL_CLI to a command that "
    "runs the CLI, e.g. KSKILL_CLI='node /path/to/k-skill/packages/k-skill-cli/bin/k-skill.js'."
)


def resolve_cli(env: Optional[Mapping[str, str]] = None) -> Optional[list]:
    """Return argv prefix for the CLI, or None when it cannot be run.

    Order: ``KSKILL_CLI`` override, an installed ``k-skill`` binary, then
    ``npx -y @nomadamas/k-skill@0`` (the invocation the skills themselves use).
    """
    env = os.environ if env is None else env
    override = (env.get("KSKILL_CLI") or "").strip()
    if override:
        return shlex.split(override)
    path = env.get("PATH")
    installed = shutil.which("k-skill", path=path)
    if installed:
        return [installed]
    npx = shutil.which("npx", path=path)
    if npx:
        return [npx, "-y", NPX_PACKAGE]
    return None


def cli_available() -> bool:
    return resolve_cli() is not None


def _clip(text: str, limit: int) -> tuple:
    if len(text) <= limit:
        return text, False
    return f"{text[:limit]}\n…[truncated {len(text) - limit} chars]", True


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGKILL)
        else:  # pragma: no cover - Windows
            proc.kill()
    except (ProcessLookupError, PermissionError):
        pass


def run_cli(args: Sequence[str], timeout: float = 60) -> dict:
    """Run the CLI with ``args`` (argv list, never a shell string)."""
    prefix = resolve_cli()
    if prefix is None:
        return {"ok": False, "exit_code": None, "stdout": "", "stderr": "",
                "timed_out": False, "truncated": False, "error": NO_CLI_MESSAGE}

    try:
        proc = subprocess.Popen(
            [*prefix, *args],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            start_new_session=(os.name == "posix"),
        )
    except OSError as exc:
        return {"ok": False, "exit_code": None, "stdout": "", "stderr": "",
                "timed_out": False, "truncated": False,
                "error": f"Failed to start the k-skill CLI ({prefix[0]}): {exc}"}

    timed_out = False
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        _kill_group(proc)
        stdout, stderr = proc.communicate()

    stdout, out_cut = _clip(stdout or "", MAX_OUTPUT_CHARS)
    stderr, _ = _clip(stderr or "", MAX_STDERR_CHARS)
    result = {
        "ok": (not timed_out) and proc.returncode == 0,
        "exit_code": None if timed_out else proc.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "timed_out": timed_out,
        "truncated": out_cut,
    }
    if timed_out:
        result["error"] = f"k-skill CLI timed out after {timeout:g}s and was killed."
    return result
