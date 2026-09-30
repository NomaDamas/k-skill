import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SOURCE_ID, SOURCE_URL, TENORS, TENOR_META, date, days, normalize, parseEcos, sha256, shift, type Observation, type Receipt, type Tenor, type WindowReceipt } from './core.mjs';

interface CacheData {version:1;storedAt:string;tenor:Tenor;from:string;to:string;raw:string;rawSha256:string}
interface CacheEnvelope {data:CacheData;digest:string}
export interface RequestResult {text:string;attempts:number}
class Fatal extends Error{}
class RequestFailure extends Error {constructor(message:string,readonly attempts:number){super(message);}}
const transient=(status:number):boolean=>[408,425,429].includes(status)||status>=500;

export async function request(url:string,get:typeof fetch=fetch,pause:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms)),validate?:(text:string)=>void):Promise<RequestResult>{
  let last='unknown error';
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const res=await get(url,{signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});
      if(!res.ok){if(!transient(res.status))throw new Fatal(`HTTP ${res.status}`);throw Error(`HTTP ${res.status}`);}
      const text=await res.text();if(text.length>2_000_000)throw new Fatal('Response too large');JSON.parse(text);validate?.(text);
      return {text,attempts:attempt};
    }catch(e){
      last=e instanceof Error?e.message:String(e);
      if(e instanceof Fatal)throw new RequestFailure(last,attempt);
      if(attempt===3)throw new RequestFailure(`${last} after 3 attempts`,attempt);
      await pause(300*2**(attempt-1));
    }
  }
  throw Error(last);
}

export const parse=parseEcos;

