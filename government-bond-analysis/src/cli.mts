import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { collect, collectWindows, pointWindows, rangeWindows } from './collect.mjs';
import { ENGINE, PACKET_VERSION, TENOR_META, TENORS, analyze, bp, classify, csvRead, date, days, kstToday, sha256, shift, type Analysis, type Packet, type Receipt } from './core.mjs';
import { collectPolicyRate, dashboard, eventQueryWindows, monthComparisonDates, onOrAfter, onOrBefore, previousMonthEnd, previousQuarterEnd, previousYearEnd, trend, type CurveSnapshot, type DashboardResult, type TrendResult } from './modes.mjs';
import { analyzeNews, newsRead, newsTemplate, type NewsAnalysis } from './news.mjs';
import { writeArtifacts } from './render.mjs';
import { analyzeDual, DUAL_ENGINE, dualChat, dualSummary, writeDualArtifacts, type DualPacket } from './dual.mjs';
import { collectUst } from './ust.mjs';
import { readSchedule } from './schedule.mjs';

type Args=Record<string,string|boolean>;
function args(argv:string[]):Args{
  const out:Args={},allowed=new Set(['as-of','base','from-month','to-month','preset','event-date','lookback-sessions','out','input','replay','news-evidence','news-template','schedule-evidence','cache-dir','max-lag','no-cache','text','json','help','market']);
  for(let i=0;i<argv.length;i++){
    const x=argv[i];if(!x.startsWith('--'))throw Error(`Unknown argument: ${x}`);const k=x.slice(2);if(!allowed.has(k))throw Error(`Unknown option: --${k}`);
    if(Object.hasOwn(out,k))throw Error(`Duplicate option: --${k}`);
    if(['no-cache','text','json','help'].includes(k))out[k]=true;else{const v=argv[++i];if(!v||v.startsWith('--'))throw Error(`Missing value: --${k}`);out[k]=v;}
  }
  return out;
}
const usage=`Usage:
  node scripts/cli.mjs [--as-of YYYY-MM-DD] [--base YYYY-MM-DD] [--max-lag 0..14] [--text]
  node scripts/cli.mjs --from-month YYYY-MM --to-month YYYY-MM [--text]
  node scripts/cli.mjs --preset today|dashboard|previous-session|previous-week|previous-month-end|previous-quarter-end|year-start|policy-gap [--as-of YYYY-MM-DD] [--text]
  node scripts/cli.mjs --event-date YYYY-MM-DD [--text]
  node scripts/cli.mjs --lookback-sessions 5|20 [--as-of YYYY-MM-DD] [--text]
  node scripts/cli.mjs --input FILE.csv --as-of YYYY-MM-DD --base YYYY-MM-DD [--text]
  node scripts/cli.mjs --base YYYY-MM-DD --as-of YYYY-MM-DD --news-evidence FILE.mjson [--out DIR]
  node scripts/cli.mjs --news-template YYYY-MM-DD
  node scripts/cli.mjs --replay evidence.mjson [--text]
  node scripts/cli.mjs --market both [--as-of YYYY-MM-DD] [--base YYYY-MM-DD] [--schedule-evidence FILE.mjson] [--json|--out DIR]
  node scripts/cli.mjs --market both --replay evidence.mjson [--out DIR]
  Add --out DIR only when a persistent HTML/CSV/evidence report bundle is requested.
`;

