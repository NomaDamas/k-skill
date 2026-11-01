"use strict";

/**
 * 신구조문대비표 HWPX — 패키지 고정 파일 + header.xml (글꼴·글자·문단·테두리 정의)
 *
 * 서식은 법제처 「법제업무편람」 법령심사안 작성 방법을 따른다:
 * 신명조(한양신명조 HFT) 14pt, 대비표 줄 간격 180%, 제목 16pt 진하게 가운데,
 * 조·항·호·목 내어 쓰기 14 · 14 · 24.4 · 45.4 · 54.2 · 75.2pt.
 * 한글 줄바꿈은 글자 단위 — 한컴 XML 에서 breakNonLatinWord="KEEP_WORD" 가 글자 단위다(이름과 반대,
 * kordoc 한글 실렌더 실측). 어절 단위면 좁은 대비표 칸이 양쪽 정렬로 크게 벌어진다(한글 화면 확인).
 * 본문 정렬은 왼쪽 — 줄표 덩어리(라틴 단어라 안 쪼개짐)가 다음 줄로 넘어가면 남은 짧은 줄이 양쪽 정렬로
 * "설   및   공동주택", "- - - -"처럼 벌어졌다(한글 화면 확인). 한글은 글자 단위라 왼쪽이어도 줄이 꽉 찬다.
 */
const NS_HEAD = "http://www.hancom.co.kr/hwpml/2011/head";
const NS_PARA = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const NS_CORE = "http://www.hancom.co.kr/hwpml/2011/core";
const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`;
const CONTENT_HPF = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:hh="${NS_HEAD}">
  <opf:metadata>
    <opf:meta name="generator" content="korean-law-mcp"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header" linear="no"/>
    <opf:itemref idref="section0" linear="yes"/>
  </opf:spine>
</opf:package>`;
/** 글자 모양 id */
const CHAR = { body: 0, underline: 1, title: 2 };
/** 문단 모양 id — 내어쓰기 단계는 BODY_LEVEL + 단계(0 조 · 1 항 · 2 호 · 3 목 · 4 1) · 5 가)) */
const PARA = { title: 0, center: 1, bodyLevel: 2 };
const HANG_PT = [14, 14, 24.4, 45.4, 54.2, 75.2];
/** 셀 테두리 id: 좌우는 늘 실선, 위·아래는 조문 경계에서만 */
const BORDER = { none: 1, topBottom: 2, top: 3, open: 4, bottom: 5 };
const LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];
const FONT = "한양신명조";
function fontfaces() {
    const face = (lang) => `      <hh:fontface lang="${lang}" fontCnt="1">
        <hh:font id="0" face="${FONT}" type="HFT" isEmbedded="0"/>
      </hh:fontface>`;
    return `    <hh:fontfaces itemCnt="${LANGS.length}">\n${LANGS.map(face).join("\n")}\n    </hh:fontfaces>`;
}
function borderFill(id, top, bottom, sides) {
    const line = (on) => on ? `type="SOLID" width="0.12 mm" color="#000000"` : `type="NONE" width="0.1 mm" color="#000000"`;
    return `      <hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder ${line(sides)}/>
        <hh:rightBorder ${line(sides)}/>
        <hh:topBorder ${line(top)}/>
        <hh:bottomBorder ${line(bottom)}/>
      </hh:borderFill>`;
}
function charPr(id, pt, opts = {}) {
    const all = (v) => LANGS.map(l => `${l.toLowerCase()}="${v}"`).join(" ");
    return `      <hh:charPr id="${id}" height="${Math.round(pt * 100)}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
        <hh:fontRef ${all(0)}/>
        <hh:ratio ${all(100)}/>
        <hh:spacing ${all(0)}/>
        <hh:relSz ${all(100)}/>
        <hh:offset ${all(0)}/>${opts.bold ? "\n        <hh:bold/>" : ""}${opts.underline ? `\n        <hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>` : ""}
      </hh:charPr>`;
}
function paraPr(id, align, lineSpacing, hangPt = 0) {
    const hang = Math.round(hangPt * 100);
    return `      <hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0" textDir="AUTO">
        <hh:align horizontal="${align}" vertical="BASELINE"/>
        <hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
        <hh:margin><hc:intent value="${-hang}" unit="HWPUNIT"/><hc:left value="${hang}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>
        <hh:lineSpacing type="PERCENT" value="${lineSpacing}"/>
        <hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>`;
}
function headerXml() {
    const chars = [charPr(CHAR.body, 14), charPr(CHAR.underline, 14, { underline: true }), charPr(CHAR.title, 16, { bold: true })];
    const paras = [paraPr(PARA.title, "CENTER", 160), paraPr(PARA.center, "CENTER", 180),
        ...HANG_PT.map((pt, i) => paraPr(PARA.bodyLevel + i, "LEFT", 180, pt))];
    const borders = [borderFill(BORDER.none, false, false, false), borderFill(BORDER.topBottom, true, true, true),
        borderFill(BORDER.top, true, false, true), borderFill(BORDER.open, false, false, true), borderFill(BORDER.bottom, false, true, true)];
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<hh:head xmlns:hh="${NS_HEAD}" xmlns:hp="${NS_PARA}" xmlns:hc="${NS_CORE}" version="1.4" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
${fontfaces()}
    <hh:borderFills itemCnt="${borders.length}">
${borders.join("\n")}
    </hh:borderFills>
    <hh:charProperties itemCnt="${chars.length}">
${chars.join("\n")}
    </hh:charProperties>
    <hh:tabProperties itemCnt="0"/>
    <hh:numberings itemCnt="1">
      <hh:numbering id="1" start="0">
${[1, 2, 3, 4, 5, 6, 7].map(level => `        <hh:paraHead start="1" level="${level}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0"/>`).join("\n")}
      </hh:numbering>
    </hh:numberings>
    <hh:paraProperties itemCnt="${paras.length}">
${paras.join("\n")}
    </hh:paraProperties>
    <hh:styles itemCnt="1">
      <hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="${PARA.bodyLevel}" charPrIDRef="${CHAR.body}" nextStyleIDRef="0" langID="1042" lockForm="0"/>
    </hh:styles>
  </hh:refList>
  <hh:compatibleDocument targetProgram="HWP2018"><hh:layoutCompatibility/></hh:compatibleDocument>
</hh:head>`;
}

module.exports = { CONTAINER_XML, CONTENT_HPF, CHAR, PARA, HANG_PT, BORDER, headerXml };
