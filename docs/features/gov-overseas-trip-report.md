# 공무국외출장 보고서 조회 가이드

`gov-overseas-trip-report`는 선관위 보드를 고해상도 축으로 두고, 권익위·정보공개포털·대구/대전/경기/경북 의회·인사혁신처/행안부 제도 안내까지 검증된 공개 표면 9개를 묶는 스킬이다. 로그인 벽 시스템(BTIS 등)은 제외한다. 목록/상세/첨부 URL을 수집하고 PDF/HWP/HWPX는 kordoc으로 사실·공개성·검토 신호만 구조화한다. 부정부패 탐지 도구가 아니다.

> 참고용 요약입니다. 문서에 없는 정보는 추정하지 않으며, 중요한 판단은 반드시 공식 원문을 직접 확인해야 합니다.

## 목적

공무국외출장 자료는 기관별 게시판·사전정보공개·정보공개포털에 흩어져 있다. 이 스킬은 live 검증된 9개 공개 표면만 허용하고, helper CLI로 목록/상세를 모은 뒤 원문 근거가 있는 범위만 요약한다.

## 사용 상황

- 선관위뿐 아니라 권익위/지방의회/정보공개포털에서 국외출장 자료를 찾을 때
- 기관·키워드·국가명으로 후보를 모을 때
- 상세 URL과 첨부 원문 URL을 남겨야 할 때
- PDF/HWP/HWPX를 kordoc으로 열어 사실·공개성·검토 신호만 분리할 때
- 표 밖 기관을 discover로 탐색해야 할 때

## 입력 예시

```text
기관/provider: nec | acrc | open_portal | daegu_council | daejeon_council | gyeonggi_council | gyeongbuk_council
키워드: 몰디브
```

```bash
python3 gov-overseas-trip-report/scripts/gov_overseas_trip_report.py list --provider nec --max-pages 5
python3 gov-overseas-trip-report/scripts/gov_overseas_trip_report.py list --provider acrc
python3 gov-overseas-trip-report/scripts/gov_overseas_trip_report.py list --provider daegu_council
python3 gov-overseas-trip-report/scripts/gov_overseas_trip_report.py search --keyword 몰디브
python3 gov-overseas-trip-report/scripts/gov_overseas_trip_report.py discover --keyword 공무국외출장
```

표에 없는 기관은 unsupported. open_portal 메타검색만 보조로 제안한다.

## 출력 예시

