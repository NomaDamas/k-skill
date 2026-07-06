# 팝빌 all-service API helper

`popbill` 스킬은 Popbill Python SDK를 k-skill 방식으로 사용하는 thin wrapper다. 사용자별 과금/권한 API이므로 hosted `k-skill-proxy`를 쓰지 않고 로컬 BYOK 방식으로 호출한다.

## 제공 기능

- 전자세금계산서: `TaxinvoiceService`
- 전자명세서: `StatementService`
- 현금영수증: `CashbillService`
- 문자: `MessageService`
- 카카오톡/알림톡/친구톡/브랜드메시지: `KakaoService`
- 팩스: `FaxService`
- 휴폐업조회: `ClosedownService`
- 기업정보조회: `BizInfoCheckService`
- 계좌조회: `EasyFinBankService`
- 예금주/계좌성명조회: `AccountCheckService`
- 홈택스 전자세금계산서 수집: `HTTaxinvoiceService`
- 홈택스 현금영수증 수집: `HTCashbillService`

## 시크릿

`~/.config/k-skill/secrets.env` 또는 환경변수:

```dotenv
KSKILL_POPBILL_LINK_ID=...
KSKILL_POPBILL_SECRET_KEY=...
KSKILL_POPBILL_CORP_NUM=...
KSKILL_POPBILL_USER_ID=
```

권한은 `0600`이어야 한다. 실제 값은 PR, 문서, 로그에 남기지 않는다.

## 사용 예

```bash
uv run popbill/scripts/popbill_cli.py config-check
uv run popbill/scripts/popbill_cli.py methods taxinvoice
uv run popbill/scripts/popbill_cli.py health taxinvoice
uv run popbill/scripts/popbill_cli.py object-template taxinvoice
```

전체 SDK method는 generic call로 호출한다.

```bash
uv run popbill/scripts/popbill_cli.py call taxinvoice getInfo \
  --args-json '["@corp", "SELL", "MGT-KEY-001"]'
```

발행/전송/취소/삭제/계좌조회 같은 mutation 또는 과금 가능 작업은 사용자 현재 턴 승인 후 `--yes-i-understand`를 붙인다. 운영환경 mutation은 `--no-test --allow-production`도 필요하다.

## 공식 문서

- Popbill developer center: <https://developers.popbill.com>
- 전자세금계산서 환경설정: <https://developers.popbill.com/guide/taxinvoice/getting-started/environment-set-up>
- 운영 전환 신청: <https://developers.popbill.com/customer-center/serviceopen>
