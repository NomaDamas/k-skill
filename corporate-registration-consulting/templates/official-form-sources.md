# 주식회사 설립등기 공식 양식 출처 맵

> 이 파일은 공식 양식의 **출처·찾는 경로·대조 기준**을 정리한 매핑 문서입니다. 이 스킬은 에이전트가 실제 HWP에 값을 쓸 수 있도록 2026-05-02 기준 국가법령정보센터 HWP 별지 양식 스냅샷을 `templates/official/`에 함께 둡니다. 다만 인터넷등기소/법원 제공 HWP/HWPX/PDF 원본은 수시로 바뀔 수 있으므로 제출 전에는 공식 사이트에서 최신본을 다시 확인하고, 번들 파일이 최신 예규와 맞는지 대조하세요.

## 우선 확인 순서

1. **대법원 인터넷등기소** `https://www.iros.go.kr`
   - 경로: 인터넷등기소 접속 → 자료센터/서비스 소개 영역 → **등기신청양식** 및 **첨부서면예시**.
   - 용도: 실제 제출용 신청서 양식, 첨부서면 예시, 작성 방식 확인.
   - 메모: 인터넷등기소 화면은 WebSquare 기반 동적 화면이므로 직접 파일 URL보다 메뉴 경로를 사용자에게 안내한다.
2. **번들 HWP 스냅샷** `templates/official/`
   - `form-65-1-stock-company-incorporation-promoter.hwp`: [양식 제65-1호] 주식회사 설립 등기(발기설립).
   - `form-65-2-stock-company-incorporation-subscription.hwp`: [양식 제65-2호] 주식회사 설립 등기(모집설립).
   - `form-65-1-fill-map.json`: 발기설립 공식 HWP의 주요 입력 셀 매핑.
   - `source-manifest.json`: 다운로드일, flSeq, SHA-256, 원천 URL 메타데이터.
3. **국가법령정보센터 등기예규** `상업등기신청서의 양식에 관한 예규`
   - 대조할 양식: **양식 제65-1호(주식회사설립등기신청서·발기설립)**, **양식 제65-2호(주식회사설립등기신청서·모집설립)**.
   - 용도: 인터넷등기소 양식이 최신 예규의 별지 양식과 맞는지 확인.
4. **찾기쉬운 생활법령정보: 주식회사 설립등기**
   - 용도: 신청 방식, 신청정보, 첨부정보 목록의 쉬운 말 확인.
   - 확인 포인트: 생활법령 페이지는 인터넷등기소에 등기신청서·첨부서류 양식 및 작성방식이 있다고 안내하고, 첨부서면은 등기예규 제65-1호/제65-2호를 보라고 안내한다.
5. **온라인법인설립시스템** `https://www.startbiz.go.kr`
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
| 주식회사설립등기신청서(모집설립) | 인터넷등기소 등기신청양식, 등기예규 양식 제65-2호, 번들 `templates/official/form-65-2-stock-company-incorporation-subscription.hwp` | v1 범위 밖 | 파일은 함께 제공하지만 모집설립이면 자동 작성을 멈추고 전문가/관할 등기소 확인으로 보낸다 |
| 정관 | 상법, 상업등기규칙, 인터넷등기소 첨부서면예시, 공개 배포 정관 HWP | `templates/attachment-hwp/articles-of-incorporation.hwp`, `templates/attachment-hwp/standard-articles-startup-moj.hwp`, `templates/standard-articles-of-incorporation.md` | 실제 공개 배포 HWP를 우선 복사해 작성하고, 종류주식·스톡옵션·투자계약 등은 전문가 검토 |
| 발기인 의사록/결정서 | 인터넷등기소 첨부서면예시, 공개 배포 발기인회의사록 HWP | `templates/attachment-hwp/founder-meeting-minutes.hwp`, `templates/attachment-hwp/founder-meeting-period-shortening-consent.hwp` | 공개 배포 HWP를 복사해 회사 구조별 필수 결의사항을 공식 예시와 대조 |
| 주식인수증/주식청약서 | 인터넷등기소 첨부서면예시, 상업등기규칙 제129조, 공개 배포 HWP | `templates/attachment-hwp/share-subscription.hwp`, `templates/attachment-hwp/share-issuance-consent.hwp` | 발기설립은 주식 인수를 증명하는 정보, 모집설립은 청약 관련 정보가 달라질 수 있음 |
| 조사보고서 | 인터넷등기소 첨부서면예시, 상법 조사보고 조항, 공개 배포 HWP | `templates/attachment-hwp/inspection-report.hwp` | 공개 배포 HWP를 복사해 작성하되, 에이전트가 최종 적법 판단 문구를 단정하지 않음 |
| 취임승낙서 | 인터넷등기소 첨부서면예시, 상업등기규칙 제129조, 공개 배포 HWP | `templates/attachment-hwp/officer-acceptance-director-ceo.hwp`, `templates/attachment-hwp/officer-acceptance-auditor.hwp` | 성명·주소·생년월일 등 개인정보는 로컬 제출본에만 입력 |
| 인감신고서 | 인터넷등기소 등기신청양식/첨부서면예시, 공개 배포 HWP | `templates/attachment-hwp/corporate-seal-report.hwp` | 공개 배포 HWP를 참고하되 법인인감 날인·인감 관련 증빙은 공식 요구 확인 |
| 등록면허세 영수필확인서 | 위택스/관할 지자체 | `templates/incorporation-document-pack.md` 세금 확인 메모 | 최종 세액·납부번호는 위택스/지자체 결과 기준 |

## 에이전트 답변에 포함할 공식 양식 안내 문구

- “실제 제출 양식은 인터넷등기소의 **등기신청양식**과 **첨부서면예시**에서 최신 HWP/HWPX/PDF를 다시 내려받아 사용하세요.”
- “주식회사 발기설립 신청서는 국가법령정보센터의 `상업등기신청서의 양식에 관한 예규` **양식 제65-1호**, 모집설립은 **양식 제65-2호**와 대조하세요.”
- “이 레포의 공개 배포 HWP 묶음과 Markdown 템플릿은 작성 보조자료이며, 최신 공식 양식·관할 등기소 요구를 대체하지 않습니다.”

## 실제 HWP 자동작성 흐름

1. 레포 밖 비공개 작업 디렉터리를 만든다.
2. 사용자 입력 JSON을 만든다. 주민등록번호 원문은 마스킹하거나 제출 직전 로컬 파일에만 둔다.
3. `scripts/fill_official_hwp.py`로 번들 [양식 제65-1호] HWP에 주요 셀을 채운다.
4. `k-skill-rhwp info`와 사람이 직접 여는 검토로 파일 무결성, 줄바꿈, 누락 칸, 날인란, 첨부서류 통수를 확인한다.

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
- `k-skill-rhwp info <공식양식>`로 구조를 확인한 뒤 표/셀은 `set-cell-text`, 본문 자리표시자는 `replace-all`을 우선 사용한다. 번들 발기설립 HWP는 `form-65-1-fill-map.json`의 셀 매핑을 사용한다.
- 공식 양식은 표와 칸이 많으므로 자동 치환 후 반드시 사람이 한컴오피스/호환 뷰어로 열어 누락 셀, 줄바꿈, 날인란, 첨부서류 목록을 확인한다.