```json
{
  "source": "중앙선거관리위원회 공무국외출장보고서 게시판",
  "sourceUrl": "https://www.nec.go.kr/site/nec/ex/bbs/List.do?cbIdx=1107",
  "facts": {
    "title": "선거기관의 역할 및 대응사례 연구 등 국외출장보고서(오스트리아, 크로아티아)",
    "publishedAt": "2026-03-13",
    "detailUrl": "https://www.nec.go.kr/site/nec/ex/bbs/View.do?cbIdx=1107&bcIdx=303199",
    "institution": "중앙선거관리위원회",
    "country": "오스트리아, 크로아티아",
    "period": "2025. 11. 22.(토) ~ 11. 30.(일) [7박 9일]",
    "purpose": "유럽 각국 선거관리위원회의 역할, 권한, 위법행위 규제 및 대응사례를 비교 연구하고 정책 개선 참고자료로 활용하기 위한 출장",
    "attachments": [
      {
        "title": "선거기관의역할및대응사례_연구_등_국외출장보고서(오스트리아_크로아티아).pdf",
        "url": "https://www.nec.go.kr/common/board/Download.do?bcIdx=303199&cbIdx=1107&streFileNm=a148c7c6-e1e8-4e8b-85ab-f3d27ec74b1d.pdf",
        "type": "pdf"
      }
    ]
  },
  "arithmetic": {
    "tripDays": 9,
    "officialScheduleDays": null,
    "perPersonCost": null,
    "registrationDelayDays": 103,
    "registrationReferenceDays": 45,
    "registrationDelayStatus": "기준 초과(공개 게시일 기준)",
    "registrationDelayBasis": "출장 종료일 다음날부터 선관위 공개 게시일까지의 일수입니다. 실제 BTIS 등록일이 아니므로 참고값입니다."
  },
  "disclosure": {
    "disclosureLevel": "일부 미공개",
    "checkedFieldCount": 10,
    "transparencyGapCount": 5,
    "stated": [
      "목적",
      "기간",
      "출장국·방문기관",
      "출장자",
      "주요일정"
    ],
    "unstated": [
      {
        "field": "예산·집행액",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "예산, 실제 집행액, 출장비 총액을 확인하지 못했습니다."
      },
      {
        "field": "산출내역",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "항공권, 숙박비, 일비 등 비용 산출내역을 확인하지 못했습니다."
      },
      {
        "field": "출장자별 역할",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "출장자 명단은 있으나 개인별 역할 분장은 확인하지 못했습니다."
      },
      {
        "field": "결과 활용계획",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "정책 반영 또는 제도 개선 활용계획은 별도 항목으로 확인하지 못했습니다."
      },
      {
        "field": "사전심사·사후심의 자료",
        "checkedScope": "게시글 상세와 첨부 보고서",
        "basis": "사전심사자료와 사후심의 결과는 공개 문서에서 확인하지 못했습니다."
      }
    ]
  },
  "reviewSignals": {
    "reviewSignalCount": 0,
    "checkedPatternCount": 6,
    "matched": [],
    "cleared": [
      {
        "id": "high_cost_or_seat_upgrade",
        "label": "고비용 좌석 표현 미확인",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "비즈니스석, 1등석, 프리미엄 이코노미, 이코노미 컴포트 표현을 확인하지 못했습니다."
      },
      {
        "id": "tourism_or_private_itinerary",
        "label": "관광·사적 일정 표현 미확인",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "공무 관련성 설명 없이 관광지, 자유일정, 쇼핑, 문화탐방, 리조트 방문으로 표시된 일정을 확인하지 못했습니다."
      },
      {
        "id": "third_party_or_interest",
        "label": "외부부담·이해관계 표현 미확인",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "외부 기관·단체·개인 비용부담, 이해관계자 동행, 상호초청 표현을 확인하지 못했습니다."
      },
      {
        "id": "cancellation_penalty_or_fee",
        "label": "취소수수료·위약금 표현 미확인",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "취소수수료, 위약금, 예약 취소 비용 표현을 확인하지 못했습니다."
      },
      {
        "id": "plan_report_change_terms",
        "label": "계획 대비 변경 표현 미확인",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "계획 변경, 일정 변경, 방문기관 변경 표현을 확인하지 못했습니다."
      },
      {
        "id": "unexplained_large_group",
        "label": "설명 없는 대규모 인원 표현 미확인",
        "checkedScope": "kordoc 추출 Markdown 전체",
        "basis": "출장자 10명 이상 또는 개인별 역할 없이 대규모 인원이 표시된 정황을 확인하지 못했습니다."
      }
    ],
    "contextFlags": [],
    "notAssessable": [
      {
        "id": "expense_forgery_or_inflation_terms",
        "reason": "공개 결과보고서 자체에서 항공료 위·변조나 허위청구 여부를 확인하기 어렵습니다. 권익위 점검 결과 등 외부 감사자료 대조가 필요한 확장 항목입니다."
      },
      {
        "id": "repeated_destination_or_same_purpose",
        "reason": "단건 보고서 요약에서는 반복 출장을 판단하지 않습니다. 전체 게시판 제목·국가·목적 정규화 스캔이 별도 실행되어야 합니다."
      }
    ],
    "notAdjudication": "검토 신호는 원문 인용 기반 확인 항목입니다. 세금낭비, 위법, 부적정 집행 여부를 확정하지 않습니다."
  },
  "recommendedDisclosureRequests": [
    {
      "document": "출장계획서 및 사전심사자료",
      "reason": "사전심사자료가 공개 문서에서 확인되지 않습니다.",
      "targetOrg": "중앙선거관리위원회"
    }
  ],
  "safeStatements": [
    "공개 보고서만으로는 예산·집행액과 산출내역을 확인하기 어렵다.",
    "registrationDelayDays는 공개 게시일 기준 산술값이며 실제 BTIS 등록일과 다를 수 있다."
  ],
  "notes": [
    "이 결과는 공식 공개 문서를 기준으로 한 참고용 요약입니다.",
    "문서에 없는 정보는 추정하지 않았습니다.",
    "중요한 판단은 반드시 공식 원문을 직접 확인해야 합니다."
  ]
}
```

## 1차 스코프 (9 providers)

