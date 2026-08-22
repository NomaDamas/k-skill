#!/usr/bin/env python3
"""Bounded, read-only X search through the public Xquik REST contract."""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Callable, Mapping, Sequence, TextIO
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

API_BASE_URL = "https://xquik.com/api/v1"
API_CONTRACT = "2026-04-29"
API_KEY_ENV_NAMES = ("KSKILL_XQUIK_API_KEY", "XQUIK_API_KEY")
MAX_LIMIT = 100
MAX_ATTEMPTS = 3
TRANSIENT_STATUSES = {424, 429, 500, 502, 503, 504}
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{1,15}$")
LANGUAGE_RE = re.compile(r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$")
TWEET_ID_RE = re.compile(r"^[0-9]{15,20}$")
ERROR_CODE_RE = re.compile(r"^[a-z0-9_]{1,64}$")
BOUNDARY_OPEN = "<XQUIK_UNTRUSTED_X_CONTENT"
BOUNDARY_CLOSE = "</XQUIK_UNTRUSTED_X_CONTENT>"

JsonObject = dict[str, Any]
OpenUrl = Callable[..., Any]
Sleep = Callable[[float], None]
Jitter = Callable[[float, float], float]


@dataclass(frozen=True)
class XquikRequestError(Exception):
    code: str
    status: int | None = None
    retry_after: float | None = None

    def payload(self) -> JsonObject:
        result: JsonObject = {"error": self.code}
        if self.status is not None:
            result["status"] = self.status
        if self.retry_after is not None:
            result["retry_after_seconds"] = self.retry_after
        return result


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, _req, _fp, _code, _msg, _headers, _newurl):
        return None


DEFAULT_OPENER = build_opener(RejectRedirects()).open


def api_key_from_environment(environ: Mapping[str, str]) -> str:
    for name in API_KEY_ENV_NAMES:
        value = environ.get(name, "").strip()
        if value:
            return value
    raise XquikRequestError("missing_api_key")


