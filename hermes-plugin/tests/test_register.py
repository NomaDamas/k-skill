import inspect
import re
import unittest

from helpers import PLUGIN_DIR, REPO_ROOT, FakeCtx, load_plugin, submodule


def read_manifest():
    """Tiny plugin.yaml reader (PyYAML is not a CI dependency)."""
    text = (PLUGIN_DIR / "plugin.yaml").read_text(encoding="utf-8")
    data, current = {}, None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if m:
            current = m.group(1)
            data[current] = m.group(2).strip().strip('"') if m.group(2).strip() else []
            continue
        m = re.match(r"^\s+-\s+(.*)$", line)
        if m and isinstance(data.get(current), list):
            data[current].append(m.group(1).strip().strip('"'))
    return data


class ManifestTest(unittest.TestCase):
    def test_manifest_basics(self):
        m = read_manifest()
        self.assertEqual(m["name"], "k-skill")
        self.assertEqual(m["license"], "MIT")
        self.assertTrue(m["description"])
        self.assertEqual(m["kind"], "standalone")

    def test_provides_tools_matches_registered_tools(self):
        ctx = FakeCtx()
        load_plugin().register(ctx)
        self.assertEqual(sorted(read_manifest()["provides_tools"]), sorted(ctx.tools))

    def test_no_python_dependencies_needed(self):
        m = read_manifest()
        self.assertNotIn("python_dependencies", m)
        self.assertNotIn("pip_dependencies", m)
        self.assertFalse((PLUGIN_DIR / "pyproject.toml").exists())

    def test_license_file_ships_with_plugin_dir(self):
        self.assertTrue((PLUGIN_DIR / "LICENSE").exists())


class RegisterTest(unittest.TestCase):
    def setUp(self):
        self.ctx = FakeCtx()
        load_plugin().register(self.ctx)

    def test_registers_the_four_tools_under_one_toolset(self):
        self.assertEqual(
            sorted(self.ctx.tools),
            ["kskill_exec", "kskill_instructions", "kskill_read", "kskill_search"],
        )
        self.assertEqual({t["toolset"] for t in self.ctx.tools.values()}, {"k-skill"})

    def test_schemas_are_valid_openai_function_shape(self):
        for name, t in self.ctx.tools.items():
            s = t["schema"]
            self.assertEqual(s["name"], name)
            self.assertGreater(len(s["description"]), 40, name)
            p = s["parameters"]
            self.assertEqual(p["type"], "object")
            for req in p.get("required", []):
                self.assertIn(req, p["properties"], f"{name}.{req}")
            for prop, spec in p["properties"].items():
                self.assertIn("type", spec, f"{name}.{prop}")
                self.assertTrue(spec.get("description"), f"{name}.{prop}")

    def test_exec_schema_requires_skill_and_script_and_args_is_string_array(self):
        p = self.ctx.tools["kskill_exec"]["schema"]["parameters"]
        self.assertEqual(sorted(p["required"]), ["script", "skill"])
        self.assertEqual(p["properties"]["args"]["type"], "array")
        self.assertEqual(p["properties"]["args"]["items"], {"type": "string"})

    def test_handlers_accept_kwargs_for_forward_compat(self):
        for name, t in self.ctx.tools.items():
            sig = inspect.signature(t["handler"])
            self.assertTrue(
                any(p.kind is inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()),
                name,
            )

    def test_tools_never_override_builtins(self):
        self.assertFalse(any(t["override"] for t in self.ctx.tools.values()))

    def test_tool_availability_follows_cli_presence(self):
        import os
        old = dict(os.environ)
        try:
            os.environ["KSKILL_CLI"] = "node /x/k-skill.js"
            self.assertTrue(self.ctx.tools["kskill_search"]["check_fn"]())
            os.environ["KSKILL_CLI"] = ""
            os.environ["PATH"] = ""
            self.assertFalse(self.ctx.tools["kskill_search"]["check_fn"]())
        finally:
            os.environ.clear()
            os.environ.update(old)

    def test_registers_cli_subcommand_and_slash_command(self):
        self.assertIn("k-skill", self.ctx.cli_commands)
        self.assertIn("kskill", self.ctx.commands)
        self.assertTrue(self.ctx.commands["kskill"]["description"])

    def test_registers_bundled_workflow_skill(self):
        skill = self.ctx.skills["k-skill"]["path"]
        text = skill.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("---\n"))
        self.assertRegex(text, r"(?m)^name: k-skill$")
        for tool in self.ctx.tools:
            self.assertIn(tool, text)


class ContextTest(unittest.TestCase):
    """What the model sees must let it route any Korean request to kskill_search."""

    def setUp(self):
        self.ctx = FakeCtx()
        load_plugin().register(self.ctx)
        self.catalog = submodule("catalog").load_catalog()
        self.desc = self.ctx.tools["kskill_search"]["schema"]["description"]

    def test_search_description_names_every_skill_from_the_catalog(self):
        missing = [e["name"] for e in self.catalog if e["name"] not in self.desc]
        self.assertEqual(missing, [])

    def test_description_is_derived_from_catalog_not_hardcoded(self):
        schemas = submodule("schemas")
        fake = [{"name": "zz-new-skill", "description": "d", "category": None, "profiles": [], "triggers": []}]
        self.assertIn("zz-new-skill", schemas.search_description(fake))
        self.assertNotIn("cheap-gas-nearby", schemas.search_description(fake))

    def test_total_tool_context_stays_small(self):
        import json
        total = sum(len(json.dumps(t["schema"], ensure_ascii=False)) for t in self.ctx.tools.values())
        self.assertLess(total, 9000, "plugin tool schemas must stay far below a native skills index (~23k chars)")

    def test_weather_and_other_everyday_topics_are_routable(self):
        for must in ("korea-weather", "lotto-results", "emergency-room-beds", "railway-timetable"):
            self.assertIn(must, self.desc)

    def test_description_tells_model_to_search_before_generic_web_tools(self):
        low = self.desc.lower()
        self.assertIn("before", low)
        self.assertTrue("web" in low or "browser" in low or "curl" in low)


class CommandsTest(unittest.TestCase):
    def setUp(self):
        self.commands = submodule("commands")

    def test_slash_command_lists_matches_as_text(self):
        out = self.commands.slash_kskill("주유소")
        self.assertIn("cheap-gas-nearby", out)

    def test_slash_command_without_args_shows_usage_and_count(self):
        out = self.commands.slash_kskill("")
        self.assertIn("/kskill", out)
        self.assertRegex(out, r"\d+ skills")

    def test_slash_command_no_match_message(self):
        self.assertIn("No k-skill", self.commands.slash_kskill("zzzz-nothing-zzzz"))

    def test_cli_parser_has_expected_subcommands(self):
        import argparse
        parser = argparse.ArgumentParser()
        self.commands.build_parser(parser)
        for argv in (["search", "ktx"], ["show", "cheap-gas-nearby"], ["doctor"],
                     ["run", "korean-character-count", "scripts/korean_character_count.js", "--", "--text", "x"]):
            ns = parser.parse_args(argv)
            self.assertTrue(hasattr(ns, "kskill_cmd"))


if __name__ == "__main__":
    unittest.main()
