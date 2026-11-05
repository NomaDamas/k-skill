import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { rangeWindows, request } from './collect.mjs';
import { TENORS, bp, date, days, normalize, sha256, shift } from './core.mjs';
function validMaxLag(maxLag) { if (!Number.isInteger(maxLag) || maxLag < 0 || maxLag > 14)
    throw Error('maxLag must be 0..14 calendar days'); }
function endOfMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(value))
        throw Error(`Invalid month: ${value}`);
    const first = date(`${value}-01`), [year, month] = first.split('-').map(Number);
    return shift(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`, -1);
}
export function monthComparisonDates(fromMonth, toMonth, today) {
    date(today);
    endOfMonth(fromMonth);
    const toEnd = endOfMonth(toMonth);
    if (fromMonth >= toMonth)
        throw Error('--from-month must be earlier than --to-month');
    const currentMonth = today.slice(0, 7);
    if (toMonth > currentMonth)
        throw Error('--to-month cannot be in the future');
    return { base: endOfMonth(fromMonth), asOf: toMonth === currentMonth ? today : toEnd };
}
export function eventQueryWindows(eventDate, today, maxLag) {
    date(eventDate);
    date(today);
    validMaxLag(maxLag);
    if (eventDate > today)
        throw Error('Event date cannot be in the future');
    const beforeTo = shift(eventDate, -1), afterTo = shift(eventDate, maxLag) < today ? shift(eventDate, maxLag) : today;
    return [...rangeWindows(shift(beforeTo, -maxLag), beforeTo), ...rangeWindows(eventDate, afterTo)];
}
export function previousMonthEnd(asOf) { const [y, m] = date(asOf).split('-').map(Number); return shift(`${y}-${String(m).padStart(2, '0')}-01`, -1); }
export function previousQuarterEnd(asOf) { const [y, m] = date(asOf).split('-').map(Number), quarterStart = Math.floor((m - 1) / 3) * 3 + 1; return shift(`${y}-${String(quarterStart).padStart(2, '0')}-01`, -1); }
export function previousYearEnd(asOf) { const y = Number(date(asOf).slice(0, 4)); return `${y - 1}-12-31`; }
export function commonSnapshots(input) {
    const rows = normalize(input), dates = [...new Set(rows.map(r => r.date))].sort();
    return dates.filter(d => TENORS.every(t => rows.some(r => r.date === d && r.tenor === t))).map(actual => ({ requested: actual, actual, lag: 0, values: Object.fromEntries(TENORS.map(t => [`${t}Y`, rows.find(r => r.date === actual && r.tenor === t).value])), reason: null }));
}
export function onOrBefore(input, requested, maxLag) {
    date(requested);
    validMaxLag(maxLag);
    const found = commonSnapshots(input).filter(s => s.actual <= requested).at(-1) ?? null, lag = found?.actual ? days(requested, found.actual) : null;
    const reason = !found ? '여섯 만기의 공통 관측일 없음' : lag > maxLag ? `공통 관측일이 ${lag}일 전: 허용 ${maxLag}일 초과` : null;
    return { requested, actual: found?.actual ?? null, lag, values: reason ? null : found.values, reason };
}
export function onOrAfter(input, requested, maxLag) {
    date(requested);
    validMaxLag(maxLag);
    const found = commonSnapshots(input).find(s => s.actual >= requested) ?? null, lag = found?.actual ? days(found.actual, requested) : null;
    const reason = !found ? '여섯 만기의 공통 관측일 없음' : lag > maxLag ? `공통 관측일이 ${lag}일 후: 허용 ${maxLag}일 초과` : null;
    return { requested, actual: found?.actual ?? null, lag, values: reason ? null : found.values, reason };
}
function changes(current, base) { return TENORS.map(t => ({ tenor: `${t}Y`, base: base.values?.[`${t}Y`] ?? null, current: current.values?.[`${t}Y`] ?? null, changeBp: base.values && current.values ? bp(current.values[`${t}Y`], base.values[`${t}Y`]) : null })); }
function spread(snapshot, long, short) { return snapshot.values ? bp(snapshot.values[`${long}Y`], snapshot.values[`${short}Y`]) : null; }
export function dashboard(asOf, input, maxLag, policyRate) {
    const snapshots = commonSnapshots(input), current = onOrBefore(input, asOf, maxLag);
    const previousActual = current.actual ? snapshots.filter(s => s.actual < current.actual).at(-1) ?? null : null;
    const previousSession = previousActual ? { ...previousActual, requested: `${current.actual} 직전 관측일` } : { requested: '직전 관측일', actual: null, lag: null, values: null, reason: '직전 공통 관측일 없음' };
    const weekAgo = onOrBefore(input, shift(asOf, -7), maxLag), monthEnd = onOrBefore(input, previousMonthEnd(asOf), maxLag), notes = [current.reason, previousSession.reason, weekAgo.reason, monthEnd.reason].filter((x) => !!x);
    const current3 = current.values?.['3Y'] ?? null, policyGap3YBp = current3 !== null && policyRate ? bp(current3, policyRate.value) : null;
    if (!policyRate)
        notes.push('기준금리 확보 실패: 정책금리 갭 제외');
    else if (policyRate.cacheWriteError)
        notes.push(`기준금리 원자료는 검증했으나 로컬 캐시 저장 실패 (${policyRate.cacheWriteError})`);
    const ready = !!current.values && !!previousSession.values && !!weekAgo.values && !!monthEnd.values;
    return { result: ready ? 'READY' : current.values ? 'INCOMPLETE' : 'BLOCKED', mode: 'dashboard', asOf, current, references: { previousSession, weekAgo, previousMonthEnd: monthEnd }, changes: { previousSession: changes(current, previousSession), weekAgo: changes(current, weekAgo), previousMonthEnd: changes(current, monthEnd) }, spreads: { '5Y-3Y': spread(current, 5, 3), '10Y-5Y': spread(current, 10, 5), '10Y-3Y': spread(current, 10, 3), '30Y-10Y': spread(current, 30, 10) }, policyRate, policyGap3YBp, notes };
}
export function trend(input, sessions) {
    if (![5, 20].includes(sessions))
        throw Error('lookback sessions must be 5 or 20');
    const all = commonSnapshots(input), selected = all.slice(-sessions), notes = [];
    if (selected.length < sessions)
        notes.push(`요청 ${sessions}거래일 중 ${selected.length}개 공통 관측일만 확보`);
    const stats = selected.length < 2 ? [] : TENORS.map(t => { const key = `${t}Y`, values = selected.map(s => s.values[key]), moves = selected.slice(1).map((s, i) => ({ date: s.actual, move: bp(s.values[key], selected[i].values[key]) })), largest = moves.reduce((a, b) => Math.abs(b.move) > Math.abs(a.move) ? b : a); return { tenor: key, start: values[0], end: values.at(-1), netChangeBp: bp(values.at(-1), values[0]), high: Math.max(...values), low: Math.min(...values), largestDailyMoveBp: largest.move, largestDailyMoveDate: largest.date }; });
    return { result: selected.length >= sessions ? 'READY' : selected.length ? 'INCOMPLETE' : 'BLOCKED', mode: 'trend', requestedSessions: sessions, actualSessions: selected.length, from: selected[0]?.actual ?? null, to: selected.at(-1)?.actual ?? null, sessions: selected, stats, notes };
}
function parsePolicy(raw, from, to) {
    const doc = JSON.parse(raw);
    if (doc.RESULT)
        throw Error(`ECOS policy ${doc.RESULT.CODE ?? 'unknown'}`);
    const block = doc.StatisticSearch, rows = block?.row;
    if (!block || !Array.isArray(rows) || block.list_total_count !== rows.length || rows.length > 10)
        throw Error('Incomplete policy-rate response');
    const seen = new Set(), valid = rows.map(r => { if (r.STAT_CODE !== '722Y001' || r.STAT_NAME !== '1.3.1. 한국은행 기준금리 및 여수신금리' || r.ITEM_CODE1 !== '0101000' || r.ITEM_NAME1 !== '한국은행 기준금리' || r.UNIT_NAME !== '연%' || !/^\d{8}$/.test(r.TIME ?? '') || !/^\d+(?:\.\d+)?$/.test(r.DATA_VALUE ?? ''))
        throw Error('Policy-rate metadata mismatch'); const d = `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}-${r.TIME.slice(6, 8)}`, value = Number(r.DATA_VALUE); date(d); if (seen.has(d))
        throw Error('Duplicate policy-rate date'); seen.add(d); if (d < from || d > to || !Number.isFinite(value) || value < 0 || value > 30)
        throw Error('Invalid policy-rate value/range'); return { date: d, value }; }).sort((a, b) => a.date.localeCompare(b.date));
    if (!valid.length)
        throw Error('No policy-rate observation');
    return valid.at(-1);
}
export async function collectPolicyRate(asOf, cacheDir, useCache = true, get = fetch, now = new Date(), maxAgeHours = 168) {
    date(asOf);
    if (typeof cacheDir !== 'string' || !cacheDir.trim())
        throw Error('cacheDir must be a non-empty path');
    if (!Number.isFinite(now.getTime()))
        throw Error('Invalid policy-rate clock');
    if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0)
        throw Error('maxAgeHours must be non-negative');
    const from = shift(asOf, -7), to = asOf, retrievedAt = now.toISOString(), file = join(cacheDir, `policy-${from}-${to}.mjson`);
    if (useCache)
        await mkdir(cacheDir, { recursive: true });
    let liveError = '';
    try {
        const key = process.env.KSKILL_BOK_ECOS_API_KEY || 'sample', url = `https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(key)}/json/kr/1/10/722Y001/D/${from.replaceAll('-', '')}/${to.replaceAll('-', '')}/0101000`, result = await request(url, get), point = parsePolicy(result.text, from, to), digest = sha256(result.text), data = { version: 1, storedAt: retrievedAt, from, to, raw: result.text, rawSha256: digest }, temp = `${file}.${randomUUID()}.tmp`;
        let cacheWriteError;
        if (useCache)
            try {
                await writeFile(temp, JSON.stringify({ data, digest: sha256(JSON.stringify(data)) }));
                await rename(temp, file);
            }
            catch (e) {
                cacheWriteError = e instanceof Error ? e.message : String(e);
                await rm(temp, { force: true });
            }
        return { ...point, unit: '연%', status: 'live', retrievedAt, sourceUrl: 'https://ecos.bok.or.kr/', statCode: '722Y001', itemCode: '0101000', rawSha256: digest, ...(cacheWriteError ? { cacheWriteError } : {}) };
    }
    catch (e) {
        liveError = e instanceof Error ? e.message : String(e);
    }
    if (useCache)
        try {
            const envelope = JSON.parse(await readFile(file, 'utf8')), data = envelope.data, age = (now.getTime() - Date.parse(data.storedAt)) / 3600000;
            if (envelope.digest !== sha256(JSON.stringify(data)) || data.version !== 1 || data.from !== from || data.to !== to || data.rawSha256 !== sha256(data.raw) || !Number.isFinite(age) || age < 0 || age > maxAgeHours)
                throw Error('Invalid policy cache');
            const point = parsePolicy(data.raw, from, to);
            return { ...point, unit: '연%', status: 'cache', retrievedAt: data.storedAt, sourceUrl: 'https://ecos.bok.or.kr/', statCode: '722Y001', itemCode: '0101000', rawSha256: data.rawSha256, cacheAgeHours: Math.round(age * 100) / 100 };
        }
        catch {
            return null;
        }
    void liveError;
    return null;
}
