"use strict";

/**
 * 신구조문대비표 — 조문 텍스트 → 단위 트리 (조 · 항 · 호 · 목 · 세목)
 *
 * 현행(법제처 본문)과 개정안(사용자 입력)을 같은 파서로 읽어야 대조가 맞는다.
 * 한 줄 = 한 단위가 원칙이고, 조 머리(제N조(제목)) 뒤에 같은 줄로 붙은 ①·1. 은 떼어 낸다.
 * 라벨 없는 줄은 앞 단위 본문에 잇는다(줄바꿈된 긴 항).
 * 개정안에는 대비표 관행대로 "② ∼ ⑤ (현행과 같음)" 같은 자리표시를 쓸 수 있다 — fillSame 이 현행에서 채운다.
 */
const LEVEL = { hang: 1, ho: 2, mok: 3, sub1: 4, sub2: 5 };
const MOK_CHARS = "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허";
const LABEL_PATTERNS = [
    // 법제처 본문은 ⑮ 다음 항을 "<16>"·"<17>"로 적는다
    ["hang", /^([①-⑳㉑-㉟㊱-㊿]|<\d{1,2}>)(\s*)/],
    ["ho", /^(\d{1,3}(?:의\d{1,2})?\.)(?=\s|$)(\s*)/],
    ["mok", new RegExp(`^([${MOK_CHARS}](?:의\\d{1,2})?\\.)(?=\\s|$)(\\s*)`)],
    ["sub1", /^(\d{1,3}\))(\s+)/],
    ["sub2", new RegExp(`^([${MOK_CHARS}]\\))(\\s+)`)],
];
const LABEL_SRC = `[①-⑳㉑-㉟㊱-㊿]|<\\d{1,2}>|\\d{1,3}(?:의\\d{1,2})?\\.|[${MOK_CHARS}](?:의\\d{1,2})?\\.|\\d{1,3}\\)|[${MOK_CHARS}]\\)`;
const SAME_NOTE = "\\((?:현행과\\s*같음|생\\s*략)\\)";
const PLACEHOLDER = new RegExp(`^(${LABEL_SRC})(?:\\s*[·ㆍ∼~～]\\s*(${LABEL_SRC}))?\\s*${SAME_NOTE}$`);
const SAME_LEAD = new RegExp(`^${SAME_NOTE}$`);
// "제3조에 따른 …" 같은 본문 첫머리는 조 머리가 아니다 — 번호 뒤는 공백·괄호·끝만
const HEADING = /^(제\d{1,4}조(?:의\d{1,3})?)(?=[\s(]|$)\s*(\((?:[^()]|\([^()]*\))*\))?\s*/;
/**
 * 연혁 표기 제거 — 대비표에는 `<개정 2013.3.23>`·`[전문개정 2008.3.21]`·`삭제<2009.6.9>` 의
 * 날짜 꼬리가 실리지 않는다(법제처 신구법비교 원문 2,284쌍 실측).
 */
function stripHistoryNotes(text) {
    return text
        .split(/\r?\n/)
        .filter(line => !/^\s*\[[^\]]*\]\s*$/.test(line))
        .map(line => line
        .replace(/<(?:개정|신설|전문개정|본조신설|제목개정|타법개정|종전)[^<>]{0,300}>/g, "")
        .replace(/<\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?(?:,\s?\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?)*>/g, "")
        .replace(/\[(?:전문개정|본조신설|제목개정|본조제목개정|종전|시행일)[^\]]{0,300}\]/g, "")
        // 줄 안 공백은 종류 불문 하나로(전각 공백·\r 연속이 뒤 정규식을 느리게 하지 않게)
        .replace(/\s+/g, " ")
        .trim())
        .filter(Boolean)
        .map(curlyQuotes)
        .join("\n");
}
/**
 * 법제처 본문 API 는 곧은 겹따옴표(")를 주지만 법령 원문·대비표는 “ ”다 — 줄 안에서 번갈아 바꾼다.
 * 짝이 안 맞는 줄은 건드리지 않는다. 홑따옴표는 대비표도 ' 그대로라 두지 않는다.
 */
