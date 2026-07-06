from __future__ import annotations

import sys
import types
from types import SimpleNamespace


def install_fake_popbill() -> None:
    fake = types.ModuleType("popbill")

    class FakeService:
        def __init__(self, *args):
            self.args = args

    class FakeObject(SimpleNamespace):
        pass

    for name in (
        "AccountCheckService",
        "BizInfoCheckService",
        "CashbillService",
        "ClosedownService",
        "EasyFinBankService",
        "FaxService",
        "HTCashbillService",
        "HTTaxinvoiceService",
        "KakaoService",
        "MessageService",
        "StatementService",
        "TaxinvoiceService",
    ):
        setattr(fake, name, type(name, (FakeService,), {}))

    for name in (
        "Cashbill",
        "FaxReceiver",
        "FileData",
        "KakaoButton",
        "KakaoReceiver",
        "MessageReceiver",
        "Statement",
        "StatementDetail",
        "Taxinvoice",
        "TaxinvoiceDetail",
    ):
        setattr(fake, name, type(name, (FakeObject,), {}))

    setattr(fake, "PopbillException", type("PopbillException", (Exception,), {}))
    sys.modules["popbill"] = fake
