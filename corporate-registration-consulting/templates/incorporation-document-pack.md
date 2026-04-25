# {{COMPANY_NAME}} 설립등기 첨부서류 묶음 초안

> 참고용 자동작성 템플릿입니다. 법률·세무 자문이 아니며 제출 전 원본성, 인감, 세금, 관할 등기소 요구사항을 확인하세요.

> 개인정보·민감정보 주의: 이 템플릿을 채울 때 주민등록번호 원문, 신분증 이미지, 인감증명서 스캔본은 꼭 필요한 로컬 제출본에만 넣고, 예시·로그·테스트·PR에는 마스킹하세요. 채워진 서류와 HWP 산출물은 레포에 커밋하지 마세요.

## 1. 등기신청 기본정보

- 법인명: {{COMPANY_NAME}}
- 본점 주소: {{HEAD_OFFICE_ADDRESS}}
- 자본금: {{CAPITAL_KRW}}원
- 1주의 금액: {{PAR_VALUE_KRW}}원
- 설립 시 발행주식 수: {{INCORPORATION_SHARES}}주
- 대표이사: {{CEO_NAME}}
- 등기 이사: {{DIRECTOR_NAMES}}

## 2. 첨부서류 체크리스트

| 순서 | 문서 | 쉬운 설명 | 준비 상태 |
| --- | --- | --- | --- |
| 1 | 설립등기신청서 | 등기소에 “이 회사를 등기해 달라”고 내는 표지 서류 | {{STATUS_APPLICATION}} |
| 2 | 정관 | 회사의 기본 규칙 | {{STATUS_ARTICLES}} |
| 3 | 발기인 의사록/결정서 | 회사를 세우기로 정했다는 기록 | {{STATUS_FOUNDERS_MINUTES}} |
| 4 | 주식인수증 | 누가 몇 주를 가져가는지 적은 문서 | {{STATUS_SHARE_SUBSCRIPTION}} |
| 5 | 주금납입 증빙/잔고증명 | 자본금이 실제로 입금됐다는 증빙 | {{STATUS_BANK_BALANCE}} |
| 6 | 조사보고서 | 설립 과정과 재산 상태를 확인했다는 보고 | {{STATUS_INSPECTION_REPORT}} |
| 7 | 취임승낙서 | 이사/감사가 직책을 맡겠다고 동의한 문서 | {{STATUS_ACCEPTANCE}} |
| 8 | 인감신고서 | 법인인감을 등기소에 신고하는 서류 | {{STATUS_SEAL_REPORT}} |
| 9 | 등록면허세 영수필확인서 | 등기 전 지방세를 냈다는 증명 | {{STATUS_TAX_RECEIPT}} |
| 10 | 주민등록/주소/인감 관련 증빙 | 임원·발기인 신원과 도장 확인 | {{STATUS_IDENTITY_DOCS}} |

공유용 체크리스트에는 위 증빙의 보유 여부만 표시하고, 주민등록번호·상세 주소·인감증명서 번호 같은 개인정보/민감정보 원문은 적지 않는다.

## 3. 취임승낙서 초안

본인은 {{COMPANY_NAME}}의 {{OFFICER_ROLE}}로 선임되었음을 승낙합니다.

- 성명: {{OFFICER_NAME}}
- 주소: {{OFFICER_ADDRESS}}
- 생년월일: {{OFFICER_BIRTHDATE}}
- 취임일: {{APPOINTMENT_DATE}}

{{APPOINTMENT_DATE}}

{{OFFICER_NAME}} (인)

## 4. 조사보고서 초안

조사보고자 {{INSPECTOR_NAME}}은 {{COMPANY_NAME}}의 설립에 관하여 다음 사항을 조사하였습니다.

1. 정관의 작성 및 발기인의 기명날인 여부
2. 발행주식 총수와 인수 여부
3. 주금납입 또는 잔고증명 확인 여부
4. 현물출자, 재산인수 등 변태설립사항 유무: {{SPECIAL_FORMATION_ITEMS}}
5. 등록면허세 및 지방교육세 납부 여부

위 조사 결과 설립 절차에 중대한 흠이 없음을 보고합니다.

{{REPORT_DATE}}

조사보고자 {{INSPECTOR_NAME}} (인)

## 5. 등록면허세 확인 메모

- 본점 주소: {{HEAD_OFFICE_ADDRESS}}
- 과밀억제권역/대도시 중과 검토 결과: {{OVERCONCENTRATION_REVIEW}}
- 소프트웨어/정보통신 업종 감면 또는 중과 제외 검토: {{SOFTWARE_TAX_REVIEW}}
- 위택스/지자체 최종 납부번호: {{WETAX_PAYMENT_ID}}
