from __future__ import annotations

import hashlib
import json
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import scripts.kakaotalk_mac as kakaotalk_mac


def sha512_hex(value: int) -> str:
    return hashlib.sha512(str(value).encode("utf-8")).hexdigest()


def make_resolved_auth(
    *,
    user_id: int = 123,
    uuid: str = "uuid",
    database_path: Path | None = None,
    database_name: str = "db-name",
    key: str = "super-secret",
    source: str = "cache",
) -> kakaotalk_mac.ResolvedAuth:
    return kakaotalk_mac.ResolvedAuth(
        user_id=user_id,
        uuid=uuid,
        database_path=database_path or Path("/tmp/kakaotalk.db"),
        database_name=database_name,
        key=key,
        source=source,
    )


class KakaoTalkMacHelperTests(unittest.TestCase):
    def test_parse_plist_xml_extracts_candidates_and_active_hash(self) -> None:
        active_hash = sha512_hex(123456)
        xml_text = f"""<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>AlertKakaoIDsList</key>
  <array>
    <integer>111</integer>
    <integer>222</integer>
  </array>
  <key>userId</key>
  <integer>333</integer>
  <key>DESIGNATEDFRIENDSREVISION:{active_hash}</key>
  <integer>5</integer>
</dict>
</plist>
"""

        parsed = kakaotalk_mac.parse_plist_xml(xml_text)

        self.assertEqual(parsed["AlertKakaoIDsList"], [111, 222])
        self.assertEqual(kakaotalk_mac.collect_candidate_user_ids(parsed), [333, 111, 222])
        self.assertEqual(kakaotalk_mac.find_active_account_hash(parsed), active_hash)

    def test_discover_database_files_filters_hex_names(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            expected = [
                root / ("a" * 78),
                root / ("b" * 78 + ".db"),
            ]
            for path in expected:
                path.write_text("", encoding="utf-8")
            (root / ("c" * 40)).write_text("", encoding="utf-8")
            (root / ("d" * 78 + "-wal")).write_text("", encoding="utf-8")

            discovered = kakaotalk_mac.discover_database_files(root)

        self.assertEqual(discovered, expected)

    def test_recover_user_id_from_sha512_supports_single_worker_search(self) -> None:
        target_user_id = 123456
        recovered = kakaotalk_mac.recover_user_id_from_sha512(
            sha512_hex(target_user_id),
            max_user_id=200000,
            workers=1,
            chunk_size=5000,
        )

        self.assertEqual(recovered, target_user_id)

    def test_resolve_auth_retries_with_hash_recovered_user_id_and_caches_result(self) -> None:
        target_user_id = 654321
        active_hash = sha512_hex(target_user_id)

        with tempfile.TemporaryDirectory() as tempdir:
            cache_path = Path(tempdir) / "auth-cache.json"
            database_path = Path(tempdir) / "kakaotalk.db"
            database_path.write_text("", encoding="utf-8")
            verification_calls: list[int] = []

            state = kakaotalk_mac.DetectionState(
                uuid="42C34717-27C3-538C-81E4-8B568287C7A0",
                candidate_user_ids=[111, 222],
                active_account_hash=active_hash,
                database_files=[database_path],
            )

            def verify(candidate: kakaotalk_mac.ResolvedAuth) -> bool:
                verification_calls.append(candidate.user_id)
                return candidate.user_id == target_user_id

            resolved = kakaotalk_mac.resolve_auth_state(
                state,
                verify_access=verify,
                cache_path=cache_path,
                max_user_id=700000,
                workers=1,
                chunk_size=10000,
            )

            cache_payload = json.loads(cache_path.read_text(encoding="utf-8"))

        self.assertEqual(verification_calls, [111, 222, target_user_id])
        self.assertEqual(resolved.user_id, target_user_id)
        self.assertEqual(resolved.database_path, database_path)
        self.assertEqual(cache_payload["user_id"], target_user_id)
        self.assertEqual(cache_payload["database_path"], str(database_path))

    def test_load_cached_auth_treats_corrupt_json_as_cache_miss(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            cache_path = Path(tempdir) / "auth-cache.json"
            cache_path.write_text("{bad json\n", encoding="utf-8")

            self.assertIsNone(kakaotalk_mac.load_cached_auth(cache_path))

    def test_resolve_auth_reuses_detection_when_cache_is_corrupt(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            cache_path = Path(tempdir) / "auth-cache.json"
            cache_path.write_text("{bad json\n", encoding="utf-8")
            database_path = Path(tempdir) / "kakaotalk.db"
            database_path.write_text("", encoding="utf-8")
            resolved = make_resolved_auth(database_path=database_path, source="hash-recovery")

            with (
                mock.patch.object(kakaotalk_mac, "collect_detection_state", return_value=mock.sentinel.state) as collect_state,
                mock.patch.object(kakaotalk_mac, "resolve_auth_state", return_value=resolved) as resolve_state,
            ):
                cached = kakaotalk_mac.resolve_auth(
                    refresh=False,
                    cache_path=cache_path,
                    user_id_override=None,
                    uuid_override=None,
                    max_user_id=1000,
                    workers=1,
                    chunk_size=100,
                )

            self.assertEqual(cached, resolved)
            collect_state.assert_called_once_with(None)
            resolve_state.assert_called_once()

    def test_resolve_auth_bypasses_cache_when_user_id_override_is_supplied(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            cache_path = Path(tempdir) / "auth-cache.json"
            database_path = Path(tempdir) / "kakaotalk.db"
            database_path.write_text("", encoding="utf-8")
            persistable = make_resolved_auth(database_path=database_path, source="cache")
            kakaotalk_mac.persist_auth_cache(persistable, cache_path)
            override_result = make_resolved_auth(user_id=999, database_path=database_path, source="candidate")

            with (
                mock.patch.object(kakaotalk_mac, "collect_detection_state", return_value=mock.sentinel.state) as collect_state,
                mock.patch.object(kakaotalk_mac, "resolve_auth_state", return_value=override_result) as resolve_state,
            ):
                resolved = kakaotalk_mac.resolve_auth(
                    refresh=False,
                    cache_path=cache_path,
                    user_id_override=999,
                    uuid_override=None,
                    max_user_id=1000,
                    workers=1,
                    chunk_size=100,
                )

            self.assertEqual(resolved, override_result)
            collect_state.assert_called_once_with(None)
            resolve_state.assert_called_once_with(
                mock.sentinel.state,
                verify_access=kakaotalk_mac.verify_database_access,
                cache_path=cache_path,
                user_id_override=999,
                max_user_id=1000,
                workers=1,
                chunk_size=100,
            )

    def test_resolve_auth_bypasses_cache_when_uuid_override_is_supplied(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            cache_path = Path(tempdir) / "auth-cache.json"
            database_path = Path(tempdir) / "kakaotalk.db"
            database_path.write_text("", encoding="utf-8")
            persistable = make_resolved_auth(database_path=database_path, source="cache")
            kakaotalk_mac.persist_auth_cache(persistable, cache_path)
            override_result = make_resolved_auth(uuid="override-uuid", database_path=database_path, source="candidate")

            with (
                mock.patch.object(kakaotalk_mac, "collect_detection_state", return_value=mock.sentinel.state) as collect_state,
                mock.patch.object(kakaotalk_mac, "resolve_auth_state", return_value=override_result) as resolve_state,
            ):
                resolved = kakaotalk_mac.resolve_auth(
                    refresh=False,
                    cache_path=cache_path,
                    user_id_override=None,
                    uuid_override="override-uuid",
                    max_user_id=1000,
                    workers=1,
                    chunk_size=100,
                )

            self.assertEqual(resolved, override_result)
            collect_state.assert_called_once_with("override-uuid")
            resolve_state.assert_called_once_with(
                mock.sentinel.state,
                verify_access=kakaotalk_mac.verify_database_access,
                cache_path=cache_path,
                user_id_override=None,
                max_user_id=1000,
                workers=1,
                chunk_size=100,
            )

    def test_render_auth_text_redacts_key_material(self) -> None:
        resolved = make_resolved_auth(key="super-secret-key", source="hash-recovery")

        rendered = kakaotalk_mac.render_auth(resolved, output_format="text", cache_path=Path("/tmp/cache.json"))

        self.assertNotIn("super-secret-key", rendered)
        self.assertNotIn("--key", rendered)
        self.assertIn("python3 scripts/kakaotalk_mac.py chats --limit 10 --json", rendered)

    def test_build_passthrough_command_rejects_non_read_only_command(self) -> None:
        auth = make_resolved_auth()

        with self.assertRaises(kakaotalk_mac.AuthResolutionError):
            kakaotalk_mac.build_passthrough_command("query", auth, ["DELETE FROM chat_logs"])

    def test_build_parser_only_exposes_read_only_commands(self) -> None:
        parser = kakaotalk_mac.build_parser()
        subcommands = parser._subparsers._group_actions[0].choices

        self.assertEqual(sorted(subcommands), ["auth", "chats", "messages", "schema", "search"])
        self.assertNotIn("query", subcommands)

    def test_build_parser_rejects_negative_max_user_id(self) -> None:
        parser = kakaotalk_mac.build_parser()
        stderr = io.StringIO()

        with self.assertRaises(SystemExit) as exit_context, mock.patch("sys.stderr", stderr):
            parser.parse_args(["auth", "--max-user-id", "-1"])

        self.assertEqual(exit_context.exception.code, 2)
        self.assertIn("must be non-negative", stderr.getvalue())

    def test_build_parser_rejects_non_positive_chunk_size(self) -> None:
        parser = kakaotalk_mac.build_parser()
        stderr = io.StringIO()

        with self.assertRaises(SystemExit) as exit_context, mock.patch("sys.stderr", stderr):
            parser.parse_args(["auth", "--chunk-size", "0"])

        self.assertEqual(exit_context.exception.code, 2)
        self.assertIn("must be positive", stderr.getvalue())

if __name__ == "__main__":
    unittest.main()
