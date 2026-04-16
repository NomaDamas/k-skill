from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import scripts.kakaotalk_mac as kakaotalk_mac


def sha512_hex(value: int) -> str:
    return hashlib.sha512(str(value).encode("utf-8")).hexdigest()


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


if __name__ == "__main__":
    unittest.main()
