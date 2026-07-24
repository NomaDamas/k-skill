from __future__ import annotations

from popbill import (
    AccountCheckService,
    BizInfoCheckService,
    Cashbill,
    CashbillService,
    ClosedownService,
    EasyFinBankService,
    FaxReceiver,
    FaxService,
    FileData,
    HTCashbillService,
    HTTaxinvoiceService,
    KakaoButton,
    KakaoReceiver,
    KakaoService,
    MessageReceiver,
    MessageService,
    Statement,
    StatementDetail,
    StatementService,
    Taxinvoice,
    TaxinvoiceDetail,
    TaxinvoiceService,
)

SERVICE_CLASSES: dict[str, type] = {
    "taxinvoice": TaxinvoiceService,
    "statement": StatementService,
    "cashbill": CashbillService,
    "message": MessageService,
    "kakao": KakaoService,
    "fax": FaxService,
    "closedown": ClosedownService,
    "bizinfo": BizInfoCheckService,
    "easyfin-bank": EasyFinBankService,
    "account-check": AccountCheckService,
    "ht-taxinvoice": HTTaxinvoiceService,
    "ht-cashbill": HTCashbillService,
}

OBJECT_CLASSES: dict[str, type] = {
    "taxinvoice": Taxinvoice,
    "taxinvoice-detail": TaxinvoiceDetail,
    "statement": Statement,
    "statement-detail": StatementDetail,
    "cashbill": Cashbill,
    "message-receiver": MessageReceiver,
    "fax-receiver": FaxReceiver,
    "file-data": FileData,
    "kakao-receiver": KakaoReceiver,
    "kakao-button": KakaoButton,
}
