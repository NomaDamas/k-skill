"""Query KOMSA MTIS ferry information through k-skill-proxy."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROXY = "https://k-skill-proxy.nomadamas.org"


def proxy_base_url(value=None, env=None):
    env = os.environ if env is None else env
    candidate = (value or env.get("KSKILL_PROXY_BASE_URL") or DEFAULT_PROXY).strip()
    if candidate.casefold() in {"off", "false", "0", "none"}:
        raise ValueError("KSKILL_PROXY_BASE_URL is disabled.")
    return candidate.rstrip("/")


def query(dataset, params, *, base_url=None, read_json=None):
    url = f"{proxy_base_url(base_url)}/v1/komsa/ferry/{urllib.parse.quote(dataset, safe='')}"
    query_string = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    request = urllib.request.Request(
        f"{url}?{query_string}",
        headers={"Accept": "application/json", "User-Agent": "k-skill-komsa-ferry-info/1.0"},
        method="GET",
    )
    if read_json:
        return read_json(request)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"error": f"HTTP {error.code}", "message": body}
        raise RuntimeError(json.dumps(payload, ensure_ascii=False)) from error


def parser():
    result = argparse.ArgumentParser(description="KOMSA MTIS 연안여객선 정보 조회")
    result.add_argument("dataset", choices=["schedules", "vessels", "ports", "license-routes", "operation-routes", "status"])
    result.add_argument("--date")
    result.add_argument("--vessel")
    result.add_argument("--route")
    result.add_argument("--port")
    result.add_argument("--page", default="1")
    result.add_argument("--limit", default="10")
    result.add_argument("--proxy-base-url")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    params = {
        "date": args.date,
        "vessel": args.vessel,
        "route": args.route,
        "port": args.port,
        "page": args.page,
        "limit": args.limit,
    }
    try:
        print(json.dumps(query(args.dataset, params, base_url=args.proxy_base_url), ensure_ascii=False, indent=2))
        return 0
    except (ValueError, RuntimeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