- `nec` GET `pageIndex` 목록/상세/PDF — **POST pageIndex 금지**
- `acrc` nPage 목록 + boardDownload 첨부
- `open_portal` mustKeyword JSON 메타
- `daegu_council` / `daejeon_council` / `gyeonggi_council` / `gyeongbuk_council` 의회 공개 보드
- `mpm` / `mois` 제도·처리기준 안내
- 첨부 원문: kordoc 추출 + 공개성 4층 요약
- HTTP timeout 시 Aside/`k-skill-browser-runtime` fallback (nec 등)

## 데이터 출처

- 중앙선거관리위원회 공무국외출장보고서 게시판
- 인사혁신처 공무국외출장 심사기준
- 국가법령정보센터 `공무원 여비 규정` 및 별표 3 국외 항공운임 지급 기준표
- 인사혁신처 여비 FAQ
- 행정안전부·국민권익위원회 공무국외출장 사전·사후관리 강화 공개자료
- 인증 필요 여부: 불필요
- 제공 형식: 서버 렌더 HTML 게시글 + 첨부 PDF/HWP/HWPX 등
- 접근 방식: read-only 직접 조회

2026-07-14 live: nec GET pageIndex 1..5 = 62 unique / attachments 62 PDF; acrc list 20; open_portal keyword hits; daegu·daejeon·ggc·gyeongbuk boards parseable; POST pageIndex on nec returns error page. kordoc on nec `bcIdx=303199` and Maldives samples remains valid.

## 사용 절차

1. provider 표에 기관을 매핑한다.
2. helper `list`/`search`로 목록을 조회한다.
3. nec 추가 페이지는 GET `pageIndex`만 사용하고 요청 간 약 2초 지연을 둔다.
4. 제목, 등록일, 상세 URL, 첨부 URL을 추출한다.
5. 사용자의 기간, 키워드, 국가명 조건으로 후보를 좁힌다.
6. 상세 페이지를 열어 본문과 첨부 정보를 재확인한다.
7. PDF/HWP/HWPX 첨부는 임시 디렉터리에만 다운로드하고 `hwp` 스킬의 `kordoc` 절차를 사용한다.
8. `kordoc` JSON에서 제목, 기간, 국가, 목적, 일정, 출장자, 요약을 문서 근거가 있는 범위에서만 구조화한다.
9. 비용·일정 관련 항목이 있으면 `facts`, `arithmetic`, `disclosure`, `reviewSignals`, `recommendedDisclosureRequests`, `safeStatements`를 생성한다. 원문에 있는 목적, 방문기관, 일정, 출장자 역할, 비용, 좌석등급, 숙박비, 일비, 결과 활용계획만 사용한다.
10. 추출 불가 항목은 `문서에서 확인 불가` 또는 `기재되어 있지 않음`으로 표시한다.
11. 원본 파일은 작업 후 삭제하고 레포에 저장하지 않는다.

## HTTP fallback

직접 HTTP에서 목록 HTML이 일부 수신된 뒤 30초 안에 끝나지 않거나, 첨부 다운로드가 일부 바이트만 받은 뒤 120초 안에 완료되지 않으면 `http timeout or partial response`로 본다. 이 경우를 차단으로 단정하지 말고 Aside Browser 또는 `k-skill-browser-runtime`으로 같은 공식 URL을 연다.

브라우저 fallback에서는 상세 링크를 `a[href*="View.do"][href*="cbIdx=1107"]`, 첨부 링크를 `a[href*="Download.do"][href*="cbIdx=1107"]`, 등록일을 `span.date`에서 우선 추출한다. 페이지 이동은 GET `pageIndex` 증가 또는 페이지네이션 클릭으로 수행하고, 새 `bcIdx`가 없거나 이미 본 `bcIdx`만 나오거나 다음 링크가 없거나 5페이지를 확인하면 종료한다.

로그인 폼, CAPTCHA, 점검 문구, 공식 경로 밖 리다이렉트가 확인될 때만 차단/점검 실패로 보고한다.

## kordoc fallback

기본 명령은 다음과 같다.

```bash
npx --yes --package kordoc --package pdfjs-dist kordoc /tmp/report.pdf --format json
```

깨끗한 npm 격리 환경에서 위 명령이 `PDF 파싱에 pdfjs-dist가 필요합니다`로 실패하면 임시 로컬 프로젝트에 두 패키지를 같이 설치해 실행한다.

