---
name: iros-registry-automation
description: 인터넷등기소(IROS)에서 법인/부동산 등기부등본(등기사항증명서) 발급을 준비하고, 사용자가 직접 로그인·결제한 브라우저 흐름 안에서 장바구니·열람·저장을 안전하게 보조한다.
license: MIT
metadata:
  category: legal-documents
  locale: ko-KR
  phase: v1
---

# 인터넷등기소 등기부등본 자동화

## What this skill does

대법원 인터넷등기소(IROS, `https://www.iros.go.kr`)에서 **법인/부동산 등기부등본(등기사항증명서)** 을 여러 건 발급해야 할 때, 원 저작자 `challengekim`의 참고 구현 [`challengekim/iros-registry-automation`](https://github.com/challengekim/iros-registry-automation) (MIT)을 기준으로 안전한 작업 순서와 로컬 실행 방식을 안내한다.

- 법인등기부등본: 법인등록번호 또는 상호명으로 장바구니에 담고, 사용자가 직접 결제한 뒤 열람·저장한다.
- 부동산등기부등본: 주소/동호수 목록으로 장바구니에 담되, 결제·열람·다운로드는 인터넷등기소 웹 UI에서 수동으로 처리하는 것을 기본 권장한다.
- TouchEn nxKey, 공동인증서/간편인증, 카드 결제처럼 사용자 PC·인증수단이 필요한 준비사항을 체크한다.
- 발급 파일과 입력 목록에 들어가는 개인정보/민감정보를 저장소 밖에서 다루도록 안내한다.

## Hard limits

- **로그인은 사용자가 브라우저에서 직접 한다.** ID/PW, 공동인증서 비밀번호, 간편인증, OTP, 보안카드, 카드번호를 에이전트가 입력·저장하지 않는다.
- **결제는 사용자가 직접 한다.** 카드 승인, 결제 확인, 결제 실패 대응은 사람이 브라우저에서 처리한다.
- 법률 자문, 권리관계 해석, 제출/발급 결과의 법적 유효성 보장은 하지 않는다. 이 스킬은 참고용 자동화 가이드다.
- IROS 보안 프로그램(TouchEn nxKey 등)이 요구되면 먼저 설치하고 브라우저/PC를 재시작한 뒤 다시 시작한다.
- 법인 결제는 upstream 문서 기준 **페이지당 10건** 단위 제약을 전제로 안내한다. 그 이상은 사용자가 10건 단위로 반복 결제한다.
- 부동산은 인터넷등기소가 로그인 상태에서 10만원 미만 일괄 결제와 일괄열람출력/일괄저장 UI를 제공하므로, v1에서는 장바구니 반복 작업만 자동화 가치가 큰 영역으로 본다.

## Prerequisites

- Chrome/Chromium 실행 가능한 환경
- Python 3.10+
- Playwright / Chromium 설치 가능 환경
- IROS 로그인 수단(아이디, 공동인증서, 간편인증 등)
- 결제 카드
- TouchEn nxKey 사전 설치
- upstream 참고 구현 clone 또는 사용자가 관리하는 로컬 사본. 실행 전 반드시 이 스킬 저장소의 `iros-registry-automation/scripts/upstream.pin`에 적힌 reviewed SHA로 고정한다.

```bash
git clone https://github.com/challengekim/iros-registry-automation.git
cd iros-registry-automation
git checkout 7c6924b2ff88d693a12556659188cb91041e5097
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp config.json.example config.json
```

업스트림 핀 업데이트는 로그인·인증·결제 인접 브라우저 자동화의 신뢰 경계를 바꾸는 작업이다. `scripts/upstream.pin` 값을 바꾸기 전에는 새 upstream diff를 검토하고, 설치 예시의 `git checkout` SHA와 함께 같은 PR에서 갱신한다.

## Workflow

### 1. 입력 파일을 저장소 밖 안전한 폴더에 준비한다

발급 대상에는 법인등록번호, 상호명, 주소, 동호수 등 민감할 수 있는 정보가 들어간다. 공개 저장소, PR, 테스트 로그에 넣지 않는다.

```bash
workdir="$(mktemp -d "${TMPDIR:-/tmp}/iros-registry.XXXXXX")"
chmod 700 "$workdir"
mkdir -p "$workdir/downloads" "$workdir/logs" "$workdir/output"
```

법인등록번호 기반 입력은 upstream repo `data/`가 아니라 `$workdir/corp-input.json` 같은 저장소 밖 파일에 둔다. 실제 법인등록번호/주소 원문을 upstream `data/` 디렉터리, git 저장소, PR 첨부, 테스트 로그에 넣지 않는다.

```bash
cat > "$workdir/corp-input.json" <<'JSON'
{
  "1101111234567": "예시 주식회사",
  "1101117654321": "샘플 주식회사"
}
JSON
```

부동산 주소 기반 입력 예시는 동/호수까지 필요한 경우가 있으므로 `data/iros_realties.json` 형식을 upstream README에서 확인하되, 실제 주소 원문은 `$workdir/realty-input.json` 같은 로컬 파일에만 둔다.

`config.json`도 저장소에 커밋하지 않는 로컬 파일로 두고, 민감 입력·로그·산출물 경로를 모두 `$workdir` 아래로 돌린다.

```bash
python3 - "$workdir" <<'PY'
import json
import pathlib
import sys

workdir = pathlib.Path(sys.argv[1])
config = json.loads(pathlib.Path("config.json").read_text())
config.update({
    "corpnum_list": str(workdir / "corp-input.json"),
    "companies_list": str(workdir / "companies-input.json"),
    "realty_list": str(workdir / "realty-input.json"),
    "save_dir": str(workdir / "downloads"),
    "realty_save_dir": str(workdir / "downloads" / "realty"),
    "pdf_dir": str(workdir / "downloads"),
    "report_output": str(workdir / "output" / "corp-report.xlsx"),
    "extract_output": str(workdir / "output" / "corp-extract.json"),
    "bizno_cache": str(workdir / "logs" / "bizno-cache.json"),
    "bizno_results": str(workdir / "logs" / "bizno-results.json"),
    "realty_cart_log": str(workdir / "logs" / "cart-realty-log.json"),
    "realty_download_log": str(workdir / "logs" / "download-realty-log.json"),
    "cart_log": str(workdir / "logs" / "cart-log.json"),
    "cart_corpnum_log": str(workdir / "logs" / "cart-corpnum-log.json"),
    "download_log": str(workdir / "logs" / "download-log.json"),
    "download_temp": str(workdir / "tmp-downloads"),
})
pathlib.Path("config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
PY
```

### 2. TouchEn nxKey와 로그인 수단을 먼저 확인한다

1. 인터넷등기소 로그인 페이지를 브라우저로 직접 연다.
2. TouchEn nxKey 설치 안내가 나오면 설치 후 브라우저 또는 PC를 재시작한다.
3. 공동인증서/간편인증/아이디 로그인 중 사용자가 선택한 방식으로 직접 로그인한다.
4. 카드 결제가 가능한지 확인한다.

### 3. 법인등기부등본 장바구니 담기

법인등록번호를 알고 있으면 정확도가 높은 upstream `iros_cart_by_corpnum.py` 흐름을 우선한다. 상호명만 있으면 `iros_cart.py`를 사용하되 사명변경·특수문자 때문에 실패할 수 있어 실패분은 법인등록번호로 재시도한다.

```bash
python iros_cart_by_corpnum.py
# 또는
python iros_cart.py
```

완료되면 브라우저의 결제대상목록으로 이동한다. 사용자는 브라우저에서 페이지당 10건 단위로 직접 카드 결제를 완료하고, 터미널에는 결제가 끝난 뒤 Enter를 입력한다.

### 4. 법인 결제 후 열람·저장

결제가 끝난 법인 등기부등본은 upstream `iros_download.py` 또는 마법사 메뉴의 법인 열람·저장 흐름으로 저장한다.

```bash
python iros_download.py
```

저장 경로는 `config.json`의 `save_dir`로 관리하되, 위 예시처럼 `$workdir/downloads`를 사용하고 공개 저장소 하위 경로를 사용하지 않는다.

### 5. 부동산등기부등본 장바구니 담기

부동산은 주소 목록 반복 입력과 장바구니 담기까지만 자동화를 우선 권장한다.

```bash
python iros_cart_realty.py
```

결제, 열람, 다운로드는 인터넷등기소 웹 UI에서 사용자가 직접 일괄 결제·일괄열람출력·일괄저장을 수행하는 것이 보통 더 빠르고 안전하다. 필요할 때만 `iros_download_realty.py`를 검토한다.

### 6. 마법사 경로

처음 쓰는 사용자는 upstream `iros_wizard.py` 메뉴가 가장 안전하다.

```bash
python iros_wizard.py
```

메뉴 요약:

- 법인등기부등본 — 장바구니 담기
- 법인등기부등본 — 결제 후 열람·저장
- 부동산등기부등본 — 장바구니 담기
- 부동산등기부등본 — 결제 후 열람·저장
- 사업자번호 → 법인정보 조회
- 다운로드된 법인 PDF → 종합 리포트 엑셀 생성

## Response policy

- 먼저 “로그인과 결제는 사용자가 직접”이라고 말한다.
- 법인과 부동산을 구분해 권장 자동화 범위를 설명한다.
- TouchEn nxKey 사전 설치와 브라우저 재시작 가능성을 안내한다.
- 발급 대상 목록, PDF, Excel, 보고서에는 개인정보/민감정보가 있을 수 있으므로 저장소 밖 비공개 폴더를 사용하게 한다.
- 법률 자문이나 권리관계 해석으로 보일 수 있는 표현을 피하고, 등기부등본 발급 보조와 파일 정리까지만 돕는다.
- 원 저작자/참고 구현 링크를 문서나 답변에 남긴다: `challengekim/iros-registry-automation` — https://github.com/challengekim/iros-registry-automation

## Verification

로그인 없이 가능한 검증:

- upstream 저장소 clone
- `pip install -r requirements.txt`
- `playwright install chromium`
- `python iros_wizard.py` 실행 후 메뉴/입력 파일 안내가 정상 표시되는지 확인

로그인 세션이 필요한 최종 smoke:

1. 사용자가 직접 IROS에 로그인한다.
2. 테스트용 1건을 장바구니에 담는다.
3. 사용자가 직접 결제한다.
4. 열람·저장 경로가 PDF를 저장하는지 확인한다.
5. 산출물 경로와 개인정보를 PR/로그에 남기지 않는다.

## Done when

- 법인/부동산 대상 유형과 입력 형식이 구분됐다.
- 로그인, 인증, 결제를 사람이 직접 처리한다는 안내가 명확하다.
- TouchEn nxKey와 페이지당 10건 결제 제약이 안내됐다.
- 원 저작자 `challengekim`과 참고 구현 링크가 포함됐다.
