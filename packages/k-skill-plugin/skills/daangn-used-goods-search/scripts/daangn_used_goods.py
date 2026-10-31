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


def cmd_search(args):
    params = []
    effective = None
    path = '/kr/buy-sell/'
    if args.region:
        effective = resolve_region(args.region)
        path = '/kr/buy-sell/all/'
        params.append(('in', f"{effective['name']}-{effective['id']}"))
    params.append(('search', args.keyword))
    if args.only_on_sale: params.append(('only_on_sale','true'))
    params.append(('_data','routes/kr.buy-sell._index'))
    url = 'https://www.daangn.com' + path + '?' + urllib.parse.urlencode(params)
    data = fetch_json(url)
    arr = (((data.get('allPage') or {}).get('fleamarketArticles')) or [])[:args.limit]
    print_json({
        'source': url,
        'effective_region': effective or data.get('region'),
        'count': len(arr),
        'items': [{
            'title': a.get('title'), 'price': a.get('price'), 'price_text': won(a.get('price')),
            'region': (a.get('region') or {}).get('name'), 'status': a.get('status'),
            'url': absolute(a.get('href') or a.get('webUrl')),
        } for a in arr]
    })

def cmd_detail(args):
    u = args.url.rstrip('/') + '/?_data=routes%2Fkr.buy-sell.%24buy_sell_id'
    data = fetch_json(u); p = data.get('product') or data.get('article') or data
    print_json({'source': u, 'product': p})

p=argparse.ArgumentParser(description='Daangn used-goods read-only search/detail')
sub=p.add_subparsers(dest='cmd', required=True)
s=sub.add_parser('search'); s.add_argument('keyword'); s.add_argument('--region'); s.add_argument('--limit',type=int,default=10); s.add_argument('--only-on-sale',action='store_true',default=True); s.set_defaults(func=cmd_search)
d=sub.add_parser('detail'); d.add_argument('url'); d.set_defaults(func=cmd_detail)
args=p.parse_args(); args.func(args)
