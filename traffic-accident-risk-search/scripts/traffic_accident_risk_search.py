import argparse, json, math, os, urllib.parse, urllib.request

DEFAULT_PROXY = "https://k-skill-proxy.nomadamas.org"

def distance_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2-lat1), math.radians(lon2-lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(math.sqrt(a))

def query(args, read_json=None):
    base = (args.proxy_base_url or os.getenv("KSKILL_PROXY_BASE_URL") or DEFAULT_PROXY).rstrip("/")
    route = "stats" if args.command == "stats" else "hotspots"
    params = {"category": args.category, "year": args.year, "sido": args.sido, "gugun": args.gugun, "page": args.page, "limit": args.limit}
    req = urllib.request.Request(f"{base}/v1/koroad/traffic-accident/{route}?{urllib.parse.urlencode(params)}", headers={"Accept":"application/json","User-Agent":"k-skill-traffic-accident-risk-search/1.0"})
    if read_json: return read_json(req)
    with urllib.request.urlopen(req, timeout=30) as response: return json.loads(response.read())

def parser():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("hotspots", "stats"):
        q = sub.add_parser(name)
        q.add_argument("--category", default="child")
        q.add_argument("--year", required=True)
        q.add_argument("--sido", required=True)
        q.add_argument("--gugun", required=True)
        q.add_argument("--page", default="1")
        q.add_argument("--limit", default="10")
        q.add_argument("--proxy-base-url")
    return p

if __name__ == "__main__":
    print(json.dumps(query(parser().parse_args()), ensure_ascii=False, indent=2))
