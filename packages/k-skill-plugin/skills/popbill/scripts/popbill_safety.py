from __future__ import annotations

DANGEROUS_METHOD_PREFIXES = (
    "accept",
    "assign",
    "attach",
    "bulk",
    "cancel",
    "checkaccountinfo",
    "checkdepositorinfo",
    "close",
    "delete",
    "deny",
    "detach",
    "faxsend",
    "issue",
    "join",
    "payment",
    "quit",
    "refund",
    "refuse",
    "regist",
    "register",
    "request",
    "resend",
    "revoke",
    "send",
    "update",
)
SAFE_URL_METHODS = frozenset(
    {"getaccessurl", "getchargeurl", "getpaymenturl", "getpopbillurl", "geturl", "getusehistoryurl"}
)


def is_dangerous_method(method_name: str) -> bool:
    lowered = method_name.lower()
    return lowered.startswith(DANGEROUS_METHOD_PREFIXES) and lowered not in SAFE_URL_METHODS
