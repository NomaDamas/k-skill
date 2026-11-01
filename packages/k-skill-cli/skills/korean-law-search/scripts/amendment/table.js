"use strict";

/**
 * 신･구조문대비표 작성 (일부개정 법령안)
 *
 * 개정안 조문 전문만 받으면 현행 조문은 법제처에서 가져와 대조한다. 바뀐 부분 밑줄, 개정안 칸의 같은
 * 부분 "----", 바뀌지 않은 항·호 "(생  략)"/"(현행과 같음)", <신  설>·<삭  제>. 조례·행정규칙·미공포안처럼
 * 자동 조회가 안 되는 현행은 currentText 로 받는다.
 */
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { AmendmentError } = require("./errors.js");
const { buildJO } = require("./law-json.js");
const { parseArticle } = require("./units.js");
const { renderArticle } = require("./render.js");
const { rowsToMarkdown } = require("./format.js");
const { buildAmendmentHwpx } = require("./hwpx.js");
const { fetchCurrentArticle, resolveLaw } = require("./current.js");

const MAX_AMENDED_ARTICLES = 30;

/** 제명 끝으로 개정안 이름: 법률 → 일부개정법률안, 영·부령 → 일부개정령안, 조례 → 일부개정조례안 */
function draftTitle(lawName) {
  if (!lawName) return "일부개정안";
  if (/조례$/.test(lawName)) return `${lawName} 일부개정조례안`;
  if (/(령|시행규칙)$/.test(lawName)) return `${lawName} 일부개정령안`;
  if (/법(률)?$/.test(lawName)) return `${lawName} 일부개정법률안`;
  return `${lawName} 일부개정안`;
}

const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";

/** 입력 검증 — 법제처를 부르기 전에 막는다 */
function validateInput(input) {
  const bad = (message) => new AmendmentError(message, "INVALID_PARAM");
  if (!input || typeof input !== "object") throw bad("입력은 JSON 객체여야 합니다.");
  const { amendments } = input;
  if (!Array.isArray(amendments) || amendments.length < 1) throw bad("amendments 에 개정하는 조문을 1개 이상 넣으세요.");
  if (amendments.length > MAX_AMENDED_ARTICLES) throw bad(`한 번에 ${MAX_AMENDED_ARTICLES}개 조문까지만 만들 수 있습니다 (입력 ${amendments.length}개).`);
  amendments.forEach((a, i) => {
    if (!a || !isNonEmptyString(a.text)) throw bad(`amendments[${i}].text 에 개정안 조문 전문을 넣으세요.`);
    if (a.currentText !== undefined && typeof a.currentText !== "string") throw bad(`amendments[${i}].currentText 는 문자열이어야 합니다.`);
  });
  const hasLaw = [input.lawName, input.mst, input.lawId].some(isNonEmptyString);
  if (!hasLaw && !amendments.every((a) => a.currentText !== undefined)) {
    throw bad("lawName·mst·lawId 중 하나를 주거나, 모든 조문에 currentText(현행 원문)를 넣으세요.");
  }
  if (input.outputPath !== undefined) resolveOutputPath(input.outputPath);
}

/** "~/Desktop/…" 은 셸이 아니면 풀리지 않는다 — 홈 디렉터리로 푼다 */
function resolveOutputPath(outputPath) {
  if (!isNonEmptyString(outputPath)) throw new AmendmentError("outputPath 는 비어 있지 않은 경로여야 합니다.", "INVALID_PARAM");
  const target = path.resolve(outputPath.replace(/^~(?=$|[\\/])/, os.homedir()));
  if (path.extname(target).toLowerCase() !== ".hwpx") {
    throw new AmendmentError("outputPath 는 .hwpx 로 끝나야 합니다.", "INVALID_PARAM");
  }
  return target;
}

