# 스타트업 지원사업 API 문서

## API 엔드포인트

### k-skill-proxy 라우트

#### 목록 조회
```
GET /v1/startup-support/list
```

파라미터:
- `region`: 지역 (선택)
- `keyword`: 검색 키워드 (선택)
- `support_type`: 지원 유형 (선택)
- `deadline_only`: 마감 임박만 검색 (선택)

#### 상세 조회
```
GET /v1/startup-support/detail/:program_id
```

#### 지역별 조회
```
GET /v1/startup-support/region/:region
```

#### 마감 임박 조회
```
GET /v1/startup-support/deadline
```

## Python API

### 클래스 구조

```python
class StartupSupportAPI:
    def __init__(self)
    def search_programs(self, region, keyword, support_type, deadline_only)
    def get_program_detail(self, program_id)
    def _search_data_go_kr(self, region, keyword, support_type)
    def _search_by_region(self, region, keyword, support_type)
    def _parse_program_from_data_go_kr(self, item)
    def _parse_program_from_region_api(self, item, region)
    def _filter_upcoming_deadline(self, programs)
    def _remove_duplicates(self, programs)
    def _sort_programs(self, programs)
```

### 사용 예제

```python
# 기본 검색
programs = search_startup_support()

# 지역별 검색
seoul_programs = search_startup_support(region='서울특별시')

# 키워드 검색
keyword_programs = search_startup_support(keyword='청년')

# 마감 임박 검색
deadline_programs = search_startup_support(deadline_only=True)

# 상세 정보 조회
detail = get_startup_program_detail('test_001')
```
