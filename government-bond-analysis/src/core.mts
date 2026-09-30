import { createHash } from 'node:crypto';
import type { NewsEvidence } from './news.mjs';

export const TENORS=[2,3,5,10,20,30] as const;
export type Tenor=typeof TENORS[number];
export const TENOR_META:Record<Tenor,{itemCode:string;itemName:string}>={
  2:{itemCode:'010195000',itemName:'국고채(2년)'},
  3:{itemCode:'010200000',itemName:'국고채(3년)'},
  5:{itemCode:'010200001',itemName:'국고채(5년)'},
  10:{itemCode:'010210000',itemName:'국고채(10년)'},
  20:{itemCode:'010220000',itemName:'국고채(20년)'},
  30:{itemCode:'010230000',itemName:'국고채(30년)'}
};
export const ENGINE='korean-interest-rate-analysis/5' as const;
export const PACKET_VERSION=5 as const;
export const SOURCE_ID='한국은행 ECOS 817Y002' as const;
export const SOURCE_URL='https://ecos.bok.or.kr/' as const;
export const sha256=(s:string):string=>createHash('sha256').update(s).digest('hex');

export interface Observation {date:string;tenor:Tenor;value:number}
export type SourceStatus='live'|'cache'|'mixed'|'input'|'failed';
export interface WindowReceipt {from:string;to:string;status:'live'|'cache'|'failed';attempts:number;cacheAgeHours?:number;error?:string}
export interface Receipt {
  tenor:Tenor;sourceId:string;sourceUrl:string;statCode:string;itemCode:string;itemName:string;unit:string;cycle:string;
  retrievedAt:string;status:SourceStatus;raw:string[];rawSha256:string[];count:number;first:string|null;last:string|null;
  windows:WindowReceipt[];error?:string;
}
export interface Packet {version:5;engine:typeof ENGINE;asOf:string;base:string;maxLag:number;observations:Observation[];receipts:Receipt[];label:string;newsEvidence?:NewsEvidence}
export interface Point {requested:string;actual:string|null;lag:number|null;values:number[]|null;reason:string|null}
export interface Spread {name:string;current:number|null;previous:number|null;change:number|null}
export interface Analysis {status:'READY'|'INCOMPLETE'|'BLOCKED';current:Point;previous:Point;changes:number[]|null;spreads:Spread[];movement:string;notes:string[]}

export function date(value:string):string{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error(`Invalid date: ${value}`);
  const [y,m,d]=value.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw Error(`Invalid date: ${value}`);
  return value;
}
export const shift=(d:string,n:number):string=>{
  if(!Number.isInteger(n))throw Error('Date shift must be an integer');
  const [y,m,day]=date(d).split('-').map(Number);
  return new Date(Date.UTC(y,m-1,day+n)).toISOString().slice(0,10);
};
export const days=(a:string,b:string):number=>{
  const [ay,am,ad]=date(a).split('-').map(Number),[by,bm,bd]=date(b).split('-').map(Number);
  return (Date.UTC(ay,am-1,ad)-Date.UTC(by,bm-1,bd))/86400000;
};
export function kstToday(now:Date=new Date()):string{
  if(!Number.isFinite(now.getTime()))throw Error('Invalid clock');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const pick=(type:Intl.DateTimeFormatPartTypes):string=>parts.find(p=>p.type===type)?.value??'';
  return date(`${pick('year')}-${pick('month')}-${pick('day')}`);
}
export const bp=(a:number,b:number):number=>Math.round((a-b)*100*1e8)/1e8;

export function normalize(input:unknown):Observation[]{
  if(!Array.isArray(input))throw Error('Observations must be an array');
  const unique=new Map<string,Observation>();
  for(const item of input){
    if(!item||typeof item!=='object')throw Error('Invalid observation');
    const r=item as Partial<Observation>;
    if(typeof r.date!=='string'||!TENORS.includes(r.tenor as Tenor)||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value< -10||r.value>50)
      throw Error('Invalid tenor/value (expected yield in annual percent, -10..50)');
    const row:Observation={date:date(r.date),tenor:r.tenor as Tenor,value:r.value};
    const key=`${row.date}/${row.tenor}`,prior=unique.get(key);
    if(prior&&prior.value!==row.value)throw Error(`Conflicting duplicate ${key}`);
    unique.set(key,row);
  }
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.tenor-b.tenor);
}

