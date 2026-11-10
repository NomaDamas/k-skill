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


def resolve_cli_candidates(env: Optional[Mapping[str, str]] = None) -> list:
    """Ordered argv prefixes to try.

    ``KSKILL_CLI`` is an explicit choice and is the only candidate. Otherwise an
    installed ``k-skill`` binary comes first, then ``npx -y @nomadamas/k-skill@0``
    (the invocation the skills themselves use, always current within major 0).
    """
    env = os.environ if env is None else env
    override = (env.get("KSKILL_CLI") or "").strip()
    if override:
        return [shlex.split(override)]
    path = env.get("PATH")
    candidates = []
    installed = shutil.which("k-skill", path=path)
    if installed:
        candidates.append([installed])
    npx = shutil.which("npx", path=path)
    if npx:
        candidates.append([npx, "-y", NPX_PACKAGE])
    return candidates


def resolve_cli(env: Optional[Mapping[str, str]] = None) -> Optional[list]:
    """First candidate argv prefix, or None when the CLI cannot be run."""
    candidates = resolve_cli_candidates(env)
    return candidates[0] if candidates else None


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


def _run_once(prefix: list, args: Sequence[str], timeout: float) -> dict:
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


def _is_unknown_skill(result: dict) -> bool:
    return result["exit_code"] == 1 and "unknown skill" in result["stderr"]


def run_cli(args: Sequence[str], timeout: float = 60) -> dict:
    """Run the CLI with ``args`` (argv list, never a shell string).

    A stale installed ``k-skill`` that predates a skill answers ``unknown skill``;
    in that case (and only that case) the next candidate (npx @0) is tried.
    """
    candidates = resolve_cli_candidates()
    if not candidates:
        return {"ok": False, "exit_code": None, "stdout": "", "stderr": "",
                "timed_out": False, "truncated": False, "error": NO_CLI_MESSAGE}
    result = _run_once(candidates[0], args, timeout)
    for prefix in candidates[1:]:
        if not _is_unknown_skill(result):
            break
        result = _run_once(prefix, args, timeout)
    return result
