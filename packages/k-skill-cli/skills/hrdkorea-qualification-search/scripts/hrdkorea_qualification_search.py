import argparse, json, os, urllib.parse, urllib.request
def main():
    p=argparse.ArgumentParser(); p.add_argument("operation", choices=["exam-schedule","qualification-items"]); p.add_argument("--year",required=True); p.add_argument("--qualgb-cd"); p.add_argument("--jm-cd"); p.add_argument("--page",default="1"); p.add_argument("--limit",default="10"); p.add_argument("--proxy-base-url"); a=p.parse_args()
    base=(a.proxy_base_url or os.getenv("KSKILL_PROXY_BASE_URL") or "https://k-skill-proxy.nomadamas.org").rstrip("/")
    q={k:v for k,v in {"year":a.year,"qualgbCd":a.qualgb_cd,"jmCd":a.jm_cd,"page":a.page,"limit":a.limit}.items() if v}
    req=urllib.request.Request(f"{base}/v1/hrdkorea/qualification/{a.operation}?{urllib.parse.urlencode(q)}",headers={"Accept":"application/json","User-Agent":"k-skill-hrdkorea-qualification-search/1.0"})
    with urllib.request.urlopen(req,timeout=30) as r: print(json.dumps(json.loads(r.read()),ensure_ascii=False,indent=2))
if __name__=="__main__": main()