export function parseEcos(raw:string,tenor:Tenor,start:string,end:string):Observation[]{
  date(start);date(end);if(start>end)throw Error('Invalid ECOS window');
  const doc=JSON.parse(raw) as {RESULT?:{CODE?:string;MESSAGE?:string};StatisticSearch?:{list_total_count?:number;row?:Record<string,string>[]}};
  if(doc.RESULT?.CODE==='INFO-200')return [];
  if(doc.RESULT)throw Error(`ECOS ${doc.RESULT.CODE??'unknown'}${doc.RESULT.MESSAGE?`: ${doc.RESULT.MESSAGE}`:''}`);
  const block=doc.StatisticSearch,rows=block?.row;
  if(!block||!Array.isArray(rows)||!Number.isInteger(block.list_total_count)||block.list_total_count!==rows.length||rows.length>10)throw Error('Incomplete or invalid ECOS response');
  const meta=TENOR_META[tenor];
  const seen=new Set<string>();return normalize(rows.map(r=>{
    if(!/^\d{8}$/.test(r.TIME??''))throw Error('ECOS invalid observation date');
    const d=`${r.TIME.slice(0,4)}-${r.TIME.slice(4,6)}-${r.TIME.slice(6,8)}`;date(d);
    if(seen.has(d))throw Error('ECOS duplicate observation date');seen.add(d);
    if(r.STAT_CODE!=='817Y002'||r.STAT_NAME!=='1.3.2.1. 시장금리(일별)'||r.ITEM_CODE1!==meta.itemCode||r.ITEM_NAME1!==meta.itemName||r.UNIT_NAME!=='연%'||d<start||d>end||!/^\-?\d+(?:\.\d+)?$/.test(r.DATA_VALUE??''))throw Error('ECOS metadata/unit/range mismatch');
    const value=Number(r.DATA_VALUE);if(!Number.isFinite(value))throw Error('ECOS non-numeric yield');
    return {date:d,tenor,value};
  }));
}