def bounded_limit(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("limit must be an integer") from exc
    if not 1 <= parsed <= MAX_LIMIT:
        raise argparse.ArgumentTypeError(f"limit must be between 1 and {MAX_LIMIT}")
    return parsed


def nonnegative_integer(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("value must be an integer") from exc
    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be zero or greater")
    return parsed


def valid_username(value: str) -> str:
    username = value.removeprefix("@")
    if not USERNAME_RE.fullmatch(username):
        raise argparse.ArgumentTypeError("username must contain 1-15 letters, numbers, or underscores")
    return username


def valid_tweet_id(value: str) -> str:
    if not TWEET_ID_RE.fullmatch(value):
        raise argparse.ArgumentTypeError("tweet ID must contain 15-20 digits")
    return value


def valid_language(value: str) -> str:
    if not LANGUAGE_RE.fullmatch(value):
        raise argparse.ArgumentTypeError("language must be a language code such as ko or en")
    return value.lower()


def valid_date(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("date must use YYYY-MM-DD") from exc
    return value


def request_url(route: str, params: Mapping[str, Any] | None = None) -> str:
    query = urlencode([(key, value) for key, value in (params or {}).items() if value is not None])
    return f"{API_BASE_URL}{route}{'?' + query if query else ''}"


def _read_json(response: Any) -> Any:
    body = response.read()
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise XquikRequestError("invalid_json_response") from exc


def _error_code(payload: Any, fallback: str) -> str:
    if not isinstance(payload, dict):
        return fallback
    error = payload.get("error")
    if isinstance(error, str) and ERROR_CODE_RE.fullmatch(error):
        return error
    if isinstance(error, dict):
        code = error.get("code")
        if isinstance(code, str) and ERROR_CODE_RE.fullmatch(code):
            return code
    return fallback


def _retry_delay(
    headers: Mapping[str, str] | None,
    attempt: int,
    jitter: Jitter,
) -> float:
    retry_after = headers.get("Retry-After") if headers is not None else None
    if retry_after:
        try:
            return min(60.0, max(0.0, float(retry_after)))
        except ValueError:
            pass
    return min(8.0, (2**attempt) + jitter(0.0, 0.25))


def request_json(
    route: str,
    params: Mapping[str, Any] | None,
    api_key: str,
    *,
    opener: OpenUrl | None = None,
    sleeper: Sleep = time.sleep,
    jitter: Jitter = random.uniform,
) -> Any:
    open_url = opener or DEFAULT_OPENER
    url = request_url(route, params)
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "k-skill-x-twitter-search/1.0",
            "x-api-key": api_key,
            "xquik-api-contract": API_CONTRACT,
        },
        method="GET",
    )

    for attempt in range(MAX_ATTEMPTS):
        try:
            with open_url(request, timeout=30) as response:
                return _read_json(response)
        except HTTPError as exc:
            try:
                payload = _read_json(exc)
            except XquikRequestError:
                payload = None
            code = _error_code(payload, f"http_{exc.code}")
            retry_limit = 2 if exc.code == 409 else MAX_ATTEMPTS
            is_transient = exc.code in TRANSIENT_STATUSES or exc.code == 409 or 500 <= exc.code <= 599
            if is_transient and attempt + 1 < retry_limit:
                sleeper(_retry_delay(exc.headers, attempt, jitter))
                continue
            retry_after = _retry_delay(exc.headers, attempt, jitter) if exc.code == 429 else None
            raise XquikRequestError(code, exc.code, retry_after) from None
        except (TimeoutError, URLError):
            if attempt + 1 < MAX_ATTEMPTS:
                sleeper(_retry_delay(None, attempt, jitter))
                continue
            raise XquikRequestError("network_error") from None

    raise XquikRequestError("network_error")


def _safe_boundary_text(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return value.replace(BOUNDARY_OPEN, "[XQUIK_UNTRUSTED_X_CONTENT").replace(
        BOUNDARY_CLOSE,
        "[/XQUIK_UNTRUSTED_X_CONTENT]",
    )


def _boundary(kind: str, identity: str, value: Any) -> str | None:
    safe = _safe_boundary_text(value)
    if safe is None:
        return None
    safe_identity = re.sub(r"[^A-Za-z0-9_-]", "_", identity) or "unknown"
    return (
        f'<XQUIK_UNTRUSTED_X_CONTENT source="{kind}" id="{safe_identity}">\n'
        f"{safe}\n{BOUNDARY_CLOSE}"
    )


def _integer(data: Mapping[str, Any], *names: str) -> int | None:
    for name in names:
        value = data.get(name)
        if isinstance(value, int) and not isinstance(value, bool):
            return value
    return None


def _string(data: Mapping[str, Any], *names: str) -> str | None:
    for name in names:
        value = data.get(name)
        if isinstance(value, str) and value:
            return value
    return None


def normalize_tweet(tweet: Mapping[str, Any]) -> JsonObject:
    tweet_id = _string(tweet, "id")
    if tweet_id is None or not TWEET_ID_RE.fullmatch(tweet_id):
        raise XquikRequestError("invalid_tweet_response")
    result: JsonObject = {"id": tweet_id}
    content = _boundary("tweet", tweet_id, tweet.get("text"))
    if content is not None:
        result["content"] = content

    author = tweet.get("author")
    username: str | None = None
    if isinstance(author, dict):
        username = _string(author, "username", "userName")
        public_author: JsonObject = {}
        if username and USERNAME_RE.fullmatch(username):
            public_author["username"] = username
        display_name = _boundary("display_name", tweet_id, author.get("name"))
        if display_name is not None:
            public_author["display_name"] = display_name
        if public_author:
            result["author"] = public_author

    if username and USERNAME_RE.fullmatch(username) and TWEET_ID_RE.fullmatch(tweet_id):
        result["url"] = f"https://x.com/{username}/status/{tweet_id}"

    created_at = _string(tweet, "created_at", "createdAt")
    if created_at is not None:
        result["created_at"] = created_at

    metric_names = {
        "likes": ("like_count", "likeCount"),
        "reposts": ("retweet_count", "retweetCount"),
        "replies": ("reply_count", "replyCount"),
        "quotes": ("quote_count", "quoteCount"),
        "views": ("view_count", "viewCount"),
        "bookmarks": ("bookmark_count", "bookmarkCount"),
    }
    metrics = {
        target: value
        for target, names in metric_names.items()
        if (value := _integer(tweet, *names)) is not None
    }
    if metrics:
        result["metrics"] = metrics
    return result


def normalize_search(payload: Any, query: str) -> JsonObject:
    if not isinstance(payload, dict):
        raise XquikRequestError("invalid_search_response")
    tweets = payload.get("tweets")
    if not isinstance(tweets, list) or not all(isinstance(item, dict) for item in tweets):
        raise XquikRequestError("invalid_search_response")
    has_more = payload.get("has_more", payload.get("has_next_page"))
    if not isinstance(has_more, bool):
        raise XquikRequestError("invalid_search_response")
    items = [normalize_tweet(item) for item in tweets]
    result: JsonObject = {
        "source": {
            "provider": "Xquik",
            "endpoint": "/api/v1/x/tweets/search",
            "query": query,
            "contract": API_CONTRACT,
        },
        "items": items,
        "has_more": has_more,
    }
    next_cursor = _string(payload, "next_cursor", "nextCursor")
    if next_cursor:
        result["next_cursor"] = next_cursor
    return result


def normalize_user(payload: Any, requested_username: str) -> JsonObject:
    if not isinstance(payload, dict):
        raise XquikRequestError("invalid_user_response")
    user_id = _string(payload, "id") or "unknown"
    username = _string(payload, "username", "userName")
    user: JsonObject = {"id": user_id}
    if username and USERNAME_RE.fullmatch(username):
        user["username"] = username
        user["url"] = f"https://x.com/{username}"
    for source_name, target_name in (
        ("followers", "followers"),
        ("following", "following"),
        ("statuses_count", "posts"),
        ("statusesCount", "posts"),
    ):
        value = _integer(payload, source_name)
        if value is not None and target_name not in user:
            user[target_name] = value
    for source_name, target_name in (("name", "display_name"), ("description", "bio")):
        content = _boundary(target_name, user_id, payload.get(source_name))
        if content is not None:
            user[target_name] = content
    verified = payload.get("verified", payload.get("is_verified", payload.get("isVerified")))
    if isinstance(verified, bool):
        user["verified"] = verified
    return {
        "source": {
            "provider": "Xquik",
            "endpoint": f"/api/v1/x/users/{requested_username}",
            "contract": API_CONTRACT,
        },
        "user": user,
    }


def normalize_tweet_lookup(payload: Any, tweet_id: str) -> JsonObject:
    if not isinstance(payload, dict):
        raise XquikRequestError("invalid_tweet_response")
    tweet = payload.get("tweet")
    if not isinstance(tweet, dict):
        raise XquikRequestError("invalid_tweet_response")
    response_id = _string(tweet, "id")
    if response_id != tweet_id:
        raise XquikRequestError("invalid_tweet_response")
    normalized_input = dict(tweet)
    author = payload.get("author")
    if "author" not in normalized_input and isinstance(author, dict):
        normalized_input["author"] = author
    return {
        "source": {
            "provider": "Xquik",
            "endpoint": f"/api/v1/x/tweets/{tweet_id}",
            "contract": API_CONTRACT,
        },
        "tweet": normalize_tweet(normalized_input),
    }


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    search = commands.add_parser("search", help="search public X posts")
    search.add_argument("--query", required=True)
    search.add_argument("--limit", type=bounded_limit, default=20)
    search.add_argument("--sort", choices=("latest", "top"), default="latest")
    search.add_argument("--language", type=valid_language)
    search.add_argument("--from-user", type=valid_username)
    search.add_argument("--since", type=valid_date)
    search.add_argument("--until", type=valid_date)
    search.add_argument("--min-likes", type=nonnegative_integer)
    search.add_argument("--cursor")

    user = commands.add_parser("user", help="read one public X profile")
    user.add_argument("--username", required=True, type=valid_username)

    tweet = commands.add_parser("tweet", help="read one public X post")
    tweet.add_argument("--id", required=True, type=valid_tweet_id)
    return root


def run_command(args: argparse.Namespace, api_key: str, requester: Callable[..., Any]) -> JsonObject:
    if args.command == "search":
        query = args.query.strip()
        if not query:
            raise XquikRequestError("missing_query")
        if args.since and args.until and args.since > args.until:
            raise XquikRequestError("invalid_date_range")
        params = {
            "q": query,
            "limit": args.limit,
            "queryType": args.sort.title(),
            "language": args.language,
            "fromUser": args.from_user,
            "sinceDate": args.since,
            "untilDate": args.until,
            "minFaves": args.min_likes,
            "cursor": args.cursor,
        }
        return normalize_search(requester("/x/tweets/search", params, api_key), query)
    if args.command == "user":
        route = f"/x/users/{quote(args.username, safe='')}"
        return normalize_user(requester(route, None, api_key), args.username)
    route = f"/x/tweets/{quote(args.id, safe='')}"
    return normalize_tweet_lookup(requester(route, None, api_key), args.id)


def main(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
    requester: Callable[..., Any] = request_json,
) -> int:
    try:
        args = parser().parse_args(argv)
        api_key = api_key_from_environment(os.environ if environ is None else environ)
        result = run_command(args, api_key, requester)
    except XquikRequestError as exc:
        print(json.dumps(exc.payload(), ensure_ascii=False, sort_keys=True), file=stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True), file=stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
