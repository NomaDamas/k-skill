# startup-support

## 스킬 개요

`startup-support` 스킬은 정부, 지자체, 공기업이 제공하는 스타트업, 중소기업, 개인 창업가를 위한 지원사업 정보를 공식 API를 통해 조회하는 기능을 제공합니다.

## 사용 시나리오

- "스타트업 지원사업 알려줘"
- "중소기업 보조금 종류 정리해줘"
- "서울시 창업 지원금 프로그램"
- "청년 창업 지원금 요건"
- "MVP 지원사업 목록"
- "정부 지원사업 마감일"
- "스타트업 융자 프로그램"

## 기능 특징

### 1. 다양한 데이터 소스
- **공공데이터포털 (data.go.kr)**: 중소벤처기업부 스타트업 지원사업 API
- **지자체별 공식 사이트**: 서울시, 경기도, 부산시, 광주시, 대구시 등
- **공기업 및 기금 관리기관**: 중소기업진흥공단, 기술보증기금 등

### 2. 전수 검색
- 모든 소스를 병렬로 검색하여 누락되는 지원사업이 없도록 함
- 실시간 정보 제공 (공고 마감일, 지원금액, 자격 요건)

### 3. 정확한 정보 제공
- 공식 출처의 정보만 사용
- 마감 여부는 KST 기준 현재 날짜와 비교하여 판정
- 공식 사이트 링크 항상 제공

## 구현 방식

### 데이터 흐름

1. **API 요청**: 사용자의 요청을 받아 적절한 API 호출
2. **데이터 수집**: 공공데이터포털, 지자체 API 등에서 병렬 데이터 수집
3. **데이터 처리**: 중복 제거, 정렬, 필터링
4. **정보 제공**: 사용자에게 정제된 정보 제공

### API 엔드포인트

#### k-skill-proxy 라우트

공공데이터포털 K-Startup OpenAPI는 별도 `kstartup-search` 스킬과 `k-skill-proxy`의 `/v1/kstartup/*` 라우트가 담당합니다. `startup-support` helper는 지역별 공개 API 목록을 조회하고, 상세 정보는 결과의 공식 `url` 로 확인합니다.

#### Python 스크립트

```python
# 기본 검색
programs = search_startup_support()

# 지역별 검색
seoul_programs = search_startup_support(region='서울특별시')

# 키워드 검색
keyword_programs = search_startup_support(keyword='청년')

# 마감 임박 검색
deadline_programs = search_startup_support(deadline_only=True)

# 상세 정보는 목록 결과의 공식 url로 확인
```

## 데이터 소스

### 1. 공공데이터포털
- **기관**: 중소벤처기업부
- **API**: 스타트업 지원사업 정보
- **인증**: hosted/self-host proxy 운영 서버에서 API 키 주입

### 2. 지자체별 사이트
- **서울시**: https://seoulstartup.go.kr
- **경기도**: https://g-startup.kr
- **부산시**: https://busanstartup.kr
- **광주시**: https://startup.gwangju.kr
- **대구시**: https://daegu-startup.kr

### 3. 공기업 및 기금
- **중소기업진흥공단**: https://smbs.or.kr
- **기술보증기금**: https://koreatech.or.kr
- **KOTRA**: https://www.kotra.or.kr

## 출력 형식

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

### 상세 정보

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

## 테스트

### 테스트 실행

```bash
cd /startup-support/scripts
python3 test_startup_support.py
```

### 테스트 범위

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

## 배포

### 1. 환경 변수 설정

```bash
export DATA_GO_KR_API_KEY="your_api_key_here"
```

### 2. k-skill-proxy 빌드

```bash
cd packages/k-skill-proxy
npm run build
```

### 3. 테스트

```bash
npm test
```

### 4. 배포

```bash
npm run ci
```

## 기여

### 문제 해결

1. **API 연결 실패**: 지자체 API 엔드포인트 확인
2. **데이터 누락**: 공공데이터포털 API 키 확인
3. **성능 문제**: 캐시 시간 조정
4. **정확도 문제**: 출처별 데이터 검증

### 개선 방향

1. **추가 지원사업**: 다른 지자체 API 추가
2. **실시간 업데이트**: 자동 데이터 수집 시스템
3. **사용자 경험**: 검색 결과 개선
4. **모니터링**: 서비스 상태 모니터링

## 참고 자료

- [API 문서](references/api-documentation.md)
- [데이터 출처](references/data-sources.md)
- [지원사업 분류](references/program-categories.md)
