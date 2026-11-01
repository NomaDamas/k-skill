"use strict";

/**
 * 신구조문대비표 — 현행·개정안 단위(항·호·목) 짝짓기
 *
 * 대비표는 현행을 기준으로 개정 부분을 적는다. 법제처 신구법비교 원문(3,795쌍)은 번호가 같으면
 * 내용이 통째로 바뀌어도 그 번호끼리 짝을 짓고, 남는 번호만 <신  설>·<삭  제>로 둔다
 * (가운데 항을 끼워 번호가 밀려도 "(현행 제N항과 같음)" 0건). 그래서 번호 일치가 언제나 이기게
 * 가산점을 유사도(≤1)보다 크게 두고, 번호가 어긋난 단위끼리는 내용이 비슷할 때만 짝을 짓는다.
 */
const { normalizeForCompare } = require("./units.js");
const LABEL_BONUS = 2;
const MIN_SIM_UNLABELED = 0.5;
function grams(s) {
    const norm = normalizeForCompare(s);
    const map = new Map();
    const t = norm.replace(/\s/g, "");
    for (let i = 0; i < t.length - 1; i++) {
        const g = t.slice(i, i + 2);
        map.set(g, (map.get(g) ?? 0) + 1);
    }
    return { map, total: Math.max(0, t.length - 1), norm };
}
/** 글자 바이그램 Dice 계수 (0~1) — 작은 쪽 표만 돈다 */
function dice(a, b) {
    if (a.norm === b.norm)
        return 1;
    if (!a.total || !b.total)
        return 0;
    const [small, big] = a.map.size <= b.map.size ? [a, b] : [b, a];
    let inter = 0;
    for (const [g, v] of small.map)
        inter += Math.min(v, big.map.get(g) ?? 0);
    return (2 * inter) / (a.total + b.total);
}
/** 자손까지 이은 본문 — 머리글이 같고 호만 바뀐 항도 같은 짝으로 잡히게 */
function fullText(u) {
    return [u.body, ...u.children.map(fullText)].join(" ");
}
/** 유사도 계산 짝 수 상한 — 넘으면 표 없이 번호만으로 선형 짝짓기(수천 줄 입력의 메모리·시간 보호) */
const MAX_SCORED_PAIRS = 10_000;
const keyOf = (u) => `${u.kind}:${u.label}`;
/** 번호(같은 층 같은 라벨)만으로 순서대로 짝 — O(n + m) */
function alignByLabel(a, b) {
    const pos = new Map();
    b.forEach((u, k) => {
        const e = pos.get(keyOf(u)) ?? { at: [], p: 0 };
        e.at.push(k);
        pos.set(keyOf(u), e);
    });
    const out = [];
    let j = 0;
    for (const x of a) {
        const e = pos.get(keyOf(x));
        while (e && e.p < e.at.length && e.at[e.p] < j)
            e.p++;
        const k = e && e.p < e.at.length ? e.at[e.p++] : undefined;
        if (k === undefined) {
            out.push({ old: x, children: [] });
            continue;
        }
        for (; j < k; j++)
            out.push({ new: b[j], children: [] });
        out.push({ old: x, new: b[k], children: alignUnits(x.children, b[k].children) });
        j = k + 1;
    }
    for (; j < b.length; j++)
        out.push({ new: b[j], children: [] });
    return out;
}
function alignUnits(a, b) {
    const n = a.length, m = b.length;
    if (n * m > MAX_SCORED_PAIRS)
        return alignByLabel(a, b);
    const ga = a.map(u => [grams(u.body), grams(fullText(u))]), gb = b.map(u => [grams(u.body), grams(fullText(u))]);
    const pairScore = (i, j) => {
        if (a[i].kind !== b[j].kind)
            return -1;
        const sim = Math.max(dice(ga[i][0], gb[j][0]), dice(ga[i][1], gb[j][1]));
        if (a[i].label === b[j].label)
            return LABEL_BONUS + sim;
        return sim >= MIN_SIM_UNLABELED ? sim : -1;
    };
    const score = a.map((_, i) => b.map((_, j) => pairScore(i, j)));
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            const sc = score[i][j];
            dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], sc >= 0 ? dp[i + 1][j + 1] + sc : -Infinity);
        }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
        const sc = i < n && j < m ? score[i][j] : -1;
        if (sc >= 0 && dp[i][j] === dp[i + 1][j + 1] + sc) {
            out.push({ old: a[i], new: b[j], children: alignUnits(a[i].children, b[j].children) });
            i++;
            j++;
        }
        else if (i < n && (j >= m || dp[i][j] === dp[i + 1][j])) {
            out.push({ old: a[i], children: [] });
            i++;
        }
        else {
            out.push({ new: b[j], children: [] });
            j++;
        }
    }
    return out;
}
const bodyEq = (n) => normalizeForCompare(n.old.body) === normalizeForCompare(n.new.body);
/** 현행과 같음 — 번호·본문·자손 전부 같다 */
function isSame(n) {
    return !!n.old && !!n.new && n.old.label === n.new.label && bodyEq(n) && n.children.every(isSame);
}
/** 개정안이 "③ 삭제" 로 지운 단위 */
function isDeletedInPlace(n) {
    return !!n.old && !!n.new && /^삭제\.?$/.test(n.new.body) && !/^삭제\.?$/.test(n.old.body);
}

module.exports = { alignUnits, isSame, isDeletedInPlace };
