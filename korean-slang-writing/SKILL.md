---
name: korean-slang-writing
description: Use curated Korean trending-slang candidates plus best-effort Namu Wiki lookups to write witty Korean text with up-to-date slang, with conservative safety and freshness guardrails.
license: MIT
metadata:
  category: writing
  locale: ko-KR
  phase: v1
---

# Korean Slang Writing

## What this skill does

사용자가 "유행어 섞어서", "요즘 말투로", "밈스럽게", "재치있게" 같은 요청을 했을 때, **검증된 한국 유행어 후보**를 먼저 뽑고 필요하면 나무위키 원문 요약을 확인해 한국어 문장·홍보문·SNS 게시글·댓글을 유행어 느낌으로 작성한다.

- 스킬은 **데이터와 조회 도구**만 제공한다: 큐레이션된 시드 인덱스 검색 + 나무위키 best-effort 요약.
- 실제 문장 작성은 **에이전트(LLM)** 가 스킬이 돌려준 후보 중에서 사용자 의도에 맞는 표현을 골라 한다.
- 시드 인덱스 출처는 [나무위키 분류:유행어](https://namu.wiki/w/%EB%B6%84%EB%A5%98:%EC%9C%A0%ED%96%89%EC%96%B4) 를 기준으로 수작업 큐레이션한다.
- risky 수준의 혐오·차별·집단 조롱 가능성이 있는 표현은 시드에 넣지 않는다.

## When to use

- "SNS 홍보 글 유행어 섞어서 써줘"
- "댓글을 요즘 말투로 바꿔줘"
- "밈스럽게 / MZ스럽게 / 재치있게 써줘"
- "이 유행어가 무슨 뜻이야?" (시드 인덱스 + 나무위키 lookup)
- "긍정적인 느낌의 유행어 3개 추천해줘"
- "이 상품 카피에 어울리는 유행어 후보 뽑아줘"

## When NOT to use

- 격식 공문, 보도자료, 법률 문서, 사과문, 공식 발표문 등 유행어 사용이 부적절한 문맥
- 민감한 사회·정치·종교 주제에 풍자 유행어를 끼얹어야 하는 상황
- 대량 인덱싱 / 전체 웹 스크래핑 (나무위키 약관·Cloudflare 정책 위반 소지)
- 불특정 다수 대상의 브랜딩 문구에서 유행어 과다 사용 (저자가 확인·동의하지 않은 경우)

## Policy first

- 유행어는 **자연스럽게 적게** 쓰는 것을 기본값으로 한다. 과다 사용은 오히려 촌스럽다.
- 뜻과 용례를 확인하지 못한 유행어는 사용하지 않는다.
- `safety` 가 `spicy` 인 항목은 비격식 컨텍스트에서만 쓰고, 격식 자리에는 피한다.
- `still_usable: false` 표시가 붙은 구형 유행어는 기본 검색 결과에 포함되지 않는다 (`--include-deprecated` 로 의도적 복원 가능).
- 나무위키는 best-effort 출처이며 Cloudflare 차단·HTML 구조 변경 시 `fetched: false` 또는 `warning` 으로 응답한다. 이 경우 추측하지 말고 시드 인덱스 meaning_short + 링크만 안내한다.

## Prerequisites

- `python3` 3.10+ (`argparse`, `urllib`, `unittest` 만 사용 — 추가 의존성 없음)
- 스킬 디렉터리의 `scripts/*.py` helper (설치 시 자동 포함)
- 나무위키 lookup 에는 인터넷 연결이 필요하지만, 실패해도 시드 인덱스만으로 안전하게 응답할 수 있다.

## Response contract

`slang_search` 결과 스키마 (v1):

```json
{
  "query": "중꺾마",
  "filters_applied": {
    "mood": ["긍정"],
    "context": ["SNS"],
    "safety": ["safe"],
    "intensity": [],
    "limit": 10,
    "include_deprecated": false
  },
  "matched_before_limit": 12,
  "total_candidates": 5,
  "candidates": [
    {
      "term": "중꺾마",
      "aliases": ["중요한 건 꺾이지 않는 마음"],
      "meaning_short": "포기하지 않는 불굴의 의지.",
      "usage_context": ["격려", "스포츠", "SNS"],
      "mood_tags": ["긍정", "의지"],
      "intensity": "medium",
      "safety": "safe",
      "example_usage": ["힘들지만 중꺾마 정신으로 이겨내자!"],
      "namuwiki_url": "https://namu.wiki/w/...",
      "era": "2022",
      "still_usable": true,
      "match_reason": "exact"
    }
  ],
  "source": "...",
  "last_reviewed": "2026-04-22"
}
```

`match_reason` 우선순위: `exact` > `alias` > `substring` > `no-query` (필터만 적용한 경우).

`slang_lookup` 결과 스키마:

```json
{
  "input": "중꺾마",
  "url": "https://namu.wiki/w/%EC%A4%91%EA%BA%BE%EB%A7%88",
  "fetched": true,
  "title": "중꺾마",
  "summary": "중꺾마는 ...",
  "error": null,
  "block_reason": null,
  "warning": "optional, when HTML parsing failed"
}
```

`fetched: false` 인 경우 `block_reason` 이 `blocked` / `not_found` / `upstream_error` 중 하나이며, 에이전트는 추측하지 않고 원문 링크를 제시하거나 다른 출처 확인을 제안한다.

## Workflow

### 1. 사용자 의도 정리

- 글쓰기 목적 (홍보, 댓글, 자기소개, 제목 등)
- 유행어 강도 (살짝 / 적당히 / 많이)
- 톤/무드 (긍정, 부정, 유머, 자조, 감탄 등)
- 문맥 (SNS, 마케팅, 음식, 스포츠, 직장, 학교 등)

### 2. 시드 인덱스에서 후보 탐색

```bash
python3 scripts/slang_search.py --mood "긍정,유머" --context "SNS,마케팅" --safety safe --limit 5 --format json
```

주요 옵션:

| 옵션 | 설명 | 예 |
|------|------|-----|
| `--query` | 키워드 매칭 (term/aliases/substring) | `--query 중꺾마` |
| `--mood` | 무드 태그 (OR 매칭) | `--mood 긍정,유머` |
| `--context` | 문맥 태그 (OR 매칭) | `--context SNS,마케팅` |
| `--safety` | 안전 수준 (safe/spicy/risky) | `--safety safe,spicy` |
| `--intensity` | 강도 (subtle/medium/strong) | `--intensity medium,strong` |
| `--limit` | 반환 개수 (1~50) | `--limit 5` |
| `--include-deprecated` | 구형 유행어 포함 | `--include-deprecated` |
| `--index-path` | 외부 인덱스 JSON 경로 | `--index-path ./my-index.json` |
| `--format` | `json` 또는 `text` | `--format text` |

### 3. (선택) 나무위키 원문 요약 확인

```bash
python3 scripts/slang_lookup.py "중꺾마" --format json
python3 scripts/slang_lookup.py "https://namu.wiki/w/%EC%A4%91%EA%BA%BE%EB%A7%88" --max-length 800
```

- 성공 시 `title`, `summary` 를 돌려준다.
- 실패 시 `fetched: false` + `block_reason` + `error` 를 돌려준다. 추측하지 말 것.

### 4. 에이전트가 글 작성

1. 후보 중 문맥에 맞는 1~3개를 선택한다. 많이 넣지 않는다.
2. `safety` 가 `spicy` 인 표현은 비격식 컨텍스트에서만 쓰고, 사용 의도를 분명히 한다.
3. 결과물을 1~2문장으로 자연스럽게 녹인다.
4. 필요하면 "사용한 표현: A, B — 의미 확인: [url]" 을 덧붙여 근거 링크를 보여준다.
5. 사용자가 더 과한/덜 과한 버전을 원하면 대안을 함께 제공한다.

## CLI examples

```bash
# 1) 특정 유행어 뜻/메타 바로 확인
python3 scripts/slang_search.py --query "갓생" --format text

# 2) 긍정 무드의 SNS 마케팅 후보 5개
python3 scripts/slang_search.py --mood "긍정,유머" --context "SNS,마케팅" --safety safe --limit 5

# 3) 이용자가 지정한 커스텀 인덱스로 전환
python3 scripts/slang_search.py --query "중꺾마" --index-path ~/Downloads/my-slang.json

# 4) 나무위키 원문 요약 시도
python3 scripts/slang_lookup.py "럭키비키" --timeout 10 --format text
```

## Response policy

- 응답에는 **선택한 유행어, 최종 문장, 근거 링크** 세 가지를 포함한다.
- 유행어를 2개 이상 썼다면 각각 왜 썼는지 한 줄 이유를 붙인다.
- 사용자가 명시적으로 요청하지 않은 상황에서는 유행어를 끼얹지 않는다.
- 나무위키 요약이 없을 때는 시드의 `meaning_short` 와 원문 링크로 대체한다. "잘 모르겠다" 를 숨기지 않는다.

## Done when

- `slang_search` 가 JSON 으로 최소 한 개의 후보를 돌려주었거나, 의도적으로 0건 (no match) 을 명확히 전달했다.
- 유행어를 사용한 경우, 각 표현의 뜻/근거 링크가 함께 제시되었다.
- `safety=risky` 표현은 시드에 없고, `spicy` 표현을 썼다면 왜 괜찮은 문맥인지 한 줄 설명이 있다.
- 나무위키 lookup 실패 시 추측 대신 원문 링크로 대체되었다.

## Notes

- 시드 인덱스 위치: `data/seed-slang.json` (약 30개 항목). 확장은 PR 로 검토 후 반영한다.
- `last_reviewed` 필드를 의미 있게 업데이트하지 않는 변경은 받지 않는 편이 안전하다.
- 이 스킬은 **나무위키 분류:유행어** 를 기반으로 하지만 전체 인덱싱하지 않는다. Cloudflare 차단·데이터 선도 변화에 보수적으로 설계된 v1 이다.
- 다음 버전에서는 여러 공개 소스를 통합하거나 `last_reviewed` 기반 자동 만료 로직을 넣을 수 있다.
