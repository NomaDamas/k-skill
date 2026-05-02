# 주식회사 설립등기 공식 양식 출처 맵

> 이 파일은 스킬에 **이미 저장된 HWP 양식 경로**와 제출 전 대조 기준을 정리한 매핑 문서입니다. 에이전트는 새 양식을 찾는 것부터 시작하지 말고, 2026-05-02 기준 저장된 `templates/official/` 및 `templates/attachment-hwp/` 파일 사본을 레포 밖 작업 디렉터리에 복사해 채웁니다. 인터넷등기소/법원 제공 HWP/HWPX/PDF 원본은 수시로 바뀔 수 있으므로 제출 직전 최신본과 대조만 안내합니다.

## 저장 양식 우선 사용 순서

1. **번들 HWP 스냅샷** `templates/official/`
   - `form-65-1-stock-company-incorporation-promoter.hwp`: [양식 제65-1호] 주식회사 설립 등기(발기설립).
   - `form-65-2-stock-company-incorporation-subscription.hwp`: [양식 제65-2호] 주식회사 설립 등기(모집설립). 모집설립은 일반적이지 않으므로 이 스킬은 대응하지 않고 대조자료로만 둔다.
   - `form-65-1-fill-map.json`: 발기설립 공식 HWP의 주요 입력 셀 매핑.
   - `source-manifest.json`: 다운로드일, flSeq, SHA-256, 원천 URL 메타데이터.
2. **국가법령정보센터 등기예규** `상업등기신청서의 양식에 관한 예규`
   - 대조할 양식: **양식 제65-1호(주식회사설립등기신청서·발기설립)**, **양식 제65-2호(주식회사설립등기신청서·모집설립)**.
   - 용도: 인터넷등기소 양식이 최신 예규의 별지 양식과 맞는지 확인.
3. **찾기쉬운 생활법령정보: 주식회사 설립등기**
   - 용도: 신청 방식, 신청정보, 첨부정보 목록의 쉬운 말 확인.
   - 확인 포인트: 생활법령 페이지는 인터넷등기소에 등기신청서·첨부서류 양식 및 작성방식이 있다고 안내하고, 첨부서면은 등기예규 제65-1호/제65-2호를 보라고 안내한다.
4. **온라인법인설립시스템** `https://www.startbiz.go.kr`
   - 용도: 온라인 법인설립 진행 시 실제 입력 흐름, 기관 연계 제출 흐름 확인.


## 실제 공개 배포 첨부서류 HWP 양식 묶음

공식 설립등기신청서 외에 실제 발기설립에서 자주 필요한 첨부서면은 `templates/attachment-hwp/`에 **공개 웹에서 실제 배포되는 HWP 파일**로 함께 둔다. 이 파일들은 에이전트가 임의 생성한 양식이 아니며, 각 파일의 출처 URL·원 파일명·SHA-256은 `templates/attachment-hwp/source-manifest.json`에 기록한다. 공개 배포본에 포함되어 있던 실제/샘플 법인명·성명·주소·주민등록번호형 문자열·은행명·구체 날짜는 HWP 안에서 자리표시자로 치환했다. 다만 공식 양식이 아닌 민간/공개 배포 양식은 제출 전 인터넷등기소 첨부서면예시, 상법 제289조, 상업등기규칙 제129조, 관할 등기소 요구와 반드시 대조한다.

- `articles-of-incorporation.hwp`: 공개 배포 정관 양식.
- `standard-articles-startup-moj.hwp`: 법무부 주식회사 표준정관 공개 재배포 HWP. 상장회사 표준정관이 아니라 비상장/스타트업 발기설립 정관 참고용으로 사용한다.
- `share-issuance-consent.hwp`: 주식발행사항동의서.
- `share-subscription.hwp`: 주식인수증.
- `founder-meeting-minutes.hwp`: 발기인회의사록.
- `founder-meeting-period-shortening-consent.hwp`: 발기인총회 기간단축 동의서.
- `shareholder-register.hwp`: 주주명부.
- `inspection-report.hwp`: 조사보고서.
- `officer-acceptance-director-ceo.hwp`: 이사/대표이사 취임승낙서.
- `officer-acceptance-auditor.hwp`: 감사 취임승낙서.
- `board-minutes.hwp`: 이사회의사록.
- `corporate-seal-report.hwp`: 인감신고서.
- `power-of-attorney.hwp`: 위임장.

