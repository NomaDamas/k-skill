"use strict";

/**
 * 신구조문대비표 — 한 단위 본문의 현행·개정안 문장 비교 → 밑줄 구간
 *
 * 법제처 신구법비교 원문의 `<P>` 밑줄 구간에서 읽은 규칙:
 * - 밑줄은 어절 단위다(글자 단위로 공통부분을 깎지 않는다).
 * - 끼워 넣기·빼기만 있으면 이웃 어절을 붙잡아 양쪽에 다 긋는다("<u>공공장소</u>" →
 *   "<u>공공장소, 동물병원 …</u>"). 개정문이 「A」를 「A, B」로 쓰는 것과 같은 단위다.
 * - 덩어리 끝의 같은 조사는 밑줄 밖에 둔다("<u>공사완료도서</u>를").
 */
const { splitEdges } = require("./units.js");
/** 어절(+뒤 공백) 토큰 — 여는 괄호 앞에서도 끊는다("특별자치도지사(이하" → 두 토큰). 이어 붙이면 원문 */
function tokenize(s) {
    return s.match(/[^\s([「“]+\s*|[([「“][^\s([「“]*\s*|\s+/g) ?? [];
}
/** LCS 표 칸 수 상한(4M칸 = 16MB). 넘으면 앞뒤 같은 어절만 떼는 선형 비교로 — 원격 서버 메모리 보호 */
const MAX_LCS_CELLS = 4_000_000;
function lcsOps(a, b) {
    const n = a.length, m = b.length;
    const key = (t) => t.trimEnd();
    if ((n + 1) * (m + 1) > MAX_LCS_CELLS) {
        let p = 0, q = 0;
        while (p < n && p < m && key(a[p]) === key(b[p]))
            p++;
        while (q < n - p && q < m - p && key(a[n - 1 - q]) === key(b[m - 1 - q]))
            q++;
        return [
            { kind: "eq", a: a.slice(0, p), b: b.slice(0, p) },
            { kind: "chg", a: a.slice(p, n - q), b: b.slice(p, m - q) },
            { kind: "eq", a: a.slice(n - q), b: b.slice(m - q) },
        ].filter(op => op.a.length || op.b.length);
    }
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const ops = [];
    const push = (kind, x, y) => {
        let last = ops[ops.length - 1];
        if (!last || last.kind !== kind) {
            last = { kind, a: [], b: [] };
            ops.push(last);
        }
        if (x !== undefined)
            last.a.push(x);
        if (y !== undefined)
            last.b.push(y);
    };
    let i = 0, j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && key(a[i]) === key(b[j])) {
            push("eq", a[i], b[j]);
            i++;
            j++;
        }
        else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
            push("chg", undefined, b[j]);
            j++;
        }
        else {
            push("chg", a[i]);
            i++;
        }
    }
    return ops;
}
/** 끼워 넣기·빼기만 있는 덩어리에 앞(없으면 뒤) 어절 하나를 붙인다 */
function anchorPureEdits(ops) {
    for (let k = 0; k < ops.length; k++) {
        const op = ops[k];
        if (op.kind !== "chg" || (op.a.length && op.b.length))
            continue;
        const prev = ops[k - 1], next = ops[k + 1];
        if (prev?.kind === "eq" && prev.a.length) {
            op.a.unshift(prev.a.pop());
            op.b.unshift(prev.b.pop());
        }
        else if (next?.kind === "eq" && next.a.length) {
            op.a.push(next.a.shift());
            op.b.push(next.b.shift());
        }
    }
    return ops.filter(op => op.a.length || op.b.length);
}
const JOSA = ["으로써", "로써", "으로서", "로서", "에서는", "에서", "에게", "에는", "으로", "부터", "까지", "이나",
    "로", "을", "를", "이", "가", "은", "는", "의", "에", "와", "과", "도", "만"];
/** 양쪽 덩어리 끝의 같은 문장부호(, .)·조사는 떼어 밑줄 밖으로 */
function splitJosa(a, b) {
    let ta = a.trimEnd(), tb = b.trimEnd();
    let tail = a.slice(ta.length);
    const p = ta.match(/[,.]+$/)?.[0];
    if (p && tb.endsWith(p) && ta.length > p.length && tb.length > p.length) {
        ta = ta.slice(0, -p.length);
        tb = tb.slice(0, -p.length);
        tail = p + tail;
    }
    for (const j of JOSA) {
        if (ta.length <= j.length || tb.length <= j.length || !ta.endsWith(j) || !tb.endsWith(j))
            continue;
        const ca = ta[ta.length - j.length - 1], cb = tb[tb.length - j.length - 1];
        if (/[\d\s]/.test(ca) || /[\d\s]/.test(cb))
            continue;
        return { a: ta.slice(0, -j.length), b: tb.slice(0, -j.length), suf: j + tail };
    }
    return { a: ta, b: tb, suf: tail };
}
function pushSeg(segs, text, u) {
    if (!text)
        return;
    const last = segs[segs.length - 1];
    if (last && last.u === u)
        last.text += text;
    else
        segs.push({ text, u });
}
/** 밑줄 구간 양 끝 공백은 밑줄 밖으로 뺀다 */
function liftSpaces(segs) {
    const out = [];
    for (const s of segs) {
        if (!s.u) {
            pushSeg(out, s.text, false);
            continue;
        }
        const [lead, core, tail] = splitEdges(s.text);
        pushSeg(out, lead, false);
        pushSeg(out, core, true);
        pushSeg(out, tail, false);
    }
    return out;
}
/** 바뀐 덩어리 사이에 낀 같은 어절이 MERGE_GAP 개 이하면 한 덩어리로 잇는다 */
const MERGE_GAP = 1;
function mergeNear(ops) {
    const out = [];
    for (const op of ops) {
        const prev = out[out.length - 1], before = out[out.length - 2];
        if (op.kind === "chg" && prev?.kind === "eq" && before?.kind === "chg" && prev.a.length <= MERGE_GAP) {
            out.pop();
            before.a.push(...prev.a, ...op.a);
            before.b.push(...prev.b, ...op.b);
            continue;
        }
        out.push(op);
    }
    return out;
}
/**
 * 같은 글자가 이 비율도 안 남으면 통째로 바뀐 단위로 본다 — 우연히 겹친 "또는"·"때" 섬을 남기지 않는다.
 * MERGE_GAP·WHOLE_RATIO 는 신구법비교 원문 93개 법령 838쌍으로 고르고 다른 100개 법령 624쌍에서
 * 확인한 값이다(글자 F1 0.955 / 0.947, 2026-10-31).
 */
const WHOLE_RATIO = 0.3;
const visible = (s) => s.replace(/\s/g, "").length;
function diffInline(oldText, newText) {
    const ops = mergeNear(anchorPureEdits(lcsOps(tokenize(oldText), tokenize(newText))));
    const same = ops.filter(op => op.kind === "eq").reduce((n, op) => n + visible(op.a.join("")), 0);
    if (same < WHOLE_RATIO * Math.max(visible(oldText), visible(newText))) {
        return { old: liftSpaces([{ text: oldText, u: true }]), new: liftSpaces([{ text: newText, u: true }]) };
    }
    const oldSegs = [], newSegs = [];
    for (const op of ops) {
        const a = op.a.join(""), b = op.b.join("");
        if (op.kind === "eq") {
            pushSeg(oldSegs, a, false);
            pushSeg(newSegs, b, false);
            continue;
        }
        const t = splitJosa(a, b);
        pushSeg(oldSegs, t.a, true);
        pushSeg(newSegs, t.b, true);
        pushSeg(oldSegs, t.suf, false);
        pushSeg(newSegs, t.suf, false);
    }
    return { old: liftSpaces(oldSegs), new: liftSpaces(newSegs) };
}

module.exports = { diffInline };