```bash
mkdir -p /tmp/kordoc-run
cd /tmp/kordoc-run
npm init -y
npm install kordoc pdfjs-dist
npx kordoc /tmp/report.pdf --format json
```

두 경로가 모두 실패하면 새 PDF 파서를 만들지 않고 `kordoc unavailable` 또는 `parse failed`로 보고한다. 임시 다운로드 파일과 임시 설치 디렉터리는 작업 후 삭제한다.

## 투명성 점검

이 스킬은 종합 위험도, 낭비 여부 등급, 감사 결론을 만들지 않는다. 출력은 사용자가 원문을 검토하기 쉽게 `facts`, `arithmetic`, `disclosure`, `reviewSignals` 네 층으로 분리한다.

- `facts`: 제목, 게시일, 기관, 국가, 기간, 목적, 첨부 URL처럼 원문에서 직접 확인되는 사실
- `arithmetic`: 출장일수, 공식 일정일수, 1인당 비용, 공개 게시일 기준 등록 지연일수처럼 원문 날짜와 숫자로만 계산되는 값
- `disclosure`: 핵심 공개항목 9개 중 어떤 항목이 기재되어 있고 어떤 항목이 공개 문서에서 확인되지 않는지
- `reviewSignals`: 원문 인용이 있는 검토 신호만 `matched`로 표시하고, 원문 인용이 없으면 `matched`로 세지 않음
- `recommendedDisclosureRequests`: 공개 문서에서 확인되지 않는 핵심 자료를 정보공개청구 후보 문서로 변환

`disclosure.disclosureLevel`은 누락된 핵심 공개항목 개수만으로 산정한다. 0~1개 누락은 `충분 공개`, 2~5개 누락은 `일부 미공개`, 6개 이상 누락 또는 첨부 추출 실패는 `대부분 미공개`로 표시한다. 이 값은 낭비 여부가 아니라 공개 문서의 충실도 표시다.

핵심 공개항목은 `목적`, `기간`, `출장국·방문기관`, `출장자`, `주요일정`, `예산·집행액`, `산출내역`, `출장자별 역할`, `결과 활용계획`, `사전심사·사후심의 자료` 9개다. 미기재 항목은 `disclosure.unstated`에 `field`, `checkedScope`, `basis`로 기록하며 검토 신호 개수에 포함하지 않는다.

`reviewSignals.matched`는 원문 인용, 위치, 근거가 모두 있을 때만 허용한다. 기본 확인 대상은 고비용 좌석 표현, 관광·사적 일정 표현, 외부부담·이해관계 표현, 취소수수료·위약금 표현, 계획 대비 변경 표현, 설명 없는 대규모 인원 표현이다. 확인한 기본 패턴 6개는 각각 `matched`, `cleared`, `contextFlags`, `notAssessable` 중 하나의 상태를 가져야 한다. 휴양지, 해변, 리조트 같은 단어가 국가 개황이나 선거운동 맥락 설명에만 나오면 `matched`가 아니라 `contextFlags`로 분리한다.

공개 결과보고서 한 건만으로 구조적으로 판단할 수 없는 항목은 `notAssessable`에 둔다. 항공권 위·변조, 허위청구, 비용 부풀리기 여부는 외부 감사자료나 증빙 대조가 필요하므로 단건 공개 보고서의 검토 신호로 세지 않는다. 같은 목적·같은 지역 반복 출장 여부도 전체 게시판을 정규화해 스캔하는 별도 절차가 있을 때만 다룬다.

## 하지 않는 일

- 부정, 위법, 외유 여부 판정
- 부정부패 탐지 또는 세금낭비 판별
- 위험도 점수화, 랭킹, 관계망 분석
- 가족관계, 배우자, 동행자 추정
- 상호초청, 호혜성, 대가성 분석
- 세금낭비 여부 확정
- 외부 시장가 조회 기반 적정가 판정
- 원문 인용 없는 검토 신호 매칭
- 외부 감사자료 없이 항공료 조작·허위청구 판단
- 단건 보고서만으로 반복 출장 판단
- 계획서와 결과보고서 비교
- 평일 관광 일정 자동 판정
- 로그인 벽 시스템(BTIS 등) 우회 수집
- 미검증 사설 도메인 무차별 크롤
- OCR 기반 스캔 PDF 복원 자동 실행
- 원본 PDF/HWP/HWPX 레포 저장

