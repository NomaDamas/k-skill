"use strict";

/**
 * 신구조문대비표 — 현행 조문 조회.
 *
 * k-skill-proxy 의 /v1/korean-law/search · /detail (법제처 DRF 그대로 전달) 만 쓴다.
 * 사용자 LAW_OC 는 필요 없고, 조회는 read-only 다.
 */
const { AmendmentError } = require("./errors.js");
const { buildJO, cleanHtml, extractHangContent, flattenContent } = require("./law-json.js");

const DEFAULT_PROXY_BASE_URL = "https://k-skill-proxy.nomadamas.org";
const REQUEST_TIMEOUT_MS = 30000;

/**
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
function createProxyClient({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const base = (baseUrl || process.env.KSKILL_PROXY_BASE_URL || DEFAULT_PROXY_BASE_URL).replace(/\/+$/, "");

  async function getJson(endpoint, params) {
    const url = new URL(`${base}/v1/korean-law/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response;
    let text;
    try {
      response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
      text = await response.text();
    } catch (error) {
      throw new AmendmentError(`k-skill-proxy 에 연결하지 못했습니다 (${base}): ${error.cause?.code || error.message}`, "UPSTREAM");
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AmendmentError(`proxy 응답이 JSON 이 아닙니다 (HTTP ${response.status}) — 법제처가 일시적으로 점검 중일 수 있습니다.`, "UPSTREAM");
    }
    if (!response.ok) {
      const code = json?.error || "error";
      throw new AmendmentError(`proxy ${response.status} ${code}${json?.message ? `: ${json.message}` : ""}`, "UPSTREAM");
    }
    return json;
  }

  return {
    /** 법령명 검색 → [{lawName, lawId, mst, status}] (DRF 는 결과가 1건이면 배열 대신 객체를 준다) */
    async searchLaws(query) {
      const json = await getJson("search", { target: "law", query, type: "JSON", display: "20" });
      const raw = json?.LawSearch?.law;
      const laws = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
      return laws.map((l) => ({
        lawName: String(l.법령명한글 ?? ""),
        lawId: String(l.법령ID ?? ""),
        mst: String(l.법령일련번호 ?? ""),
        status: String(l.현행연혁코드 ?? ""),
      }));
    },
    /** 법령(또는 그 한 조) 본문 JSON */
    async getLawJson({ mst, lawId, jo }) {
      const params = { target: "law", type: "JSON" };
      if (mst) params.MST = mst;
      else if (lawId) params.ID = lawId;
      if (jo) params.JO = jo;
      return getJson("detail", params);
    },
  };
}

// 법령명 비교는 공백·가운뎃점 표기 차이를 무시한다 (법제처 공식 표기는 'ㆍ', 실무 문서는 '·')
const normalizeName = (s) => s.replace(/\s+/g, "").replace(/[·ㆍ‧•・]/g, "");

/**
 * 법령명 → mst. 이름이 정확히 같은 법령만 받아들인다 — 법제처 검색은 부분 일치라
 * 「민법」을 찾으면 「난민법」이 나오므로, 첫 결과를 고르면 엉뚱한 법령과 대조하게 된다.
 * mst·lawId 가 있으면 조회하지 않는다.
 */
async function resolveLaw(client, input) {
  if (input.mst || input.lawId) return { lawName: input.lawName ?? "", mst: input.mst, lawId: input.lawId };
  const name = input.lawName?.trim();
  if (!name) throw new AmendmentError("lawName·mst·lawId 중 하나가 필요합니다.", "INVALID_PARAM");
  const laws = await client.searchLaws(name);
  const same = laws.filter((l) => normalizeName(l.lawName) === normalizeName(name));
  const hit = same.find((l) => l.status === "현행") ?? same[0];
  if (!hit) {
    const candidates = laws.slice(0, 5).map((l) => `「${l.lawName}」`).join(", ");
    throw new AmendmentError(`법령명이 정확히 같은 법령을 찾지 못했습니다: ${name}${candidates ? ` (검색 후보: ${candidates})` : ""}`, "NOT_FOUND", [
      "정확한 법령명(예: '건축법 시행령')으로 다시 호출하거나, 조례·행정규칙이면 amendments[].currentText 에 현행 원문을 넣으세요.",
    ]);
  }
  return { lawName: hit.lawName, mst: hit.mst, lawId: hit.lawId };
}

/** 현행 조문 텍스트. 그 조가 없으면 null(신설 조) */
async function fetchCurrentArticle(client, law, jo) {
  const code = buildJO(jo);
  const json = await client.getLawJson({ mst: law.mst, lawId: law.lawId, jo: code });
  const raw = json?.법령?.조문?.조문단위;
  const units = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  // 업스트림이 JO 를 무시하고 다른 조(법령 전체)를 주는 일이 있다 — 번호까지 맞는 조만 현행으로 쓴다
  const num = Number(code.slice(0, 4));
  const branch = Number(code.slice(4));
  const unit = units.find((u) => u?.조문여부 === "조문" && Number(u.조문번호) === num && Number(u.조문가지번호 || 0) === branch);
  if (!unit) return null;
  const head = flattenContent(unit.조문내용).trim();
  // "[제44조의2는 제43조로 이동]" 같은 자리표시 조문은 번호만 있고 본문이 없다 — 그 번호의 조는 없다
  if (/^제\d+조(?:의\d+)?$/.test(head) && !unit.항) return null;
  const rest = unit.항 ? extractHangContent(unit.항) : "";
  return cleanHtml([head, rest].filter(Boolean).join("\n"));
}

module.exports = { DEFAULT_PROXY_BASE_URL, createProxyClient, fetchCurrentArticle, resolveLaw };
