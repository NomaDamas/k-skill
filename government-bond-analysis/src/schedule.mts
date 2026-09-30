import { date, days, shift } from './core.mjs';

export type ScheduleMarket = 'KR' | 'US';
export type ScheduleKind = 'auction' | 'policy';
export interface ScheduleEvent {
  date: string;
  market: ScheduleMarket;
  kind: ScheduleKind;
  tenor?: number;
  sourceUrl: string;
  sourceExcerpt: string;
  sourceDateText: string;
}
export interface ScheduleEvidence {
  version: 1;
  anchorDate: string;
  checkedAt: string;
  events: ScheduleEvent[];
}
export interface ScheduleAnalysis {
  status: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED';
  anchorDate: string;
  checkedAt: string | null;
  events: Array<ScheduleEvent & { label: string }>;
  note: string;
}

const hosts: Record<ScheduleMarket, Record<ScheduleKind, readonly string[]>> = {
  KR: { auction: ['ktb.moef.go.kr'], policy: ['bok.or.kr', 'www.bok.or.kr'] },
  US: { auction: ['home.treasury.gov', 'www.treasurydirect.gov', 'treasurydirect.gov'], policy: ['www.federalreserve.gov', 'federalreserve.gov'] }
};
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const iso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function quotedDate(quoted: string, eventDate: string, excerpt: string): boolean {
  if (!excerpt.includes(quoted)) return false;
  const weekday = quoted.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/);
  if (weekday && new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${eventDate}T00:00:00Z`)) !== weekday[1]) return false;
  const isoOrDots = quoted.match(/^(\d{4})[-.](\d{2})[-.](\d{2})\.?$/);
  if (isoOrDots) return `${isoOrDots[1]}-${isoOrDots[2]}-${isoOrDots[3]}` === eventDate;
  const ko = quoted.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (ko) return excerpt.includes(eventDate.slice(0, 4)) && Number(ko[1]) === Number(eventDate.slice(5, 7)) && Number(ko[2]) === Number(eventDate.slice(8));
  const fed = quoted.match(/^([A-Z][a-z]+)\s+(\d{1,2})-(\d{1,2})$/);
  if (fed) {
    if (Number(fed[2]) >= Number(fed[3])) return false;
    const parsed = Date.parse(`${fed[1]} ${fed[3]}, ${eventDate.slice(0, 4)} GMT`);
    return excerpt.includes(eventDate.slice(0, 4)) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === eventDate;
  }
  const english = Date.parse(`${quoted} GMT`);
  return Number.isFinite(english) && new Date(english).toISOString().slice(0, 10) === eventDate;
}

function validateEvent(e: ScheduleEvent, anchorDate: string): void {
  if (!e || typeof e !== 'object' || !['KR', 'US'].includes(e.market) || !['auction', 'policy'].includes(e.kind) || date(e.date) !== e.date || e.date < anchorDate || e.date > shift(anchorDate, 45)) throw Error('Schedule event date, market, or kind mismatch');
  if (!text(e.sourceUrl, 500) || !text(e.sourceExcerpt, 500) || !text(e.sourceDateText, 80)) throw Error('Schedule source text missing or unsafe');
  let host: string;
  try { const url = new URL(e.sourceUrl); if (url.protocol !== 'https:' || url.username || url.password || url.toString() !== e.sourceUrl || /[\s()<>{}]/.test(e.sourceUrl)) throw Error(); host = url.hostname.toLowerCase(); } catch { throw Error('Schedule source URL must be official HTTPS'); }
  if (!hosts[e.market][e.kind].includes(host)) throw Error('Schedule source host does not match market and kind');
  if (!quotedDate(e.sourceDateText, e.date, e.sourceExcerpt)) throw Error('Schedule quoted date does not match event date');
  if (e.kind === 'auction') {
    if (!Number.isInteger(e.tenor) || ![2, 3, 5, 7, 10, 20, 30, 50].includes(e.tenor!) || (e.market === 'US' && !new RegExp(`\\b${e.tenor}-Year (?:NOTE|BOND)\\b`, 'i').test(e.sourceExcerpt)) || (e.market === 'KR' && !e.sourceExcerpt.includes(`${e.tenor}년물`))) throw Error('Schedule auction tenor or source marker mismatch');
    if (e.market === 'US') {
      const dates = [...e.sourceExcerpt.matchAll(/(?:Monday|Tuesday|Wednesday|Thursday|Friday),\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}/g)].map(match => match[0]);
      if (/tentative/i.test(e.sourceUrl) && dates.length < 3) throw Error('Tentative U.S. auction row must include announcement, auction, and settlement dates');
      if (dates.length >= 3 && e.sourceDateText !== dates[1]) throw Error('Schedule U.S. auction date must be the second date in the official row');
    }
  } else if (e.tenor !== undefined || (e.market === 'KR' && !/통화정책방향|금융통화위원회/.test(e.sourceExcerpt)) || (e.market === 'US' && !/FOMC|Federal Open Market Committee/.test(e.sourceExcerpt))) throw Error('Schedule policy source marker mismatch');
}

export function readSchedule(raw: string, anchorDate: string): ScheduleEvidence {
  if (raw.length > 100_000) throw Error('Schedule evidence exceeds 100 KB');
  const evidence = JSON.parse(raw) as ScheduleEvidence;
  validateSchedule(evidence, anchorDate);
  return evidence;
}

export function validateSchedule(evidence: ScheduleEvidence, anchorDate: string): void {
  date(anchorDate);
  if (!evidence || typeof evidence !== 'object' || evidence.version !== 1 || evidence.anchorDate !== anchorDate || !iso(evidence.checkedAt) || !Array.isArray(evidence.events) || evidence.events.length > 30) throw Error('Schedule evidence identity or size mismatch');
  const checkedDate = evidence.checkedAt.slice(0, 10);
  if (days(checkedDate, anchorDate) < -1 || days(checkedDate, anchorDate) > 14) throw Error('Schedule verification time is too far from report date');
  const seen = new Set<string>();
  for (const e of evidence.events) {
    validateEvent(e, anchorDate);
    const key = `${e.date}/${e.market}/${e.kind}/${e.tenor ?? ''}`;
    if (seen.has(key)) throw Error('Duplicate schedule event');
    seen.add(key);
  }
}

export function analyzeSchedule(evidence: ScheduleEvidence | undefined, anchorDate: string): ScheduleAnalysis {
  date(anchorDate);
  if (!evidence) return { status: 'UNVERIFIED', anchorDate, checkedAt: null, events: [], note: '공식 일정 자료를 확인하지 못해 날짜를 표시하지 않았습니다.' };
  validateSchedule(evidence, anchorDate);
  const label = (e: ScheduleEvent): string => e.kind === 'policy' ? e.market === 'KR' ? '한국은행 통화정책방향 결정회의' : 'FOMC 금리 결정' : e.market === 'KR' ? `국고채 ${e.tenor}년물 입찰` : `미국 국채 ${e.tenor}년물 입찰${/tentative/i.test(e.sourceUrl) ? ' (잠정)' : ''}`;
  const events = [...evidence.events].sort((a, b) => a.date.localeCompare(b.date) || a.market.localeCompare(b.market) || a.kind.localeCompare(b.kind) || (a.tenor ?? 0) - (b.tenor ?? 0));
  const limited = events.filter(e => events.filter(x => x.market === e.market && (x.date < e.date || (x.date === e.date && events.indexOf(x) <= events.indexOf(e)))).length <= 4).slice(0, 8).map(e => ({ ...e, label: label(e) }));
  const markets = new Set(events.map(e => e.market));
  return { status: markets.size === 2 ? 'VERIFIED' : 'PARTIAL', anchorDate, checkedAt: evidence.checkedAt, events: limited, note: markets.size === 2 ? '각 날짜는 해당 국가 현지일입니다. 예정 일정은 변경될 수 있으니 원문을 다시 확인하세요.' : markets.size === 1 ? `${markets.has('KR') ? '미국' : '한국'} 공식 일정은 확인되지 않았습니다. 표시 날짜는 해당 국가 현지일입니다.` : '조회 기간에 확인된 공식 일정이 없습니다.' };
}
