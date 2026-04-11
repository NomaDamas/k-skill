# 네이버 블로그 리서치 가이드

## 이 기능으로 할 수 있는 일

- 네이버 블로그 키워드 검색 (관련도순/최신순 정렬)
- 블로그 포스트 원문 텍스트 추출
- 블로그 포스트 내 이미지 URL 추출 및 로컬 다운로드
- 구글 검색과 병행한 한국어 콘텐츠 교차 검증 리서치

## 먼저 필요한 것

- `python3` 3.8+
- 인터넷 연결
- API 키 불필요

## 입력값

- 검색: 검색어 문자열 (예: `"서울 맛집 추천"`)
- 원문 읽기: 네이버 블로그 포스트 URL (PC 또는 모바일)
- 이미지 다운로드: 이미지 URL 목록 또는 `naver_read.py` 파이프 출력

## 공식 표면

- 검색: `https://search.naver.com/search.naver?where=blog&query={query}`
- 블로그 원문 (모바일): `https://m.blog.naver.com/{userId}/{postId}`
- 이미지 CDN: `blogfiles.naver.net`, `postfiles.pstatic.net`

## 기본 흐름

1. `naver_search.py`로 네이버 블로그 검색 실행
2. 검색 결과에서 상위 3~5개 포스트 선택
3. `naver_read.py`로 선택한 포스트의 원문 읽기
4. 필요 시 `naver_download_images.py`로 이미지 로컬 저장
5. 구글 검색(WebSearch) 결과와 교차 검증하여 정보 신뢰도 확보

## 예시

블로그 검색:

```bash
python3 scripts/naver_search.py "제주도 여행 코스" --count 5 --sort sim
```

블로그 원문 읽기:

```bash
python3 scripts/naver_read.py "https://blog.naver.com/user123/224212849946"
```

이미지 다운로드:

```bash
python3 scripts/naver_read.py "https://blog.naver.com/user123/224212849946" \
  | python3 scripts/naver_download_images.py --output ./images/ --max 5
```

## 주의 사항

- 네이버 검색엔진에 직접 요청하므로 대량 자동화 시 IP 차단 가능성이 있다. 한 세션에 과도한 요청을 자제한다.
- 이 스킬은 소량·비상업적 콘텐츠 리서치 용도로 설계되었다.
- 네이버 HTML 구조 변경 시 파싱이 실패할 수 있다. 에러 발생 시 스크립트 업데이트가 필요하다.
- PC 버전(`blog.naver.com`)은 iframe 구조여서 모바일 버전(`m.blog.naver.com`)을 사용한다.
- 블로그 출처(URL, 작성자)를 사용자에게 반드시 함께 안내한다.
