"""Tool schemas (OpenAI function format) — what the model reads."""

_SEARCH_HEAD = (
    "k-skill: {n} Korean everyday/work skills (transit, weather, fine dust, gas prices, lotto, e-sports/KBO results, "
    "emergency rooms, pharmacies, real estate, laws, public data, stocks/disclosures, shopping, spell check, postcodes ...). "
    "For ANY request about Korea-specific services or data, in Korean or English, call this BEFORE web search, browser, "
    "curl or writing your own scraper, then call kskill_instructions with the best match. Offline and instant. "
    "Available skills: "
)


def search_description(catalog) -> str:
    """Tool description that lists every skill name, so the model can route without guessing."""
    names = ", ".join(entry["name"] for entry in catalog)
    return _SEARCH_HEAD.format(n=len(catalog)) + names + "."


KSKILL_SEARCH = {
    "name": "kskill_search",
    "description": "",  # filled from catalog.json by build_all()
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

def build_all(catalog) -> dict:
    """All tool schemas, with the search description generated from the catalog."""
    search = {**KSKILL_SEARCH, "description": search_description(catalog)}
    return {
        "kskill_search": search,
        "kskill_instructions": KSKILL_INSTRUCTIONS,
        "kskill_exec": KSKILL_EXEC,
        "kskill_read": KSKILL_READ,
    }
