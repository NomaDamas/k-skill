"""Tool handlers. Contract: ``handler(args, **kwargs) -> str`` (JSON), never raises."""

from __future__ import annotations

import json
import re

from . import catalog, cli_runner

DEFAULT_TIMEOUT_S = 60
MAX_TIMEOUT_S = 300
DEFAULT_LIMIT = 8
MAX_LIMIT = 50

_SKILL_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_ASSET_RE = re.compile(r"^(scripts|references)/[A-Za-z0-9_][A-Za-z0-9_.\-]*(?:/[A-Za-z0-9_][A-Za-z0-9_.\-]*)*$")

CLI_TRANSLATION = (
    "Where these instructions show `npx -y @nomadamas/k-skill@0 exec <skill> scripts/<f> -- <args>`, call "
    "kskill_exec; `... read <skill> references/<f>` -> kskill_read; skip the `... update` step. "
    "Use the `clarify` tool before any irreversible action."
)


def _dump(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _fail(error: str, **extra) -> str:
    return _dump({"ok": False, "error": error, **extra})


def _args(args) -> dict:
    return args if isinstance(args, dict) else {}


def clamp_timeout(value) -> int:
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT_S
    return max(1, min(seconds, MAX_TIMEOUT_S))


def _skill_name(data: dict):
    skill = data.get("skill")
    if not isinstance(skill, str) or not _SKILL_RE.match(skill):
        return None
    return skill


def _bad_skill() -> str:
    return _fail("skill must be a skill name such as 'cheap-gas-nearby' (lowercase letters, digits, hyphens). "
                 "Use kskill_search to find it.")


def _asset(data: dict, key: str, roots: tuple):
    value = data.get(key)
    if not isinstance(value, str) or not _ASSET_RE.match(value) or ".." in value.split("/"):
        return None
    return value if value.split("/")[0] in roots else None


def _cli_failure(result: dict, skill: str) -> str:
    payload = {k: result[k] for k in ("exit_code", "stdout", "stderr", "timed_out", "truncated") if k in result}
    error = result.get("error") or (result.get("stderr") or "").strip() or "k-skill CLI failed"
    suggestions = catalog.suggest(skill) if "unknown skill" in error else []
    extra = {"suggestions": suggestions} if suggestions else {}
    return _fail(error, **payload, **extra)


def kskill_search(args, **kwargs) -> str:
    try:
        data = _args(args)
        query = data.get("query")
        query = query if isinstance(query, str) else ""
        category = data.get("category") if isinstance(data.get("category"), str) else None
        try:
            limit = max(1, min(int(data.get("limit", DEFAULT_LIMIT)), MAX_LIMIT))
        except (TypeError, ValueError):
            limit = DEFAULT_LIMIT
        hits = catalog.search(query, category=category, limit=limit)
        results = [
            {
                "name": h["name"],
                "description": h["description"][:300],
                "category": h.get("category"),
                "example_requests": h.get("triggers", [])[:3],
            }
            for h in hits
        ]
        return _dump({
            "ok": True,
            "total_skills": len(catalog.load_catalog()),
            "results": results,
            "next_step": "Call kskill_instructions with the best matching skill name and follow it.",
        })
    except Exception as exc:  # noqa: BLE001 - handlers must never raise
        return _fail(f"search failed: {exc}")


def kskill_instructions(args, **kwargs) -> str:
    try:
        skill = _skill_name(_args(args))
        if skill is None:
            return _bad_skill()
        result = cli_runner.run_cli(["instruct", skill], timeout=DEFAULT_TIMEOUT_S)
        if not result["ok"]:
            return _cli_failure(result, skill)
        return _dump({"ok": True, "skill": skill, "instructions": result["stdout"],
                      "truncated": result["truncated"], "tool_mapping": CLI_TRANSLATION})
    except Exception as exc:  # noqa: BLE001
        return _fail(f"instructions failed: {exc}")


def kskill_exec(args, **kwargs) -> str:
    try:
        data = _args(args)
        skill = _skill_name(data)
        if skill is None:
            return _bad_skill()
        script = _asset(data, "script", ("scripts",))
        if script is None:
            return _fail("script must be a relative path under 'scripts/' (e.g. 'scripts/fine_dust.py') "
                         "with no '..' segments.")
        raw_args = data.get("args", [])
        if raw_args is None:
            raw_args = []
        if not isinstance(raw_args, list) or not all(
            isinstance(a, (str, int, float)) and not isinstance(a, bool) for a in raw_args
        ):
            return _fail("args must be an array of strings, one item per argv entry.")
        argv = [str(a) for a in raw_args]
        result = cli_runner.run_cli(["exec", skill, script, "--", *argv],
                                    timeout=clamp_timeout(data.get("timeout_s")))
        payload = {k: result[k] for k in ("exit_code", "stdout", "stderr", "timed_out", "truncated")}
        if result.get("error"):
            payload["error"] = result["error"]
        return _dump({"ok": result["ok"], "skill": skill, "script": script, **payload})
    except Exception as exc:  # noqa: BLE001
        return _fail(f"exec failed: {exc}")


def kskill_read(args, **kwargs) -> str:
    try:
        data = _args(args)
        skill = _skill_name(data)
        if skill is None:
            return _bad_skill()
        file = _asset(data, "file", ("references", "scripts"))
        if file is None:
            return _fail("file must be a relative path under 'references/' or 'scripts/' with no '..' segments.")
        result = cli_runner.run_cli(["read", skill, file], timeout=DEFAULT_TIMEOUT_S)
        if not result["ok"]:
            return _cli_failure(result, skill)
        return _dump({"ok": True, "skill": skill, "file": file, "content": result["stdout"],
                      "truncated": result["truncated"]})
    except Exception as exc:  # noqa: BLE001
        return _fail(f"read failed: {exc}")


HANDLERS = {
    "kskill_search": kskill_search,
    "kskill_instructions": kskill_instructions,
    "kskill_exec": kskill_exec,
    "kskill_read": kskill_read,
}
