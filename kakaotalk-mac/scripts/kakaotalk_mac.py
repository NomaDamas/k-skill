#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import multiprocessing as mp
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence


EMPTY_ACCOUNT_HASH = (
    "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025"
    "f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99"
)
HEX_DATABASE_PATTERN = re.compile(r"^[0-9a-f]{78}(?:\.db)?$")
DIRECT_USER_ID_KEYS = ("userId", "user_id", "KAKAO_USER_ID", "userID")
DEFAULT_MAX_USER_ID = 1_000_000_000
DEFAULT_CHUNK_SIZE = 500_000
DEFAULT_CACHE_PATH = Path.home() / ".cache" / "k-skill" / "kakaotalk-mac-auth.json"
READ_ONLY_COMMANDS = ("chats", "messages", "search", "schema")


class AuthResolutionError(RuntimeError):
    pass


@dataclass
class DetectionState:
    uuid: str
    candidate_user_ids: list[int]
    active_account_hash: str | None
    database_files: list[Path]


@dataclass
class ResolvedAuth:
    user_id: int
    uuid: str
    database_path: Path
    database_name: str
    key: str
    source: str


def parse_plist_xml(xml_text: str) -> Any:
    tokens = tokenize_plist_xml(xml_text)
    if not tokens:
        raise AuthResolutionError("plist XML was empty")
    index = 0
    if tokens[index] != ("start", "plist"):
        raise AuthResolutionError("plist XML did not start with <plist>")
    value, index = _parse_plist_tokens(tokens, index + 1)
    if tokens[index] != ("end", "plist"):
        raise AuthResolutionError("plist XML did not end with </plist>")
    return value


def tokenize_plist_xml(xml_text: str) -> list[tuple[str, str]]:
    normalized = re.sub(r"<\?xml[^>]*\?>", "", xml_text)
    normalized = re.sub(r"<!DOCTYPE[^>]*>", "", normalized)
    normalized = re.sub(r"<([A-Za-z0-9]+)\s*/>", r"<\1></\1>", normalized)
    normalized = (
        normalized.replace("\r", "")
    )
    tokens: list[tuple[str, str]] = []
    position = 0
    for match in re.finditer(r"<(/?)([A-Za-z0-9]+)(?: [^>]*)?>", normalized):
        text = normalized[position : match.start()]
        stripped = _unescape_xml(text).strip()
        if stripped:
            tokens.append(("text", stripped))
        token_type = "end" if match.group(1) else "start"
        tokens.append((token_type, match.group(2)))
        position = match.end()
    trailing = _unescape_xml(normalized[position:]).strip()
    if trailing:
        tokens.append(("text", trailing))
    return [token for token in tokens if token[0] != "text" or token[1]]


def _parse_plist_tokens(tokens: list[tuple[str, str]], index: int) -> tuple[Any, int]:
    token_type, tag = tokens[index]
    if token_type != "start":
        raise AuthResolutionError(f"Unexpected token {tokens[index]!r}")

    if tag == "dict":
        result: dict[str, Any] = {}
        index += 1
        while tokens[index] != ("end", "dict"):
            if tokens[index] != ("start", "key"):
                raise AuthResolutionError(f"Expected dict key, got {tokens[index]!r}")
            key, index = _parse_scalar(tokens, index, "key", lambda value: value)
            value, index = _parse_plist_tokens(tokens, index)
            result[key] = value
        return result, index + 1

    if tag == "array":
        items: list[Any] = []
        index += 1
        while tokens[index] != ("end", "array"):
            value, index = _parse_plist_tokens(tokens, index)
            items.append(value)
        return items, index + 1

    if tag == "integer":
        return _parse_scalar(tokens, index, "integer", int)
    if tag == "real":
        return _parse_scalar(tokens, index, "real", float)
    if tag == "string":
        return _parse_scalar(tokens, index, "string", lambda value: value)
    if tag == "date":
        return _parse_scalar(tokens, index, "date", lambda value: value)
    if tag == "data":
        return _parse_scalar(tokens, index, "data", lambda value: value)
    if tag == "true":
        return True, index + 2
    if tag == "false":
        return False, index + 2
    raise AuthResolutionError(f"Unsupported plist tag: {tag}")


