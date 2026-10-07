#!/usr/bin/env node
// Rebuilds the searchable k-skills-list.html from k-skills-list.md.
// The markdown file is the source of truth: "## <category>" headings and
// "- **<skill-id>** — <summary>" bullets. Fails if a skill directory with a
// skill.json is missing from the markdown, so the list cannot drift silently.
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

const data =
  "[\n" +
  categories
    .map(
      ({ name, items }) =>
        ` [${JSON.stringify(`${CATEGORY_ICONS[name] || "•"} ${name}`)},[\n` +
        items.map(([id, d]) => `  [${JSON.stringify(id)},${JSON.stringify(d)}],`).join("\n") +
        "\n ]],"
    )
    .join("\n") +
  "\n];";

const today = new Date().toISOString().slice(0, 10);
let html = fs.readFileSync(htmlPath, "utf8");
html = html.replace(/const DATA = \[[\s\S]*?\n\];/, `const DATA = ${data}`);
html = html.replace(/<title>.*?<\/title>/, `<title>k-skill 스킬 목록 (${total})</title>`);
html = html.replace(/(id="cnt"[^>]*>)\d+개/, `$1${total}개`);
html = html.replace(/filter\?shown\+'개 표시':'\d+개'/, `filter?shown+'개 표시':'${total}개'`);
html = html.replace(/<footer>업데이트 .*?<\/footer>/, `<footer>업데이트 ${today} · origin/main 기준</footer>`);
fs.writeFileSync(htmlPath, html);

console.log(`k-skills-list.html: ${total} skills, ${categories.length} categories`);
console.log(
  'PDF: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless ' +
    `--no-pdf-header-footer --print-to-pdf="${path.join(repoRoot, "k-skills-list.pdf")}" "file://${htmlPath}"`
);