function summary(p:Packet,a:Analysis,news:NewsAnalysis):Record<string,unknown>{
  return {result:a.status,requested:{base:p.base,asOf:p.asOf},observed:{base:a.previous.actual,asOf:a.current.actual},unit:'annual percent; changes/spreads in bp',rates:TENORS.map((tenor,i)=>({tenor:`${tenor}Y`,base:a.previous.values?.[i]??null,asOf:a.current.values?.[i]??null,changeBp:a.changes?.[i]??null})),spreads:a.spreads,movement:a.movement,notes:a.notes,news:news.status==='DISABLED'?null:{status:news.status,confidence:news.confidence,curveDirection:news.curveDirection,commentary:news.commentary,notes:news.notes,sources:[...news.eligible.map(x=>({disposition:'eligible',...x})),...news.context.map(x=>({disposition:'context',...x})),...news.excluded.map(x=>({disposition:'excluded',...x}))].map(x=>({disposition:x.disposition,publisher:x.publisher,title:x.title,url:x.url,publishedAt:x.publishedAt,sourceFingerprint:x.sourceFingerprint}))},sources:p.receipts.map(r=>({tenor:`${r.tenor}Y`,provider:r.sourceId,statCode:r.statCode,itemCode:r.itemCode,unit:r.unit,cycle:r.cycle,retrievedAt:r.retrievedAt,status:r.status,sourceUrl:r.sourceUrl,rawSha256:r.rawSha256}))};
}
function textSummary(p:Packet,a:Analysis,news:NewsAnalysis):string{
  const lines=[`상태: ${a.status}`,`요청일: ${p.base} → ${p.asOf}`,`관측일: ${a.previous.actual??'없음'} → ${a.current.actual??'없음'}`];
  if(a.changes&&a.previous.values&&a.current.values){
    TENORS.forEach((t,i)=>lines.push(`${t}년: ${a.previous.values![i].toFixed(3)}% → ${a.current.values![i].toFixed(3)}% (${a.changes![i]>=0?'+':''}${a.changes![i].toFixed(2)}bp)`));
    for(const s of a.spreads)lines.push(`${s.name}: ${s.previous?.toFixed(2)}bp → ${s.current?.toFixed(2)}bp (${(s.change??0)>=0?'+':''}${s.change?.toFixed(2)}bp)`);
    lines.push(`곡선 판정: ${a.movement}`);
  }
  if(a.notes.length)lines.push(...a.notes.map(n=>`주의: ${n}`));
  if(news.status!=='DISABLED'){lines.push(`뉴스 근거: ${news.status}${news.confidence?` / ${news.confidence}`:''}`,...news.commentary,...news.notes.map(n=>`주의: ${n}`));for(const source of [...news.eligible,...news.context,...news.excluded])lines.push(`기사: ${source.publisher} · ${source.title} · ${source.url}`);lines.push('뉴스 코멘트는 출처가 전한 시장 해석이며 ECOS 수치만으로 인과를 확정하지 않습니다.');}
  lines.push(`출처: ${[...new Set(p.receipts.map(r=>r.sourceUrl||r.sourceId))].join(', ')}`);
  return lines.join('\n');
}
function snapshotLines(label:string,s:CurveSnapshot):string[]{const lines=[`${label}: ${s.actual??'없음'}`];if(s.values)lines.push(TENORS.map(t=>`${t}Y ${s.values![`${t}Y`].toFixed(3)}%`).join(' · '));return lines;}
function dashboardText(d:DashboardResult):string{
  const lines=[`상태: ${d.result}`,...snapshotLines('현재 관측일',d.current)];for(const [label,key] of [['전일','previousSession'],['1주','weekAgo'],['전월말','previousMonthEnd']] as const){const ref=d.references[key];lines.push(`${label} 기준: ${ref.actual??'없음'}`);if(ref.values)lines.push(d.changes[key].map(x=>`${x.tenor} ${x.changeBp!>=0?'+':''}${x.changeBp?.toFixed(2)}bp`).join(' · '));}
  lines.push(`스프레드: ${Object.entries(d.spreads).map(([k,v])=>`${k} ${v?.toFixed(2)??'없음'}bp`).join(' · ')}`);if(d.policyRate)lines.push(`기준금리: ${d.policyRate.value.toFixed(2)}% (${d.policyRate.date}) · 3Y-기준금리 ${d.policyGap3YBp?.toFixed(2)}bp`);if(d.notes.length)lines.push(...d.notes.map(n=>`주의: ${n}`));lines.push('출처: https://ecos.bok.or.kr/');return lines.join('\n');
}
function trendText(t:TrendResult):string{const lines=[`상태: ${t.result}`,`기간: ${t.from??'없음'} → ${t.to??'없음'} (${t.actualSessions}/${t.requestedSessions}거래일)`];for(const s of t.stats)lines.push(`${s.tenor}: ${s.start.toFixed(3)}% → ${s.end.toFixed(3)}% (${s.netChangeBp>=0?'+':''}${s.netChangeBp.toFixed(2)}bp), 고점 ${s.high.toFixed(3)}%, 저점 ${s.low.toFixed(3)}%, 최대 일변동 ${s.largestDailyMoveBp>=0?'+':''}${s.largestDailyMoveBp.toFixed(2)}bp (${s.largestDailyMoveDate})`);if(t.notes.length)lines.push(...t.notes.map(n=>`주의: ${n}`));lines.push('출처: https://ecos.bok.or.kr/');return lines.join('\n');}
function comparison(current:CurveSnapshot,reference:CurveSnapshot,mode:string):Record<string,unknown>{const changes=TENORS.map(t=>({tenor:`${t}Y`,base:reference.values?.[`${t}Y`]??null,current:current.values?.[`${t}Y`]??null,changeBp:current.values&&reference.values?Math.round((current.values[`${t}Y`]-reference.values[`${t}Y`])*100*1e8)/1e8:null})),c3=changes.find(x=>x.tenor==='3Y')?.changeBp,c10=changes.find(x=>x.tenor==='10Y')?.changeBp;return {result:current.values&&reference.values&&current.actual!==reference.actual?'READY':current.values||reference.values?'INCOMPLETE':'BLOCKED',mode,current,reference,changes,movement:c3!==null&&c3!==undefined&&c10!==null&&c10!==undefined?classify(c3,c10):'판정 불가',source:'https://ecos.bok.or.kr/'};}
function snapshotSpreads(s:CurveSnapshot):Record<string,number|null>{const spread=(long:string,short:string)=>s.values?bp(s.values[long],s.values[short]):null;return {'5Y-3Y':spread('5Y','3Y'),'10Y-5Y':spread('10Y','5Y'),'10Y-3Y':spread('10Y','3Y'),'30Y-10Y':spread('30Y','10Y')};}

