---
name: sh-notice-search
description: 서울주택도시개발공사(SH) 공개 공고/공지 게시판에서 청약·주택 공고 목록, 상세 본문, 첨부 미리보기 메타데이터를 직접 조회한다.
license: MIT
metadata:
  category: housing
  locale: ko-KR
  phase: v1
---

# SH Notice Search

## What this skill does

서울주택도시개발공사(SH, `www.i-sh.co.kr`)의 **공고 및 공지** 공개 HTML 게시판을 직접 읽어 청약·주택 공고 목록과 상세 본문, 첨부파일 메타데이터를 JSON으로 정리한다.

- 키워드로 SH 공고/공지 목록을 검색한다.
- 공식 게시판 분류(주택임대, 주택분양, 주택매입/주거복지, 토지, 상가/공장 등)를 선택한다.
- 상세 페이지에서 본문, 담당부서, 등록일, 조회수, 실제 첨부파일명을 추출한다.
- 첨부는 아이콘 템플릿이 아니라 `existFile('N')` onclick이 달린 실제 첨부 앵커와 `downList` 메타데이터를 기준으로 추출한다.

청약 신청, 서류 제출, 로그인 필요한 마이페이지 조회, 결제, 알림 발송은 하지 않는다.

## When to use

- "SH 행복주택 공고 찾아줘"
- "서울주택도시개발공사 매입임대 공고 보여줘"
- "SH 공고 seq 304371 상세와 첨부파일 알려줘"
- "SH 분양 공고 최신 목록 조회"

## Prerequisites

- 인터넷 연결
- Node.js 18+
- 이 저장소의 `sh-notice-search` npm package 또는 동일 로직

## Public access path discovered

### Primary source: official SH public HTML board

- default rent list: `https://www.i-sh.co.kr/app/lay2/program/S1T294C297/www/brd/m_247/list.do?multi_itm_seq=2`
- default rent detail: `https://www.i-sh.co.kr/app/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2&seq=<seq>`
- title keyword search: add `srchWord=<keyword>&srchTp=0`
- content keyword search: add `srchWord=<keyword>&srchTp=1`
- fixed board page size: 10 rows per page; use `page` for pagination.

Discovery result: direct unauthenticated fetches from `www.i-sh.co.kr` return list/detail HTML. A live smoke on 2026-05-15 showed `srchWord=행복주택` without `srchTp` returned the full rent board count, while `srchTp=0` narrowed the result set. Therefore the client always sends `srchTp` when a keyword is present.

No `k-skill-proxy` route is used because this upstream is public and does not require an API key.

## Supported category aliases

| Input aliases | Official tab |
| --- | --- |
| `rent`, `임대`, `주택임대` | 주택임대 (`multi_itm_seq=2`) |
| `sale`, `분양`, `주택분양` | 주택분양 (`multi_itm_seq=1`) |
| `purchase`, `매입`, `매입임대`, `welfare`, `주거복지` | 주택매입 (`multi_itm_seq=512`) |
| `land`, `토지` | 토지 |
| `commercial`, `상가`, `공장` | 상가/공장 |
| `compensation`, `보상`, `이주` | 보상/이주 |
| `design`, `현상설계` | 현상설계 |
| `etc`, `기타` | 기타 |
| `all`, `전체` | 전체 |

`주거복지`는 SH 공고 및 공지의 공개 탭명이 아니라 사용자 친화 alias이며, 현재는 SH의 공개 `주택매입` 탭으로 매핑한다. 답변할 때는 이 매핑을 밝힌다.

## Workflow

### 1. Search notices

```js
const { searchNotices } = require("sh-notice-search")

const result = await searchNotices({
  keyword: "행복주택",
  category: "임대",
  page: 1,
  limit: 5
})

console.log(result.items)
```

CLI:

```bash
node packages/sh-notice-search/src/cli.js 행복주택 --category 임대 --limit 5
node packages/sh-notice-search/src/cli.js 매입임대 --category 주거복지 --status 진행
```

Returned list fields include:

- `seq`
- `title`
- `department`
- `registered_date`
- `views`
- `is_new`
- `category`, `category_name`
- `status`, `status_basis`
- `detail_url`

### 2. Fetch detail

```js
const { getNoticeDetail } = require("sh-notice-search")

const detail = await getNoticeDetail({ seq: "304371", category: "임대" })
console.log(detail.notice.content_text)
console.log(detail.notice.attachments)
```

CLI:

```bash
node packages/sh-notice-search/src/cli.js --seq 304371 --category 임대
```

Attachment fields:

- `filename`
- `file_seq`
- `file_size`
- `file_type`
- `preview_url` (official SH preview/converter URL)

Direct download URLs are intentionally not returned. Hand off `detail_url` or `preview_url` to the user's browser.

### 3. Interpret status conservatively

The SH public board list does not expose a first-class status field like `접수중`/`마감`. The package can filter by `status`, but it is a title-text classifier:

- `open`/`진행`: titles with 모집공고, 입주자 모집, 신청, 접수, 공고
- `closed`/`마감`: titles with 마감, 계약결과, 결과, 완료, 종료
- `announced`/`당첨자`: titles with 당첨, 발표

When answering, disclose that status is inferred from the title unless the detailed 공고문 body states exact dates.

## Done when

- Official SH list/detail URLs were queried directly from the user machine.
- Keyword searches include `srchTp` so `srchWord` is not ignored.
- Pagination uses `page` and recognizes the fixed 10-row board page size.
- Attachments are extracted from actual `existFile()` anchors/downList metadata, not extension icon templates.
- Public source URLs are shown, and login/application automation is avoided.

## Failure modes

- SH can change board paths, table markup, JavaScript functions, or `downList` structure; parsing may become partial or fail.
- IP-rate-limit, NetFunnel throttling, maintenance pages, or temporary 4xx/5xx responses can block live fetches. Do not bypass CAPTCHA/login/queue protections.
- `srchWord` without `srchTp` is known to be ignored by the SH board; always send `srchTp=0` for title or `srchTp=1` for content.
- `pageSize` larger than 10 does not make SH return more rows. Use `page` for additional results.
- Attachment preview URLs may require browser handoff and can be governed by SH's current direct-link/download policy.
- Status is inferred from title text because the public list lacks an explicit status column.

## Notes

- Read-only lookup only.
- No proxy, no API key, no secrets.
- Do not automate 청약 신청, 로그인, 서류 제출, payment, or 마이페이지 flows.
