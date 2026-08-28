import argparse, json, os, urllib.parse, urllib.request

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--cargo-management-number", dest="cargo")
    p.add_argument("--hbl-no", dest="hbl")
    p.add_argument("--mbl-no", dest="mbl")
    p.add_argument("--bl-year", dest="year")
    p.add_argument("--proxy-base-url")
    a = p.parse_args()
    base = (a.proxy_base_url or os.getenv("KSKILL_PROXY_BASE_URL") or "https://k-skill-proxy.nomadamas.org").rstrip("/")
    params = {k: v for k, v in {"cargMtNo": a.cargo, "hblNo": a.hbl, "mblNo": a.mbl, "blYear": a.year}.items() if v}
    req = urllib.request.Request(f"{base}/v1/customs/cargo-clearance?{urllib.parse.urlencode(params)}", headers={"Accept":"application/json","User-Agent":"k-skill-customs-cargo-clearance/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        print(json.dumps(json.loads(response.read()), ensure_ascii=False, indent=2))
if __name__ == "__main__": main()