## 표준 발기설립 문서별 공식/초안 대응

| 문서 | 공식 확인 위치 | 레포 내 HWP/보조자료 | 사용 원칙 |
| --- | --- | --- | --- |
| 주식회사설립등기신청서(발기설립) | 인터넷등기소 등기신청양식, 등기예규 양식 제65-1호, 번들 `templates/official/form-65-1-stock-company-incorporation-promoter.hwp` | `templates/incorporation-document-pack.md`의 기본정보 섹션 및 `scripts/fill_official_hwp.py` | 번들 HWP에 주요 값을 자동 작성하되, 제출 전 최신 공식본 대조와 사람 검토 필수 |
| 주식회사설립등기신청서(모집설립) | 등기예규 양식 제65-2호, 번들 `templates/official/form-65-2-stock-company-incorporation-subscription.hwp` | 기본 플로우에서는 사용하지 않음 | 모집설립은 일반적이지 않으므로 사용자가 별도 요청하지 않는 한 발기설립 양식을 채운다 |
| 정관 | 상법, 상업등기규칙, 인터넷등기소 첨부서면예시, 공개 배포 정관 HWP | `templates/attachment-hwp/articles-of-incorporation.hwp`, `templates/attachment-hwp/standard-articles-startup-moj.hwp` | 실제 공개 배포 HWP를 우선 복사해 작성한다. 앞부분 제2조 목적에는 실제 사업 업태·종목을 채우고, 맨 마지막 날짜·발기인 서명/기명날인·간인을 확인한다. 종류주식·스톡옵션·투자계약 등은 표준정관 구조를 우선 확인해 별도 조항으로 보강 |
| 발기인 의사록/결정서 | 인터넷등기소 첨부서면예시, 공개 배포 발기인회의사록 HWP | `templates/attachment-hwp/founder-meeting-minutes.hwp`, `templates/attachment-hwp/founder-meeting-period-shortening-consent.hwp` | 공개 배포 HWP를 복사해 회사 구조별 필수 결의사항을 공식 예시와 대조 |
| 주식인수증/주식청약서 | 인터넷등기소 첨부서면예시, 상업등기규칙 제129조, 공개 배포 HWP | `templates/attachment-hwp/share-subscription.hwp`, `templates/attachment-hwp/share-issuance-consent.hwp` | 발기설립은 주식 인수를 증명하는 정보, 모집설립은 청약 관련 정보가 달라질 수 있음 |
| 조사보고서 | 인터넷등기소 첨부서면예시, 상법 조사보고 조항, 공개 배포 HWP | `templates/attachment-hwp/inspection-report.hwp` | 공개 배포 HWP를 복사해 작성하되, 에이전트가 최종 적법 판단 문구를 단정하지 않음 |
| 취임승낙서 | 인터넷등기소 첨부서면예시, 상업등기규칙 제129조, 공개 배포 HWP | `templates/attachment-hwp/officer-acceptance-director-ceo.hwp`, `templates/attachment-hwp/officer-acceptance-auditor.hwp` | 성명·주소·생년월일 등 개인정보는 로컬 제출본에만 입력 |
| 등기이사 개인 인감증명서 또는 본인서명사실확인서 | 상업등기규칙 제129조 및 관할 등기소 요구 | 저장 양식 없음. 주민센터/정부24 등에서 등기이사 본인이 발급 | 등기이사는 무조건 필요한 발급서류로 안내하고 원문 정보는 로컬 제출본에만 보관 |
| 등기이사 주민등록초본/등본 등 주소 확인 증빙 | 상업등기규칙 제129조 및 관할 등기소 요구 | 저장 양식 없음. 주민센터/정부24 등에서 등기이사 본인이 발급 | 등기이사는 무조건 필요한 발급서류로 안내하고 발급일·주민등록번호 표시 범위 확인 |
| 인감신고서 | 인터넷등기소 등기신청양식/첨부서면예시, 공개 배포 HWP | `templates/attachment-hwp/corporate-seal-report.hwp` | 공개 배포 HWP를 참고하되 법인인감 날인·인감 관련 증빙은 공식 요구 확인 |
| 등록면허세 영수필확인서 | 위택스/관할 지자체 | `templates/incorporation-document-pack.md` 세금 확인 메모 | 필수 발급/첨부. 최종 세액·납부번호는 위택스/지자체 결과 기준 |
| 등기신청수수료 영수필확인서 | 인터넷등기소/등기소 수수료 납부 | `templates/incorporation-document-pack.md` 체크리스트 | 필수 발급/첨부. 등록면허세 영수필확인서와 별도 문서로 관리 |

