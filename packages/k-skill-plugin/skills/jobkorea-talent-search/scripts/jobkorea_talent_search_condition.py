from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from collections.abc import Iterator
from typing import Any

from jobkorea_talent_models import AJAX_PATH, BASE_URL, DEFAULT_UA, FIND_PATH


def fetch(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None) -> str:
    req_headers = {"User-Agent": DEFAULT_UA, "Referer": BASE_URL + FIND_PATH}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "ignore")


def extract_json_object(source: str, marker: str) -> dict[str, Any]:
    idx = source.find(marker)
    if idx < 0:
        raise RuntimeError(f"cannot find marker: {marker}")
    start = source.find("{", idx)
    if start < 0:
        raise RuntimeError("cannot find JSON object start")
    depth = 0
    in_string = False
    escape = False
    for pos in range(start, len(source)):
        ch = source[pos]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                loaded = json.loads(source[start : pos + 1])
                if not isinstance(loaded, dict):
                    raise RuntimeError("search condition was not a JSON object")
                return loaded
    raise RuntimeError("unterminated JSON object")


def iter_nodes(node: Any) -> Iterator[dict[str, Any]]:
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from iter_nodes(value)
    elif isinstance(node, list):
        for item in node:
            yield from iter_nodes(item)


def mark_matching_nodes(sc: dict[str, Any], top_key: str, labels: list[str]) -> list[str]:
    if not labels:
        return []
    section = sc.get(top_key)
    if section is None:
        return []
    wanted = [x.strip().lower() for x in labels if x.strip()]
    matched: list[str] = []
    for node in iter_nodes(section):
        title = str(node.get("t", ""))
        code = str(node.get("v", ""))
        title_l = title.lower()
        code_l = code.lower()
        if any(w == title_l or w == code_l or w in title_l for w in wanted):
            for key in ("s", "c", "use"):
                if key in node:
                    node[key] = 1
            matched.append(title or code)
    return matched


def build_search_condition(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, list[str]]]:
    first = fetch(BASE_URL + FIND_PATH)
    sc = extract_json_object(first, "var searchcondition =")

    sc["p"] = args.page
    sc["ps"] = args.limit
    sc["saveno"] = 0
    sc["ff"] = 0
    sc["sf"] = args.sort

    terms: list[dict[str, Any]] = []
    for kw in args.keyword:
        terms.append({"s": 1, "c": 1, "t": kw, "v": kw, "kwdtypecode": 1, "logictypecode": 0})
    for kw in args.and_keyword:
        terms.append({"s": 1, "c": 1, "t": kw, "v": kw, "kwdtypecode": 1, "logictypecode": 1})
    for kw in args.or_keyword:
        terms.append({"s": 1, "c": 1, "t": kw, "v": kw, "kwdtypecode": 1, "logictypecode": 3})
    for kw in args.exclude_keyword:
        terms.append({"s": 1, "c": 1, "t": kw, "v": kw, "kwdtypecode": 1, "logictypecode": 2})
    sc["totalkeywordlist"] = terms

    if terms:
        first_kw = terms[0]["t"]
        sc.setdefault("pfr", {}).setdefault("ck", {})["Keyword"] = first_kw
        sc["pfr"]["ck"]["KeywordType"] = 1
        sc["pfr"]["n"] = 1

    if args.career_min is not None:
        sc.setdefault("career", {})["s"] = str(args.career_min)
    if args.career_max is not None:
        sc.setdefault("career", {})["e"] = str(args.career_max)

    matched = {
        "job_category": mark_matching_nodes(sc, "jobtype", args.job_category),
        "work_area": mark_matching_nodes(sc, "workarea", args.work_area),
        "residential_area": mark_matching_nodes(sc, "residentialarea", args.residential_area),
    }
    return sc, matched


def post_search(sc: dict[str, Any]) -> str:
    body = urllib.parse.urlencode({"searchCondition": json.dumps(sc, ensure_ascii=False)}).encode()
    return fetch(
        BASE_URL + AJAX_PATH,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        },
    )
