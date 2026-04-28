# 등기부등본 자동화 가이드

`iros-registry-automation`은 인터넷등기소(IROS)에서 법인/부동산 등기부등본(등기사항증명서)을 여러 건 발급해야 할 때, 사용자가 직접 로그인·결제하는 브라우저 흐름을 전제로 장바구니, 열람, 저장 작업을 보조하는 스킬이다.

이 문서는 원 저작자 `challengekim`의 MIT 참고 구현 [`challengekim/iros-registry-automation`](https://github.com/challengekim/iros-registry-automation)을 기준으로 작성했다. 스킬 답변이나 파생 문서에도 이 원 저작자 링크를 남긴다.

## 할 수 있는 일

- 법인등기부등본: 법인등록번호 기반(`iros_cart_by_corpnum.py`) 또는 상호명 기반(`iros_cart.py`)으로 장바구니에 담고, 사용자가 직접 결제한 뒤 열람·저장한다.
- 부동산등기부등본: 주소/동호수 JSON을 사용해 `iros_cart_realty.py`로 장바구니에 담는다. 결제·열람·다운로드는 인터넷등기소 웹 UI에서 수동 처리하는 것을 기본 권장한다.
- TouchEn nxKey 설치, Playwright/Chromium 준비, 입력 파일 형식, 저장 폴더를 점검한다.
- 다운로드된 PDF와 법인정보 리포트 같은 산출물을 저장소 밖 안전한 경로에 두도록 안내한다.

## 먼저 알아둘 점

- 로그인은 사용자가 직접 한다. 아이디/비밀번호, 공동인증서 비밀번호, 간편인증, OTP, 보안카드 입력을 에이전트에게 맡기지 않는다.
- 결제는 사용자가 직접 한다. 카드 번호와 승인 절차는 브라우저에서 사람이 처리한다.
- 법인 발급은 upstream 문서 기준 **페이지당 10건** 결제 제약을 전제로 한다. 10건을 넘으면 사용자가 10건 단위로 반복 결제한다.
- 부동산은 인터넷등기소 웹 UI의 10만원 미만 일괄 결제와 일괄열람출력/일괄저장 기능을 쓰는 편이 빠르고 안전한 경우가 많다. 이 스킬은 부동산 주소 목록을 장바구니에 반복 담는 부분에 초점을 둔다.
- TouchEn nxKey가 설치되어 있지 않으면 중간에 보안 프로그램 설치 페이지가 뜰 수 있다. 설치 후 브라우저/PC를 재시작하고 처음부터 다시 실행한다.
- 이 기능은 참고용 발급 자동화 가이드다. 법률 자문, 권리관계 해석, 발급 결과의 법적 효력 판단을 하지 않는다.

## 설치

```bash
git clone https://github.com/challengekim/iros-registry-automation.git
cd iros-registry-automation
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp config.json.example config.json
```

Chrome/Chromium, Python 3.10+, IROS 로그인 수단, 결제 카드, TouchEn nxKey가 필요하다.

## 안전한 작업 폴더

발급 대상 목록과 PDF에는 법인등록번호, 주소, 동호수, 회사명 등 개인정보/민감정보가 들어갈 수 있다. 저장소 밖 비공개 디렉터리에서 다루고, PR·테스트 로그·공개 문서에 실제 값을 커밋하지 않는다.

```bash
workdir="$(mktemp -d "${TMPDIR:-/tmp}/iros-registry.XXXXXX")"
chmod 700 "$workdir"
```

## 법인등기부등본 흐름

1. 법인등록번호 또는 상호명 목록을 준비한다.
2. 법인등록번호가 있으면 `iros_cart_by_corpnum.py`를 우선 사용한다. 상호명만 있으면 `iros_cart.py`를 사용한다.
3. 브라우저가 열리면 사용자가 직접 IROS에 로그인한다.
4. 자동 처리로 법인 검색 → 말소사항포함 등 선택 → 장바구니 담기를 진행한다.
5. 결제대상목록 페이지가 뜨면 사용자가 직접 카드 결제를 완료한다. 법인은 페이지당 10건 단위 제약을 전제로 한다.
6. 결제 후 `iros_download.py` 또는 마법사 메뉴 2번으로 열람·저장한다.

```bash
python iros_cart_by_corpnum.py
python iros_download.py
```

## 부동산등기부등본 흐름

1. 주소/동호수 JSON을 준비한다.
2. `iros_cart_realty.py`로 주소 검색 → 소재지번 선택 → 용도(열람)/등기기록유형(전부)/미공개 → 장바구니 담기를 진행한다.
3. 사용자가 인터넷등기소 웹 UI에서 직접 결제, 일괄열람출력, 일괄저장을 수행한다.
4. 자동 저장이 꼭 필요한 경우에만 `iros_download_realty.py`를 별도로 검토한다.

```bash
python iros_cart_realty.py
```

부동산은 결제·열람·다운로드까지 무조건 자동으로 밀어붙이기보다, 장바구니 단계 자동화 후 브라우저의 일괄 기능을 쓰는 경로를 먼저 권한다.

## 마법사 사용

처음 쓰는 사용자는 upstream 마법사를 먼저 실행한다.

```bash
python iros_wizard.py
```

마법사는 법인/부동산 장바구니, 결제 후 열람·저장, 사업자번호 기반 법인정보 조회, 다운로드된 법인 PDF 종합 리포트 생성을 메뉴로 제공한다.

## 트러블슈팅

| 증상 | 원인 | 대응 |
| --- | --- | --- |
| 보안 프로그램 설치 페이지가 뜸 | TouchEn nxKey 미설치 | 설치 후 브라우저/PC 재시작, 스크립트 처음부터 재실행 |
| 법인 상호 검색 결과가 맞지 않음 | 사명변경, 특수문자, 동명 법인 | 법인등록번호 기반으로 재시도 |
| 10건 초과 법인 결제가 한 번에 되지 않음 | 페이지당 10건 제약 | 10건 단위로 반복 결제 |
| 부동산 저장 자동화가 느림 | 웹 UI 일괄 기능이 더 적합 | 장바구니만 자동화하고 결제·일괄열람출력·일괄저장은 수동 처리 |

## 보안/개인정보 원칙

- IROS 계정, 인증서 비밀번호, 카드 정보를 저장하지 않는다.
- 발급 대상 JSON, 다운로드 PDF, Excel 리포트는 저장소 밖에 둔다.
- 테스트와 PR에는 샘플/마스킹 값만 사용한다.
- 산출물 경로가 개인 이름·주소를 포함하면 공유 요약에서 경로도 마스킹한다.

## 출처

- 인터넷등기소(IROS): https://www.iros.go.kr
- 원 저작자 참고 구현: `challengekim/iros-registry-automation` — https://github.com/challengekim/iros-registry-automation
- upstream license: MIT
