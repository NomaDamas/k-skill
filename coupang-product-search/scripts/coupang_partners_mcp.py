#!/usr/bin/env python3
"""Bootstrap and run retention-corp/coupang_partners Coupang MCP tools.

The k-skill repo intentionally does not vendor the third-party implementation.
This wrapper keeps the skill pointed at the approved upstream repository, clones it
into a user cache when needed, and then delegates to its local MCP-compatible CLI.
"""

from __future__ import annotations

import argparse
import os
import pathlib
import subprocess
import sys
from typing import Sequence

UPSTREAM_REPO_URL = "https://github.com/retention-corp/coupang_partners.git"
DEFAULT_MCP_ENDPOINT = "local://coupang-mcp"
DEFAULT_REPO_DIR = pathlib.Path(os.getenv("COUPANG_PARTNERS_REPO_DIR", "~/.cache/k-skill/coupang_partners")).expanduser()
UPSTREAM_CLI = pathlib.Path("bin") / "coupang_mcp.py"


class BootstrapError(RuntimeError):
    """Raised when the upstream checkout cannot be prepared."""


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the retention-corp/coupang_partners local Coupang MCP-compatible CLI.",
        epilog=(
            "Examples: coupang_partners_mcp.py tools | "
            "coupang_partners_mcp.py init | "
            "coupang_partners_mcp.py search 생수 | "
            "coupang_partners_mcp.py budget 키보드 --max-price 100000"
        ),
    )
    parser.add_argument(
        "--repo-dir",
        default=str(DEFAULT_REPO_DIR),
        help="Checkout directory for retention-corp/coupang_partners (default: %(default)s).",
    )
    parser.add_argument(
        "--no-clone",
        action="store_true",
        help="Do not clone the upstream repository if it is missing; fail with setup guidance instead.",
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Run git pull --ff-only in an existing upstream checkout before delegating.",
    )
    parser.add_argument(
        "upstream_args",
        nargs=argparse.REMAINDER,
        help="Arguments passed to bin/coupang_mcp.py, for example: tools, search 생수, rocket 에어팟.",
    )
    args = parser.parse_args(argv)
    if args.upstream_args and args.upstream_args[0] == "--":
        args.upstream_args = args.upstream_args[1:]
    if not args.upstream_args:
        parser.error("missing upstream command; try: tools, init, search <keyword>, rocket <keyword>, budget <keyword>")
    return args


def upstream_cli_path(repo_dir: pathlib.Path) -> pathlib.Path:
    return repo_dir / UPSTREAM_CLI


def ensure_repo(repo_dir: pathlib.Path, *, clone: bool = True, update: bool = False) -> pathlib.Path:
    cli_path = upstream_cli_path(repo_dir)
    if cli_path.exists():
        if update:
            run_checked(["git", "-C", str(repo_dir), "pull", "--ff-only"], "failed to update upstream checkout")
        return cli_path

    if repo_dir.exists():
        raise BootstrapError(
            f"{repo_dir} exists but does not look like retention-corp/coupang_partners "
            f"(missing {UPSTREAM_CLI}). Recreate it with: git clone {UPSTREAM_REPO_URL} {repo_dir}"
        )

    if not clone:
        raise BootstrapError(
            f"Missing retention-corp/coupang_partners checkout at {repo_dir}. "
            f"Create it with: git clone {UPSTREAM_REPO_URL} {repo_dir}"
        )

    repo_dir.parent.mkdir(parents=True, exist_ok=True)
    run_checked(["git", "clone", "--depth", "1", UPSTREAM_REPO_URL, str(repo_dir)], "failed to clone upstream checkout")
    if not cli_path.exists():
        raise BootstrapError(f"Cloned {UPSTREAM_REPO_URL}, but {UPSTREAM_CLI} was not found in {repo_dir}")
    return cli_path


def run_checked(command: Sequence[str], context: str) -> None:
    try:
        subprocess.run(command, check=True)
    except FileNotFoundError as exc:
        raise BootstrapError(f"{context}: required executable not found: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        raise BootstrapError(f"{context}: {exc}") from exc


def build_command(cli_path: pathlib.Path, upstream_args: Sequence[str]) -> list[str]:
    return [sys.executable, str(cli_path), *upstream_args]


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    repo_dir = pathlib.Path(args.repo_dir).expanduser().resolve()

    try:
        cli_path = ensure_repo(repo_dir, clone=not args.no_clone, update=args.update)
    except BootstrapError as exc:
        print(f"coupang_partners_mcp.py: {exc}", file=sys.stderr)
        return 2

    env = os.environ.copy()
    env.setdefault("COUPANG_MCP_ENDPOINT", DEFAULT_MCP_ENDPOINT)
    completed = subprocess.run(build_command(cli_path, args.upstream_args), env=env)
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