function validateReceipt(r:Receipt,rows:Observation[]):void{
  if(!r||typeof r!=='object'||!TENORS.includes(r.tenor)||!['live','cache','mixed','input','failed'].includes(r.status)||typeof r.retrievedAt!=='string'||!Number.isFinite(Date.parse(r.retrievedAt))||new Date(r.retrievedAt).toISOString()!==r.retrievedAt)throw Error('Invalid source receipt');
  const meta=TENOR_META[r.tenor];
  if(r.itemCode!==meta.itemCode||r.itemName!==meta.itemName||r.unit!=='연%'||r.cycle!=='D')throw Error(`${r.tenor}Y receipt metadata mismatch`);
  if(r.status==='input'){
    if(r.statCode!=='USER_CSV'||!r.sourceId.startsWith('사용자 제공 CSV: ')||r.sourceUrl!=='')throw Error(`${r.tenor}Y input source identity mismatch`);
  }else if(r.statCode!=='817Y002'||r.sourceId!==SOURCE_ID||r.sourceUrl!==SOURCE_URL)throw Error(`${r.tenor}Y ECOS source identity mismatch`);
  if(!Array.isArray(r.raw)||!Array.isArray(r.rawSha256)||r.raw.length!==r.rawSha256.length||r.raw.some((raw,i)=>typeof raw!=='string'||typeof r.rawSha256[i]!=='string'||!/^[a-f0-9]{64}$/.test(r.rawSha256[i])||sha256(raw)!==r.rawSha256[i]))throw Error(`${r.tenor}Y raw source hash mismatch`);
  if(!Array.isArray(r.windows)||r.windows.some(w=>{try{return !w||typeof w!=='object'||date(w.from)!==w.from||date(w.to)!==w.to||w.from>w.to||days(w.to,w.from)+1>10||!['live','cache','failed'].includes(w.status)||!Number.isInteger(w.attempts)||w.attempts<1||w.attempts>3||(w.status==='cache'&&(!Number.isFinite(w.cacheAgeHours)||w.cacheAgeHours!<0))||(w.status!=='cache'&&w.cacheAgeHours!==undefined);}catch{return true;}})||new Set(r.windows.map(w=>`${w.from}/${w.to}`)).size!==r.windows.length)throw Error(`${r.tenor}Y invalid source window`);
  const own=rows.filter(x=>x.tenor===r.tenor),first=own[0]?.date??null,last=own.at(-1)?.date??null;
  if(r.count!==own.length||r.first!==first||r.last!==last)throw Error(`${r.tenor}Y receipt count/range mismatch`);
  if(r.status==='failed'&&r.count!==0)throw Error(`${r.tenor}Y failed receipt contains observations`);
  if(r.status==='input'){
    if(r.windows.length!==0||r.raw.length!==1)throw Error(`${r.tenor}Y input receipt must contain one CSV and no network windows`);
  }else{
    if(!r.windows.length||r.raw.length!==r.windows.filter(w=>w.status!=='failed').length)throw Error(`${r.tenor}Y source window/raw mismatch`);
    const modes=new Set(r.windows.map(w=>w.status));
    const expected:SourceStatus=r.count===0&&modes.has('failed')?'failed':modes.size===1?(modes.has('live')?'live':modes.has('cache')?'cache':'failed'):'mixed';
    if(r.status!==expected)throw Error(`${r.tenor}Y receipt status mismatch`);
  }
  const fromRaw=r.status==='input'?csvRead(r.raw[0]).filter(x=>x.tenor===r.tenor):r.windows.flatMap((w,i)=>{
    if(w.status==='failed')return [];
    const rawIndex=r.windows.slice(0,i).filter(x=>x.status!=='failed').length;
    return parseEcos(r.raw[rawIndex],r.tenor,w.from,w.to);
  });
  if(JSON.stringify(normalize(fromRaw))!==JSON.stringify(own))throw Error(`${r.tenor}Y observations do not match source raw data`);
}

export function classify(short:number,long:number):string{
  const delta=long-short,eps=1e-7;
  if(Math.abs(delta)<eps)return Math.abs(short)<eps?'보합':short>0?'평행 상승':'평행 하락';
  const slope=delta>0?'스티프닝':'플래트닝';
  if(short<0&&long<0)return `Bull ${slope}`;
  if(short>0&&long>0)return `Bear ${slope}`;
  return `혼합 움직임 / ${slope}`;
}

