"""Human-facing surfaces: ``/kskill`` slash command and ``hermes k-skill`` CLI."""

from __future__ import annotations

import argparse
import json
import sys

from . import catalog, cli_runner, tools

USAGE = "Usage: /kskill <keywords>  — search the k-skill catalog (e.g. /kskill 주유소)"


def _format_hits(hits) -> str:
    lines = []
    for h in hits:
        lines.append(f"- {h['name']} [{h.get('category') or '-'}]: {h['description'][:110]}")
    return "\n".join(lines)


def slash_kskill(raw_args: str = "") -> str:
    query = (raw_args or "").strip()
    total = len(catalog.load_catalog())
    if not query:
        return f"{USAGE}\n{total} skills available. Ask normally and the agent picks one with kskill_search."
    hits = catalog.search(query, limit=8)
    if not hits:
        return f"No k-skill matched '{query}'. Try other keywords ({total} skills)."
    return f"k-skill matches for '{query}':\n{_format_hits(hits)}"


def build_parser(parser: argparse.ArgumentParser) -> None:
    sub = parser.add_subparsers(dest="kskill_cmd")
    p = sub.add_parser("search", help="Search skills by keyword")
    p.add_argument("query", nargs="*")
    p.add_argument("--limit", type=int, default=8)
    p = sub.add_parser("show", help="Print a skill's assembled instructions")
    p.add_argument("skill")
    p = sub.add_parser("run", help="Run a bundled helper script")
    p.add_argument("skill")
    p.add_argument("script")
    p.add_argument("args", nargs=argparse.REMAINDER)
    sub.add_parser("doctor", help="Check Node/CLI availability and catalog freshness")
    parser.set_defaults(kskill_cmd=None)


def _doctor() -> int:
    ok = True
    prefix = cli_runner.resolve_cli()
    print(f"CLI command : {' '.join(prefix) if prefix else 'NOT FOUND'}")
    if prefix is None:
        print(cli_runner.NO_CLI_MESSAGE)
        return 1
    version = cli_runner.run_cli(["version"], timeout=tools.MAX_TIMEOUT_S)
    print(f"CLI version : {version['stdout'].strip() if version['ok'] else 'FAILED ' + (version.get('error') or version['stderr'])}")
    ok &= version["ok"]
    listed = cli_runner.run_cli(["list"], timeout=tools.DEFAULT_TIMEOUT_S)
    cli_names = set(listed["stdout"].split()) if listed["ok"] else set()
    cat_names = {e["name"] for e in catalog.load_catalog()}
    print(f"Catalog     : {len(cat_names)} skills; CLI bundles {len(cli_names)}")
    if cli_names:
        missing, extra = sorted(cli_names - cat_names), sorted(cat_names - cli_names)
        if missing:
            print(f"  not in catalog (search will not find): {', '.join(missing)}")
        if extra:
            print(f"  not in the installed CLI (update with `npx -y @nomadamas/k-skill@0 update`): {', '.join(extra)}")
    else:
        ok = False
    return 0 if ok else 1


def handle(args) -> None:
    cmd = getattr(args, "kskill_cmd", None)
    code = 0
    if cmd == "search":
        hits = catalog.search(" ".join(args.query), limit=max(1, args.limit))
        print(_format_hits(hits) if hits else "No match.")
        code = 0 if hits else 1
    elif cmd == "show":
        result = cli_runner.run_cli(["instruct", args.skill], timeout=tools.DEFAULT_TIMEOUT_S)
        print(result["stdout"] if result["ok"] else (result.get("error") or result["stderr"]), end="")
        code = 0 if result["ok"] else 1
    elif cmd == "run":
        rest = list(args.args)
        if rest[:1] == ["--"]:
            rest = rest[1:]
        out = json.loads(tools.kskill_exec({"skill": args.skill, "script": args.script, "args": rest}))
        sys.stdout.write(out.get("stdout") or "")
        sys.stderr.write(out.get("stderr") or out.get("error") or "")
        code = 0 if out["ok"] else (out.get("exit_code") or 1)
    elif cmd == "doctor":
        code = _doctor()
    else:
        print(slash_kskill(""))
    if code:
        sys.exit(code)
