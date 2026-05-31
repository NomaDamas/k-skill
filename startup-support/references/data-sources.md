# 스타트업 지원사업 데이터 출처

## 1. 공공데이터포털 (data.go.kr)

### API 정보
- **기관**: 중소벤처기업부
- **서비스명**: 스타트업 지원사업 정보
- **API URL**: https://www.data.go.kr/api/15058530/openapi
- **인증**: API 키 필수 (DATA_GO_KR_API_KEY 환경 변수)

### 데이터 구조
```json
{
  "items": [
    {
      "pan_id": "공고ID",
      "pan_nm": "공고명",
      "cnp_cd_nm": "지역명",
      "support_type": "지원 유형",
      "amount": "지원 금액",
      "clsg_dt": "마감일",
      "target": "대상",
      "contact": "연락처",
      "detail_url": "상세 URL"
    }
  ]
}
```

### 사용 예제
```python
response = requests.get(url, params=params, headers=headers)
data = response.json()
```

## 2. 지자체별 공식 사이트

### 서울시 창업플러스
- **URL**: https://seoulstartup.go.kr
- **API 엔드포인트**: https://seoulstartup.go.kr/api/program/list
- **특징**: 서울시 내 스타트업 지원사업 전체

### 경기도 창업진흥원
- **URL**: https://g-startup.kr
- **API 엔드포인트**: https://g-startup.kr/api/support/list
- **특징**: 경기도 내 스타트업 지원사업

### 부산시 스타트업 허브
- **URL**: https://busanstartup.kr
- **API 엔드포인트**: https://busanstartup.kr/api/program/list
- **특징**: 부산시 내 스타트업 지원사업

### 광주창업파크
- **URL**: https://startup.gwangju.kr
- **API 엔드포인트**: https://startup.gwangju.kr/api/support/list
- **특징**: 광주시 내 스타트업 지원사업

### 대구창업진흥원
- **URL**: https://daegu-startup.kr
- **API 엔드포인트**: https://daegu-startup.kr/api/program/list
- **특징**: 대구시 내 스타트업 지원사업

## 3. 공기업 및 기금 관리기관

### 중소기업진흥공단 (SMBS)
- **URL**: https://smbs.or.kr
- **제공 서비스**: 중소기업 지원금, 융자 프로그램
- **API**: 공공데이터포털 통합

### 기술보증기금
- **URL**: https://koreatech.or.kr
- **제공 서비스**: 기술 기반 스타트업 보증 지원
- **API**: 공공데이터포털 통합

### KOTRA
- **URL**: https://www.kotra.or.kr
- **제공 서비스**: 해외 진출 지원사업
- **API**: 별도 API 제공

### 중소벤처기업금융공단
- **URL**: https://www.sbc.or.kr
- **제공 서비스**: 스타트업 투자, 융자
- **API**: 공공데이터포털 통합

## 4. 데이터 통합 방식

### 1단계: API 호출
- 공공데이터포털 API 호출
- 지자체별 API 병렬 호출
- 공기업 API 호출 (필요 시)

### 2단계: 데이터 파싱
- 각 API 응답 구조에 맞게 데이터 추출
- 필수 필드 검증 (ID, 제목, 지역, 마감일 등)
- 데이터 정규화 (지역명, 지원 유형 표준화)

### 3단계: 중복 제거
- ID 기준 중복 제거
- 동일 지원사업 합치기
- 최신 정보 유지

### 4단계: 정렬
- 마감일 기준 정렬 (가까운 순)
- 지역별 그룹화
- 지원 유형별 분류

## 5. 데이터 업데이트 전략

### 주기적 업데이트
- 공공데이터포털: 매일 2회 (09:00, 15:00)
- 지자체별: 매일 1회 (09:00)
- 공기업: 주간 업데이트

### 즉시 업데이트
- 새 공고 등록 시
- 마감일 변경 시
- 지원 조건 변경 시

### 캐시 정책
- API 응답: 1시간 캐시
- 데이터 저장: 24시간 캐시
- 최종 결과: 5분 캐시
