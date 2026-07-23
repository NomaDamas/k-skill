import argparse
import asyncio
import importlib.util
import pathlib
import unittest
from unittest import mock

MODULE_PATH = pathlib.Path(__file__).with_name("myrealtrip_mcp.py")
spec = importlib.util.spec_from_file_location("myrealtrip_mcp", MODULE_PATH)
myrealtrip_mcp = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(myrealtrip_mcp)


class ParseHelpersTest(unittest.TestCase):
    def test_parse_json_object_requires_object(self):
        self.assertEqual(myrealtrip_mcp.parse_json_object('{"gid": 123}', arg_name="--json"), {"gid": 123})

        with self.assertRaises(argparse.ArgumentTypeError):
            myrealtrip_mcp.parse_json_object('["not", "object"]', arg_name="--json")

    def test_parse_kv_pairs_json_decodes_values_when_possible(self):
        self.assertEqual(
            myrealtrip_mcp.parse_kv_pairs(["query=오사카", "perPage=5", "directFlightOnly=true"]),
            {"query": "오사카", "perPage": 5, "directFlightOnly": True},
        )

    def test_parse_kv_pairs_rejects_malformed_pairs(self):
        with self.assertRaises(argparse.ArgumentTypeError):
            myrealtrip_mcp.parse_kv_pairs(["missing_separator"])

        with self.assertRaises(argparse.ArgumentTypeError):
            myrealtrip_mcp.parse_kv_pairs(["=empty_key"])

    def test_timeout_must_be_positive_number(self):
        self.assertEqual(myrealtrip_mcp.parse_positive_float("1.5"), 1.5)

        for raw in ["0", "-1", "not-a-number"]:
            with self.subTest(raw=raw):
                with self.assertRaises(argparse.ArgumentTypeError):
                    myrealtrip_mcp.parse_positive_float(raw)


class CliAssemblyTest(unittest.TestCase):
    def test_json_and_arg_inputs_are_merged_before_call(self):
        captured = {}

        async def fake_run_mcp(endpoint, command, tool=None, arguments=None, *, timeout_seconds):
            captured.update(
                endpoint=endpoint,
                command=command,
                tool=tool,
                arguments=arguments,
                timeout_seconds=timeout_seconds,
            )
            return {"ok": True}

        with mock.patch.object(myrealtrip_mcp, "run_mcp", side_effect=fake_run_mcp):
            exit_code = myrealtrip_mcp.main(
                [
                    "--endpoint",
                    "https://example.invalid/mcp",
                    "--timeout-seconds",
                    "2.5",
                    "call",
                    "searchTnas",
                    "--json",
                    '{"query":"오사카","perPage":3}',
                    "--arg",
                    "perPage=5",
                ]
            )

        self.assertEqual(exit_code, 0)
        self.assertEqual(captured["endpoint"], "https://example.invalid/mcp")
        self.assertEqual(captured["command"], "call")
        self.assertEqual(captured["tool"], "searchTnas")
        self.assertEqual(captured["arguments"], {"query": "오사카", "perPage": 5})
        self.assertEqual(captured["timeout_seconds"], 2.5)


class TimeoutTest(unittest.TestCase):
    def test_run_mcp_reports_timeout(self):
        async def never_finishes(*args, **kwargs):
            await asyncio.sleep(60)

        with mock.patch.object(myrealtrip_mcp, "_run_mcp_once", side_effect=never_finishes):
            with self.assertRaisesRegex(myrealtrip_mcp.MyRealTripMcpError, "초과"):
                asyncio.run(
                    myrealtrip_mcp.run_mcp(
                        "https://example.invalid/mcp",
                        "tools",
                        timeout_seconds=0.001,
                    )
                )


if __name__ == "__main__":
    unittest.main()
