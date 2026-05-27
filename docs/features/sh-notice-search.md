# SH 청약·주택 공고문 조회 가이드

`sh-notice-search`는 서울주택도시개발공사(SH, `www.i-sh.co.kr`)의 공개 **공고 및 공지** HTML 게시판을 직접 조회하는 read-only 스킬이다. upstream이 인증/키 없이 열려 있는 공개 표면이므로 `k-skill-proxy`를 사용하지 않는다.

## 이 기능으로 할 수 있는 일

- SH 최신 공고/공지 목록 조회
- 키워드 검색: `행복주택`, `매입임대`, `신혼희망타운` 등
- 공고 종류 필터: 주택임대, 주택분양, 주택매입(주거복지 alias), 토지, 상가/공장 등
- 페이지네이션: SH 고정 10건 페이지에서 `page`로 이동
- 상세 조회: 본문 텍스트, 담당부서, 등록일, 조회수, 공식 상세 URL
- 첨부 메타데이터: 실제 `existFile()` 첨부 앵커와 `downList` 기반 파일명/미리보기 URL

## 가장 중요한 정책 경계

- SH 게시판은 공개 HTML이라 proxy에 넣지 않는다.
- 별도 API key가 필요한 공식 무료 API가 발견되는 경우에만 해당 경로를 좁은 allowlist proxy route로 검토한다.
- 본 구현은 청약 신청, 로그인, 서류 제출, 결제, 마이페이지 자동화를 하지 않는다.

## 공개 접근 경로

기본 임대 게시판:

```text
https://www.i-sh.co.kr/app/lay2/program/S1T294C297/www/brd/m_247/list.do?multi_itm_seq=2
```

상세:

```text
https://www.i-sh.co.kr/app/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2&seq=<seq>
```

검색 파라미터:

| 목적 | 파라미터 |
| --- | --- |
| 제목 검색 | `srchWord=<검색어>&srchTp=0` |
| 내용 검색 | `srchWord=<검색어>&srchTp=1` |
| 페이지 | `page=<번호>` |
| 분류 | 공식 탭별 `multi_itm_seq` 및 board path |

SH 게시판은 `srchWord`만 보내면 검색어를 무시하고 전체 목록을 반환할 수 있으므로, 패키지는 키워드가 있을 때 `srchTp`를 반드시 보낸다.

## 사용 예시

```bash
node packages/sh-notice-search/src/cli.js 행복주택 --category 임대 --limit 5
node packages/sh-notice-search/src/cli.js 매입임대 --category 주거복지 --page 2
node packages/sh-notice-search/src/cli.js --seq 304371 --category 임대
```

```js
const { searchNotices, getNoticeDetail } = require("sh-notice-search")

const list = await searchNotices({ keyword: "행복주택", category: "임대", page: 1 })
const detail = await getNoticeDetail({ seq: list.items[0].seq, category: "임대" })
```

## 출력 필드

목록:

- `seq`, `title`, `department`, `registered_date`, `views`
- `category`, `category_name`
- `status` / `status_basis` (제목 기반 보수적 분류)
- `detail_url`

상세:

- `content_text`
- `attachments[]`: `filename`, `file_seq`, `file_size`, `file_type`, `preview_url`
- `detail_url`

직접 다운로드 URL은 노출하지 않고, 공식 상세/미리보기 URL을 사용자 브라우저로 handoff한다.

## 상태와 공고 종류 필터

공고 종류는 SH 공식 탭과 일치하는 board path를 사용한다. `주거복지`는 공개 탭명이 아니므로 사용자 alias로만 받고 현재 SH의 `주택매입` 탭에 매핑한다.

상태(`진행`, `마감`, `당첨자`)는 공개 목록에 별도 컬럼이 없어 제목 텍스트 기반으로만 보수적으로 분류한다. 정확한 접수기간/마감일은 상세 본문이나 첨부 공고문을 확인해야 한다.

## 실패 모드

- SH HTML 구조, board path, `getDetailView()`, `existFile()`, `downList` 구조 변경
- IP rate limit, NetFunnel queue/throttle, 점검 페이지, CAPTCHA/login wall
- 첨부 미리보기/다운로드 direct-link 정책 변경
- `pageSize`를 10보다 크게 지정해도 SH는 한 페이지 10건만 제공
- 상태 분류는 제목 추론이라 상세 공고문 날짜와 다를 수 있음

## Done when

- 직접 공개 SH URL에서 목록/상세를 조회했다.
- 키워드 검색에 `srchTp`가 포함되어 의도된 hit count로 좁혀졌다.
- 페이지가 필요한 경우 `page`를 사용했다.
- 첨부가 아이콘 템플릿이 아니라 실제 `existFile()` 기준으로 추출되었다.
