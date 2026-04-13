# 긱뉴스 조회 가이드

## 이 기능으로 할 수 있는 일

- GeekNews 공개 RSS/Atom 피드에서 최신 글 목록 조회
- 제목/요약/작성자 기준 키워드 검색
- 특정 항목의 RSS 기반 요약/링크/작성자/게시 시각 확인

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 완료
- `python3` 사용 가능 환경
- 인터넷 연결

## v1 범위

이 기능은 **RSS-first / 읽기 전용** 범위로 제공된다.

- 공개 피드(`https://feeds.feedburner.com/geeknews-feed`)만 사용한다.
- 최신 글/검색/상세 조회까지만 다룬다.
- 댓글, 투표, 로그인, 개인화 상태는 다루지 않는다.

## 기본 흐름

1. 최신 글을 훑을 때는 목록 조회부터 실행한다.
2. 원하는 주제가 있으면 제목/요약/작성자 기준 검색으로 좁힌다.
3. 특정 글을 확인할 때는 링크/id/토픽 번호 일부로 상세 조회한다.

## 예시

최신 글 목록:

```bash
python3 scripts/geeknews_search.py list --limit 5
```

검색:

```bash
python3 scripts/geeknews_search.py search --query Claude --limit 5
```

상세:

```bash
python3 scripts/geeknews_search.py detail --id 28439
```

오프라인 fixture 또는 저장된 feed로 검증할 때:

```bash
python3 scripts/geeknews_search.py list \
  --feed-file scripts/fixtures/geeknews-feed.xml \
  --limit 3
```

## 출력에서 확인할 점

- `source.feed_url` 이 GeekNews RSS feed를 가리키는지
- `items[].title`, `items[].link`, `items[].author_name`, `items[].summary` 가 함께 내려오는지
- 상세 조회에서 `item.content_html` 과 `item.summary` 가 모두 포함되는지
- 검색 결과가 제목/요약/작성자 기준으로 보수적으로 매칭되는지

## 주의할 점

- RSS 피드 기반이라 원문 전체/댓글/메타데이터는 제한적일 수 있다.
- FeedBurner 응답이 느리거나 실패하면 재시도하거나 직접 링크를 여는 fallback이 필요하다.
- 상세 조회는 feed에 포함된 `content` 범위까지만 보장한다.