export function analyze(p:Packet):Analysis{
  if(p.version!==PACKET_VERSION||p.engine!==ENGINE||typeof p.label!=='string'||!p.label.trim()||p.label.length>120||/[\u0000-\u001f\u007f]/.test(p.label))throw Error('Unsupported or invalid evidence packet');
  date(p.asOf);date(p.base);
  if(p.base>=p.asOf)throw Error('Base must precede as-of');
  if(days(p.asOf,p.base)>366)throw Error('Comparison window must be 366 days or less');
  if(!Number.isInteger(p.maxLag)||p.maxLag<0||p.maxLag>14)throw Error('maxLag must be 0..14 calendar days');
  const rows=normalize(p.observations);
  if(rows.some(r=>r.date>p.asOf))throw Error('Future observation after as-of');
  if(!Array.isArray(p.receipts)||p.receipts.length!==TENORS.length||p.receipts.some(r=>!r||typeof r!=='object')||new Set(p.receipts.map(r=>r.tenor)).size!==TENORS.length)throw Error('Exactly one source receipt is required per tenor');
  for(const r of p.receipts)validateReceipt(r,rows);
  const at=(requested:string):Point=>{
    const dates=[...new Set(rows.filter(r=>r.date<=requested).map(r=>r.date))].sort().reverse();
    const actual=dates.find(d=>TENORS.every(t=>rows.some(r=>r.date===d&&r.tenor===t)))??null;
    const lag=actual?days(requested,actual):null;
    const reason=!actual?'여섯 만기의 공통 관측일 없음':lag!>p.maxLag?`공통 관측일이 ${lag}일 전: 허용 ${p.maxLag}일 초과`:null;
    return {requested,actual,lag,values:reason?null:TENORS.map(t=>rows.find(r=>r.date===actual&&r.tenor===t)!.value),reason};
  };
  const current=at(p.asOf),previous=at(p.base);
  const comparable=!!current.values&&!!previous.values&&current.actual!==previous.actual;
  const changes=comparable?current.values!.map((v,i)=>bp(v,previous.values![i])):null;
  const spreads:Spread[]=[['5년−3년',5,3],['10년−5년',10,5],['10년−3년',10,3],['30년−10년',30,10]].map(([name,longTenor,shortTenor])=>{
    const l=TENORS.indexOf(longTenor as Tenor),s=TENORS.indexOf(shortTenor as Tenor);return {
    name:name as string,current:current.values?bp(current.values[l],current.values[s]):null,
    previous:previous.values?bp(previous.values[l],previous.values[s]):null,
    change:changes?Math.round((changes[l]-changes[s])*1e8)/1e8:null
  }});
  const notes:string[]=[current.reason,previous.reason].filter((v):v is string=>!!v);
  for(const r of p.receipts){
    if(r.status==='cache')notes.push(`${r.tenor}년: 검증된 로컬 캐시 사용`);
    if(r.status==='mixed')notes.push(`${r.tenor}년: 여러 조회 구간의 실시간·캐시·실패 상태가 혼재`);
    if(r.status==='failed')notes.push(`${r.tenor}년: 수집 실패${r.error?` (${r.error})`:''}`);
    const failed=r.windows.filter(w=>w.status==='failed');if(failed.length&&r.status!=='failed')notes.push(`${r.tenor}년: ${failed.length}개 조회 구간 실패, 확보된 공통 관측값만 사용`);
    const cacheWriteFailed=r.windows.filter(w=>w.status==='live'&&w.error?.startsWith('cache write failed'));if(cacheWriteFailed.length)notes.push(`${r.tenor}년: 실시간 원자료는 검증했으나 ${cacheWriteFailed.length}개 로컬 캐시 저장 실패`);
  }
  if(current.actual&&current.actual===previous.actual)notes.push('두 기준일이 같은 관측일로 정렬되어 기간 변화 계산을 차단했습니다.');
  if(current.values&&current.lag)notes.push(`현재 기준일은 ${current.actual} 공통 관측값으로 정렬했습니다.`);
  if(previous.values&&previous.lag)notes.push(`비교 기준일은 ${previous.actual} 공통 관측값으로 정렬했습니다.`);
  const shortIndex=TENORS.indexOf(3),longIndex=TENORS.indexOf(10);
  return {status:changes?'READY':current.values||previous.values?'INCOMPLETE':'BLOCKED',current,previous,changes,spreads,movement:changes?classify(changes[shortIndex],changes[longIndex]):'판정 불가',notes};
}

export function csvRead(text:string):Observation[]{
  if(text.length>10_000_000)throw Error('CSV exceeds 10 MB character limit');
  const withoutBom=text.replace(/^\uFEFF/,''),clean=withoutBom.replace(/(?:\r?\n)+$/,'');if(!clean.trim())throw Error('CSV is empty');
  const lines=clean.split(/\r?\n/);if(lines.shift()!=='date,tenor,yield_pct')throw Error('CSV header must be date,tenor,yield_pct');
  return normalize(lines.map((line,i)=>{
    const f=line.split(',');if(f.length!==3||f.some(v=>v.trim()!==v||v==='')||!/^\d+$/.test(f[1])||!/^-?\d+(\.\d+)?$/.test(f[2]))throw Error(`Invalid CSV line ${i+2}`);
    return {date:f[0],tenor:Number(f[1]),value:Number(f[2])};
  }));
}
