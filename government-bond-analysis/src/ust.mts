import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bp, classify, date, days, shift, TENORS, type Tenor } from './core.mjs';

const FIELDS: Record<Tenor, string> = {
  2: 'BC_2YEAR', 3: 'BC_3YEAR', 5: 'BC_5YEAR',
  10: 'BC_10YEAR', 20: 'BC_20YEAR', 30: 'BC_30YEAR'
};
export const UST_SOURCE = 'U.S. Treasury Daily Treasury Par Yield Curve Rates';
export const UST_SOURCE_PAGE = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve';
export const UST_ENGINE = 'ktb-ust-rate-analysis/1';
export interface UstRow { date: string; yields: Record<Tenor, number> }
export interface UstSource { month: string; url: string; retrievedAt: string; status: 'live' | 'cache' | 'failed'; raw: string; sha256: string; cacheAgeHours?: number; error?: string }
export interface UstPacket { version: 1; engine: typeof UST_ENGINE; asOf: string; base: string; maxLag: number; sources: UstSource[] }
export interface UstPoint { requested: string; actual: string | null; lag: number | null; yields: Record<Tenor, number> | null; reason: string | null }
export interface UstAnalysis { status: 'READY' | 'INCOMPLETE' | 'BLOCKED'; current: UstPoint; previous: UstPoint; changes: Record<Tenor, number> | null; spreads: Record<string, number | null>; movement: string; notes: string[]; rows: UstRow[] }
const digest = (raw: string): string => createHash('sha256').update(raw).digest('hex');
const cleanError = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, ' ').slice(0, 240) || 'unknown error';

export function ustMonthUrl(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Invalid UST month');
  return `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${month.replace('-', '')}`;
}

function oneTag(xml: string, name: string): string | null {
  const matches = [...xml.matchAll(new RegExp(`<d:${name}(?:\\s[^>]*)?>([^<]*)<\\/d:${name}>`, 'g'))];
  const nulls = [...xml.matchAll(new RegExp(`<d:${name}\\s+[^>]*m:null="true"[^>]*/>`, 'g'))];
  if (matches.length + nulls.length !== 1) throw Error(`UST XML field ${name} missing or duplicated`);
  if (nulls.length) return null;
  return matches[0][1].trim();
}

export function parseUstXml(raw: string, month: string): UstRow[] {
  if (raw.length > 5_000_000 || !raw.includes('<feed ') || !raw.includes('<title type="text">DailyTreasuryYieldCurveRateData</title>')) throw Error('Invalid UST XML feed');
  const entries = [...raw.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  if (!entries.length) throw Error(`UST feed has no entries for ${month}`);
  const rows: UstRow[] = [];
  const seen = new Set<string>();
  for (const [, entry] of entries) {
    const props = [...entry.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)];
    if (props.length !== 1) throw Error('UST XML properties missing or duplicated');
    const timestamp = oneTag(props[0][1], 'NEW_DATE');
    if (!timestamp || !/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(timestamp)) throw Error('Invalid UST observation date');
    const observationDate = date(timestamp.slice(0, 10));
    if (!observationDate.startsWith(`${month}-`) || seen.has(observationDate)) throw Error('UST month/date mismatch or duplicate observation');
    seen.add(observationDate);
    const yields = {} as Record<Tenor, number>;
    let complete = true;
    for (const tenor of TENORS) {
      const value = oneTag(props[0][1], FIELDS[tenor]);
      if (value === null || value === '') { complete = false; continue; }
      if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw Error(`Invalid UST ${tenor}Y yield`);
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 50) throw Error(`UST ${tenor}Y yield outside annual-percent bounds`);
      yields[tenor] = numeric;
    }
    if (complete) rows.push({ date: observationDate, yields });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function ustMonths(base: string, asOf: string, maxLag: number): string[] {
  date(base); date(asOf);
  if (base >= asOf || days(asOf, base) > 366) throw Error('UST comparison dates must be ordered within 366 days');
  if (!Number.isInteger(maxLag) || maxLag < 0 || maxLag > 14) throw Error('UST maxLag must be 0..14');
  const months = new Set<string>();
  for (const anchor of [base, asOf]) {
    for (let d = shift(anchor, -maxLag); d <= anchor; d = shift(d, 1)) months.add(d.slice(0, 7));
  }
  return [...months].sort();
}

async function fetchUst(url: string, month: string, fetcher: typeof fetch): Promise<string> {
  let error: Error = Error('UST request failed');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/xml,text/xml' } });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 429) throw Error(`UST HTTP ${response.status} (fatal)`);
        throw Error(`UST HTTP ${response.status}`);
      }
      const raw = await response.text();
      if (raw.length > 5_000_000) throw Error('UST response exceeds 5 MB');
      parseUstXml(raw, month);
      return raw;
    } catch (e) {
      error = e instanceof Error ? e : Error(String(e));
      if (error.message.endsWith('(fatal)')) break;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
  throw error;
}

async function writeUstCache(file: string, source: UstSource): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(source)); await rename(temporary, file); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

