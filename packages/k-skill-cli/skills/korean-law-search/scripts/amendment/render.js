"use strict";

/**
 * 신구조문대비표 — 조문 한 개(현행·개정안 트리) → 대비표 행
 *
 * 행 하나 = 현행 칸·개정안 칸이 마주 보는 한 묶음(법제처 신구법비교의 조문 쌍과 같은 단위).
 * - 같은 단위가 이어지면 "①·② (생  략)" / "(현행과 같음)" 한 줄로 묶는다.
 * - 조 머리(제N조(제목))는 첫 줄 앞에 붙고, 제목이 바뀌면 "(제목)" 을 통째 밑줄.
 * - 바뀐 단위: 현행 칸은 바뀐 부분 밑줄, 개정안 칸은 같은 부분 "----" + 바뀐 부분 밑줄.
 */
const { diffInline } = require("./diff.js");
const { alignUnits, isDeletedInPlace, isSame } = require("./align.js");
const { fillSame, normalizeForCompare, unitLines } = require("./units.js");
const { dashify, dashSegs, joinLabels, plain, under, MARK_DEL, MARK_NEW, OMIT_NEW, OMIT_OLD } = require("./marks.js");
const TAIL = /\s(다만,|이 경우)\s/;
/** 끝에 붙은 단서("다만,")·후단("이 경우") 문장을 떼어 낸다 */
function splitTail(body) {
    const m = body.match(new RegExp(`^([\\s\\S]*?\\.)${TAIL.source}([\\s\\S]*)$`));
    if (!m)
        return { main: body, tail: "", kind: null };
    return { main: m[1], tail: `${m[2]} ${m[3]}`, kind: m[2] === "다만," ? "단서" : "후단" };
}
const allUnder = (s) => s.every(x => x.u || !x.text.trim());
/** 본문 비교 → [현행 세그먼트, 개정안 세그먼트(줄표 처리됨), 통째 교체 여부] */
function diffBody(oldBody, newBody) {
    if (normalizeForCompare(oldBody) === normalizeForCompare(newBody)) {
        return { old: [plain(oldBody)], new: [plain(dashify(newBody))], whole: false };
    }
    // 단서·후단 표지는 앞 문장이 이어질 때만 — 통째로 바뀐 항의 "이 경우"는 후단 신설이 아니다
    const o = splitTail(oldBody), n = splitTail(newBody);
    if (!o.kind && n.kind) {
        const d = diffInline(oldBody, n.main);
        if (!allUnder(d.old) || !allUnder(d.new)) {
            return { old: [...d.old, plain(" "), under(`<${n.kind} 신설>`)], new: [...dashSegs(d.new), plain(" "), under(n.tail)], whole: false };
        }
    }
    if (o.kind && !n.kind) {
        const d = diffInline(o.main, newBody);
        if (!allUnder(d.old) || !allUnder(d.new)) {
            return { old: [...d.old, plain(" "), under(o.tail)], new: [...dashSegs(d.new), plain(" "), under(`<${o.kind} 삭제>`)], whole: false };
        }
    }
    const d = diffInline(oldBody, newBody);
    return { old: d.old, new: dashSegs(d.new), whole: allUnder(d.old) && allUnder(d.new) };
}
const withLabel = (unit, segs, u) => {
    const gap = unit.gap ? [u && segs[0]?.u ? under(unit.gap) : plain(unit.gap)] : [];
    return [u ? under(unit.label) : plain(unit.label), ...gap, ...segs];
};
const underAll = (lines) => lines.map(l => [under(l)]);
function changedRows(n, rows) {
    const o = n.old, w = n.new;
    // 하위 호·목이 새로 생기거나 다 없어지면 그 단위를 통째로 바꾼 것으로, 하위까지 한 칸에 적는다
    // (선원법 제179조·국민기초생활 보장법 제67조 — 공통 문구가 있어도 전부 밑줄)
    const d = diffBody(o.body, w.body);
    if (d.whole && (o.children.length === 0) !== (w.children.length === 0)) {
        rows.push({ old: underAll(unitLines(o)), new: underAll(unitLines(w)) });
        return;
    }
    const labelU = d.whole || o.label !== w.label;
    rows.push({ old: [withLabel(o, d.old, labelU)], new: [withLabel(w, d.new, labelU)] });
    renderNodes(n.children, rows);
}
function renderNodes(nodes, rows) {
    for (let k = 0; k < nodes.length;) {
        const n = nodes[k];
        if (isSame(n)) {
            const run = [];
            while (k < nodes.length && isSame(nodes[k]))
                run.push(nodes[k++]);
            const labels = joinLabels(run.map(r => r.old.label));
            rows.push({ old: [[plain(`${labels} ${OMIT_OLD}`)]], new: [[plain(`${labels} ${OMIT_NEW}`)]] });
            continue;
        }
        k++;
        if (!n.old)
            rows.push({ old: [[under(MARK_NEW)]], new: underAll(unitLines(n.new)) });
        else if (!n.new || isDeletedInPlace(n))
            rows.push({ old: underAll(unitLines(n.old)), new: [[under(MARK_DEL)]] });
        else
            changedRows(n, rows);
    }
}
function headingSegs(t, titleChanged) {
    return [plain(t.num), ...(t.title ? [titleChanged ? under(t.title) : plain(t.title)] : [])];
}
/** 조 머리를 첫 행 첫 줄 앞에 붙인다 */
function prefixHeading(rows, oldHead, newHead) {
    const first = rows[0];
    first.old[0] = [...oldHead, plain(" "), ...first.old[0]];
    first.new[0] = [...newHead, plain(" "), ...first.new[0]];
}
/** 조 전체 줄 — 첫 단위는 조 머리와 한 줄("제5조(제목) ① …") */
function articleLines(t) {
    const head = `${t.num}${t.title}`;
    const body = [...(t.lead ? [t.lead] : []), ...t.children.flatMap((u) => unitLines(u))];
    return body.length ? [`${head} ${body[0]}`, ...body.slice(1)] : [head];
}
const isArticleDeleted = (t) => /^삭제\.?$/.test(t.lead) && t.children.length === 0;
/**
 * 조의 짜임 — 본문만 있던 조가 항으로 나뉘면(또는 반대) 조 전체를 통째로 바꾼 것으로 적는다
 * (저작권법 제106조의2). 본문 아래 호가 붙는 것은 짜임 변경이 아니다(수산업법 제32조: 호는 <신  설>).
 */
