import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { analyze, TENORS } from './core.mjs';
import { analyzeNews } from './news.mjs';
const h = (s) => createHash('sha256').update(s).digest('hex');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (s) => String(s).replace(/[\\`*_[\]<>]/g, '\\$&');
const n = (v, d = 2) => v === null ? '—' : v.toFixed(d);
const signed = (v) => v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
const trend = (v) => v === null ? '판정 불가' : v > 0 ? '상승' : v < 0 ? '하락' : '보합';
const spreadTrend = (v) => v === null ? '판정 불가' : v > 0 ? '확대' : v < 0 ? '축소' : '보합';
export function marketCsv(p, a) {
    const rows = ['구분,만기,현재 요청일,현재 관측일,현재 금리(%),비교 요청일,비교 관측일,비교 금리(%),변화(bp)'];
    TENORS.forEach((t, i) => rows.push([
        '금리', `${t}Y`, a.current.requested, a.current.actual ?? '', a.current.values?.[i] ?? '', a.previous.requested, a.previous.actual ?? '', a.previous.values?.[i] ?? '', a.changes?.[i] ?? ''
    ].join(',')));
    a.spreads.forEach(s => rows.push(['스프레드', s.name, a.current.requested, a.current.actual ?? '', s.current ?? '', a.previous.requested, a.previous.actual ?? '', s.previous ?? '', s.change ?? ''].join(',')));
    return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
export function brief(p, a, news = analyzeNews(p.newsEvidence, a)) {
    const current = a.current.actual ?? '확인 불가', previous = a.previous.actual ?? '확인 불가';
    const lines = [`# ${md(p.label)}`, ``, `- 상태: **${a.status}**`, `- 요청 기준일: ${p.asOf} / 사용 관측일: ${current}`,
        `- 비교 기준일: ${p.base} / 사용 관측일: ${previous}`, ''];
    if (a.changes && a.current.values && a.previous.values) {
        const i3 = TENORS.indexOf(3), i5 = TENORS.indexOf(5), i10 = TENORS.indexOf(10), s103 = a.spreads.find(s => s.name === '10년−3년');
        lines.push('## 핵심 변화', '', `- 국고채 3년은 ${signed(a.changes[i3])}bp ${trend(a.changes[i3])}, 5년은 ${signed(a.changes[i5])}bp ${trend(a.changes[i5])}, 10년은 ${signed(a.changes[i10])}bp ${trend(a.changes[i10])}.`, `- 10년−3년 스프레드는 ${n(s103.current)}bp이며 비교일보다 ${n(Math.abs(s103.change ?? 0))}bp ${spreadTrend(s103.change)}.`, `- 곡선 움직임: **${a.movement}**.`, '');
    }
    else
        lines.push('## 결과 제한', '', '- 비교 가능한 여섯 만기의 공통 관측값이 없어 변화 계산과 문장 생성을 차단했습니다.', '');
    if (news.status !== 'DISABLED')
        lines.push('## 시장 배경', '', `- 뉴스 근거 상태: **${news.status}**${news.confidence ? ` / 신뢰도 **${news.confidence}**` : ''}`, ...news.commentary.map(x => `- ${md(x)}`), ...news.notes.map(x => `- 주의: ${md(x)}`), ...([...news.eligible.map(x => ({ label: '채택', article: x })), ...news.context.map(x => ({ label: '맥락', article: x })), ...news.excluded.map(x => ({ label: '제외', article: x }))].map(({ label, article: x }) => `- ${label} · ${md(x.publisher)} · ${md(x.title)} · ${x.publishedAt} · [원문](${x.url}) · 근거 SHA-256 ${x.sourceFingerprint}`)), '', '- 기사에서 전한 시장 해석을 출처와 함께 요약했으며, ECOS 수치만으로 인과관계를 확정하지 않는다.', '');
    lines.push('## 검증 메모', '', ...(a.notes.length ? a.notes.map(x => `- ${md(x)}`) : ['- 결측·날짜 정렬 경고 없음.']), '', '## 출처', '', ...p.receipts.map(r => `- ${r.tenor}년: ${md(r.sourceId)} / ${md(r.statCode)}·${md(r.itemCode)} ${md(r.itemName)} / ${md(r.unit)}·${md(r.cycle)} / ${r.first ?? '없음'}~${r.last ?? '없음'} (${r.count}건) / ${r.status} / 원문 SHA-256 ${r.rawSha256.join(', ') || '없음'}${r.sourceUrl ? ` / ${r.sourceUrl}` : ''}`), '', '## 해석 범위', '', '- 이 결과는 공식 통계의 기간 비교다. 실시간 호가, 원인 추정, 금리 전망 또는 투자 권유가 아니다.', '');
    return lines.join('\n') + '\n';
}
function chart(a) {
    if (!a.current.values || !a.previous.values)
        return '<div class="empty">공통 관측값이 없어 차트를 생성하지 않았습니다.</div>';
    const all = [...a.current.values, ...a.previous.values], min = Math.min(...all) - .03, max = Math.max(...all) + .03, range = Math.max(max - min, .1);
    const x = (i) => 75 + i * (500 / (TENORS.length - 1)), y = (v) => 260 - (v - min) / range * 190;
    const path = (values) => values.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v).toFixed(1)}`).join(' ');
    const grid = [0, .25, .5, .75, 1].map(q => { const yy = 260 - q * 190, v = min + q * range; return `<line x1="62" y1="${yy}" x2="560" y2="${yy}"/><text x="54" y="${yy + 4}" text-anchor="end">${v.toFixed(2)}</text>`; }).join('');
    const dots = (values, cls) => values.map((v, i) => `<circle class="${cls}" cx="${x(i)}" cy="${y(v)}" r="5"/>`).join('');
    const labels = (values, other, cls) => values.map((v, i) => { const above = y(v) <= y(other[i]), baseline = y(v) + (above ? -14 : 22), top = baseline - 13; return `<g class="value-label ${cls}"><rect x="${x(i) - 24}" y="${top}" width="48" height="18" rx="5"/><text x="${x(i)}" y="${baseline}" text-anchor="middle">${v.toFixed(3)}</text></g>`; }).join('');
    return `<svg viewBox="0 0 620 320" role="img" aria-label="국고채 수익률곡선 비교"><g class="grid">${grid}</g><path class="line prior" d="${path(a.previous.values)}"/><path class="line now" d="${path(a.current.values)}"/>${dots(a.previous.values, 'prior')}${dots(a.current.values, 'now')}${labels(a.previous.values, a.current.values, 'prior')}${labels(a.current.values, a.previous.values, 'now')}<g class="axis">${TENORS.map((t, i) => `<text x="${x(i)}" y="288" text-anchor="middle">${t}년</text>`).join('')}</g><g class="legend"><circle cx="405" cy="26" r="5" class="now"/><text x="416" y="30">현재</text><circle cx="485" cy="26" r="5" class="prior"/><text x="496" y="30">비교</text></g></svg>`;
}
export function html(p, a, news = analyzeNews(p.newsEvidence, a)) {
    const statusClass = a.status.toLowerCase();
    const allInput = p.receipts.every(r => r.status === 'input'), allEcos = p.receipts.every(r => r.status !== 'input');
    const sourceFooter = allInput ? '출처: 사용자 제공 CSV · 연% · 일별 입력자료. 원자료 성격은 제공자가 확인해야 합니다.' : allEcos ? '출처: 한국은행 ECOS 817Y002 · 연% · 일별 공식 통계. 실시간 호가나 투자 권유가 아닙니다.' : '출처: 한국은행 ECOS 및 사용자 제공 CSV 혼합 자료. 각 만기의 출처를 확인해야 합니다.';
    const rows = TENORS.map((t, i) => `<tr><td>${t}년</td><td>${n(a.previous.values?.[i] ?? null, 3)}</td><td>${n(a.current.values?.[i] ?? null, 3)}</td><td class="${(a.changes?.[i] ?? 0) > 0 ? 'up' : (a.changes?.[i] ?? 0) < 0 ? 'down' : ''}">${signed(a.changes?.[i] ?? null)}</td></tr>`).join('');
    const spreadRows = a.spreads.map(s => `<tr><td>${esc(s.name)}</td><td>${n(s.previous)}</td><td>${n(s.current)}</td><td>${signed(s.change)}</td></tr>`).join('');
    const sourceRows = p.receipts.map(r => `<tr><td>${r.tenor}년</td><td>${esc(r.sourceId)}</td><td>${esc(r.statCode)} / ${esc(r.itemCode)}<br><span class="sub">${esc(r.itemName)}</span></td><td>${esc(r.unit)} / ${esc(r.cycle)}</td><td>${esc(r.first ?? '없음')}<br>${esc(r.last ?? '없음')} · ${r.count}건</td><td>${esc(r.retrievedAt)}<br><strong>${esc(r.status)}</strong></td><td>${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" rel="noreferrer">공식 원천</a>` : '로컬 입력'}</td></tr>`).join('');
    const newsRows = [...news.eligible.map(x => ({ label: '채택', article: x })), ...news.context.map(x => ({ label: '맥락', article: x })), ...news.excluded.map(x => ({ label: '제외', article: x }))];
    const newsSection = news.status === 'DISABLED' ? '' : `<section class="card" style="margin-top:18px"><h2>시장 배경</h2><div class="metric">${news.status}${news.confidence ? ` · ${news.confidence}` : ''}</div><ul class="notes">${[...news.commentary, ...news.notes.map(x => `주의: ${x}`)].map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="scroll"><table class="news-table"><colgroup><col class="news-result"><col class="news-publisher"><col class="news-title"><col class="news-time"><col class="news-summary"></colgroup><thead><tr><th>판정</th><th>매체</th><th>기사</th><th>게시 UTC</th><th>근거 요약</th></tr></thead><tbody>${newsRows.map(({ label, article: x }) => `<tr><td>${label}</td><td>${esc(x.publisher)}</td><td><a href="${esc(x.url)}" rel="noreferrer">${esc(x.title)}</a></td><td>${esc(x.publishedAt)}</td><td>${esc(x.evidenceSummary)}</td></tr>`).join('')}</tbody></table></div><p class="sub">기사에서 전한 시장 해석을 출처와 함께 요약했으며, ECOS 수치만으로 인과관계를 확정하지 않습니다.</p></section>`;
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.label)}</title><style>
  :root{--ink:#172033;--muted:#687386;--paper:#f5f3ee;--card:#fff;--blue:#165dff;--orange:#e97522;--line:#dfe4eb;--good:#17745c;--warn:#a15c00;--bad:#a9363e}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:36px 22px 56px}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}h1{font-size:30px;line-height:1.16;margin:4px 0 8px;letter-spacing:-.03em}.eyebrow{font-size:12px;font-weight:700;color:var(--blue);letter-spacing:.08em}.meta{color:var(--muted);font-size:13px}.badge{padding:7px 12px;border-radius:999px;font-size:13px;font-weight:800;background:#e8f5f0;color:var(--good)}.badge.incomplete{background:#fff0d9;color:var(--warn)}.badge.blocked{background:#fae8e9;color:var(--bad)}.grid2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(340px,.7fr);gap:16px}.card{min-width:0;background:var(--card);border:1px solid var(--line);border-radius:15px;padding:19px;box-shadow:0 8px 24px #1a243008}.scroll{overflow-x:auto}h2{font-size:17px;margin:0 0 13px}table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:8px 7px;border-bottom:1px solid var(--line);vertical-align:middle}th:first-child,td:first-child{text-align:left}th{color:var(--muted);font-size:11px;font-weight:700;line-height:1.25;white-space:nowrap;text-transform:uppercase}.rates-table td,.spread-table td{white-space:nowrap}.news-table,.source-table{table-layout:fixed;min-width:920px}.news-table th,.news-table td,.source-table th,.source-table td{text-align:left;overflow-wrap:break-word}.news-table .news-result{width:7%}.news-table .news-publisher{width:12%}.news-table .news-title{width:24%}.news-table .news-time{width:18%}.news-table .news-summary{width:39%}.source-table .source-tenor{width:7%}.source-table .source-provider{width:18%}.source-table .source-code{width:21%}.source-table .source-unit{width:10%}.source-table .source-range{width:18%}.source-table .source-retrieved{width:18%}.source-table .source-link{width:8%}.metric{font-size:23px;line-height:1.25;font-weight:800}.sub{color:var(--muted);font-size:12px}.notes{margin:0;padding-left:19px}.notes li+li{margin-top:6px}svg{display:block;width:100%;height:auto}.grid line{stroke:#e5e9ef}.grid text,.axis text,.legend text{fill:#687386;font-size:11px}.line{fill:none;stroke-width:2.5}.line.now{stroke:var(--blue)}.line.prior{stroke:var(--orange);stroke-dasharray:7 5}circle.now{fill:var(--blue)}circle.prior{fill:var(--orange)}.value-label rect{fill:#fff;stroke-width:1}.value-label text{font-size:10.5px;font-weight:750;font-variant-numeric:tabular-nums}.value-label.now rect{stroke:#9db8ff}.value-label.now text{fill:#174fc5}.value-label.prior rect{stroke:#f0bc95}.value-label.prior text{fill:#a84e12}.empty{padding:80px 20px;text-align:center;color:var(--muted)}footer{margin-top:16px;color:var(--muted);font-size:11px}@media(max-width:820px){.grid2{grid-template-columns:1fr}header{display:block}.badge{display:inline-block;margin-top:12px}}@media(max-width:560px){.wrap{padding:24px 12px 40px}.card{padding:15px}h1{font-size:25px}}
  </style></head><body><main class="wrap"><header><div><div class="eyebrow">KOREAN RATES · VERIFIED SNAPSHOT</div><h1>${esc(p.label)}</h1><div class="meta">요청 ${esc(p.base)} → ${esc(p.asOf)} · 관측 ${esc(a.previous.actual ?? '없음')} → ${esc(a.current.actual ?? '없음')}</div></div><div class="badge ${statusClass}">${a.status}</div></header><section class="grid2"><article class="card"><h2>수익률곡선</h2>${chart(a)}</article><article class="card"><h2>곡선 판정</h2><div class="metric">${esc(a.movement)}</div><p class="sub">3년과 10년 변화 및 10년−3년 스프레드를 기준으로 한 기계적 분류</p><table class="spread-table"><thead><tr><th>구간</th><th>비교</th><th>현재</th><th>변화(bp)</th></tr></thead><tbody>${spreadRows}</tbody></table></article></section><section class="card" style="margin-top:16px"><h2>만기별 금리</h2><table class="rates-table"><thead><tr><th>만기</th><th>비교일(%)</th><th>현재일(%)</th><th>변화(bp)</th></tr></thead><tbody>${rows}</tbody></table></section>${newsSection}<section class="card" style="margin-top:16px"><h2>검증 메모</h2><ul class="notes">${(a.notes.length ? a.notes : ['결측·날짜 정렬 경고 없음.']).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section><section class="card" style="margin-top:16px"><h2>원천·검증 추적</h2><div class="scroll"><table class="source-table" data-provenance="true"><colgroup><col class="source-tenor"><col class="source-provider"><col class="source-code"><col class="source-unit"><col class="source-range"><col class="source-retrieved"><col class="source-link"></colgroup><thead><tr><th>만기</th><th>제공기관</th><th>통계/항목</th><th>단위/주기</th><th>관측 범위</th><th>수집 UTC/방식</th><th>링크</th></tr></thead><tbody>${sourceRows}</tbody></table></div></section><footer>${esc(sourceFooter)}</footer></main></body></html>`;
}
const artifactNames = ['market-table.csv', 'brief.md', 'report.html', 'evidence.mjson', 'status.mjson'];
function statusJson(p, a, news) { return JSON.stringify({ status: a.status, notes: a.notes, usable: a.status === 'READY', news: { status: news.status, confidence: news.confidence, curveDirection: news.curveDirection, notes: news.notes, sources: [...news.eligible.map(x => ({ disposition: 'eligible', ...x })), ...news.context.map(x => ({ disposition: 'context', ...x })), ...news.excluded.map(x => ({ disposition: 'excluded', ...x }))].map(({ disposition, publisher, title, url, publishedAt, sourceFingerprint }) => ({ disposition, publisher, title, url, publishedAt, sourceFingerprint })) }, sources: p.receipts.map(({ tenor, status, sourceId, statCode, itemCode, unit, cycle, count, first, last, retrievedAt, rawSha256 }) => ({ tenor, status, sourceId, statCode, itemCode, unit, cycle, count, first, last, retrievedAt, rawSha256 })) }, null, 2) + '\n'; }
export async function writeArtifacts(out, p) {
    const a = analyze(p), news = analyzeNews(p.newsEvidence, a), parent = dirname(out), stage = join(parent, `.${basename(out)}.stage-${process.pid}-${randomUUID()}`);
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
        await mkdir(stage, { recursive: false });
        const evidence = JSON.stringify(p, null, 2) + '\n';
        const files = { 'market-table.csv': marketCsv(p, a), 'brief.md': brief(p, a, news), 'report.html': html(p, a, news), 'evidence.mjson': evidence, 'status.mjson': statusJson(p, a, news) };
        const manifest = { version: 5, engine: p.engine, status: a.status, newsStatus: news.status, evidenceSha256: h(evidence), files: {} };
        for (const name of artifactNames) {
            const content = files[name];
            if (/NaN|undefined/.test(content))
                throw Error(`${name}: invalid token`);
            manifest.files[name] = h(content);
            await writeFile(join(stage, name), content);
        }
        await writeFile(join(stage, 'manifest.mjson'), JSON.stringify(manifest, null, 2) + '\n');
        await validateArtifacts(stage);
        await rename(stage, out);
        return manifest;
    }
    catch (e) {
        await rm(stage, { recursive: true, force: true });
        throw e;
    }
}
export async function validateArtifacts(dir) {
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.mjson'), 'utf8'));
    if (manifest.version !== 5 || manifest.engine !== 'korean-interest-rate-analysis/5' || !manifest.files || typeof manifest.files !== 'object')
        throw Error('Unsupported manifest');
    const expected = [...artifactNames].sort(), declared = Object.keys(manifest.files).sort(), present = (await readdir(dir)).sort();
    if (JSON.stringify(declared) !== JSON.stringify(expected) || JSON.stringify(present) !== JSON.stringify([...expected, 'manifest.mjson'].sort()) || Object.values(manifest.files).some(x => typeof x !== 'string' || !/^[a-f0-9]{64}$/.test(x)) || !/^[a-f0-9]{64}$/.test(manifest.evidenceSha256))
        throw Error('Manifest file contract mismatch');
    const evidence = await readFile(join(dir, 'evidence.mjson'), 'utf8');
    if (h(evidence) !== manifest.evidenceSha256)
        throw Error('Evidence hash mismatch');
    const p = JSON.parse(evidence), a = analyze(p), news = analyzeNews(p.newsEvidence, a);
    if (a.status !== manifest.status || news.status !== manifest.newsStatus)
        throw Error('Status mismatch');
    for (const [name, digest] of Object.entries(manifest.files)) {
        const content = await readFile(join(dir, name), 'utf8');
        if (h(content) !== digest)
            throw Error(`${name}: hash mismatch`);
    }
    const mdFile = await readFile(join(dir, 'brief.md'), 'utf8'), csv = await readFile(join(dir, 'market-table.csv'), 'utf8'), page = await readFile(join(dir, 'report.html'), 'utf8'), status = await readFile(join(dir, 'status.mjson'), 'utf8');
    if (mdFile !== brief(p, a, news) || csv !== marketCsv(p, a) || page !== html(p, a, news) || status !== statusJson(p, a, news))
        throw Error('Rendered artifact is not reproducible');
    if (a.status === 'READY' && (!page.includes('<svg') || csv.trim().split(/\r?\n/).length !== 1 + TENORS.length + a.spreads.length || !mdFile.includes('## 핵심 변화') || !page.includes('data-provenance="true"') || !page.includes('class="value-label') || page.includes('원문 SHA-256') || p.receipts.some(r => r.sourceUrl && !page.includes(r.sourceUrl))))
        throw Error('READY output contract is incomplete');
    if (a.status !== 'READY' && !mdFile.includes('## 결과 제한'))
        throw Error('Non-ready output must state its limitation');
}
