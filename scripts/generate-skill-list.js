#!/usr/bin/env node
// Rebuilds the browsable k-skills-list.html from k-skills-list.md.
// The markdown file is the source of truth: "## <category>" headings and
// "- **<skill-id>** — <summary>" bullets. Fails if a skill directory with a
// skill.json is missing from the markdown, so the list cannot drift silently.
// The HTML template is embedded below, so a fresh clone can regenerate the
// page without any untracked local file.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const mdPath = path.join(repoRoot, "k-skills-list.md");
const htmlPath = path.join(repoRoot, "k-skills-list.html");

const CATEGORY_ICONS = {
  "쇼핑 · 커머스": "🛒",
  "부동산 · 경매 · 차량": "🏠",
  "교통 · 예매 · 여행": "🚆",
  "공공 · 행정 · 법률": "⚖️",
  "조달 · 입찰 · 기업조회": "📑",
  "금융 · 투자 · 통계": "💰",
  "의료 · 안전 · 환경": "🏥",
  "지역 · 장소": "📍",
  "채용 · 창업 · 지원사업": "💼",
  "문서 · 한국어 텍스트": "📄",
  "미디어 · 뉴스 · 콘텐츠": "📰",
  "스포츠 · 엔터 · 운세": "🏀",
  "생활 · 기타": "🧰",
  "k-skill 관리": "🔧",
};

// Numeric references keep this file free of literal entity text and cover
// every character the markdown summaries can contain.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function parseMarkdown(markdown) {
  const categories = [];
  let current = null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = { name: heading[1].trim(), items: [] };
      categories.push(current);
      continue;
    }
    const item = line.match(/^- \*\*([a-z0-9-]+)\*\* — (.+)$/);
    if (item && current) current.items.push([item[1], item[2].trim()]);
  }
  return categories;
}

function listSkillDirs() {
  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(repoRoot, e.name, "skill.json")))
    .map((e) => e.name);
}

const categories = parseMarkdown(fs.readFileSync(mdPath, "utf8"));
const listed = new Set(categories.flatMap((c) => c.items.map(([id]) => id)));
const total = listed.size;

const missing = listSkillDirs().filter((id) => !listed.has(id));
if (missing.length) {
  console.error(`k-skills-list.md is missing ${missing.length} skill(s):`);
  for (const id of missing) console.error(`  - ${id}`);
  process.exit(1);
}

function renderSection({ name, items }) {
  const icon = CATEGORY_ICONS[name] || "•";
  const rows = items
    .map(
      ([id, description]) =>
        `      <li><code>${escapeHtml(id)}</code><span>${escapeHtml(description)}</span></li>`
    )
    .join("\n");
  return `  <section>
    <h2>${escapeHtml(`${icon} ${name}`)} <span class="n">${items.length}개</span></h2>
    <ul>
${rows}
    </ul>
  </section>`;
}

const today = new Date().toISOString().slice(0, 10);
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>k-skill 스킬 목록 (${total})</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 15px/1.6 -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
  header { padding: 28px 20px 12px; max-width: 880px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 14px; }
  #cnt { font-size: 15px; font-weight: 400; opacity: 0.7; margin-left: 8px; }
  #q { width: 100%; box-sizing: border-box; padding: 10px 14px; font-size: 15px;
       border: 1px solid #b8b8b8; border-radius: 10px; background: transparent; color: inherit; }
  #q:focus { outline: 2px solid #6ea8fe; }
  main { max-width: 880px; margin: 0 auto; padding: 8px 20px 40px; }
  section { margin: 22px 0; }
  h2 { font-size: 17px; margin: 0 0 10px; }
  h2 .n { font-size: 13px; font-weight: 400; opacity: 0.6; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; gap: 12px; padding: 7px 0; border-bottom: 1px solid #e6e6e6; align-items: baseline; }
  code { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  #shown { font-size: 13px; opacity: 0.7; margin-left: 10px; }
  footer { max-width: 880px; margin: 0 auto; padding: 18px 20px 36px; font-size: 13px; opacity: 0.65; }
</style>
</head>
<body>
<header>
  <h1>k-skill 스킬 목록<span id="cnt">${total}개</span><span id="shown"></span></h1>
  <input id="q" type="search" placeholder="스킬 검색 (id 또는 설명)">
</header>
<main>
${categories.map(renderSection).join("\n")}
</main>
<footer>업데이트 ${today} · k-skills-list.md 기준</footer>
<script>
  const input = document.getElementById("q");
  const shown = document.getElementById("shown");
  input.addEventListener("input", () => {
    const needle = input.value.trim().toLowerCase();
    let count = 0;
    for (const li of document.querySelectorAll("main li")) {
      const hit = !needle || li.textContent.toLowerCase().includes(needle);
      li.hidden = !hit;
      if (hit) count += 1;
    }
    for (const section of document.querySelectorAll("main section")) {
      section.hidden = ![...section.querySelectorAll("li")].some((li) => !li.hidden);
    }
    shown.textContent = needle ? count + "개 표시" : "";
  });
</script>
</body>
</html>
`;

fs.writeFileSync(htmlPath, html);

console.log(`k-skills-list.html: ${total} skills, ${categories.length} categories`);
console.log(
  'PDF: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless ' +
    `--no-pdf-header-footer --print-to-pdf="${path.join(repoRoot, "k-skills-list.pdf")}" "file://${htmlPath}"`
);
