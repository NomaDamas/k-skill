# sh-notice-search

Public SH(서울주택도시개발공사) notice lookup client for the `sh-notice-search` k-skill.

## Source

- List/detail pages: `https://www.i-sh.co.kr/app/lay2/program/.../www/brd/.../{list,view}.do`
- Default category: `주택임대` (`multi_itm_seq=2`)
- Keyword search: SH requires both `srchWord` and `srchTp`; this client defaults keyword searches to title scope (`srchTp=0`).

This is an unauthenticated public HTML surface. No proxy or API key is required. The client does not automate application, login, document submission, payment, or My Page flows.

## Usage

```js
const { searchNotices, getNoticeDetail } = require("sh-notice-search")

const list = await searchNotices({ keyword: "행복주택", category: "임대", page: 1 })
const detail = await getNoticeDetail({ seq: list.items[0].seq, category: "임대" })
```

CLI:

```bash
sh-notice-search 행복주택 --category 임대 --limit 5
sh-notice-search 매입임대 --category 주거복지 --status 진행
sh-notice-search --seq 304371 --category 임대
```

## Returned fields

List rows include `seq`, `title`, `department`, `registered_date`, `views`, `category`, `status`, and the official `detail_url`.

Detail rows include `content_text` plus attachment metadata: `filename`, `file_seq`, `file_size`, `file_type`, and official SH `preview_url`. Direct download URLs are intentionally not exposed because SH file-download behavior can be session/policy dependent; hand off official preview/detail URLs to the user's browser.

## Boundaries

- `pageSize`/`limit` is capped at 10 because the SH board returns a fixed 10 rows per page.
- Status filtering uses a conservative title-text classifier because the public board list has no first-class status field.
- Category aliases map to official board tabs (`주택임대`, `주택분양`, `주택매입`, `토지`, etc.). The `주거복지` alias maps to SH's public `주택매입` tab.
- Public HTML structure, NetFunnel/rate limits, and attachment preview policy can change.