const shapeOf = (t) => t.lead ? "lead" : `units:${t.children[0]?.kind ?? ""}`;
/** 개정안에 아예 없는(삭제 표기도 없는) 현행 단위 — 바뀐 항만 적어 나머지가 지워지는 실수를 알린다 */
function droppedLabels(nodes, prefix = "") {
    return nodes.flatMap(n => !n.new ? [`${prefix}${n.old.label}`] : n.old ? droppedLabels(n.children, `${prefix}${n.old.label} `) : []);
}
/**
 * 조문 한 개의 대비표 행. 현행이 없으면 신설, 개정안이 "제N조 삭제" 면 삭제.
 * 바뀐 곳이 없으면 null.
 */
function renderArticle(oldTree, proposal, notes = []) {
    if (!oldTree)
        return [{ old: [[under(MARK_NEW)]], new: underAll(articleLines(proposal)) }];
    const missing = [];
    const newTree = fillSame(proposal, oldTree, missing);
    if (missing.length)
        notes.push(`"(현행과 같음)"으로 적은 ${missing.join(", ")}이(가) 현행에 없어 뺐습니다`);
    if (isArticleDeleted(newTree) && !isArticleDeleted(oldTree)) {
        return [{ old: underAll(articleLines(oldTree)), new: [[under(`${newTree.num} 삭제`)]] }];
    }
    const titleChanged = normalizeForCompare(oldTree.title) !== normalizeForCompare(newTree.title);
    const oldHead = headingSegs(oldTree, titleChanged), newHead = headingSegs(newTree, titleChanged);
    if (shapeOf(oldTree) !== shapeOf(newTree)) {
        return [{ old: underAll(articleLines(oldTree)), new: underAll(articleLines(newTree)) }];
    }
    const nodes = alignUnits(oldTree.children, newTree.children);
    const dropped = droppedLabels(nodes);
    if (dropped.length) {
        notes.push(`개정안에 없는 ${dropped.join(", ")}을(를) <삭  제>로 적었습니다 — 그대로 두는 것이면 개정안에 "② ∼ ⑤ (현행과 같음)"처럼 적거나 조문 전체를 넣으세요`);
    }
    const leadSame = normalizeForCompare(oldTree.lead) === normalizeForCompare(newTree.lead);
    const childrenSame = nodes.every(isSame);
    if (leadSame && childrenSame && !titleChanged)
        return null;
    if (leadSame && childrenSame && nodes.length === 0) {
        return [{ old: [[...oldHead, plain(` ${OMIT_OLD}`)]], new: [[...newHead, plain(` ${OMIT_NEW}`)]] }];
    }
    const rows = [];
    if (oldTree.lead || newTree.lead) {
        const d = diffBody(oldTree.lead, newTree.lead);
        rows.push({ old: [d.old], new: [d.new] });
    }
    renderNodes(nodes, rows);
    prefixHeading(rows, oldHead, newHead);
    return rows;
}

module.exports = { renderArticle };
