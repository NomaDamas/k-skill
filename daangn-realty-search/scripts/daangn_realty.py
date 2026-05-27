#!/usr/bin/env python3
import argparse, json, re, sys, urllib.parse, urllib.request
from html import unescape

HEADERS = {"User-Agent":"Mozilla/5.0", "Accept":"application/json,text/html;q=0.9,*/*;q=0.8"}

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0", "Accept":"text/html"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode('utf-8', 'ignore')

def won(v):
    if v in (None, ''): return '-'
    try: return f"{int(float(v)):,}원"
    except Exception: return str(v)

def resolve_region(region):
    if not region: return None
    url = 'https://www.daangn.com/kr/api/v1/regions/keyword?keyword=' + urllib.parse.quote(region)
    data = fetch_json(url)
    locs = data.get('locations') or []
    if not locs: raise SystemExit(f'지역 후보 없음: {region}')
    # Exact dong/name match first, then Seoul depth-3, then first candidate.
    exact = [x for x in locs if region in (x.get('name'), x.get('name1'), x.get('name2'), x.get('name3'))]
    seoul = [x for x in locs if x.get('name1') == '서울특별시' and x.get('depth') == 3]
    sel = (exact or seoul or locs)[0]
    return sel

def region_param(sel):
    return urllib.parse.quote(f"{sel['name']}-{sel['id']}")

def absolute(href):
    if not href: return ''
    if href.startswith('http'): return href
    return 'https://www.daangn.com' + href

def print_json(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def norm_trade(t):
    if not t: return None
    return t

def cmd_search(args):
    sel = resolve_region(args.region) if args.region else None
    params=[]
    if sel: params.append(('in', f"{sel['name']}-{sel['id']}"))
    if args.sales_type: params.append(('salesType', args.sales_type))
    if args.trade_type: params.append(('tradeType', args.trade_type))
    if args.only_verified: params.append(('onlyVerified','true'))
    params.append(('_data','routes/kr.realty._index'))
    url='https://www.daangn.com/kr/realty/?'+urllib.parse.urlencode(params)
    data=fetch_json(url)
    arr=((data.get('realtyPosts') or {}).get('realtyPosts') or [])
    if args.keyword:
        arr=[a for a in arr if args.keyword.lower() in json.dumps(a, ensure_ascii=False).lower()]
    arr=arr[:args.limit]
    items=[]
    for a in arr:
        tr=(a.get('trades') or [{}])[0]
        items.append({'title':a.get('title'),'salesType':a.get('salesType') or a.get('salesTypeV2'),'trade':tr,
                      'area':a.get('area'),'areaPyeong':a.get('areaPyeong'),'totalManageCost':a.get('totalManageCost'),
                      'url':a.get('webUrl') or absolute(a.get('href'))})
    print_json({'source':url,'effective_region':data.get('searchRegion') or sel,'count':len(items),'items':items})

def cmd_detail(args):
    html=fetch_text(args.url)
    lds=[]
    for m in re.finditer(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S):
        try: lds.append(json.loads(unescape(m.group(1))))
        except Exception: pass
    title=re.search(r'<title>(.*?)</title>', html, re.S)
    print_json({'source':args.url,'title':unescape(title.group(1)).strip() if title else None,'json_ld':lds[:3]})

p=argparse.ArgumentParser(description='Daangn realty read-only search/detail')
sub=p.add_subparsers(dest='cmd', required=True)
s=sub.add_parser('search'); s.add_argument('--region'); s.add_argument('--keyword'); s.add_argument('--sales-type'); s.add_argument('--trade-type'); s.add_argument('--only-verified',action='store_true'); s.add_argument('--limit',type=int,default=10); s.set_defaults(func=cmd_search)
d=sub.add_parser('detail'); d.add_argument('url'); d.set_defaults(func=cmd_detail)
args=p.parse_args(); args.func(args)
