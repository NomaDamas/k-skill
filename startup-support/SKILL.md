---
name: startup-support
description: Search Korean government startup support programs, grants, and subsidies for startups, SMEs, and entrepreneurs through various public APIs. Use when users ask about 창업 지원, 스타트업 지원금, 중소기업 지원, 정부 지원사업.
license: MIT
metadata:
  category: business-support
  locale: ko-KR
  phase: v1
---

# 스타트업 지원사업 조회

## What this skill does

정부, 지자체, 공기업이 제공하는 **스타트업, 중소기업, 개인 창업가**를 위한 지원사업, 보조금, 융자 프로그램, 멘토링, 교육 프로그램 등을 공식 API를 통해 조회한다.

본 스킬은 창업 준비 중이거나, 사업 초기 단계에 있는 스타트업 창업가가 **어떤 지원사업이 있는지 빠르게 파악**하고, 지원 가능한 자격 요건을 확인하며, 공고 마감일을 추적할 수 있도록 돕는다.

## When to use

- "스타트업 지원사업 알려줘"
- "중소기업 보조금 종류 정리해줘"
- "서울시 창업 지원금 프로그램"
- "청년 창업 지원금 요건"
- "MVP 지원사업 목록"
- "정부 지원사업 마감일"
- "스타트업 융자 프로그램"

## When not to use

- 개별 지원금 신청 자동화 (본 스킬은 read-only 조회다)
- 세무/회계 절차 대체 (전문가 상담 필요)
- 법적 자격 심사 결정
- 실제 지급액 계산 (정확한 금액은 공식 사이트 확인)
- 창업아이디어 구체화 컨설팅

## Core principle

1. **공식 API 우선**: 정부 공공데이터포털(`data.go.kr`), 각 지자체 API, 공기업 API 등 공식 출처를 사용
2. **전수 검색**: 모든 소스를 병렬로 검색하여 누락되는 지원사업이 없도록 함
3. **실시간 정보**: 공고 마감일, 지원금액, 자격 요건 등 최신 정보만 제공
4. **정확한 한글**: 전문 용어를 정확히 표기 (예: "MVP 지원" vs "MVP지원")

## Implementation

### Data Sources

1. **공공데이터포털 (data.go.kr)**
   - 중소벤처기업부 스타트업 지원사업 API
   - 서울시 창업 지원 프로그램 API
   - 각 지자체 창업 지원사업 API

2. **지자체별 공식 사이트**
   - 서울시 창업플러스 (seoulstartup.go.kr)
   - 경기도 창업진흥원 (g-startup.kr)
   - 부산시 스타트업 허브 (busanstartup.kr)
   - 광주창업파크 (startup.gwangju.kr)
   - 대구창업진흥원 (daegu-startup.kr)

3. **공기업 및 기금 관리기관**
   - 중소기업진흥공단 (smbs.or.kr)
   - 기술보증기금 (koreatech.or.kr)
   - KOTRA 해외진출 지원
   - 중소벤처기업금융공단

### Proxy Integration

공공데이터포털 K-Startup OpenAPI는 `kstartup-search` 스킬과 `k-skill-proxy`의 `/v1/kstartup/*` 라우트가 담당한다. 이 스킬의 helper는 지역별 공개 API 목록을 조회하고, 상세 정보는 결과의 공식 `url` 로 확인한다.

## Output format

### 지원사업 목록

```json
{
  "programs": [
    {
      "id": "seoul_2024_startup_001",
      "title": "서울시 청년 스타트업 창업 지원금",
      "organization": "서울시",
      "region": "서울특별시",
      "support_type": "보조금",
      "amount": "최대 5천만원",
      "deadline": "2024-12-31",
      "target": "만 19~34세 청년 창업가",
      "contact": "02-1234-5678",
      "url": "https://seoulstartup.go.kr/program/001",
      "source": "서울시 창업플러스",
      "last_updated": "2024-05-20"
    }
  ]
}
```

### 특정 지원사업 상세 정보

```json
{
  "program": {
    "id": "seoul_2024_startup_001",
    "title": "서울시 청년 스타트업 창업 지원금",
    "organization": "서울시",
    "region": "서울특별시",
    "support_type": "보조금",
    "amount": "최대 5천만원",
    "deadline": "2024-12-31",
    "target": "만 19~34세 청년 창업가",
    "requirements": [
      "사업자등록증 (개인/법인)",
      "사업계획서",
      "재무제표",
      "창업자 신분증"
    ],
    "application_process": [
      "온라인 신청서 작성",
      "서류 제출",
      "서류 심사",
      "현장 면접 (일부)",
      "결공고"
    ],
    "contact": {
      "phone": "02-1234-5678",
      "email": "startup@seoul.go.kr",
      "address": "서울시 강남구 테헤란로 123"
    },
    "url": "https://seoulstartup.go.kr/program/001",
    "source": "서울시 창업플러스",
    "last_updated": "2024-05-20"
  }
}
```

## Testing

### 테스트 케이스

1. **기본 기능 테스트**
   - 서울시 지원사업 조회
   - 경기도 지원사업 조회
   - 전국 지원사업 조회

2. **검색 기능 테스트**
   - 키워드 검색 ("청년", "MVP", "해외")
   - 지역별 검색
   - 마감일 순 정렬

3. **에러 처리 테스트**
   - API 연결 실패 시 처리
   - 데이터 없을 때 처리
   - 잘못된 파라미터 처리

### 테스트 데이터

테스트 시 다음과 같은 가상 데이터를 사용:

```json
{
  "test_programs": [
    {
      "id": "test_001",
      "title": "테스트 스타트업 지원사업",
      "organization": "테스트 기관",
      "region": "테스트 지역",
      "support_type": "보조금",
      "amount": "최대 1천만원",
      "deadline": "2024-12-31",
      "target": "테스트 대상",
      "contact": "02-1234-5678",
      "url": "https://test.example.com",
      "source": "테스트 소스",
      "last_updated": "2024-05-20"
    }
  ]
}
```

## Files

- `SKILL.md` - 이 문서
- `scripts/` - Python 스크립트 구현
  - `startup_support.py` - 메인 로직
  - `test_startup_support.py` - 테스트 파일
- `references/` - 참고 자료
  - `api-documentation.md` - API 문서
  - `data-sources.md` - 데이터 출처
  - `program-categories.md` - 지원사업 분류