export async function collectUst(base: string, asOf: string, maxLag: number, cacheDir: string, useCache = true, fetcher: typeof fetch = fetch, now = new Date()): Promise<UstPacket> {
  if (!Number.isFinite(now.getTime())) throw Error('Invalid UST collection clock');
  const sources: UstSource[] = [];
  for (const month of ustMonths(base, asOf, maxLag)) {
    const url = ustMonthUrl(month), file = join(cacheDir, `ust-${month}.mjson`);
    let cached: UstSource | null = null;
    if (useCache) {
      try {
        const candidate = JSON.parse(await readFile(file, 'utf8')) as UstSource;
        const age = (now.getTime() - Date.parse(candidate.retrievedAt)) / 3_600_000;
        if (candidate.month === month && candidate.url === url && candidate.status === 'live' && candidate.error === undefined && candidate.cacheAgeHours === undefined && candidate.sha256 === digest(candidate.raw) && Number.isFinite(age) && age >= 0 && age <= 168) {
          parseUstXml(candidate.raw, month);
          cached = { ...candidate, status: 'cache', cacheAgeHours: Math.round(age * 100) / 100 };
        }
      } catch { /* invalid cache is ignored */ }
    }
    const usParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(now);
    const currentUsMonth = `${usParts.find(p => p.type === 'year')?.value}-${usParts.find(p => p.type === 'month')?.value}`;
    if (cached && cached.cacheAgeHours! <= (month === currentUsMonth ? 6 : 24)) { sources.push(cached); continue; }
    try {
      const raw = await fetchUst(url, month, fetcher);
      const source: UstSource = { month, url, retrievedAt: now.toISOString(), status: 'live', raw, sha256: digest(raw) };
      sources.push(source);
      if (useCache) { try { await mkdir(cacheDir, { recursive: true }); await writeUstCache(file, source); } catch { /* live data remains valid */ } }
    } catch (e) {
      if (cached) sources.push(cached);
      else sources.push({ month, url, retrievedAt: now.toISOString(), status: 'failed', raw: '', sha256: '', error: cleanError(e) });
    }
  }
  return { version: 1, engine: UST_ENGINE, base, asOf, maxLag, sources };
}

export function analyzeUst(packet: UstPacket): UstAnalysis {
  if (packet.version !== 1 || packet.engine !== UST_ENGINE || !Array.isArray(packet.sources)) throw Error('Unsupported UST evidence packet');
  const expected = ustMonths(packet.base, packet.asOf, packet.maxLag);
  if (packet.sources.length !== expected.length) throw Error('UST source month count mismatch');
  const rows: UstRow[] = [];
  let omittedIncompleteDates = 0;
  for (let i = 0; i < expected.length; i++) {
    const source = packet.sources[i];
    if (!source || source.month !== expected[i] || source.url !== ustMonthUrl(source.month) || !['live', 'cache', 'failed'].includes(source.status) || !Number.isFinite(Date.parse(source.retrievedAt)) || new Date(source.retrievedAt).toISOString() !== source.retrievedAt) throw Error('UST source identity or checksum mismatch');
    if (source.status === 'failed') {
      if (source.raw !== '' || source.sha256 !== '' || typeof source.error !== 'string' || !source.error || source.error.length > 240 || /[\r\n\t]/.test(source.error) || source.cacheAgeHours !== undefined) throw Error('Invalid failed UST source receipt');
      continue;
    }
    if (source.error !== undefined) throw Error('Successful UST source cannot contain an error');
    if (source.sha256 !== digest(source.raw)) throw Error('UST source checksum mismatch');
    if (source.status === 'cache' && (!Number.isFinite(source.cacheAgeHours) || source.cacheAgeHours! < 0 || source.cacheAgeHours! > 168)) throw Error('Invalid UST cache age');
    if (source.status === 'live' && source.cacheAgeHours !== undefined) throw Error('Live UST source cannot claim cache age');
    const parsed = parseUstXml(source.raw, source.month);
    omittedIncompleteDates += [...source.raw.matchAll(/<entry>/g)].length - parsed.length;
    rows.push(...parsed);
  }
  const point = (requested: string): UstPoint => {
    const row = rows.filter(r => r.date <= requested).at(-1) ?? null;
    const lag = row ? days(requested, row.date) : null;
    const reason = !row ? 'UST 공통 관측일 없음' : lag! > packet.maxLag ? `UST 관측일 ${lag}일 지연: 허용 ${packet.maxLag}일 초과` : null;
    return { requested, actual: row?.date ?? null, lag, yields: reason ? null : row!.yields, reason };
  };
  const current = point(packet.asOf), previous = point(packet.base);
  const comparable = current.yields && previous.yields && current.actual !== previous.actual;
  const changes = comparable ? Object.fromEntries(TENORS.map(t => [t, bp(current.yields![t], previous.yields![t])])) as Record<Tenor, number> : null;
  const spreads = Object.fromEntries(([['5Y-3Y',5,3],['10Y-5Y',10,5],['10Y-3Y',10,3],['30Y-10Y',30,10]] as const).map(([name, longer, shorter]) => [name, current.yields ? bp(current.yields[longer], current.yields[shorter]) : null]));
  const notes = [current.reason, previous.reason, ...(current.actual === previous.actual && current.actual ? ['두 기준일이 같은 UST 관측일로 정렬되어 변화 계산을 차단했습니다.'] : []), ...(omittedIncompleteDates ? [`UST 만기 결측이 있는 ${omittedIncompleteDates}개 관측일을 제외했습니다.`] : []), ...packet.sources.filter(s => s.status === 'cache').map(s => `${s.month}: 검증된 UST 캐시 사용`), ...packet.sources.filter(s => s.status === 'failed').map(s => `${s.month}: UST 원천 수집 실패 (${s.error})`)].filter((x): x is string => !!x);
  return { status: changes ? 'READY' : current.yields || previous.yields ? 'INCOMPLETE' : 'BLOCKED', current, previous, changes, spreads, movement: changes ? classify(changes[3], changes[10]) : '판정 불가', notes, rows };
}
