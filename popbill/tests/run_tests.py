from __future__ import annotations

import importlib.util
import json
import sys
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from fake_popbill import install_fake_popbill

install_fake_popbill()

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "popbill_cli.py"
sys.path.insert(0, str(MODULE_PATH.parent))
spec = importlib.util.spec_from_file_location("popbill_cli", MODULE_PATH)
popbill_cli = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(popbill_cli)


def test_normalize_corp_num_accepts_hyphenated_number():
    assert popbill_cli.normalize_corp_num("123-45-67890") == "1234567890"


def test_dangerous_methods_require_approval():
    assert popbill_cli.is_dangerous_method("registIssue") is True
    assert popbill_cli.is_dangerous_method("sendSMS") is True
    assert popbill_cli.is_dangerous_method("CancelReserveRNbyRCV") is True
    assert popbill_cli.is_dangerous_method("resendFax_multi") is True
    assert popbill_cli.is_dangerous_method("quitMember") is True
    assert popbill_cli.is_dangerous_method("delete") is True
    assert popbill_cli.is_dangerous_method("getInfo") is False
    assert popbill_cli.is_dangerous_method("getURL") is False
    assert popbill_cli.is_dangerous_method("getPartnerBalance") is False


def test_nested_object_converts_kind_payloads():
    value = popbill_cli.nested_object({"__kind__": "taxinvoice-detail", "serialNum": 1, "itemName": "테스트"})
    assert value.__class__.__name__ == "TaxinvoiceDetail"
    assert value.serialNum == 1
    assert value.itemName == "테스트"


def test_service_coverage_contains_all_popbill_modules():
    expected = {
        "taxinvoice",
        "statement",
        "cashbill",
        "message",
        "kakao",
        "fax",
        "closedown",
        "bizinfo",
        "easyfin-bank",
        "account-check",
        "ht-taxinvoice",
        "ht-cashbill",
    }
    assert expected <= set(popbill_cli.SERVICE_CLASSES)


def test_config_check_does_not_print_secret_values():
    import os
    old = dict(os.environ)
    try:
        os.environ["KSKILL_POPBILL_LINK_ID"] = "LINKSECRET"
        os.environ["KSKILL_POPBILL_SECRET_KEY"] = "SUPERSECRET"
        os.environ["KSKILL_POPBILL_CORP_NUM"] = "1234567890"
        args = popbill_cli.build_parser().parse_args(["config-check"])
        output = StringIO()
        with redirect_stdout(output):
            result = popbill_cli.command_config_check(args)
        assert result == 0
        printed = output.getvalue()
        payload = json.loads(printed)
        assert payload["ok"] is True
        assert "LINKSECRET" not in printed
        assert "SUPERSECRET" not in printed
    finally:
        os.environ.clear()
        os.environ.update(old)


def main() -> int:
    tests = [value for name, value in globals().items() if name.startswith("test_")]
    for test in tests:
        test()
    print(f"{len(tests)} tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
