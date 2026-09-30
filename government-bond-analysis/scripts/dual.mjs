import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { analyze, bp, TENORS } from './core.mjs';
import { analyzeUst, UST_SOURCE, UST_SOURCE_PAGE } from './ust.mjs';
import { analyzeSchedule } from './schedule.mjs';
export const DUAL_ENGINE = 'ktb-ust-rate-analysis/1';
const hash = (text) => createHash('sha256').update(text).digest('hex');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mdLine = (s) => s.replace(/[\r\n\t]+/g, ' ').replace(/[\\`*_\[\]<>|]/g, '\\$&');
const crossLabel = (a) => a.cross.current.gapBp === null ? '계산 불가' : `${a.cross.current.gapBp.toFixed(2)}bp`;
export function analyzeDual(packet) {
    if (packet.version !== 1 || packet.engine !== DUAL_ENGINE || !packet.ktb || !packet.ust)
        throw Error('Unsupported dual-market evidence packet');
    if (packet.ktb.asOf !== packet.ust.asOf || packet.ktb.base !== packet.ust.base || packet.ktb.maxLag !== packet.ust.maxLag)
        throw Error('KTB/UST request date or lag mismatch');
    const ktb = analyze(packet.ktb), ust = analyzeUst(packet.ust), schedule = analyzeSchedule(packet.schedule, packet.ktb.asOf);
    const common = (requested) => {
        const krDates = new Map();
        for (const row of packet.ktb.observations) {
            if (!krDates.has(row.date))
                krDates.set(row.date, new Set());
            krDates.get(row.date).add(row.tenor);
        }
        const kr10 = new Map(packet.ktb.observations.filter(r => r.tenor === 10 && TENORS.every(t => krDates.get(r.date)?.has(t))).map(r => [r.date, r.value]));
        const us10 = new Map(ust.rows.map((r) => [r.date, r.yields[10]]));
        const actual = [...kr10.keys()].filter(d => d <= requested && us10.has(d) && (new Date(`${requested}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) / 86_400_000 <= packet.ktb.maxLag).sort().at(-1) ?? null;
        const ust10Y = actual ? us10.get(actual) : null, ktb10Y = actual ? kr10.get(actual) : null;
        return { requested, actual, ust10Y, ktb10Y, gapBp: ust10Y !== null && ktb10Y !== null ? bp(ust10Y, ktb10Y) : null };
    };
    const current = common(packet.ktb.asOf), previous = common(packet.ktb.base);
    const changeBp = current.gapBp !== null && previous.gapBp !== null && current.actual !== previous.actual ? Math.round((current.gapBp - previous.gapBp) * 1e8) / 1e8 : null;
    const status = ktb.status === 'READY' && ust.status === 'READY' ? 'READY' : ktb.status === 'BLOCKED' && ust.status === 'BLOCKED' ? 'BLOCKED' : 'INCOMPLETE';
    const notes = [
        'UST는 미국 재무부의 명목 par/constant-maturity 수익률이고 KTB는 한국은행 ECOS 국고채 시장금리입니다. 같은 날짜라도 종가 시점이 달라 단순 금리차는 동시 가격, 환헤지 비용 또는 상대가치를 뜻하지 않습니다.',
        current.actual ? `한·미 10년 금리차의 현재 공통 관측일: ${current.actual}` : '현재 기준일의 한·미 공통 관측일이 없어 금리차를 표시하지 않았습니다.',
        previous.actual ? `한·미 10년 금리차의 비교 공통 관측일: ${previous.actual}` : '비교 기준일의 한·미 공통 관측일이 없어 금리차 변화를 표시하지 않았습니다.',
        ...ktb.notes.map(s => `KTB: ${s}`), ...ust.notes.map(s => `UST: ${s}`)
    ];
    return { status, ktb, ust, cross: { current, previous, changeBp }, schedule, notes };
}
function marketTable(name, base, current, changes) {
    const rows = TENORS.map(t => `<tr><td>${t}Y</td><td>${base?.[t]?.toFixed(3) ?? '—'}</td><td>${current?.[t]?.toFixed(3) ?? '—'}</td><td>${changes?.[t] === undefined ? '—' : `${changes[t] >= 0 ? '+' : ''}${changes[t].toFixed(2)}`}</td></tr>`).join('');
    return `<section class="panel"><h2>${esc(name)}</h2><table><thead><tr><th>만기</th><th>비교일 연%</th><th>현재일 연%</th><th>변화 bp</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
export function dualSummary(packet, analysis = analyzeDual(packet)) {
    const market = (name, a) => ({ market: name, status: a.status, observed: { base: a.previous.actual, asOf: a.current.actual }, rates: TENORS.map((tenor, i) => ({ tenor: `${tenor}Y`, base: name === 'KTB' ? a.previous.values?.[i] ?? null : a.previous.yields?.[tenor] ?? null, asOf: name === 'KTB' ? a.current.values?.[i] ?? null : a.current.yields?.[tenor] ?? null, changeBp: name === 'KTB' ? a.changes?.[i] ?? null : a.changes?.[tenor] ?? null })), movement: a.movement, notes: a.notes });
    return { result: analysis.status, requested: { base: packet.ktb.base, asOf: packet.ktb.asOf }, markets: [market('KTB', analysis.ktb), market('UST', analysis.ust)], cross: analysis.cross, schedule: analysis.schedule, notes: analysis.notes, sources: [{ market: 'KTB', url: 'https://ecos.bok.or.kr/' }, { market: 'UST', name: UST_SOURCE, url: UST_SOURCE_PAGE, feedUrls: packet.ust.sources.map(s => s.url) }] };
}
const rateText = (value) => value === null || value === undefined ? '—' : `${value.toFixed(3)}%`;
const changeText = (value) => value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}bp`;
const observedText = (requested, actual, lag) => actual ? `${actual}${lag ? ` (요청일 ${requested}보다 ${lag}일 전)` : ''}` : '확인 불가';
/** Stable, source-backed Markdown for direct conversational replies. */
export function dualChat(packet, a = analyzeDual(packet)) {
    const ktb3 = a.ktb.changes?.[TENORS.indexOf(3)] ?? null;
    const ktb10 = a.ktb.changes?.[TENORS.indexOf(10)] ?? null;
    const ust3 = a.ust.changes?.[3] ?? null;
    const ust10 = a.ust.changes?.[10] ?? null;
    const headline = (name, short, longer, movement) => short === null || longer === null ? `${name}는 비교 가능한 두 관측일이 부족합니다.` :
        `${name} 3년 ${changeText(short)}, 10년 ${changeText(longer)} (${movement}).`;
    const table = TENORS.map((tenor, i) => `| ${tenor}년 | ${rateText(a.ktb.current.values?.[i])} | ${changeText(a.ktb.changes?.[i])} | ${rateText(a.ust.current.yields?.[tenor])} | ${changeText(a.ust.changes?.[tenor])} |`);
    const kSpread = a.ktb.spreads.find(s => s.name === '10년−3년');
    const uSpread = a.ust.spreads['10Y-3Y'];
    const gap = a.cross.current.gapBp === null ? '공통 관측일이 없어 계산 불가' :
        `${changeText(a.cross.current.gapBp)} (공통 관측일 ${a.cross.current.actual})`;
    const gapChange = a.cross.changeBp === null ? '계산 불가' : changeText(a.cross.changeBp);
    const warnings = [...a.ktb.notes.map(n => `KTB: ${n}`), ...a.ust.notes.map(n => `UST: ${n}`)];
    const statusNote = a.status === 'READY' ? '분석 완료' : a.status === 'INCOMPLETE' ? '일부 자료 부족, 확인된 값만 표시' : '자료 확인 불가';
    return [
        '## 한·미 국채 금리 분석',
        `**상태:** ${statusNote} (${a.status})`,
        `**요청 기간:** ${packet.ktb.base} → ${packet.ktb.asOf}`,
        `**실제 관측:** KTB ${observedText(packet.ktb.base, a.ktb.previous.actual, a.ktb.previous.lag)} → ${observedText(packet.ktb.asOf, a.ktb.current.actual, a.ktb.current.lag)} · UST ${observedText(packet.ust.base, a.ust.previous.actual, a.ust.previous.lag)} → ${observedText(packet.ust.asOf, a.ust.current.actual, a.ust.current.lag)}`,
        '',
        '**핵심 변화**',
        headline('KTB', ktb3, ktb10, a.ktb.movement),
        headline('UST', ust3, ust10, a.ust.movement),
        '',
        '| 만기 | KTB 현재 | 변화 | UST 현재 | 변화 |',
        '| --- | ---: | ---: | ---: | ---: |',
        ...table,
        '',
        '**커브·한미 차이**',
        `- 10년−3년: KTB ${changeText(kSpread?.current)} (기간 변화 ${changeText(kSpread?.change)}), UST ${changeText(uSpread)}.`,
        `- UST 10년−KTB 10년: ${gap} · 기간 변화 ${gapChange}.`,
        '',
        '**주요 일정**',
        ...(a.schedule.events.length ? a.schedule.events.map(e => `- ${e.date} (${e.market}) ${e.label} · [공식 일정](${e.sourceUrl})`) : [a.schedule.status === 'UNVERIFIED' ? '- 공식 일정 미확인.' : '- 조회 기간에 확인된 일정 없음.']),
        `- 일정 확인: ${a.schedule.checkedAt ?? '미확인'} · ${a.schedule.status}. ${a.schedule.note}`,
        '',
        '**확인 사항**',
        ...(warnings.length ? warnings.map(w => `- ${mdLine(w)}`) : ['- 날짜·수집 관련 경고 없음.']),
        '- UST는 미국 재무부의 명목 par/constant-maturity 수익률, KTB는 ECOS 국고채 시장금리입니다. 같은 날짜라도 종가 시점이 달라 단순 금리차는 동시 가격이나 환헤지 수익을 뜻하지 않습니다.',
        '',
        `**출처:** [한국은행 ECOS](https://ecos.bok.or.kr/) · [미국 재무부 일별 국채 수익률](${UST_SOURCE_PAGE})`
    ].join('\n');
}
function dualCsv(a) {
    const cells = ['market,date_role,observation_date,tenor,yield_pct,change_bp'];
    for (const [market, detail] of [['KTB', a.ktb], ['UST', a.ust]]) {
        for (const [role, point] of [['base', detail.previous], ['as_of', detail.current]]) {
            for (const [i, tenor] of TENORS.entries()) {
                const yieldValue = market === 'KTB' ? point.values?.[i] : point.yields?.[tenor];
                const change = role === 'as_of' ? market === 'KTB' ? a.ktb.changes?.[i] : a.ust.changes?.[tenor] : null;
                cells.push([market, role, point.actual ?? '', tenor, yieldValue ?? '', change ?? ''].join(','));
            }
        }
    }
    return cells.join('\n') + '\n';
}
function dualHtml(packet, a) {
    const kBase = a.ktb.previous.values ? Object.fromEntries(TENORS.map((t, i) => [t, a.ktb.previous.values[i]])) : null;
    const kCurrent = a.ktb.current.values ? Object.fromEntries(TENORS.map((t, i) => [t, a.ktb.current.values[i]])) : null;
    const kChanges = a.ktb.changes ? Object.fromEntries(TENORS.map((t, i) => [t, a.ktb.changes[i]])) : null;
    const sourceRows = [...packet.ktb.receipts.map(r => `<tr><td>KTB ${r.tenor}Y</td><td>${esc(r.sourceId)} · ${esc(r.statCode)}/${esc(r.itemCode)}</td><td>${esc(r.retrievedAt)}</td><td><a href="${esc(r.sourceUrl || '#')}">원천</a></td></tr>`), ...packet.ust.sources.map(s => `<tr><td>UST ${esc(s.month)}</td><td><a href="${esc(UST_SOURCE_PAGE)}">${esc(UST_SOURCE)}</a> · ${esc(s.status)}</td><td>${esc(s.retrievedAt)}</td><td><a href="${esc(s.url)}">원천</a></td></tr>`)].join('');
    const cross = a.cross.current.gapBp === null ? '공통 관측일 없음' : `${a.cross.current.gapBp.toFixed(2)}bp (${a.cross.current.actual})`;
    const scheduleRows = a.schedule.events.length ? a.schedule.events.map(e => `<li><strong>${esc(e.date)} (${esc(e.market)})</strong> ${esc(e.label)} · <a href="${esc(e.sourceUrl)}">공식 일정</a></li>`).join('') : a.schedule.status === 'UNVERIFIED' ? '<li>공식 일정 미확인.</li>' : '<li>조회 기간에 확인된 일정 없음.</li>';
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>한·미 국채 금리 분석</title><style>body{font:15px/1.55 system-ui,sans-serif;background:#f4f6fa;color:#172033;margin:0}.wrap{max-width:1100px;margin:auto;padding:32px 16px}h1{font-size:30px;margin:0 0 8px}.meta{color:#586477}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.panel{background:#fff;border:1px solid #dce3ec;border-radius:12px;padding:18px;margin-top:18px;overflow:auto}table{border-collapse:collapse;width:100%;min-width:400px;font-variant-numeric:tabular-nums}th,td{padding:9px 8px;border-bottom:1px solid #e8edf3;text-align:right}th:first-child,td:first-child{text-align:left}th{font-size:12px;color:#536276}p{margin:8px 0}.notes li{margin:5px 0}a{color:#235cba}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style></head><body><main class="wrap"><h1>한·미 국채 금리 분석</h1><div class="meta">요청 ${esc(packet.ktb.base)} → ${esc(packet.ktb.asOf)} · 상태 ${esc(a.status)}</div><p>KTB 관측 ${esc(a.ktb.previous.actual ?? '없음')} → ${esc(a.ktb.current.actual ?? '없음')} · UST 관측 ${esc(a.ust.previous.actual ?? '없음')} → ${esc(a.ust.current.actual ?? '없음')}</p><div class="grid">${marketTable('KTB · 한국 국고채', kBase, kCurrent, kChanges)}${marketTable('UST · 미국 국채 par 수익률', a.ust.previous.yields, a.ust.current.yields, a.ust.changes)}</div><section class="panel"><h2>커브와 한·미 차이</h2><p>KTB: ${esc(a.ktb.movement)} · UST: ${esc(a.ust.movement)}</p><p>UST 10Y − KTB 10Y: ${esc(cross)}${a.cross.changeBp === null ? '' : ` · 기간 변화 ${a.cross.changeBp >= 0 ? '+' : ''}${a.cross.changeBp.toFixed(2)}bp`}</p></section><section class="panel"><h2>주요 일정</h2><ul class="notes">${scheduleRows}</ul><p class="meta">일정 확인 ${esc(a.schedule.checkedAt ?? '미확인')} · ${esc(a.schedule.status)}. ${esc(a.schedule.note)}</p></section><section class="panel"><h2>검증 메모</h2><ul class="notes">${a.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section><section class="panel"><h2>원천·수집 기록</h2><table><thead><tr><th>구분</th><th>제공기관·항목</th><th>수집 UTC</th><th>링크</th></tr></thead><tbody>${sourceRows}</tbody></table></section></main></body></html>`;
}
const FILES = ['brief.md', 'market-table.csv', 'report.html', 'evidence.mjson', 'status.mjson'];
function scheduleBrief(a) {
    return `## 주요 일정\n\n${a.schedule.events.length ? a.schedule.events.map(e => `- ${e.date} (${e.market}) ${e.label} · ${e.sourceUrl}`).join('\n') : a.schedule.status === 'UNVERIFIED' ? '- 공식 일정 미확인.' : '- 조회 기간에 확인된 일정 없음.'}\n\n일정 확인: ${a.schedule.checkedAt ?? '미확인'} · ${a.schedule.status}. ${a.schedule.note}\n`;
}
export async function writeDualArtifacts(out, packet) {
    const a = analyzeDual(packet), parent = dirname(out), stage = join(parent, `.${basename(out)}.stage-${process.pid}-${randomUUID()}`);
    await mkdir(parent, { recursive: true });
    try {
        await stat(out);
        throw Error(`Output path already exists: ${out}`);
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            throw e;
    }
    try {
        await mkdir(stage);
        const summary = dualSummary(packet, a);
        const files = {
            'brief.md': `# 한·미 국채 금리 분석\n\n요청 ${packet.ktb.base} → ${packet.ktb.asOf} · ${a.status}\n\nKTB 관측 ${a.ktb.previous.actual ?? '없음'} → ${a.ktb.current.actual ?? '없음'} · ${a.ktb.movement}\n\nUST 관측 ${a.ust.previous.actual ?? '없음'} → ${a.ust.current.actual ?? '없음'} · ${a.ust.movement}\n\nUST 10Y − KTB 10Y: ${crossLabel(a)} (공통 관측일 ${a.cross.current.actual ?? '없음'})\n\n${scheduleBrief(a)}\n${a.notes.map(n => `- ${mdLine(n)}`).join('\n')}\n\n원천: https://ecos.bok.or.kr/ · ${UST_SOURCE_PAGE}\n`,
            'market-table.csv': dualCsv(a),
            'report.html': dualHtml(packet, a),
            'evidence.mjson': JSON.stringify(packet, null, 2) + '\n',
            'status.mjson': JSON.stringify({ result: a.status, summary }, null, 2) + '\n'
        };
        const manifest = { version: 1, engine: DUAL_ENGINE, status: a.status, evidenceSha256: hash(files['evidence.mjson']), files: Object.fromEntries(FILES.map(name => [name, hash(files[name])])) };
        for (const name of FILES)
            await writeFile(join(stage, name), files[name]);
        await writeFile(join(stage, 'manifest.mjson'), JSON.stringify(manifest, null, 2) + '\n');
        await validateDualArtifacts(stage);
        await rename(stage, out);
    }
    catch (e) {
        await rm(stage, { recursive: true, force: true });
        throw e;
    }
}
export async function validateDualArtifacts(dir) {
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.mjson'), 'utf8'));
    if (manifest.version !== 1 || manifest.engine !== DUAL_ENGINE || !manifest.files || JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify([...FILES].sort()) || JSON.stringify((await readdir(dir)).sort()) !== JSON.stringify([...FILES, 'manifest.mjson'].sort()))
        throw Error('Dual report manifest contract mismatch');
    const evidence = await readFile(join(dir, 'evidence.mjson'), 'utf8');
    if (manifest.evidenceSha256 !== hash(evidence))
        throw Error('Dual evidence checksum mismatch');
    const packet = JSON.parse(evidence), a = analyzeDual(packet);
    if (manifest.status !== a.status)
        throw Error('Dual status mismatch');
    const expected = {
        'brief.md': `# 한·미 국채 금리 분석\n\n요청 ${packet.ktb.base} → ${packet.ktb.asOf} · ${a.status}\n\nKTB 관측 ${a.ktb.previous.actual ?? '없음'} → ${a.ktb.current.actual ?? '없음'} · ${a.ktb.movement}\n\nUST 관측 ${a.ust.previous.actual ?? '없음'} → ${a.ust.current.actual ?? '없음'} · ${a.ust.movement}\n\nUST 10Y − KTB 10Y: ${crossLabel(a)} (공통 관측일 ${a.cross.current.actual ?? '없음'})\n\n${scheduleBrief(a)}\n${a.notes.map(n => `- ${mdLine(n)}`).join('\n')}\n\n원천: https://ecos.bok.or.kr/ · ${UST_SOURCE_PAGE}\n`,
        'market-table.csv': dualCsv(a), 'report.html': dualHtml(packet, a), 'evidence.mjson': evidence, 'status.mjson': JSON.stringify({ result: a.status, summary: dualSummary(packet, a) }, null, 2) + '\n'
    };
    for (const name of FILES) {
        const content = await readFile(join(dir, name), 'utf8');
        if (hash(content) !== manifest.files[name] || content !== expected[name])
            throw Error(`${name}: hash or deterministic output mismatch`);
    }
    if (a.status === 'READY' && (!expected['report.html'].includes('원천·수집 기록') || !expected['report.html'].includes(UST_SOURCE_PAGE)))
        throw Error('Dual READY report lacks source provenance');
}
