# 네이버 검색광고 성과 조회 가이드

## 이 기능으로 할 수 있는 일

- 네이버 검색광고 캠페인/광고그룹/키워드 목록 조회
- 기간별 성과(노출수·클릭수·광고비·CTR·CPC·평균노출순위·전환수) 조회, 일별 breakdown 지원
- 연관키워드·월간 PC/모바일 조회수·경쟁정도 조회 (키워드 도구)
- 키 셋업 여부와 네이버 API 도달성 진단(`doctor`)

**읽기 전용**이다. 입찰가 변경, 캠페인/키워드 생성·수정·삭제 같은 쓰기 작업은 구현돼 있지 않다.

## 먼저 필요한 것

- 인터넷 연결(로컬 실행 환경 — 클라우드 샌드박스는 egress가 막혀 있을 수 있다)
- `python3` (표준 라이브러리만 사용, 추가 패키지 설치 불필요)
- 네이버 검색광고 계정(searchad.naver.com) → **도구 > API 사용 관리**에서 API 키/시크릿/CUSTOMER_ID 발급
- 환경변수 3개: `NAVER_AD_API_KEY`, `NAVER_AD_SECRET_KEY`, `NAVER_AD_CUSTOMER_ID`

## 공식 표면

- Base URL: `https://api.searchad.naver.com`
- 성과 조회: `GET /stats`
- 구조 조회: `GET /ncc/campaigns`, `GET /ncc/adgroups`, `GET /ncc/keywords`
- 키워드 도구: `GET /keywordstool`
- 인증: 요청마다 `X-Timestamp`/`X-API-KEY`/`X-Customer`/`X-Signature` 헤더, `X-Signature`는 `HMAC-SHA256(secret, "{timestamp}.{method}.{uri_path}")`를 base64 인코딩

## CLI 예시

### 진단

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py doctor
```

### 캠페인/광고그룹/키워드 목록

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py campaigns
python3 naver-ad-performance/scripts/naver_ad_performance.py adgroups --campaign <nccCampaignId>
python3 naver-ad-performance/scripts/naver_ad_performance.py keywords --adgroup <nccAdgroupId>
```

### 성과 조회

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py stats \
  --ids <id1,id2> --since 2026-06-01 --until 2026-06-30

python3 naver-ad-performance/scripts/naver_ad_performance.py stats \
  --ids <id> --since 2026-06-01 --until 2026-06-30 --by day
```

### 키워드 도구

```bash
python3 naver-ad-performance/scripts/naver_ad_performance.py keywordtool --keywords "제주여행,게스트하우스"
```

## 응답 예시 포맷

```json
[
  {
    "impCnt": 12034,
    "clkCnt": 452,
    "salesAmt": 305000,
    "ctr": 3.76,
    "cpc": 674.78,
    "avgRnk": 2.1,
    "ccnt": 8,
    "labels": {
      "impCnt": "노출수",
      "clkCnt": "클릭수",
      "salesAmt": "광고비",
      "ctr": "CTR",
      "cpc": "CPC",
      "avgRnk": "평균노출순위",
      "ccnt": "전환수"
    }
  }
]
```

## 실패 모드

| 증상 | 원인 |
|---|---|
| `missing required env var(s): ...` | 환경변수 미설정. 정확한 이름이 출력됨 |
| HTTP 401 | 서명 실패 — 키 값 또는 시스템 시계 확인 |
| HTTP 403 | 이 `customer_id`에 조회 권한 없음 |
| HTTP 404 | campaign/adgroup id가 잘못됨 |
| HTTP 429 | 호출 한도 초과 — 잠시 후 재시도 |
| `egress unreachable` | 클라우드 샌드박스 등에서 네이버로 나가는 네트워크가 막힘 — 로컬 실행 필요 |

## 참고

- 참고 구현: [`NariP/naver-searchad`](https://github.com/NariP/naver-searchad) (MIT)
