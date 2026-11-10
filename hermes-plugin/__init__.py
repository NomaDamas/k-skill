"""k-skill for Hermes Agent: 130+ Korean everyday/work skills as a Hermes plugin."""

from __future__ import annotations

from pathlib import Path

from . import commands, schemas, tools
from .cli_runner import cli_available

TOOLSET = "k-skill"
SKILL_DESCRIPTION = "Workflow for finding and running k-skill Korean-service skills."


def register(ctx) -> None:
    for name, schema in schemas.ALL.items():
        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema=schema,
            handler=tools.HANDLERS[name],
            check_fn=cli_available,
            description=schema["description"],
            emoji="🇰🇷",
        )
    ctx.register_command(
        "kskill",
        commands.slash_kskill,
        description="Search the k-skill catalog (Korean everyday/work skills)",
        args_hint="<keywords>",
    )
    ctx.register_cli_command(
        "k-skill",
        "Search and run k-skill Korean-service skills",
        commands.build_parser,
        commands.handle,
        description="k-skill: search, show, run, doctor",
    )
    skill = Path(__file__).resolve().parent / "skills" / "k-skill" / "SKILL.md"
    ctx.register_skill("k-skill", skill, description=SKILL_DESCRIPTION)