async function buildArticle(client, law, a) {
  const newTree = parseArticle(a.text);
  const jo = (a.jo?.trim() || newTree.num).replace(/\s/g, "");
  if (!jo) throw new AmendmentError("조 번호를 알 수 없습니다 — jo 를 주거나 text 를 '제N조(제목)'으로 시작하세요.", "INVALID_PARAM");
  let joCode;
  try {
    joCode = buildJO(jo);
  } catch (error) {
    throw new AmendmentError(error.message, "INVALID_PARAM");
  }
  const current = a.currentText !== undefined ? a.currentText : await fetchCurrentArticle(client, law, jo);
  const oldTree = current?.trim() ? parseArticle(current) : null;
  const notes = [];
  if (newTree.num && buildJO(newTree.num) !== joCode) {
    notes.push(`${jo}: jo(${jo})와 개정안 머리(${newTree.num})가 다릅니다 — 현행은 ${jo}로 조회했습니다`);
  }
  if (!newTree.num) {
    newTree.num = oldTree?.num || jo;
    newTree.title = oldTree?.title ?? "";
    if (oldTree?.title) notes.push(`${jo}: 개정안에 조 제목이 없어 현행 제목 ${oldTree.title}을 그대로 썼습니다`);
  }
  if (!oldTree && current === null) notes.push(`${jo}: 현행에 없는 조라 신설로 처리했습니다 — 번호가 맞는지 확인하세요`);
  const found = [];
  const rows = renderArticle(oldTree, newTree, found);
  notes.push(...found.map((n) => `${jo}: ${n}`));
  if (!rows) notes.push(`${jo}: 현행과 같아 표에서 뺐습니다`);
  return { joCode, rows, notes };
}

async function saveHwpx(outputPath, title, articles) {
  const target = resolveOutputPath(outputPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buildAmendmentHwpx([title, "신･구조문대비표"], articles));
  return target;
}

/**
 * @param {{ searchLaws(query: string): Promise<object[]>, getLawJson(p: object): Promise<object> }} client
 * @param {{ lawName?: string, mst?: string, lawId?: string, title?: string, outputPath?: string,
 *           amendments: { jo?: string, text: string, currentText?: string }[] }} input
 * @returns {Promise<{ text: string, isError: boolean }>}
 */
async function amendmentTable(client, input) {
  try {
    validateInput(input);
    const needsFetch = input.amendments.some((a) => a.currentText === undefined);
    const law = needsFetch ? await resolveLaw(client, input) : null;
    const results = await Promise.all(input.amendments.map((a) => buildArticle(client, law, a)));
    const seen = new Set();
    for (const r of results) {
      if (seen.has(r.joCode)) throw new AmendmentError("같은 조를 두 번 넣었습니다 — 한 조는 개정안 하나로 합치세요.", "INVALID_PARAM");
      seen.add(r.joCode);
    }
    results.sort((x, y) => x.joCode.localeCompare(y.joCode));

    const lawName = law?.lawName || input.lawName || "";
    const title = input.title?.trim() || draftTitle(lawName);
    const articles = results.map((r) => r.rows).filter((r) => r !== null);
    const lines = [];
    if (articles.length) {
      lines.push(rowsToMarkdown(`${title} 신･구조문대비표`, articles.flat()), "");
      lines.push("굵은 글씨는 개정되는 부분(한글 문서에서는 밑줄), '----'는 현행과 같은 부분입니다.");
    } else {
      lines.push("[NO_CHANGE] 입력한 개정안이 모두 현행과 같습니다.");
    }
    if (law) lines.push(`현행 원문: 국가법령정보센터 「${law.lawName}」${law.mst ? ` (MST ${law.mst})` : ""} 현행 조문을 조회해 대조했습니다.`);
    const notes = results.flatMap((r) => r.notes);
    if (notes.length) lines.push("", "확인할 점:", ...notes.map((n) => `- ${n}`));

    if (input.outputPath && articles.length) {
      const saved = await saveHwpx(input.outputPath, title, articles);
      lines.push("", `HWPX 저장: ${saved} (한양신명조 14pt · 줄 간격 180% · 법제업무편람 서식)`);
    }
    return { text: lines.join("\n"), isError: false };
  } catch (error) {
    if (!(error instanceof AmendmentError)) throw error;
    return { text: [`[${error.code}] ${error.message}`, ...error.hints.map((h) => `- ${h}`)].join("\n"), isError: true };
  }
}

module.exports = { MAX_AMENDED_ARTICLES, amendmentTable, draftTitle, validateInput };