def _parse_scalar(
    tokens: list[tuple[str, str]],
    index: int,
    tag: str,
    caster: Callable[[str], Any],
) -> tuple[Any, int]:
    if tokens[index] != ("start", tag):
        raise AuthResolutionError(f"Expected <{tag}>, got {tokens[index]!r}")
    text = ""
    index += 1
    if tokens[index][0] == "text":
        text = tokens[index][1]
        index += 1
    if tokens[index] != ("end", tag):
        raise AuthResolutionError(f"Expected </{tag}>, got {tokens[index]!r}")
    return caster(text), index + 1


def _unescape_xml(text: str) -> str:
    return (
        text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
    )


def collect_candidate_user_ids(plist_data: dict[str, Any]) -> list[int]:
    candidates: list[int] = []
    for key in DIRECT_USER_ID_KEYS:
        value = plist_data.get(key)
        if isinstance(value, int) and value > 0:
            candidates.append(value)
        elif isinstance(value, str) and value.isdigit():
            candidates.append(int(value))

    alert_ids = plist_data.get("AlertKakaoIDsList", [])
    if isinstance(alert_ids, list):
        for item in alert_ids:
            if isinstance(item, int) and item > 0:
                candidates.append(item)
            elif isinstance(item, str) and item.isdigit():
                numeric = int(item)
                if numeric > 0:
                    candidates.append(numeric)

    return unique_ints(candidates)


def find_active_account_hash(plist_data: dict[str, Any]) -> str | None:
    prefix = "DESIGNATEDFRIENDSREVISION:"
    for key, value in plist_data.items():
        if not key.startswith(prefix):
            continue
        hash_hex = key[len(prefix) :]
        if hash_hex == EMPTY_ACCOUNT_HASH:
            continue
        if not re.fullmatch(r"[0-9a-f]{128}", hash_hex):
            continue
        numeric_value = 0
        if isinstance(value, (int, float)):
            numeric_value = int(value)
        elif isinstance(value, str) and value.isdigit():
            numeric_value = int(value)
        if numeric_value != 0:
            return hash_hex
    return None


def discover_database_files(container_path: Path) -> list[Path]:
    if not container_path.exists():
        return []
    return sorted(
        [path for path in container_path.iterdir() if path.is_file() and HEX_DATABASE_PATTERN.fullmatch(path.name)],
        key=lambda item: item.name,
    )


