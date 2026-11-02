"use strict";

const { splitEdges } = require("./units.js");
const OMIT_OLD = "(생  략)";
const OMIT_NEW = "(현행과 같음)";
const MARK_NEW = "<신  설>";
const MARK_DEL = "<삭  제>";
const plain = (text) => ({ text, u: false });
const under = (text) => ({ text, u: true });
/** 개정안 칸의 같은 부분 → 줄표. 문장 끝 마침표와 양 끝 공백(밑줄과의 경계)은 남긴다.
 *  before 는 이 조각 앞 글자 — 밑줄 친 "…한다" 뒤에 마침표만 남은 조각도 문장 끝으로 본다(#180) */
function dashify(text, before = "") {
    const [lead, core, tail] = splitEdges(text);
    const prev = lead ? lead[lead.length - 1] : before;
    let out = "";
    for (let k = 0; k < core.length; k++) {
        const sentenceEnd = core[k] === "." && (k === core.length - 1 || /\s/.test(core[k + 1])) && /[가-힣)」\]”]/.test(k > 0 ? core[k - 1] : prev);
        if (sentenceEnd)
            out += ".";
        else
            out += out.endsWith(".") && /\s/.test(core[k]) ? " " : "-";
    }
    return lead + out + tail;
}
/** 개정안 칸 세그먼트 — 밑줄 아닌 부분을 줄표로 */
function dashSegs(segs) {
    return segs.map((s, i) => s.u ? s : plain(dashify(s.text, segs[i - 1]?.text.slice(-1) ?? "")));
}
function joinLabels(labels) {
    if (labels.length <= 1)
        return labels[0] ?? "";
    if (labels.length === 2)
        return `${labels[0]}·${labels[1]}`;
    return `${labels[0]} ∼ ${labels[labels.length - 1]}`;
}

module.exports = { OMIT_OLD, OMIT_NEW, MARK_NEW, MARK_DEL, plain, under, dashify, dashSegs, joinLabels };
