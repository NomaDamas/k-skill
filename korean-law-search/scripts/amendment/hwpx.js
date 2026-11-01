"use strict";

/**
 * 신구조문대비표 → HWPX (한글 문서)
 *
 * A4 세로, 여백 위·아래 16㎜ · 좌우 25㎜ · 머리말·꼬리말 12.7㎜(법제업무편람).
 * 2칸 표 — 머리행 "현      행 | 개   정   안" 은 쪽마다 반복, 가로줄은 조문 경계에만 긋는다.
 */
const { BORDER, CHAR, CONTAINER_XML, CONTENT_HPF, PARA, headerXml } = require("./hwpx-header.js");
const { createZip } = require("./zip.js");
const NS_SEC = "http://www.hancom.co.kr/hwpml/2011/section";
const NS_PARA = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const MM = 7200 / 25.4;
const PAGE = { width: 59528, height: 84188, top: Math.round(16 * MM), bottom: Math.round(16 * MM), side: Math.round(25 * MM), header: Math.round(12.7 * MM) };
const TABLE_WIDTH = PAGE.width - 2 * PAGE.side;
const COL = Math.floor(TABLE_WIDTH / 2);
/** XML 이스케이프 + XML 1.0 에 못 쓰는 제어문자·짝 없는 서로게이트 제거(남으면 한글이 문서를 못 연다) */
const esc = (s) => s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 줄 첫머리로 내어쓰기 단계와 앞 공백(편람: 항 1칸 · 호 2칸 · 목 4칸 · 1) 6칸 · 가) 8칸)을 정한다 */
function levelOf(text) {
    const t = text.replace(/^제\d+조(?:의\d+)?(?:\((?:[^()]|\([^()]*\))*\))?\s*/, "");
    if (t !== text)
        return { level: 0, pad: "" };
    if (/^(?:[①-⑳㉑-㉟㊱-㊿]|<\d{1,2}>)/.test(t))
        return { level: 1, pad: " " };
    if (/^\d{1,3}(?:의\d{1,2})?\./.test(t))
        return { level: 2, pad: "  " };
    if (/^[가-힣](?:의\d{1,2})?\./.test(t))
        return { level: 3, pad: "    " };
    if (/^\d{1,3}\)/.test(t))
        return { level: 4, pad: "      " };
    if (/^[가-힣]\)/.test(t))
        return { level: 5, pad: "        " };
    return { level: 0, pad: "" };
}
function para(line) {
    const plainText = line.map(s => s.text).join("");
    const { level, pad } = levelOf(plainText);
    const runs = line.filter(s => s.text).map(s => `<hp:run charPrIDRef="${s.u ? CHAR.underline : CHAR.body}"><hp:t>${esc(s.text)}</hp:t></hp:run>`);
    if (pad)
        runs.unshift(`<hp:run charPrIDRef="${CHAR.body}"><hp:t>${pad}</hp:t></hp:run>`);
    return `<hp:p paraPrIDRef="${PARA.bodyLevel + level}" styleIDRef="0">${runs.join("") || `<hp:run charPrIDRef="${CHAR.body}"/>`}</hp:p>`;
}
function cell(col, row, border, paras, header) {
    return `<hp:tc name="" header="${header ? 1 : 0}" hasMargin="0" protect="0" editable="1" dirty="0" borderFillIDRef="${border}">` +
        `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paras}</hp:subList>` +
        `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
        `<hp:cellSz width="${COL}" height="1000"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
}
function table(articles) {
    const trs = [];
    const headCell = (col, text) => cell(col, 0, BORDER.topBottom, `<hp:p paraPrIDRef="${PARA.center}" styleIDRef="0"><hp:run charPrIDRef="${CHAR.body}"><hp:t>${text}</hp:t></hp:run></hp:p>`, true);
    trs.push(`<hp:tr>${headCell(0, "현      행")}${headCell(1, "개   정   안")}</hp:tr>`);
    const flat = articles.flatMap(rows => rows.map((r, i) => ({ r, first: i === 0, last: i === rows.length - 1 })));
    flat.forEach(({ r, first, last }, k) => {
        const border = first && last ? BORDER.topBottom : first ? BORDER.top : last ? BORDER.bottom : BORDER.open;
        trs.push(`<hp:tr>${cell(0, k + 1, border, r.old.map(para).join(""), false)}${cell(1, k + 1, border, r.new.map(para).join(""), false)}</hp:tr>`);
    });
    return `<hp:tbl id="1001" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${trs.length}" colCnt="2" cellSpacing="0" borderFillIDRef="${BORDER.none}" noShading="0">` +
        `<hp:sz width="${COL * 2}" widthRelTo="ABSOLUTE" height="${trs.length * 1000}" heightRelTo="ABSOLUTE" protect="0"/>` +
        `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
        `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${trs.join("")}</hp:tbl>`;
}
function secPr() {
    return `<hp:secPr textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
        `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
        `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
        `<hp:pagePr landscape="WIDELY" width="${PAGE.width}" height="${PAGE.height}" gutterType="LEFT_ONLY"><hp:margin header="${PAGE.header}" footer="${PAGE.header}" gutter="0" left="${PAGE.side}" right="${PAGE.side}" top="${PAGE.top}" bottom="${PAGE.bottom}"/></hp:pagePr>` +
        `<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
        `<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr></hp:secPr>` +
        `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;
}
function sectionXml(titleLines, articles) {
    const titles = titleLines.map((t, i) => `<hp:p paraPrIDRef="${PARA.title}" styleIDRef="0"><hp:run charPrIDRef="${CHAR.title}">${i === 0 ? secPr() : ""}<hp:t>${esc(t)}</hp:t></hp:run></hp:p>`);
    const spacer = `<hp:p paraPrIDRef="${PARA.title}" styleIDRef="0"><hp:run charPrIDRef="${CHAR.body}"/></hp:p>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hs:sec xmlns:hs="${NS_SEC}" xmlns:hp="${NS_PARA}">
  ${titles.join("\n  ")}
  ${spacer}
  <hp:p paraPrIDRef="${PARA.center}" styleIDRef="0"><hp:run charPrIDRef="${CHAR.body}">${table(articles)}</hp:run></hp:p>
</hs:sec>`;
}
/** 제목 줄(예: ["건축법 일부개정법률안", "신･구조문대비표"]) + 조문별 행 → HWPX 바이트 */
function buildAmendmentHwpx(titleLines, articles) {
    return createZip([
        // OPC 규칙: mimetype 은 첫 항목이고 압축하지 않는다
        { name: "mimetype", data: "application/hwp+zip", store: true },
        { name: "META-INF/container.xml", data: CONTAINER_XML },
        { name: "Contents/content.hpf", data: CONTENT_HPF },
        { name: "Contents/header.xml", data: headerXml() },
        { name: "Contents/section0.xml", data: sectionXml(titleLines, articles) },
        { name: "Preview/PrvText.txt", data: titleLines.join("\n") },
    ]);
}

module.exports = { buildAmendmentHwpx };
