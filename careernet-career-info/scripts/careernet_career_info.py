import argparse, json, os, urllib.parse, urllib.request
def main():
    p=argparse.ArgumentParser(); s=p.add_subparsers(dest="operation",required=True)
    q=s.add_parser("search"); q.add_argument("--keyword"); q.add_argument("--page",default="1"); q.add_argument("--limit",default="10")
    d=s.add_parser("detail"); d.add_argument("--seq",required=True)
    p.add_argument("--proxy-base-url"); a=p.parse_args()
    base=(a.proxy_base_url or os.getenv("KSKILL_PROXY_BASE_URL") or "https://k-skill-proxy.nomadamas.org").rstrip("/")
    params={"keyword":getattr(a,"keyword",None),"page":getattr(a,"page",None),"limit":getattr(a,"limit",None),"seq":getattr(a,"seq",None)}
    params={k:v for k,v in params.items() if v is not None}
    req=urllib.request.Request(f"{base}/v1/careernet/career/{a.operation}?{urllib.parse.urlencode(params)}",headers={"Accept":"application/json","User-Agent":"k-skill-careernet-career-info/1.0"})
    with urllib.request.urlopen(req,timeout=30) as r: print(json.dumps(json.loads(r.read()),ensure_ascii=False,indent=2))
if __name__=="__main__": main()