function curlyQuotes(line) {
    if ((line.split('"').length - 1) % 2)
        return line;
    let k = 0;
    return line.replace(/"/g, () => (k++ % 2 ? "”" : "“"));
}
function matchLabel(line) {
    for (const [kind, re] of LABEL_PATTERNS) {
        const m = line.match(re);
        if (m)
            return { kind, label: m[1], gap: m[2] ? " " : "", rest: line.slice(m[0].length) };
    }
    return null;
}
/** 조문 텍스트 한 개를 트리로. 첫 줄이 조 머리가 아니면 num·title 은 빈 값 */
function parseArticle(text) {
    const lines = stripHistoryNotes(text).split("\n");
    const tree = { num: "", title: "", lead: "", children: [] };
    const first = lines[0] ?? "";
    const h = first.match(HEADING);
    if (h) {
        tree.num = h[1];
        tree.title = h[2] ?? "";
        lines[0] = first.slice(h[0].length);
        if (!lines[0])
            lines.shift();
    }
    const stack = [];
    let last = null;
    for (const line of lines) {
        const ph = line.match(PLACEHOLDER);
        const lab = ph ? { ...matchLabel(`${ph[1]} `), rest: "" } : matchLabel(line);
        if (!lab) {
            if (last)
                last.body = last.body ? `${last.body} ${line}` : line;
            else
                tree.lead = tree.lead ? `${tree.lead} ${line}` : line;
            continue;
        }
        const unit = { kind: lab.kind, label: lab.label, gap: lab.gap, body: lab.rest.trim(), children: [] };
        if (ph)
            unit.sameUntil = ph[2] ?? ph[1];
        while (stack.length && LEVEL[stack[stack.length - 1].kind] >= LEVEL[unit.kind])
            stack.pop();
        const parent = stack[stack.length - 1];
        if (parent)
            parent.children.push(unit);
        else
            tree.children.push(unit);
        stack.push(unit);
        last = unit;
    }
    return tree;
}
/**
 * 개정안의 자리표시를 현행 단위로 채운다. 현행에 없는 번호를 가리키면 빼고 missing 에 적는다.
 * 조 본문 자체가 "(현행과 같음)"이면 현행 본문을 쓴다.
 */
function fillSame(proposal, current, missing) {
    const lead = SAME_LEAD.test(proposal.lead) ? current.lead : proposal.lead;
    return { ...proposal, lead, children: fillUnits(proposal.children, current.children, missing) };
}
function fillUnits(units, current, missing) {
    const out = [];
    for (const u of units) {
        const at = (label) => current.findIndex(c => c.kind === u.kind && c.label === label);
        if (u.sameUntil !== undefined) {
            const i = at(u.label), j = at(u.sameUntil);
            if (i < 0 || j < i)
                missing.push(u.sameUntil === u.label ? u.label : `${u.label} ∼ ${u.sameUntil}`);
            else
                out.push(...structuredClone(current.slice(i, j + 1)));
            continue;
        }
        out.push({ ...u, children: fillUnits(u.children, current[at(u.label)]?.children ?? [], missing) });
    }
    return out;
}
/** 단위를 라벨까지 붙인 원문 줄들로 (자손 포함) */
function unitLines(unit) {
    const head = unit.body ? `${unit.label}${unit.gap}${unit.body}` : unit.label;
    return [head, ...unit.children.flatMap(unitLines)];
}
/** 앞뒤 공백과 가운데를 정규식 없이 가른다(선형) */
function splitEdges(s) {
    const lead = s.length - s.trimStart().length;
    if (lead === s.length)
        return [s, "", ""];
    const tail = s.length - s.trimEnd().length;
    return [s.slice(0, lead), s.slice(lead, s.length - tail), s.slice(s.length - tail)];
}
/** 대비 판정용 정규형 — 공백 흔들림과 가운뎃점 변종만 맞춘다 */
function normalizeForCompare(s) {
    return s.replace(/\s+/g, " ").replace(/[·‧•・]/g, "ㆍ").replace(/[“”]/g, '"').trim();
}

module.exports = { stripHistoryNotes, parseArticle, fillSame, unitLines, splitEdges, normalizeForCompare };
