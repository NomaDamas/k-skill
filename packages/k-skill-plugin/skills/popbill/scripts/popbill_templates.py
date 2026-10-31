from __future__ import annotations

import datetime as dt
from typing import Any


def object_templates(today: dt.date | None = None) -> dict[str, dict[str, Any]]:
    write_date = (today or dt.date.today()).strftime("%Y%m%d")
    return {
        "taxinvoice": {
            "issueType": "정발행",
            "chargeDirection": "정과금",
            "purposeType": "청구",
            "taxType": "과세",
            "writeDate": write_date,
            "invoicerMgtKey": "TEST-YYYYMMDD-001",
            "invoicerCorpNum": "1234567890",
            "invoicerCorpName": "공급자 상호",
            "invoicerCEOName": "대표자",
            "invoicerAddr": "공급자 주소",
            "invoicerEmail": "tax@example.com",
            "invoiceeType": "사업자",
            "invoiceeCorpNum": "0987654321",
            "invoiceeCorpName": "공급받는자 상호",
            "invoiceeCEOName": "대표자",
            "invoiceeAddr": "공급받는자 주소",
            "invoiceeEmail1": "receiver@example.com",
            "supplyCostTotal": "91",
            "taxTotal": "9",
            "totalAmount": "100",
            "detailList": [
                {
                    "__kind__": "taxinvoice-detail",
                    "serialNum": 1,
                    "itemName": "테스트 품목",
                    "supplyCost": "91",
                    "tax": "9",
                }
            ],
        },
        "statement": {
            "itemCode": 121,
            "mgtKey": "STMT-YYYYMMDD-001",
            "senderCorpNum": "1234567890",
            "receiverCorpNum": "0987654321",
            "detailList": [
                {
                    "__kind__": "statement-detail",
                    "serialNum": 1,
                    "itemName": "테스트 품목",
                    "supplyCost": "91",
                    "tax": "9",
                }
            ],
        },
        "cashbill": {
            "mgtKey": "CASH-YYYYMMDD-001",
            "tradeType": "승인거래",
            "tradeUsage": "소득공제용",
            "taxationType": "과세",
            "totalAmount": "100",
            "supplyCost": "91",
            "tax": "9",
            "serviceFee": "0",
            "identityNum": "01000000000",
            "customerName": "테스트",
        },
        "message-receiver": {"receiveNum": "01000000000", "receiveName": "테스트"},
        "fax-receiver": {"receiveNum": "0200000000", "receiveName": "테스트"},
        "kakao-receiver": {"rcv": "01000000000", "rcvnm": "테스트", "msg": "알림톡 테스트"},
    }
