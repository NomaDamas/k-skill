"""Tool schemas (OpenAI function format) — what the model reads."""

KSKILL_SEARCH = {
    "name": "kskill_search",
    "description": (
        "Search k-skill, a catalog of ~130 Korean everyday/work skills (KTX/SRT, 당근, 쿠팡, 다이소, "
        "미세먼지, 주유소, 공시지가, 법령, 공공데이터, 병원/약국, 부동산, 주식/공시, 한글 맞춤법 …). "
        "Use FIRST for any request about Korea-specific services or data, in Korean or English, "
        "then call kskill_instructions with the best match. Offline and instant."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Keywords in Korean or English, e.g. '근처 싼 주유소' or 'ktx timetable'. Every word must match. Empty lists skills alphabetically."},
            "category": {"type": "string", "description": "Optional exact category filter such as 'transit' or 'finance'."},
            "limit": {"type": "integer", "description": "Max results (default 8, max 50)."},
        },
    },
}

KSKILL_INSTRUCTIONS = {
    "name": "kskill_instructions",
    "description": (
        "Get the full, runtime-aware, up-to-date instructions of one k-skill (inputs to ask the user, "
        "API/proxy endpoints, helper scripts, failure modes, approval rules). MUST be read and followed "
        "before doing the task. In the text, a `npx -y @nomadamas/k-skill@0 exec <skill> scripts/<f> -- <args>` "
        "command means call kskill_exec; `... read <skill> references/<f>` means kskill_read; "
        "the `npx ... update` step must be skipped."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "skill": {"type": "string", "description": "Exact skill name from kskill_search, e.g. 'cheap-gas-nearby'."},
        },
        "required": ["skill"],
    },
}

KSKILL_EXEC = {
    "name": "kskill_exec",
    "description": (
        "Run a helper script bundled with a k-skill (equivalent of `k-skill exec <skill> scripts/<file> -- <args>`). "
        "Only scripts named in that skill's instructions. Arguments are passed as an argv array, never through a shell. "
        "Returns stdout, stderr and exit_code."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "skill": {"type": "string", "description": "Skill name, e.g. 'fine-dust-location'."},
            "script": {"type": "string", "description": "Path under the skill, always starting with 'scripts/', e.g. 'scripts/fine_dust.py'."},
            "args": {"type": "array", "items": {"type": "string"}, "description": "Arguments for the script, one array item per argv entry."},
            "timeout_s": {"type": "integer", "description": "Seconds before the script is killed (default 60, max 300)."},
        },
        "required": ["skill", "script"],
    },
}

KSKILL_READ = {
    "name": "kskill_read",
    "description": (
        "Read a reference document or script source bundled with a k-skill "
        "(equivalent of `k-skill read <skill> references/<file>`)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "skill": {"type": "string", "description": "Skill name."},
            "file": {"type": "string", "description": "Path starting with 'references/' or 'scripts/', e.g. 'references/regions.md'."},
        },
        "required": ["skill", "file"],
    },
}

ALL = {
    "kskill_search": KSKILL_SEARCH,
    "kskill_instructions": KSKILL_INSTRUCTIONS,
    "kskill_exec": KSKILL_EXEC,
    "kskill_read": KSKILL_READ,
}