def unique_ints(values: Iterable[int]) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def recover_user_id_from_sha512(
    hex_hash: str,
    *,
    max_user_id: int = DEFAULT_MAX_USER_ID,
    workers: int | None = None,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> int | None:
    if not re.fullmatch(r"[0-9a-f]{128}", hex_hash):
        raise ValueError("expected 128-char lowercase sha512 hex digest")
    if max_user_id < 0:
        raise ValueError("max_user_id must be non-negative")

    normalized_workers = max(1, workers or (os.cpu_count() or 1))
    if normalized_workers == 1:
        return _scan_user_id_range((0, max_user_id + 1, hex_hash))

    start_method = "fork" if "fork" in mp.get_all_start_methods() else mp.get_start_method()
    ctx = mp.get_context(start_method)
    job_iter = (
        (start, min(start + chunk_size, max_user_id + 1), hex_hash)
        for start in range(0, max_user_id + 1, chunk_size)
    )
    with ctx.Pool(processes=normalized_workers) as pool:
        for result in pool.imap_unordered(_scan_user_id_range, job_iter, chunksize=1):
            if result is not None:
                pool.terminate()
                return result
    return None


def _scan_user_id_range(job: tuple[int, int, str]) -> int | None:
    start, end, hex_hash = job
    target = hex_hash.encode("ascii")
    for user_id in range(start, end):
        if hashlib.sha512(str(user_id).encode("utf-8")).hexdigest().encode("ascii") == target:
            return user_id
    return None


def database_name(user_id: int, uuid: str) -> str:
    hawawa = ".".join([".", "F", str(user_id), "A", "F", uuid[::-1], ".", "|"])
    salt = hashed_device_uuid(uuid)[::-1].encode("utf-8")
    derived = hashlib.pbkdf2_hmac("sha256", hawawa.encode("utf-8"), salt, 100_000, 128)
    hex_value = derived.hex()
    return hex_value[28 : 28 + 78]


def secure_key(user_id: int, uuid: str) -> str:
    hashed = hashed_device_uuid(uuid)
    parts = ["A", hashed, "|", "F", uuid[:5], "H", str(user_id), "|", uuid[7:]]
    hawawa = "F".join(parts)[::-1].encode("utf-8")
    salt = uuid[int(len(uuid) * 0.3) :].encode("utf-8")
    return hashlib.pbkdf2_hmac("sha256", hawawa, salt, 100_000, 128).hex()


def hashed_device_uuid(uuid: str) -> str:
    uuid_bytes = uuid.encode("utf-8")
    combined = hashlib.sha1(uuid_bytes).digest() + hashlib.sha256(uuid_bytes).digest()
    return base64.b64encode(combined).decode("ascii")


def resolve_auth_state(
    state: DetectionState,
    *,
    verify_access: Callable[[ResolvedAuth], bool],
    cache_path: Path | None = None,
    user_id_override: int | None = None,
    max_user_id: int = DEFAULT_MAX_USER_ID,
    workers: int | None = None,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> ResolvedAuth:
    if not state.database_files:
        raise AuthResolutionError("No KakaoTalk database files were discovered in the container path.")

    candidates = list(state.candidate_user_ids)
    if user_id_override is not None:
        candidates = [user_id_override, *candidates]
    candidates = unique_ints(candidates)

    for user_id in candidates:
        resolved = _try_resolved_auth(user_id, "candidate", state, verify_access)
        if resolved is not None:
            persist_auth_cache(resolved, cache_path)
            return resolved

    if state.active_account_hash:
        recovered = recover_user_id_from_sha512(
            state.active_account_hash,
            max_user_id=max_user_id,
            workers=workers,
            chunk_size=chunk_size,
        )
        if recovered is not None and recovered not in candidates:
            resolved = _try_resolved_auth(recovered, "hash-recovery", state, verify_access)
            if resolved is not None:
                persist_auth_cache(resolved, cache_path)
                return resolved

    raise AuthResolutionError(
        "Failed to resolve a working KakaoTalk auth key. "
        "Try a larger --max-user-id or pass --user-id explicitly."
    )


def _try_resolved_auth(
    user_id: int,
    source: str,
    state: DetectionState,
    verify_access: Callable[[ResolvedAuth], bool],
) -> ResolvedAuth | None:
    derived_name = database_name(user_id, state.uuid)
    key = secure_key(user_id, state.uuid)
    for database_path in prioritized_database_paths(state.database_files, derived_name):
        resolved = ResolvedAuth(
            user_id=user_id,
            uuid=state.uuid,
            database_path=database_path,
            database_name=derived_name,
            key=key,
            source=source,
        )
        if verify_access(resolved):
            return resolved
    return None


def prioritized_database_paths(database_files: Sequence[Path], derived_name: str) -> list[Path]:
    preferred_names = {derived_name, f"{derived_name}.db"}
    preferred = [path for path in database_files if path.name in preferred_names]
    fallback = [path for path in database_files if path.name not in preferred_names]
    return [*preferred, *fallback]


def load_cached_auth(cache_path: Path) -> ResolvedAuth | None:
    if not cache_path.exists():
        return None
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        database_path = Path(payload["database_path"]).expanduser()
        user_id = int(payload["user_id"])
        uuid = str(payload["uuid"])
        database_name = str(payload["database_name"])
        key = str(payload["key"])
        source = str(payload.get("source", "cache"))
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None

    if user_id <= 0 or not uuid or not database_name or not key or not database_path.exists():
        return None

    return ResolvedAuth(
        user_id=user_id,
        uuid=uuid,
        database_path=database_path,
        database_name=database_name,
        key=key,
        source=source,
    )


def persist_auth_cache(resolved: ResolvedAuth, cache_path: Path | None) -> None:
    if cache_path is None:
        return
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "user_id": resolved.user_id,
        "uuid": resolved.uuid,
        "database_path": str(resolved.database_path),
        "database_name": resolved.database_name,
        "key": resolved.key,
        "source": resolved.source,
    }
    cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        os.chmod(cache_path, 0o600)
    except OSError:
        pass


def platform_uuid() -> str:
    result = run_command(["/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice"], check=True)
    match = re.search(r'"IOPlatformUUID" = "([0-9A-F-]+)"', result.stdout)
    if not match:
        raise AuthResolutionError("Could not read IOPlatformUUID from ioreg output.")
    return match.group(1)


def convert_plist_to_xml(plist_path: Path) -> str:
    result = run_command(["/usr/bin/plutil", "-convert", "xml1", "-o", "-", str(plist_path)], check=True)
    return result.stdout


def read_plist_snapshot(plist_path: Path) -> dict[str, Any]:
    return parse_plist_xml(convert_plist_to_xml(plist_path))


def collect_detection_state(uuid_override: str | None = None) -> DetectionState:
    uuid = uuid_override or platform_uuid()
    snapshots = []
    for plist_path in preference_paths():
        if plist_path.exists():
            snapshots.append(read_plist_snapshot(plist_path))

    candidate_user_ids: list[int] = []
    active_account_hash: str | None = None
    for snapshot in snapshots:
        candidate_user_ids.extend(collect_candidate_user_ids(snapshot))
        if active_account_hash is None:
            active_account_hash = find_active_account_hash(snapshot)

    return DetectionState(
        uuid=uuid,
        candidate_user_ids=unique_ints(candidate_user_ids),
        active_account_hash=active_account_hash,
        database_files=discover_database_files(container_path()),
    )


def preference_paths() -> list[Path]:
    pref_dir = (
        Path.home()
        / "Library"
        / "Containers"
        / "com.kakao.KakaoTalkMac"
        / "Data"
        / "Library"
        / "Preferences"
    )
    paths = sorted(pref_dir.glob("com.kakao.KakaoTalkMac*.plist"))
    global_pref = Path.home() / "Library" / "Preferences" / "com.kakao.KakaoTalkMac.plist"
    if global_pref.exists():
        paths.append(global_pref)
    deduped: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        if path not in seen:
            seen.add(path)
            deduped.append(path)
    return deduped


def container_path() -> Path:
    return (
        Path.home()
        / "Library"
        / "Containers"
        / "com.kakao.KakaoTalkMac"
        / "Data"
        / "Library"
        / "Application Support"
        / "com.kakao.KakaoTalkMac"
    )


def verify_database_access(resolved: ResolvedAuth) -> bool:
    result = run_command(
        [
            "kakaocli",
            "query",
            "SELECT count(*) FROM sqlite_master",
            "--db",
            str(resolved.database_path),
            "--key",
            resolved.key,
        ],
        check=False,
    )
    return result.returncode == 0


def run_command(args: Sequence[str], *, check: bool) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if check and result.returncode != 0:
        raise AuthResolutionError(result.stderr.strip() or result.stdout.strip() or f"command failed: {' '.join(args)}")
    return result


def resolve_auth(
    *,
    refresh: bool,
    cache_path: Path,
    user_id_override: int | None,
    uuid_override: str | None,
    max_user_id: int,
    workers: int | None,
    chunk_size: int,
) -> ResolvedAuth:
    use_cache = not refresh and user_id_override is None and uuid_override is None
    if use_cache:
        cached = load_cached_auth(cache_path)
        if cached is not None:
            return cached

    state = collect_detection_state(uuid_override)
    return resolve_auth_state(
        state,
        verify_access=verify_database_access,
        cache_path=cache_path,
        user_id_override=user_id_override,
        max_user_id=max_user_id,
        workers=workers,
        chunk_size=chunk_size,
    )


def render_auth(resolved: ResolvedAuth, *, output_format: str, cache_path: Path) -> str:
    payload = {
        "user_id": resolved.user_id,
        "uuid": resolved.uuid,
        "database_path": str(resolved.database_path),
        "database_name": resolved.database_name,
        "key": resolved.key,
        "source": resolved.source,
        "cache_path": str(cache_path),
    }
    if output_format == "json":
        return json.dumps(payload, ensure_ascii=False, indent=2)
    if output_format == "shell":
        return "\n".join(
            [
                f"export KSKILL_KAKAOTALK_USER_ID='{resolved.user_id}'",
                f"export KSKILL_KAKAOTALK_UUID='{resolved.uuid}'",
                f"export KSKILL_KAKAOTALK_DB='{resolved.database_path}'",
                f"export KSKILL_KAKAOTALK_KEY='{resolved.key}'",
                f"export KSKILL_KAKAOTALK_AUTH_CACHE='{cache_path}'",
            ]
        )
    return "\n".join(
        [
            "KakaoTalk auth resolved",
            f"- user_id: {resolved.user_id}",
            f"- uuid: {resolved.uuid}",
            f"- database: {resolved.database_path}",
            f"- source: {resolved.source}",
            f"- cache: {cache_path}",
            "- secrets: redacted in text output (use --format json or --format shell only when automation needs them)",
            "",
            "You can now run:",
            "  python3 scripts/kakaotalk_mac.py chats --limit 10 --json",
            "  python3 scripts/kakaotalk_mac.py messages --chat \"채팅방 이름\" --since 1d --json",
        ]
    )


def build_passthrough_command(command: str, auth: ResolvedAuth, forwarded_args: Sequence[str]) -> list[str]:
    if command not in READ_ONLY_COMMANDS:
        raise AuthResolutionError(
            f"Unsupported command '{command}'. Allowed read-only commands: {', '.join(READ_ONLY_COMMANDS)}"
        )
    return [
        "kakaocli",
        command,
        *forwarded_args,
        "--db",
        str(auth.database_path),
        "--key",
        auth.key,
    ]


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()

    try:
        args, forwarded_args = parser.parse_known_args(argv)
        cache_path = Path(args.cache_path).expanduser()
        if args.command == "auth":
            if forwarded_args:
                raise AuthResolutionError(f"Unexpected auth arguments: {' '.join(forwarded_args)}")
            resolved = resolve_auth(
                refresh=args.refresh,
                cache_path=cache_path,
                user_id_override=args.user_id,
                uuid_override=args.uuid,
                max_user_id=args.max_user_id,
                workers=args.workers,
                chunk_size=args.chunk_size,
            )
            print(render_auth(resolved, output_format=args.format, cache_path=cache_path))
            return 0

        resolved = resolve_auth(
            refresh=args.refresh_auth,
            cache_path=cache_path,
            user_id_override=args.user_id,
            uuid_override=args.uuid,
            max_user_id=args.max_user_id,
            workers=args.workers,
            chunk_size=args.chunk_size,
        )
        result = subprocess.run(build_passthrough_command(args.command, resolved, forwarded_args))
        return result.returncode
    except (AuthResolutionError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Thin k-skill adapter around kakaocli auth for user_id/hash recovery and cached read access.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    auth_parser = subparsers.add_parser("auth", help="Recover/cache the working KakaoTalk DB/key tuple.")
    add_auth_options(auth_parser)
    auth_parser.add_argument("--refresh", action="store_true", help="Ignore cached auth and resolve again.")
    auth_parser.add_argument("--format", choices=("text", "json", "shell"), default="text")

    for command in READ_ONLY_COMMANDS:
        passthrough = subparsers.add_parser(command, help=f"Run kakaocli {command} with cached/recovered auth.")
        add_auth_options(passthrough)
        passthrough.add_argument("--refresh-auth", action="store_true", help="Refresh cached auth before running.")

    return parser


def add_auth_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--cache-path", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--user-id", type=int, help="Explicit Kakao user_id override.")
    parser.add_argument("--uuid", help="Explicit device UUID override.")
    parser.add_argument("--max-user-id", type=non_negative_int, default=DEFAULT_MAX_USER_ID)
    parser.add_argument("--workers", type=positive_int, default=None)
    parser.add_argument("--chunk-size", type=positive_int, default=DEFAULT_CHUNK_SIZE)


def non_negative_int(value: str) -> int:
    integer = int(value)
    if integer < 0:
        raise argparse.ArgumentTypeError("must be non-negative")
    return integer


def positive_int(value: str) -> int:
    integer = int(value)
    if integer <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return integer


if __name__ == "__main__":
    raise SystemExit(main())