export interface QueryWindow {from:string;to:string}
export function pointWindows(points:string[],maxLag:number):QueryWindow[]{
  const unique=new Map<string,QueryWindow>();
  if(!Number.isInteger(maxLag)||maxLag<0||maxLag>14)throw Error('maxLag must be 0..14 calendar days');
  for(const point of points){
    date(point);
    for(const window of rangeWindows(shift(point,-maxLag),point))unique.set(`${window.from}/${window.to}`,window);
  }
  return [...unique.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
}
export function rangeWindows(from:string,to:string):QueryWindow[]{
  date(from);date(to);if(from>to)throw Error('Invalid collection range');const result:QueryWindow[]=[];
  for(let start=from;start<=to;start=shift(start,10)){const end=shift(start,9)<to?shift(start,9):to;result.push({from:start,to:end});}
  return result;
}
async function atomic(path:string,content:string):Promise<void>{const temp=`${path}.${randomUUID()}.tmp`;try{await writeFile(temp,content);await rename(temp,path);}catch(e){await rm(temp,{force:true});throw e;}}
const cacheName=(tenor:Tenor,from:string,to:string):string=>`${tenor}-${from}-${to}.mjson`;

export async function collect(base:string,asOf:string,maxLag:number,cacheDir:string,useCache=true,get:typeof fetch=fetch,now:Date=new Date(),maxCacheAgeHours=168):Promise<{observations:Observation[];receipts:Receipt[]}>{
  date(base);date(asOf);if(!Number.isInteger(maxLag)||maxLag<0||maxLag>14)throw Error('maxLag must be 0..14 calendar days');
  if(base>=asOf)throw Error('Base must precede as-of');if(days(asOf,base)>366)throw Error('Comparison window must be 366 days or less');
  return collectWindows(pointWindows([base,asOf],maxLag),cacheDir,useCache,get,now,maxCacheAgeHours);
}

export async function collectWindows(inputSegments:QueryWindow[],cacheDir:string,useCache=true,get:typeof fetch=fetch,now:Date=new Date(),maxCacheAgeHours=168):Promise<{observations:Observation[];receipts:Receipt[]}>{
  if(!Array.isArray(inputSegments)||!inputSegments.length)throw Error('At least one query window is required');
  if(typeof cacheDir!=='string'||!cacheDir.trim())throw Error('cacheDir must be a non-empty path');
  if(!Number.isFinite(now.getTime()))throw Error('Invalid collection clock');
  if(!Number.isFinite(maxCacheAgeHours)||maxCacheAgeHours<0)throw Error('maxCacheAgeHours must be non-negative');
  const unique=new Map<string,QueryWindow>();for(const segment of inputSegments){if(!segment||typeof segment.from!=='string'||typeof segment.to!=='string')throw Error('Invalid query window');date(segment.from);date(segment.to);if(segment.from>segment.to||daysBetween(segment.from,segment.to)>10)throw Error('Query windows must contain 1..10 calendar days');unique.set(`${segment.from}/${segment.to}`,segment);}
  const retrievedAt=now.toISOString(),segments=[...unique.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));if(useCache)await mkdir(cacheDir,{recursive:true});
  const parts=await Promise.all(TENORS.map(async tenor=>{
    const observations:Observation[]=[];const raw:string[]=[];const rawSha256:string[]=[];const windowReceipts:WindowReceipt[]=[];const errors:string[]=[];
    for(const segment of segments){
      const file=join(cacheDir,cacheName(tenor,segment.from,segment.to));let liveError='',liveAttempts=0;
      try{
        const key=process.env.KSKILL_BOK_ECOS_API_KEY||'sample',meta=TENOR_META[tenor];
        const url=`https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(key)}/json/kr/1/10/817Y002/D/${segment.from.replaceAll('-','')}/${segment.to.replaceAll('-','')}/${meta.itemCode}`;
        const result=await request(url,get,undefined,text=>{parse(text,tenor,segment.from,segment.to);});liveAttempts=result.attempts;const rows=parse(result.text,tenor,segment.from,segment.to),digest=sha256(result.text);
        const data:CacheData={version:1,storedAt:retrievedAt,tenor,...segment,raw:result.text,rawSha256:digest};
        let cacheError:string|undefined;if(useCache)try{await atomic(file,JSON.stringify({data,digest:sha256(JSON.stringify(data))} satisfies CacheEnvelope));}catch(e){cacheError=`cache write failed (${e instanceof Error?e.message:String(e)})`;}
        observations.push(...rows);raw.push(result.text);rawSha256.push(digest);windowReceipts.push({...segment,status:'live',attempts:result.attempts,...(cacheError?{error:cacheError}:{})});continue;
      }catch(e){liveError=e instanceof Error?e.message:String(e);liveAttempts=e instanceof RequestFailure?e.attempts:Math.max(liveAttempts,1);}
      if(useCache)try{
        const envelope=JSON.parse(await readFile(file,'utf8')) as CacheEnvelope,data=envelope.data;
        const age=(now.getTime()-Date.parse(data?.storedAt))/3600000;
        if(!data||envelope.digest!==sha256(JSON.stringify(data))||data.version!==1||data.tenor!==tenor||data.from!==segment.from||data.to!==segment.to||data.rawSha256!==sha256(data.raw)||!Number.isFinite(age)||age<0||age>maxCacheAgeHours)throw Error('cache identity, hash, or age check failed');
        const rows=parse(data.raw,tenor,segment.from,segment.to);observations.push(...rows);raw.push(data.raw);rawSha256.push(data.rawSha256);
        windowReceipts.push({...segment,status:'cache',attempts:liveAttempts,cacheAgeHours:Math.round(age*100)/100,error:liveError});continue;
      }catch(e){errors.push(`${segment.from}..${segment.to}: ${liveError}; cache rejected (${e instanceof Error?e.message:String(e)})`);}
      else errors.push(`${segment.from}..${segment.to}: ${liveError}`);
      windowReceipts.push({...segment,status:'failed',attempts:liveAttempts,error:liveError});
    }
    const rows=normalize(observations),modes=new Set(windowReceipts.map(w=>w.status));
    const status:Receipt['status']=rows.length===0&&modes.has('failed')?'failed':modes.size===1?(modes.has('live')?'live':modes.has('cache')?'cache':'failed'):'mixed';
    const meta=TENOR_META[tenor];
    const receipt:Receipt={tenor,sourceId:SOURCE_ID,sourceUrl:SOURCE_URL,statCode:'817Y002',itemCode:meta.itemCode,itemName:meta.itemName,unit:'연%',cycle:'D',retrievedAt,status,raw,rawSha256,count:rows.length,first:rows[0]?.date??null,last:rows.at(-1)?.date??null,windows:windowReceipts,...(errors.length?{error:errors.join(' | ')}:{})};
    return {observations:rows,receipt};
  }));
  return {observations:normalize(parts.flatMap(p=>p.observations)),receipts:parts.map(p=>p.receipt)};
}

function daysBetween(from:string,to:string):number{return Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;}
