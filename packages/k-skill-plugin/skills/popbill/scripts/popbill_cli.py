#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "popbill==1.64.2",
# ]
# ///
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any, Callable

from popbill import PopbillException
from popbill_registry import OBJECT_CLASSES, SERVICE_CLASSES
from popbill_safety import is_dangerous_method
from popbill_templates import object_templates

SECRET_FILE = Path.home() / ".config" / "k-skill" / "secrets.env"
ENV_ALIASES = {
    "link_id": ("KSKILL_POPBILL_LINK_ID", "POPBILL_LINKID", "POPBILL_LINK_ID"),
    "secret_key": ("KSKILL_POPBILL_SECRET_KEY", "POPBILL_SECRET_KEY"),
    "corp_num": ("KSKILL_POPBILL_CORP_NUM", "POPBILL_TEST_CORP_NUM", "POPBILL_CORP_NUM"),
    "user_id": ("KSKILL_POPBILL_USER_ID", "POPBILL_USER_ID"),
}
DEFAULT_TEST_CORP_NUMS = ("1231212312", "1248100998", "1208800767")

def load_dotenv(path: Path = SECRET_FILE) -> None:
    if not path.exists():
        return
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise RuntimeError(f"{path} permissions are {oct(mode)}; expected 0600")
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def env_value(name: str, explicit: str | None = None, *, required: bool = False) -> str | None:
    if explicit:
        return explicit.strip()
    for key in ENV_ALIASES[name]:
        value = os.environ.get(key, "").strip()
        if value and value != "replace-me":
            return value
    if required:
        names = ", ".join(ENV_ALIASES[name])
        raise ValueError(f"missing {name}; set one of: {names}")
    return None


def normalize_corp_num(value: str | None) -> str:
    if not value:
        raise ValueError("missing corp_num; set KSKILL_POPBILL_CORP_NUM or pass --corp-num")
    normalized = re.sub(r"\D", "", value)
    if not re.fullmatch(r"\d{10}", normalized):
        raise ValueError("corp_num must be a 10 digit Korean business registration number")
    return normalized


def create_service(service_name: str, *, link_id: str | None, secret_key: str | None, is_test: bool) -> Any:
    cls = SERVICE_CLASSES[service_name]
    service = cls(env_value("link_id", link_id, required=True), env_value("secret_key", secret_key, required=True))
    service.IsTest = bool(is_test)
    service.IPRestrictOnOff = True
    return service


def to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if hasattr(value, "__dict__"):
        return {k: to_jsonable(v) for k, v in vars(value).items() if not k.startswith("_")}
    return str(value)


def print_json(payload: Any) -> None:
    print(json.dumps(to_jsonable(payload), ensure_ascii=False, indent=2, sort_keys=True))


def parse_json_arg(value: str | None, default: Any) -> Any:
    if not value:
        return default
    if value.startswith("@"):
        value = Path(value[1:]).read_text(encoding="utf-8")
    return json.loads(value)


def object_from_payload(kind: str, payload: dict[str, Any]) -> Any:
    if kind not in OBJECT_CLASSES:
        raise ValueError(f"unsupported object kind: {kind}")
    return OBJECT_CLASSES[kind](**payload)


def nested_object(value: Any) -> Any:
    if isinstance(value, dict):
        kind = value.pop("__kind__", None)
        converted = {k: nested_object(v) for k, v in value.items()}
        if kind:
            return object_from_payload(kind, converted)
        return converted
    if isinstance(value, list):
        return [nested_object(v) for v in value]
    return value


def guard_dangerous(method_name: str, args: argparse.Namespace) -> None:
    if not is_dangerous_method(method_name):
        return
    if not args.yes_i_understand:
        raise ValueError(f"{method_name} can mutate Popbill/test data or send messages; pass --yes-i-understand after current-turn approval")
    if not args.test and not args.allow_production:
        raise ValueError("production mutation requires --allow-production and current-turn approval")


def command_config_check(args: argparse.Namespace) -> int:
    load_dotenv()
    missing = []
    for logical, aliases in ENV_ALIASES.items():
        if logical == "user_id":
            continue
        if logical == "corp_num" and os.environ.get("KSKILL_POPBILL_TRY_DEFAULT_TEST_CORP_NUMS") == "1":
            continue
        if not env_value(logical, getattr(args, logical, None)):
            missing.append({"field": logical, "accepted_env": aliases})
    result = {
        "ok": not missing,
        "secrets_file": str(SECRET_FILE),
        "secrets_file_exists": SECRET_FILE.exists(),
        "missing": missing,
        "mode": "test" if args.test else "production",
    }
    print_json(result)
    return 0 if not missing else 1


def command_methods(args: argparse.Namespace) -> int:
    cls = SERVICE_CLASSES[args.service]
    import inspect

    methods = []
    for name, func in inspect.getmembers(cls, inspect.isfunction):
        if name.startswith("_") or name == "__init__":
            continue
        methods.append({"name": name, "signature": str(inspect.signature(func)), "requires_approval": is_dangerous_method(name)})
    print_json({"service": args.service, "methods": methods})
    return 0


