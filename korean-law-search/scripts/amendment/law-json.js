"use strict";

/**
 * 법제처 조문 JSON(DRF `조문단위`) → 조문 텍스트 변환 유틸 + 조문 번호 → JO 코드.
 * 조문내용(조 머리) 뒤에 항·호·목 줄을 이어 붙이면 대비표 파서가 읽는 모양이 된다.
 */

const normalizeSeparators = (raw) => raw
    .replace(/[‐‑‒–—―﹘﹣－]/gu, "-")
    .replace(/[·•]/gu, " ");
const stripClauseAndItem = (raw) => raw
    .replace(/제?\d+항.*$/u, "")
    .replace(/제?\d+호.*$/u, "")
    .replace(/제?\d+목.*$/u, "");

/**
 * 조문 표기 → 법령용 6자리 JO 코드(AAAABB: 조 4자리 + 가지번호 2자리)
 * "제38조" → "003800", "10조의2" → "001002"
 */
function buildJO(input) {
    const sanitized = stripClauseAndItem(normalizeSeparators(input)
        .replace(/제|第/gu, "")
        .replace(/조문|條/gu, "조")
        .replace(/之/gu, "의")
        .replace(/[()]/gu, "")
        .replace(/\s+/gu, "")
        .trim());
    const match = sanitized.match(/(\d+)(?:조)?(?:(?:의|-)\s*(\d+))?/u);
    if (!match) throw new Error(`조문 패턴을 인식할 수 없습니다: ${input}`);
    const articleNumber = Number.parseInt(match[1], 10);
    const branchNumber = match[2] ? Number.parseInt(match[2], 10) : 0;
    return `${String(articleNumber).padStart(4, "0")}${String(branchNumber).padStart(2, "0")}`;
}

/** 중첩 배열 평탄화 후 문자열 결합 (<img> 태그 제외) */
function flattenContent(value) {
    if (typeof value === "string")
        return value;
    if (!Array.isArray(value))
        return "";
    const result = [];
    for (const item of value) {
        if (typeof item === "string") {
            if (!item.startsWith("<img") && !item.startsWith("</img")) {
                result.push(item);
            }
        }
        else if (Array.isArray(item)) {
            result.push(flattenContent(item));
        }
    }
    return result.join("\n");
}

/** 목 배열을 소속 호별로 그룹핑.
 *  법제처 JSON은 목(目)을 호의 자식이 아니라 **항 레벨 형제 배열**로 주고 목 객체에
 *  소속 호 정보가 없다(키는 목번호·목내용뿐). 목번호가 '가'로 리셋되는 지점을 새 호의
 *  목 시작으로 보고 순서를 복원한다 — 조판 규칙상 각 호의 목은 항상 '가'부터 시작한다. */
function groupMokByReset(mokArray) {
    const groups = [];
    for (const mok of mokArray) {
        if (!mok || typeof mok !== "object")
            continue;
        const num = String(mok.목번호 ?? "").trim();
        if (num.startsWith("가") || groups.length === 0)
            groups.push([]);
        groups[groups.length - 1].push(mok);
    }
    return groups;
}

/** 목 배열 → 텍스트 (앞에 개행 포함) */
function renderMok(mokArray) {
    let out = "";
    for (const mok of mokArray) {
        if (!mok || typeof mok !== "object")
            continue;
        if (mok.목내용) {
            const mokContent = flattenContent(mok.목내용);
            if (mokContent)
                out += "\n" + mokContent;
        }
    }
    return out;
}

/** 항 배열에서 내용 추출 (재귀적으로 호/목 처리) */
function extractHangContent(hangInput) {
    // API가 단일 항을 객체로 반환하는 경우 배열로 정규화
    const hangArray = Array.isArray(hangInput) ? hangInput : [hangInput];
    let content = "";
    for (const hang of hangArray) {
        if (!hang || typeof hang !== "object")
            continue;
        if (hang.항내용) {
            const hangContent = flattenContent(hang.항내용);
            if (hangContent) {
                content += (content ? "\n" : "") + hangContent;
            }
        }
        // 호도 단일 객체일 수 있으므로 정규화
        const hoArray = hang.호 ? (Array.isArray(hang.호) ? hang.호 : [hang.호]) : [];
        // 항 레벨 목 — 그룹 수가 호 수와 같을 때만 각 호 뒤에 배치(원문 순서 복원)
        const hangMokArray = hang.목 ? (Array.isArray(hang.목) ? hang.목 : [hang.목]) : [];
        const mokGroups = groupMokByReset(hangMokArray);
        const alignable = hoArray.length > 0 && mokGroups.length === hoArray.length;
        for (let i = 0; i < hoArray.length; i++) {
            const ho = hoArray[i];
            if (!ho || typeof ho !== "object")
                continue;
            if (ho.호내용) {
                const hoContent = flattenContent(ho.호내용);
                if (hoContent) {
                    content += "\n" + hoContent;
                }
            }
            // 호 안에 목이 실려 오는 응답도 있어 기존 경로는 유지
            const mokArray = ho.목 ? (Array.isArray(ho.목) ? ho.목 : [ho.목]) : [];
            content += renderMok(mokArray);
            if (alignable)
                content += renderMok(mokGroups[i]);
        }
        // 호에 배정하지 못한 항 레벨 목 — 누락시키지 않고 항 말미에 모아 출력
        if (!alignable && hangMokArray.length > 0) {
            const rest = renderMok(hangMokArray);
            if (rest) {
                content += "\n[참고] 아래 목은 위 각 호의 세부 항목이나 API 응답 구조상 소속 호를 특정할 수 없어 일괄 표시합니다.";
                content += rest;
            }
        }
    }
    return content;
}

/**
 * HTML 정리 - 엔티티 디코딩 순서 중요: &amp; 최후 처리 (이중 인코딩 방지)
 *
 * 태그 제거는 영문 태그와 주석으로 한정한다. 조문 본문에는 `<개정 2012.8.1.>`·`<신설 2005.12.29>`·
 * `부칙 <1999.01.11>` 같은 꺾쇠 표기가 원문 그대로 오는데, `<[^>]+>` 로 지우면 개정 시점이 통째로
 * 사라졌다(민법 전문에서만 149개, 2026-09-23). 행위시법 판단의 근거라 남긴다. admin-rule 의
 * markChangedParts 와 같은 규칙이다.
 */
function cleanHtml(text) {
    return text
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?[A-Za-z][^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&middot;/g, '·')
        .replace(/&lsquo;/g, '‘')
        .replace(/&rsquo;/g, '’')
        .replace(/&amp;/g, '&') // &amp; 반드시 마지막 (이중 인코딩 &amp;lt; → &lt; 방지)
        .trim();
}

module.exports = { buildJO, cleanHtml, extractHangContent, flattenContent };
