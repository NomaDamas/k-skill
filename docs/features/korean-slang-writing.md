# 한국어 유행어 글쓰기 가이드

## 이 기능으로 할 수 있는 일

- SNS·홍보문·댓글·자기소개를 "유행어 섞인 요즘 말투" 로 작성하거나 리라이팅
- 무드·문맥·안전성(safety)·강도(intensity) 기준으로 한국 유행어 후보를 조회
- 개별 유행어의 뜻을 나무위키 best-effort 요약으로 확인
- 외부 JSON 인덱스로 유행어 풀을 교체·확장 (확장성)

## 왜 별도 스킬이 필요한가

- 한국 유행어는 생성·변형·소멸 속도가 빠르다. LLM 단독 지식에 의존하면 knowledge cutoff 이후 표현은 놓치거나 잘못 쓰기 쉽다.
- 유행어를 아무 때나 자동으로 끼워 넣는 것은 위험하다. `korean-slang-writing` 은 **사용자가 명시적으로 원할 때만** 활성화되고, 근거 링크와 안전성 메타를 함께 돌려준다.
- 다른 한국어 스킬(자기소개서 교정, SNS 카피 작성 등)이 공통으로 참조할 수 있는 유행어 사전 레이어를 제공한다.

## 먼저 필요한 것

- `python3` 3.10+
- 인터넷 연결 (나무위키 lookup 에만 사용, 시드 검색은 오프라인)
- 추가 API 키 없음

## 입력값

- 시드 검색: `--query`, `--mood`, `--context`, `--safety`, `--intensity`, `--limit`, `--include-deprecated`, `--index-path`
- 원문 lookup: 유행어 단어 또는 나무위키 URL
- 출력: JSON(기본) 또는 텍스트

## 기본 계약

- 스킬은 **데이터와 조회 도구** 만 제공한다. 실제 글 작성은 호출하는 에이전트(LLM)가 한다.
- 시드 인덱스 (`data/seed-slang.json`) 는 나무위키 `분류:유행어` 를 참고한 수작업 큐레이션 결과이며, 각 항목은 `term`, `aliases`, `meaning_short`, `usage_context`, `mood_tags`, `intensity`, `safety`, `example_usage`, `namuwiki_url`, `era`, `still_usable` 을 가진다.
- `safety` 는 `safe` / `spicy` / `risky` 중 하나다. v1 시드에는 `risky` 항목을 포함하지 않는다.
- 검색 결과의 `match_reason` 우선순위는 `exact > alias > substring > no-query` 다.
- 나무위키 fetch 는 **best-effort** 다. Cloudflare 차단(403/429) 이나 404 시 `fetched: false` 와 `block_reason` 으로 보고하고, 에이전트는 추측하지 않는다.

## 기본 흐름

1. 사용자 의도(목적, 톤, 문맥, 강도)를 정리한다.
2. `slang_search.py` 로 시드 인덱스에서 후보를 고른다 (무드/문맥/safety 필터 조합).
3. 필요한 경우 `slang_lookup.py` 로 특정 유행어의 나무위키 원문 요약을 확인한다.
4. 에이전트가 후보 중 1~3개를 골라 자연스럽게 녹여 문장을 완성한다.
5. 결과물과 함께 "사용한 표현 · 의미 · 근거 링크" 를 사용자에게 보여준다.

## CLI 사용 예시

```bash
# 1) 특정 유행어 즉시 조회 (시드 정확 매칭)
python3 scripts/slang_search.py --query "갓생" --format text

# 2) 긍정·유머 무드, SNS/마케팅 문맥에서 안전한 후보 5개
python3 scripts/slang_search.py \
  --mood "긍정,유머" \
  --context "SNS,마케팅" \
  --safety safe \
  --limit 5

# 3) 구형 유행어까지 포함해 넓게 조회
python3 scripts/slang_search.py --query "인싸" --include-deprecated

# 4) 나무위키 원문 요약 시도 (실패하면 warning 반환)
python3 scripts/slang_lookup.py "중꺾마" --timeout 10 --format json

# 5) 외부 인덱스 파일로 대체 (PR 없이 커스텀 풀 사용)
python3 scripts/slang_search.py \
  --query "럭키비키" \
  --index-path ./my-custom-slang.json
```

## 응답 스타일 권장

```text
[추천 문안]
...

[사용한 유행어]
- 갓생: 부지런하고 생산적인 삶 — https://namu.wiki/w/...
- 오운완: 오늘 운동 완료 — https://namu.wiki/w/...

[더 과한 버전]
...
[더 무난한 버전]
...
```

## 제한사항

- 시드 인덱스는 약 30개 항목의 큐레이션 모음이며 전체 나무위키 `분류:유행어` 를 망라하지 않는다.
- 나무위키는 Cloudflare 를 사용하므로 요청량이 많거나 IP 가 의심받으면 403/429 가 나올 수 있다. 이 스킬은 실패를 조용히 덮지 않고 `block_reason` 으로 보고한다.
- `still_usable` 플래그는 수작업으로 관리하며, 자동 만료 로직은 v1 범위가 아니다.
- 스킬은 LLM 호출을 하지 않는다. "유행어 추천 → 문장 작성" 판단은 호출 에이전트가 한다.

## 안전 가이드

- 민감한 상황 (사과문, 공문, 보도자료, 법률 문서) 에서는 사용을 자제한다.
- `spicy` 로 표시된 표현은 비격식 · 친근한 컨텍스트에서만 사용하고, 이유를 한 줄 덧붙인다.
- 유행어의 의미를 시드 또는 나무위키에서 확인하지 못했다면 그 유행어는 쓰지 않는다.
- 사용자가 별도 요청하지 않는 한, 유행어는 **적게** 쓰는 것이 기본값이다.

## 확장 아이디어

- `data/` 에 커뮤니티·브랜드 전용 유행어 인덱스를 별도 파일로 추가 (의도적 사용)
- 자동 만료 점수 (`last_reviewed` + 현재 날짜 기반) 로 구형 항목 자동 demote
- 다중 소스 병합 (나무위키 외 공개 사전/뉴스 기사 요약)
