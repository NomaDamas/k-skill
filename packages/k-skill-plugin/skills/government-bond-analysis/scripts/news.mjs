import { date, sha256 } from './core.mjs';
const sourceTypes = new Set(['market-close', 'market-update', 'official-release', 'headline']);
const directions = new Set(['higher', 'lower', 'mixed', 'flat', 'context']);
const relations = new Set(['explicit', 'contextual']);
const clean = (value, name, max, min = 1) => {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
        throw Error(`Invalid news ${name}`);
    return value;
};
const instant = (value, name) => {
    const text = clean(value, name, 40), time = Date.parse(text);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== text)
        throw Error(`Invalid news ${name}`);
    return text;
};
const kstDate = (instantValue) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instantValue));
    const pick = (type) => parts.find(p => p.type === type)?.value ?? '';
    return date(`${pick('year')}-${pick('month')}-${pick('day')}`);
};
const acceptedHost = (hostname) => ['news.einfomax.co.kr', 'kr.investing.com', 'www.investing.com', 'investing.com'].includes(hostname) || ['bok.or.kr', 'moef.go.kr', 'federalreserve.gov', 'treasury.gov', 'kostat.go.kr'].some(x => hostname === x || hostname.endsWith(`.${x}`));
const fingerprint = (a) => sha256(JSON.stringify(a));
export function newsRead(raw) {
    if (raw.length > 100_000)
        throw Error('News evidence exceeds 100 KB character limit');
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.version !== 1)
        throw Error('Unsupported news evidence');
    if (Object.keys(doc).some(k => !['version', 'observationDate', 'retrievedAt', 'articles'].includes(k)))
        throw Error('Unknown news evidence field');
    const observationDate = date(clean(doc.observationDate, 'observationDate', 10)), retrievedAt = instant(doc.retrievedAt, 'retrievedAt');
    if (!Array.isArray(doc.articles) || doc.articles.length < 1 || doc.articles.length > 5)
        throw Error('News evidence requires 1..5 articles');
    const articles = doc.articles.map((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw Error(`Invalid news article ${index + 1}`);
        const x = value;
        if (Object.keys(x).some(k => !['publisher', 'title', 'url', 'publishedAt', 'sourceType', 'marketDirection', 'relation', 'factor', 'evidenceSummary', 'sourceFingerprint'].includes(k)))
            throw Error(`Unknown news article field ${index + 1}`);
        const publisher = clean(x.publisher, 'publisher', 80, 2), title = clean(x.title, 'title', 220, 5), publishedAt = instant(x.publishedAt, 'publishedAt'), factor = clean(x.factor, 'factor', 140, 2), evidenceSummary = clean(x.evidenceSummary, 'evidenceSummary', 280, 20);
        if (typeof x.sourceType !== 'string' || !sourceTypes.has(x.sourceType) || typeof x.marketDirection !== 'string' || !directions.has(x.marketDirection) || typeof x.relation !== 'string' || !relations.has(x.relation))
            throw Error(`Invalid news classification ${index + 1}`);
        let parsed;
        try {
            parsed = new URL(clean(x.url, 'url', 2048));
        }
        catch {
            throw Error(`Invalid news URL ${index + 1}`);
        }
        const host = parsed.hostname.toLowerCase();
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !acceptedHost(host))
            throw Error(`Unapproved news host ${index + 1}`);
        if ((host === 'news.einfomax.co.kr' && publisher !== '연합인포맥스') || ((host === 'investing.com' || host.endsWith('.investing.com')) && publisher !== 'Investing.com'))
            throw Error(`Publisher/host mismatch ${index + 1}`);
        if (Date.parse(publishedAt) > Date.parse(retrievedAt) || kstDate(publishedAt) !== observationDate)
            throw Error(`News date alignment mismatch ${index + 1}`);
        const articleBase = { publisher, title, url: parsed.toString(), publishedAt, sourceType: x.sourceType, marketDirection: x.marketDirection, relation: x.relation, factor, evidenceSummary };
        const sourceFingerprint = fingerprint(articleBase);
        if (x.sourceFingerprint !== undefined && x.sourceFingerprint !== sourceFingerprint)
            throw Error(`News fingerprint mismatch ${index + 1}`);
        if (articleBase.sourceType === 'official-release' && (articleBase.marketDirection !== 'context' || articleBase.relation !== 'contextual'))
            throw Error(`Official release must be contextual ${index + 1}`);
        if (articleBase.relation === 'explicit' && articleBase.marketDirection === 'context')
            throw Error(`Explicit article requires market direction ${index + 1}`);
        return { ...articleBase, sourceFingerprint };
    });
    if (new Set(articles.map(x => x.url)).size !== articles.length || new Set(articles.map(x => x.sourceFingerprint)).size !== articles.length)
        throw Error('Duplicate news article');
    return { version: 1, observationDate, retrievedAt, articles };
}
function direction(a) {
    if (!a.changes)
        return null;
    const short = a.changes[1], long = a.changes[3], eps = 1e-7;
    if (Math.abs(short) < eps && Math.abs(long) < eps)
        return 'flat';
    if (short > eps && long > eps)
        return 'higher';
    if (short < -eps && long < -eps)
        return 'lower';
    return 'mixed';
}
export function analyzeNews(evidence, a) {
    const curveDirection = direction(a);
    if (!evidence)
        return { status: 'DISABLED', confidence: null, curveDirection, commentary: [], eligible: [], context: [], excluded: [], notes: [] };
    const normalized = newsRead(JSON.stringify(evidence));
    if (!a.current.actual || normalized.observationDate !== a.current.actual)
        throw Error('News observation date must equal the current common observation date');
    const context = normalized.articles.filter(x => x.relation === 'contextual'), eligible = curveDirection ? normalized.articles.filter(x => x.relation === 'explicit' && x.marketDirection === curveDirection) : [];
    const excluded = normalized.articles.filter(x => x.relation === 'explicit' && x.marketDirection !== curveDirection), notes = [];
    if (excluded.length)
        notes.push(`${excluded.length}개 기사는 관측된 3Y·10Y 방향과 불일치하여 원인 코멘트에서 제외`);
    let status = 'UNATTRIBUTED', confidence = null;
    if (eligible.length) {
        status = 'SOURCED';
        confidence = eligible.some(x => x.sourceType === 'market-close' && new URL(x.url).hostname === 'news.einfomax.co.kr') ? 'HIGH' : new Set(eligible.map(x => new URL(x.url).hostname)).size >= 2 ? 'MEDIUM' : 'LOW';
    }
    else if (context.length)
        status = 'CONTEXT_ONLY';
    const commentary = eligible.slice(0, 3).map(x => `시장 배경: ${x.factor} (${x.publisher} 「${x.title}」).`);
    if (status === 'CONTEXT_ONLY')
        commentary.push('같은 관측일의 공식 발표는 확인했지만 시장 움직임의 직접 원인으로 연결하지 않았다.');
    if (status === 'UNATTRIBUTED')
        commentary.push('관측 방향과 날짜가 일치하는 근거 기사를 확인하지 못했다.');
    return { status, confidence, curveDirection, commentary, eligible, context, excluded, notes };
}
export function newsTemplate(observationDate, retrievedAt) {
    date(observationDate);
    instant(retrievedAt, 'retrievedAt');
    const publishedAt = new Date(`${observationDate}T00:00:00+09:00`).toISOString();
    return JSON.stringify({ version: 1, observationDate, retrievedAt, articles: [{ publisher: '연합인포맥스', title: '기사 제목을 입력', url: 'https://news.einfomax.co.kr/news/articleView.html?idxno=0000000', publishedAt, sourceType: 'market-close', marketDirection: 'mixed', relation: 'explicit', factor: '기사에서 명시한 시장 배경을 짧게 의역', evidenceSummary: '기사에서 시장 배경을 설명한 근거를 20~280자로 의역' }] }, null, 2) + '\n';
}