def command_object_template(args: argparse.Namespace) -> int:
    templates = object_templates()
    print_json({"kind": args.kind, "template": templates.get(args.kind, {})})
    return 0


def command_call(args: argparse.Namespace) -> int:
    load_dotenv()
    guard_dangerous(args.method, args)
    service = create_service(args.service, link_id=args.link_id, secret_key=args.secret_key, is_test=args.test)
    if not hasattr(service, args.method):
        raise ValueError(f"{args.service} has no method {args.method}")
    method: Callable[..., Any] = getattr(service, args.method)
    positional = nested_object(parse_json_arg(args.args_json, []))
    keywords = nested_object(parse_json_arg(args.kwargs_json, {}))
    if not isinstance(positional, list):
        raise ValueError("--args-json must be a JSON array")
    if not isinstance(keywords, dict):
        raise ValueError("--kwargs-json must be a JSON object")
    if positional and positional[0] == "@corp":
        positional[0] = resolve_corp_candidates(args.corp_num)[0]
    result = method(*positional, **keywords)
    print_json({"ok": True, "service": args.service, "method": args.method, "result": result})
    return 0


def resolve_corp_candidates(explicit: str | None = None) -> list[str]:
    configured = env_value("corp_num", explicit)
    if configured:
        return [normalize_corp_num(configured)]
    if os.environ.get("KSKILL_POPBILL_TRY_DEFAULT_TEST_CORP_NUMS") == "1":
        return list(DEFAULT_TEST_CORP_NUMS)
    raise ValueError("missing corp_num; set KSKILL_POPBILL_CORP_NUM or pass --corp-num")


def command_health(args: argparse.Namespace) -> int:
    load_dotenv()
    service = create_service(args.service, link_id=args.link_id, secret_key=args.secret_key, is_test=args.test)
    all_checks = []
    for corp_num in resolve_corp_candidates(args.corp_num):
        checks: dict[str, Any] = {"service": args.service, "corp_num": corp_num, "mode": "test" if args.test else "production"}
        success = False
        for method_name in ("checkIsMember", "getPartnerBalance"):
            if hasattr(service, method_name):
                try:
                    checks[method_name] = getattr(service, method_name)(corp_num)
                    success = True
                except PopbillException as exc:
                    checks[method_name] = {"popbill_error": int(exc.code), "message": str(exc.message)}
        all_checks.append(checks)
        if success:
            print_json(checks)
            return 0
    print_json({"ok": False, "checks": all_checks})
    return 2


def command_closedown_check(args: argparse.Namespace) -> int:
    load_dotenv()
    corp_num = normalize_corp_num(env_value("corp_num", args.corp_num, required=True))
    target = normalize_corp_num(args.target_corp_num)
    service = create_service("closedown", link_id=args.link_id, secret_key=args.secret_key, is_test=args.test)
    print_json({"ok": True, "result": service.checkCorpNum(corp_num, target)})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Popbill all-service k-skill CLI")
    parser.add_argument("--link-id")
    parser.add_argument("--secret-key")
    parser.add_argument("--corp-num")
    parser.add_argument("--test", action=argparse.BooleanOptionalAction, default=True, help="use Popbill test environment (default: true)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("config-check", help="check local k-skill Popbill secret wiring without printing secrets")
    p.set_defaults(func=command_config_check)

    p = sub.add_parser("methods", help="list SDK methods for a Popbill service")
    p.add_argument("service", choices=sorted(SERVICE_CLASSES))
    p.set_defaults(func=command_methods)

    p = sub.add_parser("object-template", help="print safe starter JSON for SDK input objects")
    p.add_argument("kind", choices=sorted(set(OBJECT_CLASSES) | {"message-receiver", "fax-receiver", "kakao-receiver"}))
    p.set_defaults(func=command_object_template)

    p = sub.add_parser("health", help="safe membership/balance smoke test")
    p.add_argument("service", choices=sorted(SERVICE_CLASSES), nargs="?", default="taxinvoice")
    p.set_defaults(func=command_health)

    p = sub.add_parser("closedown-check", help="휴폐업 단건 조회")
    p.add_argument("--target-corp-num", required=True)
    p.set_defaults(func=command_closedown_check)

    p = sub.add_parser("call", help="generic SDK method call; covers all Popbill SDK service features")
    p.add_argument("service", choices=sorted(SERVICE_CLASSES))
    p.add_argument("method")
    p.add_argument("--args-json", default="[]", help="JSON array; use @path to read from file. Use @corp as first item to inject --corp-num/env corp num.")
    p.add_argument("--kwargs-json", default="{}", help="JSON object; use @path to read from file")
    p.add_argument("--yes-i-understand", action="store_true", help="required for mutation/send/issue operations")
    p.add_argument("--allow-production", action="store_true", help="required together with --no-test for production mutation")
    p.set_defaults(func=command_call)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except PopbillException as exc:
        print_json({"ok": False, "popbill_error": int(exc.code), "message": str(exc.message)})
        return 2
    except Exception as exc:
        print_json({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