## 원본 저장 금지

첨부 원본은 레포에 저장하거나 커밋하지 않는다. 다운로드가 필요하면 임시 디렉터리에만 저장하고 작업 후 삭제한다. fixture가 필요하면 원본 전체가 아니라 메타데이터와 짧은 근거 인용만 사용한다.

## 안전 표현

금지 표현:

- 부정행위 확정
- 비리
- 외유 확정
- 허위 보고서
- 세금도둑
- 세금낭비 확정
- 가족여행
- 카르텔
- 유착
- 대가성

권장 표현:

- 문서에서 확인 불가
- 공개되지 않음
- 기재되어 있지 않음
- 추가 확인 필요
- 비용 정보 미공개
- 일반 범위로 보임
- 고비용 요소 확인
- 규정 대조 필요
- 추가 자료 필요
- 원문 확인 필요
- 참고용 요약
- 일부 미공개
- 대부분 미공개
- 검토 신호
- 공개 보고서 기준
- 원문 인용 기준
- 정보공개청구 추천

## 알려진 한계

- 선관위 게시판의 현재 첨부는 실측 범위에서 PDF만 확인되었다.
- 텍스트 기반 PDF는 `kordoc`으로 추출하지만, 이미지 기반 스캔 PDF나 품질 경고가 큰 문서는 자동 추출 신뢰도가 낮을 수 있다.
- HWP/HWPX가 향후 올라오더라도 kordoc 실행 환경이 없거나 문서가 손상/암호화/스캔 기반이면 추출이 실패할 수 있다.
- 게시판 HTML 구조가 바뀌거나 빈 응답, 차단, 점검 페이지가 나오면 즉시 중단하고 실패 상태를 보고해야 한다.
- 상세 일정, 예산, 동행자 정보는 문서에 구조적으로 없을 수 있으므로 없다고 단정하지 않는다.
- 투명성 점검은 원문에 공개된 목적·일정·비용·좌석등급·직급 정보에 한정한다. 총액과 인원이 모두 원문에서 확인되면 단순 산술 1인당 비용은 표시할 수 있지만, 현재 항공권 시장가나 숙박 시세 자동 비교는 하지 않는다.
- `reviewSignalCount`는 원문 인용이 있는 검토 신호 수일 뿐 감사 결과, 위법 판단, 세금낭비 판정, 종합 점수가 아니다.
- `registrationDelayDays`는 선관위 공개 게시일 기준 참고값이다. 실제 BTIS 등록일과 다를 수 있다.

## 후속 확장 계획

- 추가 광역의회/중앙부처 공개 보드 inventory
- open.go.kr 원문 deep-link 안정화
- BTIS 공개 API가 생길 때만 정식 연동
- 이미지 기반 PDF/OCR fallback은 별도 이슈에서 비용과 안전성을 검토
- HWP/HWPX 첨부가 있는 실제 선관위 샘플이 생기면 같은 `kordoc` 경로로 추가 실측
- 예산 항목이 있는 보고서에 대한 비용 요약
- 공식 여비 기준과 보고서 산출내역을 더 정밀하게 대조하는 별도 helper
- 전체 게시판 정규화 스캔을 통한 반복 목적·반복 지역 후보 탐지
- 외부 감사자료와 증빙 자료 대조를 통한 별도 확장
- 관계망 분석, 대가성 판단, 법적 감사 판단은 별도 이슈에서 안전성 논의 후 추진


## 실제 공개 데이터 예시

- 권익위: 유엔반부패협약 일본 점검 방문, IOI 회의, OECD 반부패 포럼 등 출장 **현황/계획 HWPX**
- 대구시의회: 상임위별 결과보고서, 히로시마/몽골 등 제목, 상세 PDF와 기간·국가 본문
- 대전시의회: 일본/베트남/미주/몽골 계획·결과·심사위 회의록 + 파일 첨부
- 경기도의회: 국외훈련결과보고서 보드
- 경북도의회: 출장계획 사전공개 공지
- 정보공개포털: 다수 교육청·지자체 문서 메타

## 능동 확장 (표 밖 기관)

1. `discover --keyword` 로 open_portal + seed board probe
2. 기관 공식 사이트에서 출장/정보공개 메뉴 탐색
3. 공개 HTML만 채택, login/SSO는 제외
4. pagination/detail/attachment 패턴을 실측 후 provider recipe 추가
