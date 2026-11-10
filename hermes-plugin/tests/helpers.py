"""Shared test helpers: load the plugin the same way Hermes does."""

from __future__ import annotations

import importlib.util
import os
import shlex
import shutil
import sys
import types
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PLUGIN_DIR.parent
NS_PARENT = "hermes_plugins"


def load_plugin(module_name: str = "hermes_plugins.k_skill") -> types.ModuleType:
    """Import hermes-plugin/ as ``hermes_plugins.k_skill`` (mirrors
    ``PluginManager._load_directory_module`` in hermes_cli/plugins.py)."""
    if NS_PARENT not in sys.modules:
        ns_pkg = types.ModuleType(NS_PARENT)
        ns_pkg.__path__ = []  # type: ignore[attr-defined]
        ns_pkg.__package__ = NS_PARENT
        sys.modules[NS_PARENT] = ns_pkg
    for name in [m for m in sys.modules if m == module_name or m.startswith(module_name + ".")]:
        del sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        module_name,
        PLUGIN_DIR / "__init__.py",
        submodule_search_locations=[str(PLUGIN_DIR)],
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    module.__package__ = module_name
    module.__path__ = [str(PLUGIN_DIR)]  # type: ignore[attr-defined]
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def submodule(name: str):
    load_plugin()
    return sys.modules[f"hermes_plugins.k_skill.{name}"]


class FakeCtx:
    """Records what a plugin registers, like hermes_cli.plugins.PluginContext."""

    def __init__(self) -> None:
        self.tools: dict[str, dict] = {}
        self.cli_commands: dict[str, dict] = {}
        self.commands: dict[str, dict] = {}
        self.skills: dict[str, dict] = {}

    def register_skill(self, name, path, description=""):
        if not Path(path).exists():
            raise FileNotFoundError(f"SKILL.md not found at {path}")
        self.skills[name] = {"path": Path(path), "description": description}

    def register_tool(self, name, toolset, schema, handler, check_fn=None,
                      requires_env=None, is_async=False, description="", emoji="",
                      override=False):
        self.tools[name] = {
            "toolset": toolset, "schema": schema, "handler": handler,
            "check_fn": check_fn, "description": description, "emoji": emoji,
            "override": override,
        }

    def register_cli_command(self, name, help, setup_fn, handler_fn=None, description=""):
        self.cli_commands[name] = {
            "help": help, "setup_fn": setup_fn, "handler_fn": handler_fn,
            "description": description,
        }

    def register_command(self, name, handler, description="", args_hint=""):
        self.commands[name] = {
            "handler": handler, "description": description, "args_hint": args_hint,
        }


def real_cli_command() -> str:
    """Command string for the repo's own, unmodified k-skill CLI (offline)."""
    node = shutil.which("node")
    assert node, "node is required to run the hermes-plugin tests"
    bin_js = REPO_ROOT / "packages" / "k-skill-cli" / "bin" / "k-skill.js"
    return f"{shlex.quote(node)} {shlex.quote(str(bin_js))}"


def repo_cli_env() -> dict[str, str]:
    """Environment that keeps the real CLI offline and telemetry-free."""
    env = dict(os.environ)
    env["KSKILL_ANALYTICS_DISABLED"] = "1"
    env["KSKILL_CLI"] = real_cli_command()
    return env
