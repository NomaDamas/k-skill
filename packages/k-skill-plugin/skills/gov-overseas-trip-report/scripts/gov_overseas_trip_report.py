#!/usr/bin/env python3
"""Read-only multi-agency overseas / official-trip report discovery helper.

Verified public surfaces only. Does not adjudicate corruption or waste.
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
DEFAULT_TIMEOUT = 30

ProviderFn = Callable[["Client", dict[str, Any]], dict[str, Any]]


class FetchError(RuntimeError):
    def __init__(self, mode: str, message: str, *, url: str | None = None):
        super().__init__(message)
        self.mode = mode
        self.url = url


@dataclass(frozen=True)
class Provider:
    id: str
    name: str
    kind: str
    description: str
    list_url: str
    supports_list: bool
    supports_detail: bool
    notes: str


PROVIDERS: dict[str, Provider] = {
    "nec": Provider(
        id="nec",
        name="중앙선거관리위원회",
        kind="agency_board",
        description="공무국외출장보고서 게시판 (첨부 PDF 전량 공개)",
        list_url="https://www.nec.go.kr/site/nec/ex/bbs/List.do?cbIdx=1107",
        supports_list=True,
        supports_detail=True,
        notes="GET pageIndex 페이지네이션. POST pageIndex 는 서버 오류.",
    ),
    "acrc": Provider(
        id="acrc",
        name="국민권익위원회",
        kind="agency_board",
        description="사전정보공개 국외출장 현황 게시판",
        list_url="https://www.acrc.go.kr/board.es?mid=a10502060000&bid=1000",
        supports_list=True,
        supports_detail=True,
        notes="첨부 HWPX는 boardDownload.es 로 제공.",
    ),
    "mpm": Provider(
        id="mpm",
        name="인사혁신처",
        kind="policy_guide",
        description="공무국외출장 제도·BTIS 등록 안내 페이지",
        list_url="https://www.mpm.go.kr/mpm/info/infoService/BizService08/",
        supports_list=False,
        supports_detail=True,
        notes="개별 출장보고서 DB가 아니라 제도 안내. 로그인 필요 시스템(BTIS 등)은 스킬 범위에서 제외.",
    ),
    "mois": Provider(
        id="mois",
        name="행정안전부",
        kind="policy_guide",
        description="위법 공무국외출장 지방자치단체 처리기준 등 정책 자료",
        list_url=(
            "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do"
            "?bbsId=BBSMSTR_000000000016&nttId=127619"
        ),
        supports_list=False,
        supports_detail=True,
        notes="출장 원문이 아니라 처리 기준 예규·첨부.",
    ),
    "open_portal": Provider(
        id="open_portal",
        name="정보공개포털",
        kind="federated_search",
        description="open.go.kr 사전정보 키워드 검색 (다수 기관 문서 메타)",
        list_url="https://www.open.go.kr/othicInfo/infoList/infoList.do",
        supports_list=True,
        supports_detail=False,
        notes="원문 파일 직접 링크보다 기관/문서 메타 검색에 강함.",
    ),
    "daegu_council": Provider(
        id="daegu_council",
        name="대구광역시의회",
        kind="council_board",
        description="공무국외출장 결과 게시판",
        list_url="https://council.daegu.go.kr/kr/bbs?bbs_id=overseas",
        supports_list=True,
        supports_detail=True,
        notes="상세에 /attach/bbs/overseas/*.pdf 및 /kr/bbs/download 링크.",
    ),
    "daejeon_council": Provider(
        id="daejeon_council",
        name="대전광역시의회",
        kind="council_board",
        description="공무국외출장 계획·결과 보고서 게시판",
        list_url="https://council.daejeon.go.kr/svc/inf/TrainingReportList.do",
        supports_list=True,
        supports_detail=True,
        notes="상세 첨부는 /bbs/FileDownLoadProc.do?flSn=.",
    ),
    "gyeonggi_council": Provider(
        id="gyeonggi_council",
        name="경기도의회",
        kind="council_board",
        description="공무원 국외훈련결과보고서 게시판",
        list_url="https://www.ggc.go.kr/site/main/board/training_resrep/list",
        supports_list=True,
        supports_detail=True,
        notes="첨부 /site/main/file/download/uu/<id>.",
    ),
    "gyeongbuk_council": Provider(
        id="gyeongbuk_council",
        name="경상북도의회",
        kind="council_board",
        description="공지사항 중 공무국외출장 계획서 공개 글",
        list_url="https://council.gb.go.kr/kr/bbs?bbs_id=notice",
        supports_list=True,
        supports_detail=True,
        notes="전용 overseas 보드가 아니라 공지 키워드 필터.",
    ),
}


class Client:
    def __init__(
        self,
        *,
        timeout: int = DEFAULT_TIMEOUT,
        opener: Callable[[urllib.request.Request, int], Any] | None = None,
    ) -> None:
        self.timeout = timeout
        self._opener = opener or self._default_open

    @staticmethod
    def _default_open(req: urllib.request.Request, timeout: int) -> Any:
        return urllib.request.urlopen(req, timeout=timeout)

    def fetch_text(self, url: str, *, data: bytes | None = None) -> tuple[str, str]:
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        }
        if data is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with self._opener(req, self.timeout) as resp:
                raw = resp.read()
                final = resp.geturl()
                ctype = (resp.headers.get("Content-Type") or "").lower()
        except urllib.error.HTTPError as exc:
            raise FetchError("http_error", f"HTTP {exc.code} for {url}", url=url) from exc
        except urllib.error.URLError as exc:
            raise FetchError("network_error", f"network error for {url}: {exc.reason}", url=url) from exc
        except TimeoutError as exc:
            raise FetchError("http timeout or partial response", f"timeout for {url}", url=url) from exc

        if "html" not in ctype and not raw.lstrip().startswith((b"<!"),) and b"<html" not in raw[:200].lower():
            # allow small HTML without ctype, still try decode
            pass
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")
        if "오류가 발생" in text and "pageIndex" in url:
            raise FetchError("unexpected HTML", f"NEC/board error page for {url}", url=final)
        return text, final


def unescape(value: str) -> str:
    return html_lib.unescape(value)


def absolute(base: str, href: str) -> str:
    return urllib.parse.urljoin(base, unescape(href))


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", value))).strip()



def item(
    *,
    provider: str,
    title: str,
    detail_url: str | None = None,
    published_at: str | None = None,
    attachments: list[dict[str, str]] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "provider": provider,
        "title": title,
        "detailUrl": detail_url,
        "publishedAt": published_at,
        "attachments": attachments or [],
    }
    if extra:
        row.update(extra)
    return row


def parse_nec_list(html: str, *, base: str = "https://www.nec.go.kr") -> dict[str, Any]:
    footer = re.search(
        r'총\s*<em class="count">\s*([^<]+?)\s*</em>\s*\[<em class="now">\s*([^<]+?)\s*</em>/(\d+)페이지]',
        html,
    )
    rows: list[dict[str, Any]] = []
    for li in re.findall(r"<li\s*>[\s\S]*?</li>", html):
        view = re.search(r"View\.do\?cbIdx=1107&bcIdx=(\d+)", li)
        if not view:
            continue
        bc = view.group(1)
        title_m = re.search(r'class="btn_bbsDetail"[^>]*>([\s\S]*?)</a>', li)
        date_m = re.search(r'<span class="date">\s*([^<]+?)\s*</span>', li)
        dl_m = re.search(r'href="(/common/board/Download\.do\?[^"]+)"', li)
        file_m = re.search(r'title="([^"]+?)\s*파일다운로드"', li)
        att: list[dict[str, str]] = []
        if dl_m:
            href = absolute(base, dl_m.group(1))
            name = clean_text(file_m.group(1)) if file_m else href.rsplit("=", 1)[-1]
            typ = "pdf" if name.lower().endswith(".pdf") else "unknown"
            att.append({"title": name, "url": href, "type": typ})
        rows.append(
            item(
                provider="nec",
                title=clean_text(title_m.group(1)) if title_m else f"bcIdx={bc}",
                detail_url=f"{base}/site/nec/ex/bbs/View.do?cbIdx=1107&bcIdx={bc}",
                published_at=clean_text(date_m.group(1)) if date_m else None,
                attachments=att,
                extra={"bcIdx": bc},
            )
        )
    return {
        "totalText": clean_text(footer.group(1)) if footer else None,
        "page": int(footer.group(2)) if footer else None,
        "totalPages": int(footer.group(3)) if footer else None,
        "items": rows,
    }


def list_nec(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    max_pages = int(args.get("max_pages") or 5)
    keyword = (args.get("keyword") or "").strip()
    all_items: list[dict[str, Any]] = []
    pages_meta: list[dict[str, Any]] = []
    # Official pagination is GET pageIndex. POST pageIndex fails with server error page.
    for page in range(1, max_pages + 1):
        url = f"https://www.nec.go.kr/site/nec/ex/bbs/List.do?cbIdx=1107&pageIndex={page}"
        html, final = client.fetch_text(url)
        parsed = parse_nec_list(html)
        pages_meta.append(
            {
                "page": parsed["page"] or page,
                "count": len(parsed["items"]),
                "url": final,
                "totalText": parsed["totalText"],
                "totalPages": parsed["totalPages"],
            }
        )
        if not parsed["items"]:
            break
        all_items.extend(parsed["items"])
        total_pages = parsed["totalPages"] or page
        if page >= total_pages:
            break
    if keyword:
        all_items = [it for it in all_items if keyword in (it.get("title") or "")]
    return {
        "provider": "nec",
        "source": PROVIDERS["nec"].name,
        "sourceUrl": PROVIDERS["nec"].list_url,
        "pagination": {"method": "GET", "param": "pageIndex", "pages": pages_meta},
        "count": len(all_items),
        "items": all_items,
        "notes": [
            "Use GET pageIndex only. POST pageIndex=N returns a server error page.",
            "Decode HTML entities in Download.do URLs before fetching attachments.",
        ],
    }


def parse_acrc_list(html: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for m in re.finditer(
        r'href="([^"]*act=view[^"]*list_no=(\d+)[^"]*)"[\s\S]*?>([\s\S]*?)</a>',
        html,
        re.I,
    ):
        list_no = m.group(2)
        if list_no in seen:
            continue
        title = clean_text(m.group(3))
        if not title or title in {"상세보기", "새창", "더보기"}:
            continue
        seen.add(list_no)
        detail = absolute("https://www.acrc.go.kr/", m.group(1))
        if "bid=" not in detail:
            detail = (
                "https://www.acrc.go.kr/board.es?mid=a10502060000&bid=1000"
                f"&act=view&list_no={list_no}"
            )
        rows.append(
            item(
                provider="acrc",
                title=title,
                detail_url=detail,
                extra={"listNo": list_no},
            )
        )
    return rows


def list_acrc(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    max_pages = int(args.get("max_pages") or 3)
    keyword = (args.get("keyword") or "").strip()
    items: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        url = (
            "https://www.acrc.go.kr/board.es?mid=a10502060000&bid=1000"
            f"&nPage={page}"
        )
        html, _ = client.fetch_text(url)
        page_items = parse_acrc_list(html)
        if not page_items:
            break
        items.extend(page_items)
    if keyword:
        items = [it for it in items if keyword in (it.get("title") or "")]
    return {
        "provider": "acrc",
        "source": PROVIDERS["acrc"].name,
        "sourceUrl": PROVIDERS["acrc"].list_url,
        "count": len(items),
        "items": items,
    }


def detail_acrc(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    list_no = str(args.get("id") or "").strip()
    if not list_no:
        raise FetchError("invalid_input", "acrc detail requires --id list_no")
    url = (
        "https://www.acrc.go.kr/board.es?mid=a10502060000&bid=1000"
        f"&act=view&list_no={urllib.parse.quote(list_no)}"
    )
    html, final = client.fetch_text(url)
    title = clean_text(re.search(r"<title[^>]*>([^<]+)</title>", html).group(1)) if re.search(r"<title", html) else None
    attachments: list[dict[str, str]] = []
    for m in re.finditer(r'href="(/boardDownload\.es\?[^"]+)"', html):
        attachments.append(
            {
                "title": "attachment",
                "url": absolute("https://www.acrc.go.kr/", m.group(1)),
                "type": "hwpx",
            }
        )
    # prefer filenameOrg if present
    for m in re.finditer(r"filenameOrg=([^&\"']+)", html):
        if attachments:
            attachments[0]["title"] = urllib.parse.unquote(m.group(1))
            break
    body_bits = []
    for key in ("목적", "기간", "출장", "방문"):
        j = html.find(key)
        if j >= 0:
            body_bits.append(clean_text(html[j : j + 240]))
    return {
        "provider": "acrc",
        "source": PROVIDERS["acrc"].name,
        "facts": {
            "title": title,
            "detailUrl": final,
            "listNo": list_no,
            "attachments": attachments,
            "snippets": body_bits[:5],
        },
    }


def list_open_portal(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    keyword = (args.get("keyword") or "국외출장").strip() or "국외출장"
    page = int(args.get("page") or 1)
    url = (
        "https://www.open.go.kr/othicInfo/infoList/infoList.do?"
        + urllib.parse.urlencode({"mustKeyword": keyword, "pageIndex": str(page)})
    )
    html, final = client.fetch_text(url)
    m = re.search(r"var\s+result\s*=\s*(\{[\s\S]*?\});", html)
    if not m:
        raise FetchError("unexpected HTML", "open.go.kr result JSON not found", url=final)
    data = json.loads(m.group(1))
    items = []
    for row in data.get("rtnList") or []:
        title = row.get("S_INFO_SJ") or row.get("INFO_SJ") or ""
        items.append(
            item(
                provider="open_portal",
                title=title,
                published_at=row.get("P_DATE") or row.get("FRST_REGIST_DT"),
                extra={
                    "institution": row.get("PROC_INSTT_NM"),
                    "department": row.get("CHRG_DEPT_NM") or row.get("NFLST_CHRG_DEPT_NM"),
                    "docNo": row.get("DOC_NO"),
                    "registerNo": row.get("PRDCTN_INSTT_REGIST_NO"),
                    "keywords": row.get("tma_kwd"),
                    "unitJob": row.get("UNIT_JOB_NM"),
                },
            )
        )
    return {
        "provider": "open_portal",
        "source": PROVIDERS["open_portal"].name,
        "sourceUrl": final,
        "keyword": keyword,
        "total": data.get("rtnTotal"),
        "count": len(items),
        "items": items,
        "notes": [
            "Federated metadata search across many institutions.",
            "Does not always expose a direct file URL; use institution portal or Nuri FOI next.",
        ],
    }


def list_daegu(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    page = int(args.get("page") or 1)
    keyword = (args.get("keyword") or "").strip()
    url = f"https://council.daegu.go.kr/kr/bbs?bbs_id=overseas&page={page}"
    html, final = client.fetch_text(url)
    items: list[dict[str, Any]] = []
    for m in re.finditer(
        r"href\s*=\s*(['\"])([^'\"]*reform=view[^'\"]*bbs_id=overseas[^'\"]*)\1([^>]*)>([\s\S]*?)</a>",
        html,
        re.I,
    ):
        href = m.group(2)
        attrs = m.group(3) or ""
        inner = m.group(4) or ""
        title_m = re.search(r"title\s*=\s*(['\"])(.*?)\1", attrs, re.I | re.S)
        title = clean_text(title_m.group(2)) if title_m else clean_text(inner)
        title = title.replace(" 내용보기", "").strip()
        if not title or len(title) < 4:
            continue
        abs_url = absolute("https://council.daegu.go.kr/", href)
        uid_m = re.search(r"uid=([0-9A-Fa-f]+)", abs_url)
        items.append(
            item(
                provider="daegu_council",
                title=title,
                detail_url=abs_url,
                extra={"uid": uid_m.group(1) if uid_m else None},
            )
        )
    # de-dup by detail url
    dedup: dict[str, dict[str, Any]] = {}
    for it in items:
        dedup[it["detailUrl"]] = it
    items = list(dedup.values())
    if keyword:
        items = [it for it in items if keyword in (it.get("title") or "")]
    return {
        "provider": "daegu_council",
        "source": PROVIDERS["daegu_council"].name,
        "sourceUrl": final,
        "count": len(items),
        "items": items,
    }


def detail_daegu(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    detail_url = (args.get("url") or "").strip()
    uid = (args.get("id") or "").strip()
    if not detail_url and uid:
        detail_url = (
            "https://council.daegu.go.kr/kr/bbs?reform=view"
            f"&uid={urllib.parse.quote(uid)}&bbs_id=overseas"
        )
    if not detail_url.startswith("https://council.daegu.go.kr/"):
        raise FetchError("invalid_input", "daegu detail requires official council.daegu.go.kr URL or --id uid")
    html, final = client.fetch_text(detail_url)
    attachments: list[dict[str, str]] = []
    for m in re.finditer(r"href\s*=\s*(['\"])([^'\"]+)\1", html, re.I):
        href = unescape(m.group(2))
        if re.search(r"/attach/bbs/overseas/|/kr/bbs/download", href):
            url = absolute("https://council.daegu.go.kr/", href)
            # filename from surrounding title attr if download link
            typ = "pdf" if url.lower().endswith(".pdf") else "unknown"
            title = url.rsplit("/", 1)[-1]
            # look back small window for title=
            start = max(0, m.start() - 200)
            window = html[start:m.end()+50]
            tm = re.search(r"title\s*=\s*(['\"])(.*?)\1", window, re.I | re.S)
            if tm:
                title = clean_text(tm.group(2)).replace(" 파일 내려받기", "")
                if title.lower().endswith(".pdf"):
                    typ = "pdf"
            attachments.append({"title": title, "url": url, "type": typ})
    uniq = {a["url"]: a for a in attachments}
    # Prefer direct pdf attach URL first
    ordered = sorted(uniq.values(), key=lambda a: 0 if a["url"].endswith(".pdf") else 1)
    # extract simple body facts if present
    period = re.search(r"출장기간\s*:\s*([^<\n]+)", html)
    country = re.search(r"출장국가\s*:\s*([^<\n]+)", html)
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html)
    report_title = None
    # attachment human filenames often encode the report title
    for att in ordered:
        name = att.get("title") or ""
        if "결과보고서" in name or "출장" in name:
            report_title = re.sub(r"^[★*\s]+", "", name)
            report_title = report_title.replace(".pdf", "").replace(".hwp", "").replace(".hwpx", "").strip()
            break
    if not report_title:
        tm = re.search(r"title\s*=\s*(['\"])([^'\"]*(?:결과보고서|공무국외)[^'\"]*)\1", html, re.I)
        if tm:
            report_title = clean_text(tm.group(2)).replace(" 파일 내려받기", "").replace(" 내용보기", "")
    if not report_title and title_m:
        report_title = clean_text(title_m.group(1))
        report_title = report_title.split(">")[-1].strip()
    return {
        "provider": "daegu_council",
        "source": PROVIDERS["daegu_council"].name,
        "facts": {
            "title": report_title,
            "detailUrl": final,
            "period": clean_text(period.group(1)) if period else None,
            "country": clean_text(country.group(1)) if country else None,
            "attachments": ordered,
        },
    }


def list_daejeon(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    page = int(args.get("page") or 1)
    keyword = (args.get("keyword") or "").strip()
    url = f"https://council.daejeon.go.kr/svc/inf/TrainingReportList.do?pageNo={page}"
    html, final = client.fetch_text(url)
    items: list[dict[str, Any]] = []
    for m in re.finditer(
        r'href="(/svc/inf/TrainingReportView\.do\?[^"]+)"[^>]*>([\s\S]*?)</a>',
        html,
    ):
        title = clean_text(m.group(2))
        if not title:
            continue
        href = absolute("https://council.daejeon.go.kr", m.group(1))
        sn = re.search(r"bbsSn=(\d+)", href)
        items.append(
            item(
                provider="daejeon_council",
                title=title,
                detail_url=href,
                extra={"bbsSn": sn.group(1) if sn else None},
            )
        )
    if keyword:
        items = [it for it in items if keyword in (it.get("title") or "")]
    return {
        "provider": "daejeon_council",
        "source": PROVIDERS["daejeon_council"].name,
        "sourceUrl": final,
        "count": len(items),
        "items": items,
    }


def detail_daejeon(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    detail_url = (args.get("url") or "").strip()
    bbs_sn = (args.get("id") or "").strip()
    if not detail_url and bbs_sn:
        detail_url = (
            "https://council.daejeon.go.kr/svc/inf/TrainingReportView.do?"
            + urllib.parse.urlencode({"bbsSn": bbs_sn, "pageNo": "1"})
        )
    if not detail_url.startswith("https://council.daejeon.go.kr/"):
        raise FetchError("invalid_input", "daejeon detail requires official URL or --id bbsSn")
    html, final = client.fetch_text(detail_url)
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html)
    attachments: list[dict[str, str]] = []
    for m in re.finditer(r'href="(/bbs/FileDownLoadProc\.do\?flSn=\d+)"', html):
        url = absolute("https://council.daejeon.go.kr", m.group(1))
        attachments.append({"title": f"flSn={urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('flSn', [''])[0]}", "url": url, "type": "unknown"})
    return {
        "provider": "daejeon_council",
        "source": PROVIDERS["daejeon_council"].name,
        "facts": {
            "title": clean_text(title_m.group(1)) if title_m else None,
            "detailUrl": final,
            "attachments": attachments,
        },
    }


def list_gyeonggi(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    keyword = (args.get("keyword") or "").strip()
    url = PROVIDERS["gyeonggi_council"].list_url
    html, final = client.fetch_text(url)
    items: list[dict[str, Any]] = []
    for m in re.finditer(
        r'href="(/site/main/board/training_resrep/\d+\?[^"]*)"[^>]*>([\s\S]*?)</a>',
        html,
    ):
        title = clean_text(m.group(2))
        if not title:
            continue
        items.append(
            item(
                provider="gyeonggi_council",
                title=title,
                detail_url=absolute("https://www.ggc.go.kr", m.group(1)),
            )
        )
    if keyword:
        items = [it for it in items if keyword in (it.get("title") or "")]
    return {
        "provider": "gyeonggi_council",
        "source": PROVIDERS["gyeonggi_council"].name,
        "sourceUrl": final,
        "count": len(items),
        "items": items,
    }


def detail_gyeonggi(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    detail_url = (args.get("url") or "").strip()
    if not detail_url.startswith("https://www.ggc.go.kr/site/main/board/training_resrep/"):
        raise FetchError("invalid_input", "gyeonggi detail requires official training_resrep URL")
    html, final = client.fetch_text(detail_url)
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html)
    attachments = []
    for m in re.finditer(r'href="(/site/main/file/download/uu/[^"]+)"', html):
        attachments.append(
            {
                "title": "download",
                "url": absolute("https://www.ggc.go.kr", m.group(1)),
                "type": "unknown",
            }
        )
    return {
        "provider": "gyeonggi_council",
        "source": PROVIDERS["gyeonggi_council"].name,
        "facts": {
            "title": clean_text(title_m.group(1)) if title_m else None,
            "detailUrl": final,
            "attachments": attachments,
        },
    }


def list_gyeongbuk(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    keyword = (args.get("keyword") or "국외출장").strip()
    url = PROVIDERS["gyeongbuk_council"].list_url
    html, final = client.fetch_text(url)
    items: list[dict[str, Any]] = []
    for m in re.finditer(
        r"href\s*=\s*(['\"])([^'\"]*reform=view[^'\"]*bbs_id=notice[^'\"]*)\1([^>]*)>",
        html,
        re.I,
    ):
        href = m.group(2)
        attrs = m.group(3) or ""
        title_m = re.search(r"title\s*=\s*(['\"])(.*?)\1", attrs, re.I | re.S)
        title = clean_text(title_m.group(2)) if title_m else ""
        if "출장" not in title:
            continue
        items.append(
            item(
                provider="gyeongbuk_council",
                title=title,
                detail_url=absolute("https://council.gb.go.kr/", href),
            )
        )
    # unique
    dedup = {it["detailUrl"]: it for it in items}
    items = list(dedup.values())
    if keyword:
        items = [it for it in items if keyword in (it.get("title") or "")]
    return {
        "provider": "gyeongbuk_council",
        "source": PROVIDERS["gyeongbuk_council"].name,
        "sourceUrl": final,
        "count": len(items),
        "items": items,
        "notes": ["Filtered notice-board posts that mention 출장."],
    }


def detail_gyeongbuk(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    detail_url = (args.get("url") or "").strip()
    if not detail_url.startswith("https://council.gb.go.kr/"):
        raise FetchError("invalid_input", "gyeongbuk detail requires official council.gb.go.kr URL")
    html, final = client.fetch_text(detail_url)
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html)
    attachments = []
    for m in re.finditer(r'href="([^"]+)"', html):
        href = unescape(m.group(1))
        if re.search(r"/kr/bbs/download|doc\.html\?fn=", href):
            attachments.append(
                {
                    "title": href.rsplit("/", 1)[-1][:80],
                    "url": absolute("https://council.gb.go.kr/", href),
                    "type": "unknown",
                }
            )
    uniq = {a["url"]: a for a in attachments}
    return {
        "provider": "gyeongbuk_council",
        "source": PROVIDERS["gyeongbuk_council"].name,
        "facts": {
            "title": clean_text(title_m.group(1)) if title_m else None,
            "detailUrl": final,
            "attachments": list(uniq.values()),
        },
    }


def detail_mpm(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    html, final = client.fetch_text(PROVIDERS["mpm"].list_url)
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html)
    links = []
    for m in re.finditer(r'href="([^"]+)"[^>]*>([^<]{0,40})', html):
        label = clean_text(m.group(2))
        href = unescape(m.group(1))
        if re.search(r"BTIS|국외출장|open\.go\.kr|여비", label + href, re.I):
            links.append({"label": label or href, "url": absolute("https://www.mpm.go.kr", href)})
    return {
        "provider": "mpm",
        "source": PROVIDERS["mpm"].name,
        "facts": {
            "title": clean_text(title_m.group(1)) if title_m else None,
            "detailUrl": final,
            "relatedLinks": links[:20],
        },
        "notes": [
            "This surface explains the overseas-trip policy and BTIS registration duty.",
            "It is not a bulk public report board.",
        ],
    }


def detail_mois(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    html, final = client.fetch_text(PROVIDERS["mois"].list_url)
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html)
    attachments = []
    for m in re.finditer(r'href="(/cmm/fms/FileDown\.do\?[^"]+)"', html):
        attachments.append(
            {
                "title": "FileDown",
                "url": absolute("https://www.mois.go.kr", m.group(1)),
                "type": "unknown",
            }
        )
    return {
        "provider": "mois",
        "source": PROVIDERS["mois"].name,
        "facts": {
            "title": clean_text(title_m.group(1)) if title_m else None,
            "detailUrl": final,
            "attachments": attachments,
        },
        "notes": [
            "Pinned verified policy article: processing standard for illegal overseas local-gov trips.",
        ],
    }



def providers_payload() -> dict[str, Any]:
    return {
        "count": len(PROVIDERS),
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "kind": p.kind,
                "description": p.description,
                "listUrl": p.list_url,
                "supportsList": p.supports_list,
                "supportsDetail": p.supports_detail,
                "notes": p.notes,
            }
            for p in PROVIDERS.values()
        ],
    }


LIST_HANDLERS: dict[str, ProviderFn] = {
    "nec": list_nec,
    "acrc": list_acrc,
    "open_portal": list_open_portal,
    "daegu_council": list_daegu,
    "daejeon_council": list_daejeon,
    "gyeonggi_council": list_gyeonggi,
    "gyeongbuk_council": list_gyeongbuk,
}

DETAIL_HANDLERS: dict[str, ProviderFn] = {
    "acrc": detail_acrc,
    "daegu_council": detail_daegu,
    "daejeon_council": detail_daejeon,
    "gyeonggi_council": detail_gyeonggi,
    "gyeongbuk_council": detail_gyeongbuk,
    "mpm": detail_mpm,
    "mois": detail_mois,
}



DISCOVERY_SEEDS = [
    # Federated metadata (always try first for unknown agency keywords)
    {
        "id": "open_portal",
        "name": "정보공개포털",
        "kind": "federated_search",
        "list_url": "https://www.open.go.kr/othicInfo/infoList/infoList.do",
        "notes": "mustKeyword JSON 메타. 원문 파일 URL은 제한적일 수 있음.",
    },
    # Known high-signal board URL patterns for active expansion
    {
        "id": "seed_nec",
        "name": "중앙선거관리위원회",
        "kind": "agency_board",
        "list_url": "https://www.nec.go.kr/site/nec/ex/bbs/List.do?cbIdx=1107",
    },
    {
        "id": "seed_acrc",
        "name": "국민권익위원회 국외출장 현황",
        "kind": "agency_board",
        "list_url": "https://www.acrc.go.kr/board.es?mid=a10502060000&bid=1000",
    },
    {
        "id": "seed_daegu",
        "name": "대구광역시의회",
        "kind": "council_board",
        "list_url": "https://council.daegu.go.kr/kr/bbs?bbs_id=overseas",
    },
    {
        "id": "seed_daejeon",
        "name": "대전광역시의회",
        "kind": "council_board",
        "list_url": "https://council.daejeon.go.kr/svc/inf/TrainingReportList.do",
    },
    {
        "id": "seed_ggc",
        "name": "경기도의회",
        "kind": "council_board",
        "list_url": "https://www.ggc.go.kr/site/main/board/training_resrep/list",
    },
    {
        "id": "seed_gb",
        "name": "경상북도의회 공지",
        "kind": "council_board",
        "list_url": "https://council.gb.go.kr/kr/bbs?bbs_id=notice",
    },
]


def score_discovery_html(html: str, final_url: str) -> dict[str, Any]:
    text = html or ""
    keywords = len(
        re.findall(
            r"국외출장|공무국외|해외출장|국외연수|국외훈련|출장결과|출장보고|해외연수|training_resrep|TrainingReport",
            text,
            re.I,
        )
    )
    # Hard login wall signals only (not global nav "로그인" links)
    hard_login = bool(
        re.search(
            r"(로그인\s*페이지|본인인증|공동인증서|간편인증|password|type=\"password\"|type='password'|SSO\s*Login|로그인이 필요)",
            text,
            re.I,
        )
    ) or (len(text) < 2500 and bool(re.search(r"로그인|login", text, re.I)))
    attach_like = len(re.findall(r"Download|download|FileDown|fileDown|attach|\.pdf|\.hwp", text, re.I))
    view_like = len(
        re.findall(
            r"View\.do|reform=view|act=view|TrainingReportView|training_resrep/\d+|/view",
            text,
            re.I,
        )
    )
    status = "candidate"
    if hard_login and keywords == 0:
        status = "login_walled"
    elif keywords == 0 and view_like == 0:
        status = "low_signal"
    elif keywords > 0 and (attach_like > 0 or view_like > 0 or len(text) > 20000):
        status = "public_board_candidate"
    return {
        "url": final_url,
        "status": status,
        "keywordHits": keywords,
        "attachmentHints": attach_like,
        "viewHints": view_like,
        "loginish": hard_login,
        "title": clean_text(re.search(r"<title[^>]*>([^<]+)</title>", text).group(1)) if re.search(r"<title", text) else None,
    }


def discover_surfaces(client: Client, args: dict[str, Any]) -> dict[str, Any]:
    """Actively probe known seeds + optional user URL/host to find public trip-report boards.

    Login-walled systems are reported and excluded from recommendUse.
    """
    keyword = (args.get("keyword") or "국외출장").strip() or "국외출장"
    extra_urls = [u.strip() for u in (args.get("urls") or []) if u and u.strip()]
    results = []
    recommend = []
    excluded = []

    # open portal always, federated
    try:
        open_payload = list_open_portal(client, {"keyword": keyword, "page": 1})
        institutions = {}
        for it in open_payload.get("items") or []:
            inst = it.get("institution") or "unknown"
            institutions[inst] = institutions.get(inst, 0) + 1
        results.append(
            {
                "id": "open_portal",
                "status": "ok",
                "sourceUrl": open_payload.get("sourceUrl"),
                "count": open_payload.get("count"),
                "institutionHistogram": institutions,
                "sampleTitles": [it.get("title") for it in (open_payload.get("items") or [])[:5]],
            }
        )
        recommend.append("open_portal")
    except FetchError as exc:
        results.append({"id": "open_portal", "status": "error", "error": exc.mode, "message": str(exc)})

    # seed boards
    for seed in DISCOVERY_SEEDS:
        if seed["id"] == "open_portal":
            continue
        try:
            html, final = client.fetch_text(seed["list_url"])
            scored = score_discovery_html(html, final)
            scored.update({"id": seed["id"], "name": seed["name"], "kind": seed["kind"]})
            results.append(scored)
            if scored["status"] == "public_board_candidate":
                recommend.append(seed["id"])
            elif scored["status"] == "login_walled":
                excluded.append({"id": seed["id"], "reason": "login_walled"})
        except FetchError as exc:
            results.append({"id": seed["id"], "status": "error", "error": exc.mode, "message": str(exc), "url": seed["list_url"]})

    # optional user-supplied public URLs (still no arbitrary JS auth bypass)
    for url in extra_urls:
        host = urllib.parse.urlparse(url).netloc.lower()
        if not host.endswith(".go.kr") and not host.endswith(".or.kr") and "open.go.kr" not in host:
            excluded.append({"url": url, "reason": "host_not_public_gov_like"})
            continue
        try:
            html, final = client.fetch_text(url)
            scored = score_discovery_html(html, final)
            scored.update({"id": f"custom:{host}", "name": host, "kind": "custom_probe"})
            results.append(scored)
            if scored["status"] == "public_board_candidate":
                recommend.append(scored["id"])
            elif scored["status"] == "login_walled":
                excluded.append({"id": scored["id"], "reason": "login_walled"})
        except FetchError as exc:
            results.append({"id": f"custom:{host}", "status": "error", "error": exc.mode, "message": str(exc), "url": url})

    # map recommend seed ids to built-in providers when available
    seed_to_provider = {
        "seed_nec": "nec",
        "seed_acrc": "acrc",
        "seed_daegu": "daegu_council",
        "seed_daejeon": "daejeon_council",
        "seed_ggc": "gyeonggi_council",
        "seed_gb": "gyeongbuk_council",
        "open_portal": "open_portal",
    }
    use_providers = []
    for rid in recommend:
        use_providers.append(seed_to_provider.get(rid, rid))

    return {
        "keyword": keyword,
        "results": results,
        "recommendUse": sorted(set(use_providers)),
        "excludedLoginWalled": excluded,
        "expansionHints": [
            "Unknown ministry/council: start with open_portal keyword search and collect PROC_INSTT_NM histogram.",
            "From institution names, open that org's 정보공개/사전정보공표/자료실 and look for 공무국외출장|출장결과|국외훈련 boards.",
            "Accept only read-only public HTML/JSON surfaces. If login/SSO/cert wall appears, mark login_walled and stop.",
            "When a new public board is found, record list URL, pagination param, detail linker, attachment pattern, then add a provider recipe.",
            "Never automate CAPTCHA, paid FOI submission, or password entry.",
        ],
        "notAdjudication": "Discovery only. Not a corruption determination.",
    }


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Multi-agency overseas trip report discovery")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("providers", help="List verified providers")

    disc = sub.add_parser("discover", help="Probe public boards / expand unknown agencies")
    disc.add_argument("--keyword", default="국외출장")
    disc.add_argument("--urls", default="", help="Comma-separated optional public .go.kr URLs to probe")
    disc.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)

    lp = sub.add_parser("list", help="List items from a provider")
    lp.add_argument("--provider", required=True, choices=sorted(PROVIDERS))
    lp.add_argument("--keyword")
    lp.add_argument("--page", type=int, default=1)
    lp.add_argument("--max-pages", type=int, default=3)
    lp.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)

    dp = sub.add_parser("detail", help="Fetch one detail/policy surface")
    dp.add_argument("--provider", required=True, choices=sorted(PROVIDERS))
    dp.add_argument("--id", help="Provider-specific id (bcIdx/list_no/uid/bbsSn)")
    dp.add_argument("--url", help="Official detail URL when required")
    dp.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)

    sp = sub.add_parser("search", help="Keyword search across list-capable providers")
    sp.add_argument("--keyword", required=True)
    sp.add_argument(
        "--providers",
        default="nec,acrc,open_portal,daegu_council,daejeon_council,gyeonggi_council,gyeongbuk_council",
        help="Comma-separated provider ids",
    )
    sp.add_argument("--max-pages", type=int, default=1)
    sp.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.cmd == "providers":
            print(json.dumps(providers_payload(), ensure_ascii=False, indent=2))
            return 0

        if args.cmd == "discover":
            client = Client(timeout=getattr(args, "timeout", DEFAULT_TIMEOUT))
            urls = [u.strip() for u in (args.urls or "").split(",") if u.strip()]
            result = discover_surfaces(client, {"keyword": args.keyword, "urls": urls})
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0


        client = Client(timeout=getattr(args, "timeout", DEFAULT_TIMEOUT))
        if args.cmd == "list":
            handler = LIST_HANDLERS.get(args.provider)
            if not handler:
                if args.provider in DETAIL_HANDLERS:
                    raise FetchError(
                        "unsupported_operation",
                        f"{args.provider} has no list surface; use detail/providers notes",
                    )
                raise FetchError("unsupported institution", f"unknown provider {args.provider}")
            result = handler(
                client,
                {
                    "keyword": args.keyword,
                    "page": args.page,
                    "max_pages": args.max_pages,
                },
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0

        if args.cmd == "detail":
            # NEC detail is constructible without extra fetch for URL validation path
            if args.provider == "nec":
                bc = (args.id or "").strip()
                if not bc and args.url:
                    m = re.search(r"bcIdx=(\d+)", args.url)
                    bc = m.group(1) if m else ""
                if not bc:
                    raise FetchError("invalid_input", "nec detail requires --id bcIdx")
                detail = f"https://www.nec.go.kr/site/nec/ex/bbs/View.do?cbIdx=1107&bcIdx={bc}"
                html, final = client.fetch_text(detail)
                dl = re.findall(r'href="(/common/board/Download\.do\?[^"]+)"', html)
                file_names = re.findall(r'title="([^"]+?)\s*파일다운로드"', html)
                attachments = []
                for i, href in enumerate(dl):
                    name = clean_text(file_names[i]) if i < len(file_names) else "attachment"
                    url = absolute("https://www.nec.go.kr", href)
                    attachments.append(
                        {
                            "title": name,
                            "url": url,
                            "type": "pdf" if name.lower().endswith(".pdf") else "unknown",
                        }
                    )
                title = None
                tm = re.search(r'class="tit"[^>]*>([\s\S]*?)</', html)
                if tm:
                    title = clean_text(tm.group(1))
                if not title:
                    tm = re.search(r"<title[^>]*>([^<]+)</title>", html)
                    title = clean_text(tm.group(1)) if tm else None
                result = {
                    "provider": "nec",
                    "source": PROVIDERS["nec"].name,
                    "facts": {
                        "title": title,
                        "detailUrl": final,
                        "bcIdx": bc,
                        "attachments": attachments,
                    },
                }
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 0

            handler = DETAIL_HANDLERS.get(args.provider)
            if not handler:
                raise FetchError("unsupported_operation", f"{args.provider} detail not implemented")
            result = handler(client, {"id": args.id, "url": args.url})
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0

        if args.cmd == "search":
            provider_ids = [x.strip() for x in args.providers.split(",") if x.strip()]
            results = []
            errors = []
            for pid in provider_ids:
                handler = LIST_HANDLERS.get(pid)
                if not handler:
                    errors.append({"provider": pid, "error": "no list handler"})
                    continue
                try:
                    payload = handler(
                        client,
                        {"keyword": args.keyword, "page": 1, "max_pages": args.max_pages},
                    )
                    results.append(
                        {
                            "provider": pid,
                            "count": payload.get("count"),
                            "sourceUrl": payload.get("sourceUrl") or PROVIDERS[pid].list_url,
                            "items": payload.get("items") or [],
                        }
                    )
                except FetchError as exc:
                    errors.append({"provider": pid, "error": exc.mode, "message": str(exc)})
            print(
                json.dumps(
                    {
                        "keyword": args.keyword,
                        "results": results,
                        "errors": errors,
                        "notAdjudication": (
                            "Discovery only. Do not treat matches as findings of waste, illegality, or corruption."
                        ),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0

        parser.error(f"unknown command {args.cmd}")
        return 2
    except FetchError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "failureMode": exc.mode,
                    "error": str(exc),
                    "url": exc.url,
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
