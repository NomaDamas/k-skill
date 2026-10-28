#!/usr/bin/env python3
import argparse, json, re, sys, urllib.parse, urllib.request
from html import unescape

HEADERS = {"User-Agent":"Mozilla/5.0", "Accept":"application/json,text/html;q=0.9,*/*;q=0.8"}

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        body = r.read()
        if not body:
            raise ValueError(f'빈 JSON 응답: {url}')
        return json.loads(body)

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

def parse_html_detail(url):
    html = fetch_text(url)
    title = re.search(r'<title>(.*?)</title>', html, re.S)
    meta = {}
    for m in re.finditer(r'<meta[^>]+(?:property|name)=["\']([^"\']+)["\'][^>]+content=["\']([^"\']*)["\']', html):
        key, value = m.group(1), unescape(m.group(2)).strip()
        if key in ('description', 'og:title', 'og:description', 'og:image'):
            meta[key] = value
    json_ld = []
    for m in re.finditer(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S):
        try:
            json_ld.append(json.loads(unescape(m.group(1))))
        except Exception:
            pass
    return {
        'source': url,
        'title': unescape(title.group(1)).strip() if title else meta.get('og:title'),
        'meta': meta,
        'json_ld': json_ld[:3],
    }


def cmd_search(args):
    sel=resolve_region(args.region) if args.region else None
    params=[]
    if sel: params.append(('in', f"{sel['name']}-{sel['id']}"))
    if args.keyword: params.append(('search', args.keyword))
    params.append(('_data','routes/kr.jobs._index'))
    url='https://www.daangn.com/kr/jobs/?'+urllib.parse.urlencode(params)
    data=fetch_json(url); arr=((data.get('jobsAllPage') or {}).get('jobPosts') or [])[:args.limit]
    items=[{'title':a.get('title'),'company':a.get('workplaceCompanyName'),'region':a.get('workplaceRegion'),
            'address':a.get('workplaceRoadNameAddress'),'salary':a.get('salary'),'salaryType':a.get('salaryType'),
            'workDays':a.get('workDays'),'workTimeStart':a.get('workTimeStart'),'workTimeEnd':a.get('workTimeEnd'),
            'closed':a.get('closed'),'url':absolute(a.get('href') or a.get('jobsWebDetailUrl'))} for a in arr]
    print_json({'source':url,'effective_region':data.get('searchRegion') or sel,'count':len(items),'items':items})

def cmd_detail(args):
    u=args.url.rstrip('/')+'/?_data=routes%2Fkr.jobs.%24job_post_id'
    try:
        data=fetch_json(u)
        print_json({'source':u,'jobPost':data.get('jobPost') or data})
    except Exception:
        detail = parse_html_detail(args.url)
        detail['data_source_attempted'] = u
        print_json(detail)

p=argparse.ArgumentParser(description='Daangn jobs read-only search/detail')
sub=p.add_subparsers(dest='cmd', required=True)
s=sub.add_parser('search'); s.add_argument('keyword', nargs='?'); s.add_argument('--region'); s.add_argument('--limit',type=int,default=10); s.set_defaults(func=cmd_search)
d=sub.add_parser('detail'); d.add_argument('url'); d.set_defaults(func=cmd_detail)
args=p.parse_args(); args.func(args)
