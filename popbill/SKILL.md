---
name: popbill
description: 팝빌 전자세금계산서·전자명세서·현금영수증·문자·카카오톡·팩스·휴폐업/기업정보·계좌조회·홈택스 수집을 테스트/운영 환경에서 안전하게 호출한다.
license: MIT
metadata:
  category: business
  locale: ko-KR
  phase: v1
---

# Popbill all-service k-skill

팝빌 Python SDK `popbill==1.64.2`를 감싸는 k-skill이다. 목표는 전자세금계산서 하나만이 아니라 팝빌 SDK가 제공하는 주요 서비스 전체를 같은 방식으로 조회·검증·발행 전 점검할 수 있게 하는 것이다.

## 제공 범위

`scripts/popbill_cli.py`는 아래 SDK service class를 모두 노출한다.

- `taxinvoice`: 전자세금계산서 발행/임시저장/수정/취소/국세청 전송/조회/인쇄 URL/인증서 확인/첨부/메일·문자·팩스 재전송
- `statement`: 전자명세서 등록/발행/수정/취소/조회/인쇄 URL/메일·문자·팩스 전송
- `cashbill`: 현금영수증 등록/발행/취소/역발행/조회/메일·문자·팩스 전송
- `message`: SMS/LMS/MMS 단건·대량 발송, 예약취소, 결과조회, 발신번호 관리 조회
- `kakao`: 알림톡/친구톡/브랜드메시지 템플릿·채널·발신번호 조회와 발송/예약취소/결과조회
- `fax`: 팩스 발송/예약취소/결과조회/발신번호 관리
- `closedown`: 휴폐업 조회
- `bizinfo`: 기업정보조회
- `easyfin-bank`: 계좌 등록/수집작업/내역조회 등 팝빌 계좌조회 서비스
- `account-check`: 예금주·계좌성명 조회
- `ht-taxinvoice`: 홈택스 전자세금계산서 수집 작업/검색/상세/XML
- `ht-cashbill`: 홈택스 현금영수증 수집 작업/검색/요약

모든 SDK method는 `call` 서브커맨드로 호출 가능하다. 안전한 조회는 바로 실행하고, 발행·전송·취소·삭제·계좌검증 등 상태 변경/과금 가능 작업은 `--yes-i-understand`가 있어야 실행된다. 운영환경 mutation은 추가로 `--no-test --allow-production`이 필요하다.

## 인증/시크릿

시크릿은 저장소에 넣지 않는다. k-skill 표준 resolution order를 따른다.

1. 이미 환경변수에 있으면 그대로 사용
2. 에이전트 vault(1Password/Bitwarden/macOS Keychain 등)를 쓰면 거기서 주입
3. `~/.config/k-skill/secrets.env` fallback, 권한 `0600`
4. 없으면 사용자에게 물어 위 경로에 저장

지원 환경변수:

```dotenv
KSKILL_POPBILL_LINK_ID=...
KSKILL_POPBILL_SECRET_KEY=...
KSKILL_POPBILL_CORP_NUM=...
KSKILL_POPBILL_USER_ID=
```

호환 alias도 읽는다: `POPBILL_LINKID`, `POPBILL_LINK_ID`, `POPBILL_SECRET_KEY`, `POPBILL_TEST_CORP_NUM`, `POPBILL_CORP_NUM`, `POPBILL_USER_ID`.

기본은 팝빌 테스트 환경이다. 운영환경은 명시적으로 `--no-test`를 붙여야 한다.

## 필수 사전조건

서비스별로 팝빌 계정 준비가 다르다.

- 전자세금계산서: 테스트/운영 환경 각각 공동인증서 등록 필요
- 홈택스 수집: 홈택스 수집용 인증서/정액제 상태 필요
- 문자: 발신번호 사전 등록 필요
- 카카오톡/알림톡: 비즈니스 채널, 발신번호, 승인 템플릿 필요
- 팩스: 발신번호 등록 권장 또는 필요할 수 있음
- 계좌/예금주조회: 팝빌 서비스 신청·과금·조회 대상 입력값 필요
- 테스트와 운영 환경은 분리되어 있으며 테스트 데이터가 운영으로 이관되지 않는다

## 기본 명령