async function main():Promise<void>{
  const a=args(process.argv.slice(2));if(a.help){console.log(usage);return;}
  const market=typeof a.market==='string'?a.market:'kr';if(!['kr','both'].includes(market))throw Error('--market must be kr or both');
  if(a.text===true&&a.json===true)throw Error('--text and --json are mutually exclusive');
  if(market==='kr'&&a.json===true)throw Error('--json is only needed with --market both; Korean mode already defaults to JSON');
  if(typeof a['news-template']==='string'){if(Object.keys(a).some(k=>k!=='news-template'))throw Error('--news-template cannot be combined with other options');console.log(newsTemplate(date(a['news-template']),new Date().toISOString()));return;}
  const hasMonth=typeof a['from-month']==='string'||typeof a['to-month']==='string';
  const hasInput=typeof a.input==='string',hasReplay=typeof a.replay==='string';
  if(hasInput&&hasReplay)throw Error('--input and --replay are mutually exclusive');
  if(hasMonth&&(typeof a['from-month']!=='string'||typeof a['to-month']!=='string'))throw Error('--from-month and --to-month must be used together');
  if(hasMonth&&(typeof a.base==='string'||typeof a['as-of']==='string'))throw Error('Month range cannot be combined with --base/--as-of');
  if(hasInput&&(hasMonth||typeof a.base!=='string'||typeof a['as-of']!=='string'))throw Error('--input requires explicit --base and --as-of and cannot use month range');
  if(hasReplay&&Object.keys(a).some(k=>!['replay','out','text','json','market'].includes(k)))throw Error('--replay accepts only --market, --out, --text and --json');
  const monthDates=hasMonth?monthComparisonDates(a['from-month'] as string,a['to-month'] as string,kstToday()):null;
  const asOf=monthDates?.asOf??(typeof a['as-of']==='string'?date(a['as-of']):kstToday());
  const base=monthDates?.base??(typeof a.base==='string'?date(a.base):shift(asOf,-7));
  const maxLag=typeof a['max-lag']==='string'?Number(a['max-lag']):7;if(!Number.isInteger(maxLag)||maxLag<0||maxLag>14)throw Error('--max-lag must be an integer from 0 to 14');
  const cacheDir=resolve(typeof a['cache-dir']==='string'?a['cache-dir']:join(homedir(),'.cache','k-skill','korean-interest-rate-analysis')),useCache=a['no-cache']!==true;
  if(market==='both'){
    if(Object.keys(a).some(k=>!['market','base','as-of','from-month','to-month','max-lag','out','replay','schedule-evidence','cache-dir','no-cache','text','json'].includes(k)))throw Error('--market both supports dates, schedule evidence, cache, replay, --text, --json and --out only');
    let dual: DualPacket;
    if(hasReplay){
      const evidencePath=resolve(a.replay as string),raw=await readFile(evidencePath,'utf8');
      if(raw.length>100_000_000)throw Error('Dual replay evidence exceeds 100 MB');
      try{const manifest=JSON.parse(await readFile(join(dirname(evidencePath),'manifest.mjson'),'utf8')) as {evidenceSha256?:string};if(manifest.evidenceSha256!==sha256(raw))throw Error('Dual replay evidence hash differs from manifest');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      dual=JSON.parse(raw) as DualPacket;
    }else{
      if(asOf>kstToday())throw Error('Live collection cannot use a future KST as-of date');
      if(base>=asOf||days(asOf,base)>366)throw Error(base>=asOf?'Base must precede as-of':'Comparison window must be 366 days or less');
      const [kr,us]=await Promise.all([collect(base,asOf,maxLag,cacheDir,useCache),collectUst(base,asOf,maxLag,cacheDir,useCache)]);
      const schedule=typeof a['schedule-evidence']==='string'?readSchedule(await readFile(resolve(a['schedule-evidence']),'utf8'),asOf):undefined;
      dual={version:1,engine:DUAL_ENGINE,ktb:{version:PACKET_VERSION,engine:ENGINE,asOf,base,maxLag,...kr,label:'한·미 국채 금리 분석 · KTB'},ust:us,...(schedule?{schedule}:{})};
    }
    const result=analyzeDual(dual);
    if(typeof a.out==='string'){
      const out=resolve(a.out);await writeDualArtifacts(out,dual);
      console.log(JSON.stringify({result:result.status,out,files:['report.html','brief.md','market-table.csv','evidence.mjson','status.mjson','manifest.mjson']},null,2));
    }else if(a.json===true)console.log(JSON.stringify(dualSummary(dual,result),null,2));
    else console.log(dualChat(dual,result));
    if(result.status!=='READY')process.exitCode=2;
    return;
  }
  const preset=typeof a.preset==='string'?a.preset:null,eventDate=typeof a['event-date']==='string'?date(a['event-date']):null,lookback=typeof a['lookback-sessions']==='string'?Number(a['lookback-sessions']):null;
  if((preset!==null||lookback!==null||eventDate!==null)&&(typeof a.input==='string'||typeof a.replay==='string'||typeof a.out==='string'||typeof a['news-evidence']==='string'||hasMonth||typeof a.base==='string'))throw Error('Preset/trend/event modes accept only date anchor, --max-lag, --cache-dir, --no-cache and --text');
  if([preset!==null,lookback!==null,eventDate!==null].filter(Boolean).length>1)throw Error('--preset, --lookback-sessions and --event-date are mutually exclusive');
  if(!hasReplay&&(base>=asOf||days(asOf,base)>366))throw Error(base>=asOf?'Base must precede as-of':'Comparison window must be 366 days or less');
  if(preset!==null||lookback!==null||eventDate!==null){
    if(asOf>kstToday())throw Error('Live collection cannot use a future KST as-of date');let output:unknown;
    if(eventDate!==null){const data=await collectWindows(eventQueryWindows(eventDate,kstToday(),maxLag),cacheDir,useCache),before=onOrBefore(data.observations,shift(eventDate,-1),maxLag),after=onOrAfter(data.observations,eventDate,maxLag);output={...comparison(after,before,'event'),eventDate};console.log(JSON.stringify(output,null,2));}
    else if(lookback!==null){if(![5,20].includes(lookback))throw Error('--lookback-sessions must be 5 or 20');const from=shift(asOf,lookback===20?-45:-16),data=await collectWindows(rangeWindows(from,asOf),cacheDir,useCache);output=trend(data.observations,lookback);console.log(a.text===true?trendText(output as TrendResult):JSON.stringify(output,null,2));}
    else if(preset==='today'){
      const data=await collectWindows(pointWindows([asOf],maxLag),cacheDir,useCache),current=onOrBefore(data.observations,asOf,maxLag);output={result:current.values?'READY':'BLOCKED',mode:'today',current,spreads:snapshotSpreads(current),source:'https://ecos.bok.or.kr/'};console.log(JSON.stringify(output,null,2));
    }else if(preset==='policy-gap'){
      const data=await collectWindows(pointWindows([asOf],maxLag),cacheDir,useCache),current=onOrBefore(data.observations,asOf,maxLag),policyRate=await collectPolicyRate(asOf,cacheDir,useCache),current3=current.values?.['3Y']??null,policyGap3YBp=current3!==null&&policyRate?bp(current3,policyRate.value):null,notes=[current.reason,!policyRate?'기준금리 확보 실패: 정책금리 갭 제외':null].filter((x):x is string=>!!x);output={result:current.values&&policyRate?'READY':current.values?'INCOMPLETE':'BLOCKED',mode:'policy-gap',current,policyRate,policyGap3YBp,notes,source:'https://ecos.bok.or.kr/'};console.log(JSON.stringify(output,null,2));
    }else if(preset==='dashboard'||preset==='previous-session'){
      const windows=[...rangeWindows(shift(asOf,-(maxLag+7)),asOf),...pointWindows([shift(asOf,-7),previousMonthEnd(asOf)],maxLag)],data=await collectWindows(windows,cacheDir,useCache),policy=preset==='dashboard'?await collectPolicyRate(asOf,cacheDir,useCache):null,d=dashboard(asOf,data.observations,maxLag,policy);
      output=preset==='dashboard'?d:comparison(d.current,d.references.previousSession,'previous-session');console.log(a.text===true&&preset==='dashboard'?dashboardText(d):JSON.stringify(output,null,2));
    }else{
      const refs:Record<string,string>={'previous-week':shift(asOf,-7),'previous-month-end':previousMonthEnd(asOf),'previous-quarter-end':previousQuarterEnd(asOf),'year-start':previousYearEnd(asOf)};const referenceDate=refs[preset??''];if(!referenceDate)throw Error(`Unknown preset: ${preset}`);const data=await collectWindows(pointWindows([asOf,referenceDate],maxLag),cacheDir,useCache),current=onOrBefore(data.observations,asOf,maxLag),reference=onOrBefore(data.observations,referenceDate,maxLag);output=comparison(current,reference,preset!);console.log(JSON.stringify(output,null,2));
    }
    const result=(output as {result?:string}).result;if(result!=='READY')process.exitCode=2;return;
  }
  let p:Packet;
  if(typeof a.replay==='string'){
    const evidencePath=resolve(a.replay),raw=await readFile(evidencePath,'utf8');
    if(raw.length>100_000_000)throw Error('Replay evidence exceeds 100 MB character limit');
    try{const m=JSON.parse(await readFile(join(dirname(evidencePath),'manifest.mjson'),'utf8')) as {evidenceSha256?:string};if(m.evidenceSha256&&m.evidenceSha256!==sha256(raw))throw Error('Replay evidence hash differs from manifest');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    p=JSON.parse(raw) as Packet;if(p.version!==PACKET_VERSION||p.engine!==ENGINE)throw Error('Unsupported evidence packet');
  }else if(typeof a.input==='string'){
    const inputPath=resolve(a.input),raw=await readFile(inputPath,'utf8'),observations=csvRead(raw),now=new Date().toISOString();
    const receipts=TENORS.map(tenor=>{const rows=observations.filter(r=>r.tenor===tenor),meta=TENOR_META[tenor];return {tenor,sourceId:`사용자 제공 CSV: ${basename(inputPath)}`,sourceUrl:'',statCode:'USER_CSV',itemCode:meta.itemCode,itemName:meta.itemName,unit:'연%',cycle:'D',retrievedAt:now,status:'input',raw:[raw],rawSha256:[sha256(raw)],count:rows.length,first:rows[0]?.date??null,last:rows.at(-1)?.date??null,windows:[]} satisfies Receipt;});
    p={version:PACKET_VERSION,engine:ENGINE,asOf,base,maxLag,observations,receipts,label:'한국 금리 동향 분석'};
  }else{
    if(asOf>kstToday())throw Error('Live collection cannot use a future KST as-of date');
    const result=await collect(base,asOf,maxLag,cacheDir,useCache);
    p={version:PACKET_VERSION,engine:ENGINE,asOf,base,maxLag,...result,label:'한국 금리 동향 분석'};
  }
  if(typeof a['news-evidence']==='string'){const raw=await readFile(resolve(a['news-evidence']),'utf8');p={...p,newsEvidence:newsRead(raw)};}
  const analysis=analyze(p),news=analyzeNews(p.newsEvidence,analysis);
  if(typeof a.out==='string'){
    const out=resolve(a.out),manifest=await writeArtifacts(out,p);
    console.log(JSON.stringify({result:manifest.status,out,files:[...Object.keys(manifest.files),'manifest.mjson']},null,2));
  }else console.log(a.text===true?textSummary(p,analysis,news):JSON.stringify(summary(p,analysis,news),null,2));
  if(analysis.status!=='READY')process.exitCode=2;
}
main().catch(e=>{const message=e instanceof Error?e.message:String(e);console.error(JSON.stringify({result:'error',message},null,2));process.exitCode=1;});