## 조건부 추가서류 대조

- 명의개서대리인을 둔 경우: 명의개서대리인 계약 또는 선임 증명 정보를 첨부서류 목록에 추가한다.
- 현물출자·재산인수·설립비용 등 변태설립사항이 있는 경우: 상업등기규칙 제129조상 검사인/공증인 조사보고, 감정인 감정, 관련 재판서류 등 해당 증명정보를 별도로 확인한다.
- 인허가 업종인 경우: 허가·인가·등록·신고 수리 증명 등 영업 가능 증빙을 추가한다.
- 자본금 10억 원 이상 또는 소규모회사 특례 밖인 경우: 정관 공증, 의사록 인증, 감사/이사회 구성 필요 여부를 확인한다.

## 에이전트 답변에 포함할 공식 양식 안내 문구

- “실제 제출 양식은 인터넷등기소의 **등기신청양식**과 **첨부서면예시**에서 최신 HWP/HWPX/PDF를 다시 내려받아 사용하세요.”
- “주식회사 발기설립 신청서는 국가법령정보센터의 `상업등기신청서의 양식에 관한 예규` **양식 제65-1호**, 모집설립은 **양식 제65-2호**와 대조하세요.”
- “이 레포의 공개 배포 HWP 묶음과 Markdown 템플릿은 작성 보조자료이며, 최신 공식 양식·관할 등기소 요구를 대체하지 않습니다.”

## 저장 양식 기반 작성 흐름

1. 레포 밖 비공개 작업 디렉터리를 만든다.
2. 위 표의 저장된 HWP 양식을 작업 디렉터리로 복사한다.
3. 사용자 입력 JSON을 만든다. 주민등록번호 원문은 마스킹하거나 제출 직전 로컬 파일에만 둔다.
4. `scripts/fill_official_hwp.py`로 번들 [양식 제65-1호] HWP에 주요 셀을 채운다.
5. 첨부서류는 저장된 `templates/attachment-hwp/*.hwp` 사본을 한 장씩 확인하며 채운다. 단순 replace-all은 shortcut이므로 모든 양식을 순차 확인하고, 정관·의사록·위임장 등 간인 대상 가능 문서와 법인인감 준비 여부를 별도 체크한다.

```bash
workdir="$(mktemp -d "${TMPDIR:-/tmp}/corp-reg.XXXXXX")"
chmod 700 "$workdir"
python3 corporate-registration-consulting/scripts/fill_official_hwp.py \
  --input-json "$workdir/form-data.json" \
  --output "$workdir/form-65-1-filled.hwp"
npx k-skill-rhwp info "$workdir/form-65-1-filled.hwp"
```

## HWP/HWPX 처리 주의

- 공식 파일을 새로 내려받거나 번들 HWP를 채운 산출물은 레포 밖 임시 디렉터리에 보관한다.
- `k-skill-rhwp info <공식양식>`로 구조를 확인한 뒤 표/셀은 `set-cell-text`, 본문 자리표시자는 `replace-all`을 우선 사용한다. 다만 replace-all에 의존하지 말고 각 양식의 앞부분·본문·하단 날짜·서명/날인란을 순차 검토한다. 번들 발기설립 HWP는 `form-65-1-fill-map.json`의 셀 매핑을 사용한다.
- 공식 양식은 표와 칸이 많으므로 자동 치환 후 반드시 사람이 한컴오피스/호환 뷰어로 열어 누락 셀, 줄바꿈, 날인란, 첨부서류 목록을 확인한다.