```bash
# 시크릿 파일 권한과 필수 env 존재 확인. 실제 secret 값은 출력하지 않는다.
uv run popbill/scripts/popbill_cli.py config-check

# 특정 SDK service method 목록과 approval 필요 여부 확인
uv run popbill/scripts/popbill_cli.py methods taxinvoice
uv run popbill/scripts/popbill_cli.py methods kakao

# 안전한 SDK 객체 템플릿 출력
uv run popbill/scripts/popbill_cli.py object-template taxinvoice
uv run popbill/scripts/popbill_cli.py object-template cashbill

# 테스트 환경에서 안전한 회원/파트너 잔액 smoke test
uv run popbill/scripts/popbill_cli.py health taxinvoice

# 휴폐업 단건 조회
uv run popbill/scripts/popbill_cli.py closedown-check --target-corp-num 123-45-67890
```

## Generic SDK call

전체 Popbill SDK 기능은 아래 형태로 호출한다.

```bash
uv run popbill/scripts/popbill_cli.py call <service> <method> \
  --args-json '["@corp", "arg2"]' \
  --kwargs-json '{"UserID":"optional-user"}'
```

`--args-json` 첫 번째 원소가 `"@corp"`이면 `--corp-num` 또는 `KSKILL_POPBILL_CORP_NUM` 값으로 대체된다. JSON 파일을 쓰려면 `@path/to/file.json` 형식을 사용한다. 중첩 SDK 객체는 `__kind__` 필드로 지정한다.

예: 전자세금계산서 임시저장 payload skeleton

```json
{
  "__kind__": "taxinvoice",
  "issueType": "정발행",
  "chargeDirection": "정과금",
  "purposeType": "청구",
  "taxType": "과세",
  "writeDate": "20260701",
  "invoicerMgtKey": "TEST-20260701-001",
  "invoicerCorpNum": "1234567890",
  "invoicerCorpName": "공급자 상호",
  "invoicerCEOName": "대표자",
  "invoiceeType": "사업자",
  "invoiceeCorpNum": "0987654321",
  "invoiceeCorpName": "공급받는자 상호",
  "invoiceeCEOName": "대표자",
  "supplyCostTotal": "91",
  "taxTotal": "9",
  "totalAmount": "100",
  "detailList": [
    {"__kind__":"taxinvoice-detail", "serialNum":1, "itemName":"테스트 품목", "supplyCost":"91", "tax":"9"}
  ]
}
```

발행·전송·삭제·취소처럼 되돌리기 어려운 동작은 사용자의 현재 턴 승인을 받은 뒤에만 실행한다.

```bash
uv run popbill/scripts/popbill_cli.py call taxinvoice registIssue \
  --args-json '["@corp", {"__kind__":"taxinvoice", "...":"..."}]' \
  --yes-i-understand
```

## 안전 경계

- 실제 `LinkID`, `SecretKey`, 사업자번호, 인증서, 수신자 전화번호/이메일, 계좌번호를 저장소·PR·스크린샷에 넣지 않는다.
- 테스트 환경에서도 발행/전송/취소/삭제는 사용자 승인 없이 실행하지 않는다.
- 운영환경에서 발행/전송/취소/삭제는 `--no-test --allow-production --yes-i-understand`와 현재 턴 승인 둘 다 필요하다.
- 메시지·알림톡·팩스 발송은 테스트라도 수신자에게 도달하거나 과금될 수 있으므로 기본적으로 dry-run/템플릿/조회부터 한다.
- 계좌조회/예금주조회는 개인정보·금융정보이므로 목적·보관·파기 기준이 명확할 때만 실행한다.

## 실패 모드

- `missing link_id/secret_key/corp_num`: k-skill secrets 파일 또는 환경변수 설정 필요
- `permissions ... expected 0600`: `chmod 600 ~/.config/k-skill/secrets.env`
- `-99003008`: 해당 테스트/운영 환경에 연동회원 사업자번호가 없음
- `-10004000`: 전자세금계산서 공동인증서 미등록
- 문자/카카오/팩스 발신번호·채널·템플릿 미등록: 서비스별 관리 URL에서 등록 후 재시도
- 테스트 환경 성공이 운영환경 성공을 보장하지 않음: 운영 전환 신청과 운영 계정 세팅이 별도로 필요

## 완료 기준

- `config-check`가 필수 시크릿 존재를 확인한다.
- `methods <service>`로 필요한 SDK method가 확인된다.
- 가능한 경우 `health <service>` 또는 조회형 API가 테스트 환경에서 성공한다.
- mutation 작업은 payload를 파일로 저장해 사용자 확인을 받은 뒤 `--yes-i-understand`로 실행하고 응답 code/message를 보관한다.
