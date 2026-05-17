# 창업진흥원 K-Startup 조회 가이드

공공데이터포털 데이터셋 `15125364` (창업진흥원_K-Startup(사업소개,사업공고,콘텐츠 등)_조회서비스) 기반 4개 endpoint를 `k-skill-proxy` 경유로 조회한다. **조회 전용** 이며 사업 신청·결제·계좌 연결은 자동화하지 않는다.

스킬 이름: `kstartup-search`
호출 helper: `kstartup-search/scripts/run_kstartup.py`

## 어떤 데이터를 조회하나

| 서브커맨드 | upstream operation | 설명 |
| --- | --- | --- |
| `business-info` | `getBusinessInformation01` | 통합공고 지원사업 정보 (예산, 규모, 수행기관, 사업절차, 문의처) |
| `announcements` | `getAnnouncementInformation01` | 지원사업 공고 정보 (공고명, 접수기간, 지역, 신청대상, 모집진행여부 등) |
| `contents` | `getContentInformation01` | 창업관련 콘텐츠 (공지·뉴스·우수사례) |
| `statistics` | `getStatisticalInformation01` | 창업관련 통계보고서 |

`announcements` 가 가장 활용도 높다. 지역·대상·기간·모집 진행 여부로 필터링해 답변할 공고 후보를 좁히고, 자세한 신청 절차는 응답의 `detl_pg_url` 로 사용자가 K-Startup 사이트에서 직접 확인한다.

> **주의**: `supt_regin`은 라이브 호출에서 upstream이 서버 측에서 적용하지 않는 사례가 관측됐다 (서울만 요청해도 타 지역 공고가 섞여 돌아온다). 지역 필터가 중요한 답변이라면 helper가 받은 응답 JSON을 client에서 `supt_regin` 으로 한 번 더 거른다.

## 사용자 시크릿

- 일반 조회는 hosted proxy(`https://k-skill-proxy.nomadamas.org`)가 K-Startup 인증키를 서버 측에서 주입한다. 사용자에게 키를 요구하지 않는다.
- `--direct` 사용 시에만 `KSKILL_KSTARTUP_API_KEY` (또는 `DATA_GO_KR_API_KEY` fallback) 가 필요하다.
- 자세한 credential resolution order 는 [공통 설정 가이드](../setup.md) 와 [보안/시크릿 정책](../security-and-secrets.md) 참고.

## 예시

```bash
# 서울 모집 중 공고 5건 (hosted proxy 사용, 사용자 키 불필요)
python3 kstartup-search/scripts/run_kstartup.py announcements \
  --supt-regin 서울특별시 --rcrt-prgs-yn Y --per-page 5 --text

# 2024년 사업화 분야 통합공고
python3 kstartup-search/scripts/run_kstartup.py business-info \
  --biz-yr 2024 --biz-category-cd cmrczn_Tab3

# 정책/공지 콘텐츠 dry-run (인증 호출 없이 URL 검증만)
python3 kstartup-search/scripts/run_kstartup.py contents \
  --clss-cd notice_matr --per-page 10 --dry-run

# 본인 키로 직접 호출
python3 kstartup-search/scripts/run_kstartup.py announcements \
  --supt-regin 부산광역시 --direct
```

## 실패 모드 요약

- `400 bad_request`: 잘못된 날짜/Y·N/페이지 범위, 시작일 > 종료일 등 입력 검증 실패.
- `503 upstream_not_configured`: 프록시 서버에 `DATA_GO_KR_API_KEY` 가 없거나 `15125364` 활용신청이 미승인 상태.
- `502 upstream_error`: data.go.kr이 `resultCode != "00"` 또는 `errMsg` 를 반환 (API 키 미등록·만료·IP 미등록·요청 초과 등).
- 빈 `data` 배열: 필터에 맞는 공고나 콘텐츠가 없는 경우 → 키워드·지역·대상 범위를 완화한다.
- 데이터 갱신 주기: 공식 서비스설계서는 **일 1회**, 공공데이터포털 dataset 메타데이터에는 "실시간" 으로 표기돼 있다. 두 표면이 일치하지 않으니 분 단위 마감 시계열에는 쓰지 말고, 최종 마감·접수 상태는 응답의 `detl_pg_url` 에서 직접 확인한다.

## 한도와 출처

- 일 호출 한도: 개발계정 10,000, 운영계정 활용사례 등록 시 증가 가능.
- 라이선스: 이용허락범위 제한 없음 (data.go.kr 명시).
- 공식 표면: `https://www.data.go.kr/data/15125364/openapi.do`
- 서비스 URL: `https://apis.data.go.kr/B552735/kisedKstartupService01`
