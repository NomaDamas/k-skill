"use strict";

const PUNCT = /[\p{P}\p{S}]/u;
const SPACE = /\s/;
/**
 * 굵게 감쌀 구간 [a, b) 을 CommonMark 강조 규칙에 맞게 다듬는다. "제65조**(승무정원)**"처럼 글자와 문장부호가
 * 맞붙은 경계에선 ** 가 강조로 안 읽혀 글자째 남는다 — 경계의 문장부호를 굵은 범위 밖으로 뺀다.
 */
function fitBold(line, a, b) {
    const opens = (i) => !PUNCT.test(line[i]) || i === 0 || SPACE.test(line[i - 1]) || PUNCT.test(line[i - 1]);
    const closes = (j) => !PUNCT.test(line[j - 1]) || j === line.length || SPACE.test(line[j]) || PUNCT.test(line[j]);
    while (a < b && !opens(a))
        a++;
    while (b > a && !closes(b))
        b--;
    // 여는 괄호가 밖으로 나갔으면 짝 닫는 괄호도 밖으로: "(**승무정원)**" → "(**승무정원**)"
    const pair = { ")": "(", "]": "[", "」": "「", "”": "“" };
    const inside = (ch) => [...line.slice(a, b)].filter(c => c === ch).length;
    while (b > a && pair[line[b - 1]] && inside(pair[line[b - 1]]) < inside(line[b - 1]))
        b--;
    return [a, b];
}
function lineToMarkdown(line) {
    const text = line.map(s => s.text).join("");
    const spans = [];
    let at = 0;
    for (const s of line) {
        const end = at + s.text.length;
        if (s.u && s.text.trim()) {
            const prev = spans[spans.length - 1];
            if (prev && prev[1] === at)
                prev[1] = end;
            else
                spans.push([at, end]);
        }
        at = end;
    }
    const esc = (t) => t.replace(/([|*\\])/g, "\\$1");
    let out = "", pos = 0;
    for (const [a0, b0] of spans) {
        const [a, b] = fitBold(text, a0, b0);
        if (a >= b)
            continue;
        out += esc(text.slice(pos, a)) + "**" + esc(text.slice(a, b)) + "**";
        pos = b;
    }
    return out + esc(text.slice(pos));
}
function rowsToMarkdown(title, rows) {
    const cell = (lines) => lines.map(lineToMarkdown).join("<br>");
    return [
        `### ${title}`,
        "",
        "| 현      행 | 개   정   안 |",
        "| --- | --- |",
        ...rows.map(r => `| ${cell(r.old)} | ${cell(r.new)} |`),
    ].join("\n");
}
/** 줄 단위 평문 — 밑줄 구간을 ‹›로 감싼다(표를 못 그리는 화면·검수용) */
function lineToPlain(line) {
    return line.map(s => s.u ? `‹${s.text}›` : s.text).join("").replace(/›‹/g, "");
}

module.exports = { rowsToMarkdown, lineToPlain };
