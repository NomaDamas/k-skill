const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findSection(doc, heading) {
  const escaped = escapeRegex(heading);
  const match = doc.match(new RegExp(`${escaped}[\\s\\S]*?(?=\\n## |\\n### |$)`));

  assert.ok(match, `expected section headed by "${heading}"`);
  return match[0];
}

function assertOliveYoungCloneFallbackCommands(doc, label) {
  assert.match(doc, /node dist\/bin\.js health/, `${label} should document the runnable local health command`);
  assert.match(
    doc,
    /node dist\/bin\.js get \/api\/oliveyoung\/stores --keyword 명동 --limit 5 --json/,
    `${label} should document the runnable local store lookup command`,
  );
  assert.match(
    doc,
    /node dist\/bin\.js get \/api\/oliveyoung\/products --keyword 선크림 --size 5 --json/,
    `${label} should document the runnable local product lookup command`,
  );
  assert.match(
    doc,
    /node dist\/bin\.js get \/api\/oliveyoung\/inventory --keyword 선크림 --storeKeyword 명동 --size 5 --json/,
    `${label} should document the runnable local inventory lookup command`,
  );
  assert.doesNotMatch(doc, /^\s*npx daiso\b/m, `${label} should not publish broken clone-local npx commands`);
}

function assertOliveYoungCloneFallbackShorthand(doc, label) {
  assert.match(
    doc,
    /git clone https:\/\/github\.com\/hmmhmmhm\/daiso-mcp\.git && cd daiso-mcp && npm install && npm run build/,
    `${label} should include a runnable shorthand that changes into the clone before install/build`,
  );
  assert.doesNotMatch(
    doc,
    /git clone https:\/\/github\.com\/hmmhmmhm\/daiso-mcp\.git && npm install && npm run build/,
    `${label} should not publish the broken shorthand that skips cd daiso-mcp`,
  );
}

function extractQuotedEntries(block, indent) {
  return block
    .split("\n")
    .map((line) => line.match(new RegExp(`^ {${indent}}"([^"]+)":\\s*(.+?)(?:,)?$`)))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim()]);
}

function findPrintedObjectBlock(doc, carrier) {
  const block = [...doc.matchAll(/print\(json\.dumps\(\{\n([\s\S]*?)\n\}, ensure_ascii=False, indent=2\)\)/g)]
    .map((match) => match[1])
    .find((candidate) => candidate.includes(`"carrier": "${carrier}"`));

  assert.ok(block, `expected ${carrier} normalized JSON example`);
  return block;
}

function findRecentEventsBlock(doc, carrier) {
  const block = [...doc.matchAll(/normalized_events = \[\n\s*\{\n([\s\S]*?)\n\s*\}\n\s*for [^\n]+ in events\n\]/g)]
    .map((match) => match[1])
    .find((candidate) => candidate.includes('"status_code":') === (carrier === "cj"));

  assert.ok(block, `expected ${carrier} recent_events example`);
  return block;
}

function findJsonFenceAfterLabel(doc, label) {
  return JSON.parse(findJsonFenceTextAfterLabel(doc, label));
}

function findJsonFenceTextAfterLabel(doc, label) {
  const escaped = escapeRegex(label);
  const match = doc.match(new RegExp(`${escaped}[\\s\\S]*?\\\`\\\`\\\`json\\n([\\s\\S]*?)\\n\\\`\\\`\\\``));

  assert.ok(match, `expected JSON example after "${label}"`);
  return match[1];
}

function assertSampleProvenance(doc, sectionLabel, expected, docLabel) {
  const escapedSectionLabel = escapeRegex(sectionLabel);
  const escapedVerifiedAt = escapeRegex(expected.verified_at);
  const escapedInvoice = escapeRegex(expected.invoice);

  assert.match(
    doc,
    new RegExp(
      `${escapedSectionLabel}[\\s\\S]*?아래 값은 ${escapedVerifiedAt} 기준 live smoke test\\(\\x60${escapedInvoice}\\x60\\)에서 확인한 정규화 결과다\\.\\n\\n\\\`\\\`\\\`json`,
    ),
    `${docLabel} ${sectionLabel} provenance line must stay pinned to the verified smoke-test date and invoice`,
  );
}

function assertSanitizedPublicOutput(output, label) {
  const serialized = JSON.stringify(output);

  assert.doesNotMatch(serialized, /\bTEL\b/i, `${label} must not leak TEL fragments`);
  assert.doesNotMatch(
    serialized,
    /\d{2,4}[.\-]\d{3,4}[.\-]\d{4}/,
    `${label} must not leak phone-number-like strings anywhere in the published sample`,
  );
  assert.doesNotMatch(serialized, /crgNm/, `${label} must not leak CJ assignee/source fields`);
  assert.doesNotMatch(serialized, /sender/i, `${label} must not leak sender fields`);
  assert.doesNotMatch(serialized, /receiver/i, `${label} must not leak receiver fields`);
  assert.doesNotMatch(serialized, /delivered_to/i, `${label} must not leak delivered_to fields`);
}

function assertKakaoBarNearbySadangSmokeSnapshot(smoke, label) {
  assert.equal(smoke.anchor.name, "사당1동먹자골목상점가", `${label} anchor should stay on the verified area landmark`);
  assert.equal(smoke.meta.openNowCount, 4, `${label} should publish the verified open-now count`);
  assert.deepEqual(
    smoke.items.map((item) => item.name),
    ["우미노식탁", "방배을지로골뱅이술집포차 사당역점", "커먼테이블"],
    `${label} should keep the verified top-3 ordering`,
  );
}

test("root npm test script includes the skill docs regression suite", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.match(packageJson.scripts.test, /node --test scripts\/skill-docs\.test\.js/);
});

test("README advertises OpenClaw among the supported coding agents", () => {
  const readme = read("README.md");

  assert.match(
    readme,
    /Claude Code, Codex, OpenCode, OpenClaw\/ClawHub 등 각종 코딩 에이전트 지원합니다\./,
  );
});

test("hwp skill documents kordoc-based parsing and supported operations", () => {
  const skillPath = path.join(repoRoot, "hwp", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected hwp/SKILL.md to exist");

  const skill = read(path.join("hwp", "SKILL.md"));

  assert.match(skill, /^name: hwp$/m);
  assert.match(skill, /\bkordoc\b/);
  assert.doesNotMatch(skill, /@ohah\/hwpjs/);
  assert.doesNotMatch(skill, /\bhwp-mcp\b/);
  assert.match(skill, /JSON/i);
  assert.match(skill, /Markdown/i);
  assert.match(skill, /image/i);
  assert.match(skill, /(batch|배치)/i);
  assert.match(skill, /HWPX/i);
  assert.match(skill, /(역변환|되돌려)/);
  assert.match(skill, /(비교|compare)/i);
  assert.match(skill, /pdfjs-dist/);
  assert.match(skill, /(extractFormFields|양식 필드)/);
  assert.doesNotMatch(skill, /fillForm/);
  assert.doesNotMatch(skill, /kordoc fill/);
  assert.doesNotMatch(skill, /kordoc mcp/);
});

test("hwp docs match the published kordoc install and runtime contract", () => {
  const skill = read(path.join("hwp", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "hwp.md"));
  const install = read(path.join("docs", "install.md"));
  const readme = read("README.md");
  const sources = read(path.join("docs", "sources.md"));

  assert.match(skill, /npx --yes --package kordoc --package pdfjs-dist kordoc .* -o .*\.md/);
  assert.match(skill, /markdownToHwpx/);
  assert.match(skill, /extractFormFields/);
  assert.match(skill, /npm init -y/);
  assert.match(skill, /npm install kordoc pdfjs-dist/);
  assert.doesNotMatch(skill, /^\s*npx kordoc\b/m);
  assert.doesNotMatch(skill, /export NODE_PATH/);
  assert.match(featureDoc, /npx --yes --package kordoc --package pdfjs-dist kordoc .* --format json/);
  assert.match(featureDoc, /markdownToHwpx/);
  assert.match(featureDoc, /(extractFormFields|양식 필드)/);
  assert.match(featureDoc, /npx --yes --package kordoc --package pdfjs-dist kordoc watch/);
  assert.match(featureDoc, /npm init -y/);
  assert.match(featureDoc, /npm install kordoc pdfjs-dist/);
  assert.doesNotMatch(featureDoc, /^\s*npx kordoc\b/m);
  assert.doesNotMatch(featureDoc, /export NODE_PATH/);
  assert.match(featureDoc, /npm install -g kordoc pdfjs-dist/);
  assert.doesNotMatch(featureDoc, /선택적으로 `pdfjs-dist`/);
  assert.doesNotMatch(featureDoc, /kordoc fill/);
  assert.doesNotMatch(featureDoc, /kordoc mcp/);
  assert.doesNotMatch(featureDoc, /fillForm/);
  assert.match(install, /npm install -g kordoc pdfjs-dist /);
  assert.match(install, /HWP Node API 예시는 전역 `NODE_PATH` 대신 로컬 프로젝트에 `npm install kordoc pdfjs-dist` 후 실행/);
  assert.match(install, /`kordoc` CLI를 일회성으로만 쓸 때는 `npx --yes --package kordoc --package pdfjs-dist kordoc \.\.\.` 형태를 사용한다\./);
  assert.match(readme, /\| HWP 문서 처리 \| .*양식 필드 추출.*Markdown→HWPX 역변환/);
  assert.doesNotMatch(readme, /\| HWP 문서 처리 \| .*양식 채우기/);
  assert.match(sources, /kordoc/);
  assert.match(sources, /pdfjs-dist/);
});

test("repository docs advertise the hwp skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "hwp.md");
  const featureDoc = read(path.join("docs", "features", "hwp.md"));

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/hwp.md to exist");
  assert.match(readme, /\| HWP 문서 처리 \|/);
  assert.match(readme, /\[HWP 문서 처리\]\(docs\/features\/hwp\.md\)/);
  assert.match(install, /--skill hwp/);
  assert.match(featureDoc, /\bkordoc\b/);
  assert.doesNotMatch(featureDoc, /@ohah\/hwpjs/);
  assert.doesNotMatch(featureDoc, /\bhwp-mcp\b/);
  assert.match(install, /npm install -g kordoc /);
  assert.doesNotMatch(install, /@ohah\/hwpjs/);
});

test("repository docs advertise the kakaotalk-mac skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "kakaotalk-mac.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/kakaotalk-mac.md to exist");
  assert.match(readme, /\| 카카오톡 Mac CLI \|/);
  assert.match(readme, /\[카카오톡 Mac CLI\]\(docs\/features\/kakaotalk-mac\.md\)/);
  assert.match(install, /--skill kakaotalk-mac/);
});

test("repository docs advertise the used-car-price-search skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "used-car-price-search.md");
  const skillPath = path.join(repoRoot, "used-car-price-search", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/used-car-price-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected used-car-price-search/SKILL.md to exist");
  assert.match(readme, /\| 중고차 가격 조회 \|/);
  assert.match(readme, /\[중고차 가격 조회 가이드\]\(docs\/features\/used-car-price-search\.md\)/);
  assert.match(install, /--skill used-car-price-search/);
  assert.match(
    install,
    /npm install -g kordoc pdfjs-dist kbo-game kbl-results kleague-results lck-analytics toss-securities hipass-receipt k-lotto coupang-product-search used-car-price-search cheap-gas-nearby public-restroom-nearby korean-law-mcp/,
  );
});

test("repository docs advertise the public-restroom-nearby skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "public-restroom-nearby.md");
  const skillPath = path.join(repoRoot, "public-restroom-nearby", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/public-restroom-nearby.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected public-restroom-nearby/SKILL.md to exist");
  assert.match(readme, /\| 근처 공중화장실 찾기 \|/);
  assert.match(readme, /\[근처 공중화장실 찾기 가이드\]\(docs\/features\/public-restroom-nearby\.md\)/);
  assert.match(install, /--skill public-restroom-nearby/);
  assert.match(install, /npm install -g .*public-restroom-nearby/);
});

test("public-restroom-nearby docs describe the maxDistanceMeters distance cap", () => {
  const featureDoc = read(path.join("docs", "features", "public-restroom-nearby.md"));
  const packageReadme = read(path.join("packages", "public-restroom-nearby", "README.md"));

  assert.match(featureDoc, /maxDistanceMeters/);
  assert.match(featureDoc, /100m/);
  assert.match(packageReadme, /maxDistanceMeters/);
  assert.match(packageReadme, /100m/);
});

test("repository docs advertise the lck-analytics skill and package", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "lck-analytics.md");
  const skillPath = path.join(repoRoot, "lck-analytics", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/lck-analytics.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected lck-analytics/SKILL.md to exist");
  assert.match(readme, /\| LCK 경기 분석 \|/);
  assert.match(readme, /\[LCK 경기 분석 가이드\]\(docs\/features\/lck-analytics\.md\)/);
  assert.match(install, /--skill lck-analytics/);
  assert.match(install, /npm install -g .*lck-analytics/);
});

test("lck-analytics docs and skill credit the original author and reference repo", () => {
  const skill = read(path.join("lck-analytics", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "lck-analytics.md"));
  const packageReadme = read(path.join("packages", "lck-analytics", "README.md"));
  const sources = read(path.join("docs", "sources.md"));

  for (const doc of [skill, featureDoc, packageReadme]) {
    assert.match(doc, /jerjangmin/);
    assert.match(doc, /https:\/\/github\.com\/jerjangmin\/share\/tree\/main\/SKILL\/lck-analytics/);
    assert.match(doc, /Riot|LoL Esports|Oracle(?:'s)? Elixir/i);
  }

  assert.match(sources, /https:\/\/github\.com\/jerjangmin\/share\/tree\/main\/SKILL\/lck-analytics/);
});

test("repository docs advertise the korean-spell-check skill and usage constraints", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-spell-check.md");
  const skillPath = path.join(repoRoot, "korean-spell-check", "SKILL.md");
  const featureDoc = read(path.join("docs", "features", "korean-spell-check.md"));
  const skill = read(path.join("korean-spell-check", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korean-spell-check.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected korean-spell-check/SKILL.md to exist");
  assert.match(readme, /\| 한국어 맞춤법 검사 \|/);
  assert.match(readme, /\[한국어 맞춤법 검사 가이드\]\(docs\/features\/korean-spell-check\.md\)/);
  assert.match(install, /--skill korean-spell-check/);
  assert.match(skill, /비상업적 용도|개인이나 학생만 무료/);
  assert.match(skill, /robots\.txt/i);
  assert.match(skill, /청크|chunk/i);
  assert.match(skill, /원문.*교정안.*이유/s);
  assert.match(featureDoc, /old_speller\/results/);
  assert.match(featureDoc, /Cloudflare|403/);
  assert.match(featureDoc, /python3 scripts\/korean_spell_check\.py/);
  assert.match(sources, /https:\/\/nara-speller\.co\.kr\/speller\//);
  assert.match(sources, /https:\/\/nara-speller\.co\.kr\/old_speller\//);
  assert.match(sources, /https:\/\/nara-speller\.co\.kr\/robots\.txt/);
  assert.match(roadmap, /한국어 맞춤법 검사 스킬 출시/);
});

test("repository docs advertise the MFDS public-health skills and mandatory symptom interview", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const sources = read(path.join("docs", "sources.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const drugSkillPath = path.join(repoRoot, "mfds-drug-safety", "SKILL.md");
  const foodSkillPath = path.join(repoRoot, "mfds-food-safety", "SKILL.md");
  const drugFeaturePath = path.join(repoRoot, "docs", "features", "mfds-drug-safety.md");
  const foodFeaturePath = path.join(repoRoot, "docs", "features", "mfds-food-safety.md");

  assert.ok(fs.existsSync(drugSkillPath), "expected mfds-drug-safety/SKILL.md to exist");
  assert.ok(fs.existsSync(foodSkillPath), "expected mfds-food-safety/SKILL.md to exist");
  assert.ok(fs.existsSync(drugFeaturePath), "expected docs/features/mfds-drug-safety.md to exist");
  assert.ok(fs.existsSync(foodFeaturePath), "expected docs/features/mfds-food-safety.md to exist");
  assert.match(readme, /\| 의약품 안전 체크 \|/);
  assert.match(readme, /\| 식품 안전 체크 \|/);
  assert.match(readme, /\| 의약품 안전 체크 \| .* \| 불필요 \|/);
  assert.match(readme, /\| 식품 안전 체크 \| .* \| 불필요 \|/);
  assert.match(install, /--skill mfds-drug-safety/);
  assert.match(install, /--skill mfds-food-safety/);
  assert.match(sources, /15075057\/openapi\.do/);
  assert.match(sources, /15097208\/openapi\.do/);
  assert.match(sources, /15056516\/openapi\.do/);
  assert.match(sources, /15074318\/openapi\.do/);
  assert.match(sources, /foodsafetykorea\.go\.kr\/api\/openApiInfo\.do.*svc_no=I0490/);
  for (const doc of [setup, security, setupSkill]) {
    assert.match(doc, /의약품 안전 체크|식품 안전 체크/);
    assert.match(doc, /FOODSAFETYKOREA_API_KEY|DATA_GO_KR_API_KEY/);
    assert.match(doc, /사용자.*불필요|proxy 서버/u);
  }

  for (const relativePath of [
    path.join("mfds-drug-safety", "SKILL.md"),
    path.join("mfds-food-safety", "SKILL.md"),
    path.join("docs", "features", "mfds-drug-safety.md"),
    path.join("docs", "features", "mfds-food-safety.md")
  ]) {
    const doc = read(relativePath);

    assert.match(doc, /인터뷰|되묻/);
    assert.match(doc, /호흡곤란/);
    assert.match(doc, /직접 진단|진단\/처방|진단\)이나/);
    assert.match(doc, /119|응급실/);
  }
});
test("used-car-price-search docs document the provider survey and SK direct surface", () => {
  const skill = read(path.join("used-car-price-search", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "used-car-price-search.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /SK렌터카|SK렌터카 다이렉트|타고BUY/);
    assert.match(doc, /롯데렌탈|롯데오토옥션/);
    assert.match(doc, /레드캡렌터카/);
    assert.match(doc, /MCP/i);
    assert.match(doc, /Skill/i);
    assert.match(doc, /https:\/\/www\.skdirect\.co\.kr\/tb/);
    assert.match(doc, /__NEXT_DATA__/);
    assert.match(doc, /인수가/);
    assert.match(doc, /월\s*렌트료|월\s*요금|월\s*가격/);
    assert.match(doc, /10회 이상|최소 10회/);
  }

  assert.match(featureDoc, /2026-04-02/);
  assert.match(featureDoc, /inventory 규모는 시점에 따라 변동될 수/);
  assert.doesNotMatch(featureDoc, /총 `\d+대`/);
  assert.match(sources, /https:\/\/www\.skdirect\.co\.kr\/tb/);
  assert.match(sources, /https:\/\/www\.lotteautoauction\.net\/hp\/pub\/cmm\/viewMain\.do/);
  assert.match(sources, /https:\/\/biz\.redcap\.co\.kr\/rent\//);
  assert.match(roadmap, /중고차 가격 조회 스킬 출시/);
});

test("seoul subway docs require an explicit proxy until the hosted route is live", () => {
  const readme = read("README.md");
  const setup = read(path.join("docs", "setup.md"));
  const install = read(path.join("docs", "install.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const skill = read(path.join("seoul-subway-arrival", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "seoul-subway-arrival.md"));
  const proxyDoc = read(path.join("docs", "features", "k-skill-proxy.md"));
  const proxyReadme = read(path.join("packages", "k-skill-proxy", "README.md"));
  const secretsExample = read(path.join("examples", "secrets.env.example"));

  assert.match(readme, /\| 서울 지하철 도착정보 조회 \| .* \| 불필요 \|/);
  assert.match(setup, /\| 서울 지하철 도착정보 조회 \| self-host 또는 배포 확인이 끝난 `KSKILL_PROXY_BASE_URL` \|/);
  assert.match(install, /--skill seoul-subway-arrival/);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /KSKILL_PROXY_BASE_URL/);
    assert.match(doc, /\/v1\/seoul-subway\/arrival/);
    assert.match(doc, /사용자가 .*OpenAPI key.*직접.*필요(가|는)? 없다|개인 API key 없이/i);
    assert.match(doc, /self-host|운영 중인 proxy|배포가 끝난 proxy/i);
    assert.doesNotMatch(doc, /SEOUL_OPEN_API_KEY/);
    assert.doesNotMatch(doc, /swopenAPI\.seoul\.go\.kr\/api\/subway\/\$\{SEOUL_OPEN_API_KEY\}/);
    assert.doesNotMatch(doc, /기본값 `https:\/\/k-skill-proxy\.nomadamas\.org`/);
    assert.doesNotMatch(doc, /없으면 hosted proxy .*기본/);
  }

  assert.match(proxyDoc, /GET \/v1\/seoul-subway\/arrival/);
  assert.match(proxyDoc, /SEOUL_OPEN_API_KEY/);
  assert.match(proxyReadme, /GET \/v1\/seoul-subway\/arrival/);
  assert.match(proxyReadme, /SEOUL_OPEN_API_KEY/);
  assert.match(security, /KSKILL_PROXY_BASE_URL/);
  assert.match(security, /배포가 끝난 proxy|self-host/i);
  assert.match(setupSkill, /서울 지하철: self-host 또는 배포 확인이 끝난 `KSKILL_PROXY_BASE_URL`/);
  assert.doesNotMatch(secretsExample, /SEOUL_OPEN_API_KEY/);
  assert.match(secretsExample, /KSKILL_PROXY_BASE_URL=https:\/\/your-proxy\.example\.com/);
  assert.doesNotMatch(secretsExample, /KSKILL_PROXY_BASE_URL=https:\/\/k-skill-proxy\.nomadamas\.org/);
});

test("repository docs advertise the korea-weather skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korea-weather.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korea-weather.md to exist");
  assert.match(readme, /\| 한국 날씨 조회 \|/);
  assert.match(readme, /\[한국 날씨 조회 가이드\]\(docs\/features\/korea-weather\.md\)/);
  assert.match(install, /--skill korea-weather/);
  assert.match(roadmap, /한국 날씨 조회 스킬 출시/);
  assert.match(sources, /기상청 단기예보 조회서비스: https:\/\/www\.data\.go\.kr\/data\/15084084\/openapi\.do/);
});

test("korea-weather docs route short-term forecast calls through the proxy without requiring a user API key", () => {
  const skillPath = path.join(repoRoot, "korea-weather", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected korea-weather/SKILL.md to exist");

  const skill = read(path.join("korea-weather", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "korea-weather.md"));
  const proxyDoc = read(path.join("docs", "features", "k-skill-proxy.md"));
  const proxyReadme = read(path.join("packages", "k-skill-proxy", "README.md"));

  assert.match(skill, /^name: korea-weather$/m);
  assert.match(skill, /^description: .*날씨.*기상청.*프록시.*$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /\/v1\/korea-weather\/forecast/);
    assert.match(doc, /기상청.*단기예보|단기예보.*기상청/);
    assert.match(doc, /사용자가 .*API key.*직접.*필요(가|는)? 없다|개인 API key 없이/i);
    assert.match(doc, /nx|ny|위도|경도/u);
    assert.match(doc, /TMP|SKY|PTY|POP/);
    assert.match(doc, /KSKILL_PROXY_BASE_URL|k-skill-proxy\.nomadamas\.org/);
    assert.doesNotMatch(doc, /KMA_OPEN_API_KEY=.*사용자/);
  }

  assert.match(proxyDoc, /GET \/v1\/korea-weather\/forecast/);
  assert.match(proxyDoc, /KMA_OPEN_API_KEY/);
  assert.match(proxyReadme, /GET \/v1\/korea-weather\/forecast/);
  assert.match(proxyReadme, /KMA_OPEN_API_KEY/);
});

test("kakaotalk-mac skill documents safe macOS kakaocli usage", () => {
  const skillPath = path.join(repoRoot, "kakaotalk-mac", "SKILL.md");
  const helperPath = path.join(repoRoot, "scripts", "kakaotalk_mac.py");
  const featureDoc = read(path.join("docs", "features", "kakaotalk-mac.md"));

  assert.ok(fs.existsSync(skillPath), "expected kakaotalk-mac/SKILL.md to exist");
  assert.ok(fs.existsSync(helperPath), "expected scripts/kakaotalk_mac.py to exist");

  const skill = read(path.join("kakaotalk-mac", "SKILL.md"));

  assert.match(skill, /^name: kakaotalk-mac$/m);
  assert.match(skill, /kakaocli/);
  assert.match(skill, /macOS/i);
  assert.match(skill, /KakaoTalk/i);
  assert.match(skill, /Full Disk Access/i);
  assert.match(skill, /Accessibility/i);
  assert.match(skill, /--me/);
  assert.match(skill, /confirm before sending/i);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /python3 scripts\/kakaotalk_mac\.py auth/);
    assert.match(doc, /python3 scripts\/kakaotalk_mac\.py chats --limit 10 --json/);
    assert.match(doc, /python3 scripts\/kakaotalk_mac\.py messages --chat/);
    assert.match(doc, /python3 scripts\/kakaotalk_mac\.py search/);
    assert.match(doc, /user_id 자동 감지 실패|SHA-512|DESIGNATEDFRIENDSREVISION/i);
    assert.match(doc, /cache|캐시/);
    assert.match(doc, /read-only|읽기 전용/i);
    assert.doesNotMatch(doc, /`query`/);
  }
});

test("repository docs advertise the KTX booking skill as supported", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "ktx-booking.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/ktx-booking.md to exist");
  assert.match(readme, /\| KTX 예매 \|/);
  assert.match(readme, /\[KTX 예매 가이드\]\(docs\/features\/ktx-booking\.md\)/);
  assert.doesNotMatch(readme, /KTX 예매는 현재 작동하지 않습니다/);
  assert.doesNotMatch(readme, /KTX 예매 \| 현재 작동하지 않음/);
  assert.match(install, /--skill ktx-booking/);
});

test("ktx-booking docs document the helper-based live Korail workflow", () => {
  const skillPath = path.join(repoRoot, "ktx-booking", "SKILL.md");
  const helperPath = path.join(repoRoot, "scripts", "ktx_booking.py");

  assert.ok(fs.existsSync(skillPath), "expected ktx-booking/SKILL.md to exist");
  assert.ok(fs.existsSync(helperPath), "expected scripts/ktx_booking.py to exist");

  const skill = read(path.join("ktx-booking", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "ktx-booking.md"));
  const helper = read(path.join("scripts", "ktx_booking.py"));

  assert.match(skill, /^name: ktx-booking$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /python3 scripts\/ktx_booking\.py search/);
    assert.match(doc, /python3 scripts\/ktx_booking\.py reserve/);
    assert.match(doc, /python3 scripts\/ktx_booking\.py reservations/);
    assert.match(doc, /python3 scripts\/ktx_booking\.py cancel/);
    assert.match(doc, /train_id/);
    assert.match(doc, /--train-id/);
    assert.match(doc, /--include-no-seats/);
    assert.match(doc, /--include-waiting-list/);
    assert.match(doc, /--try-waiting/);
    assert.match(doc, /credential resolution order|KSKILL_KTX_ID/);
    assert.match(doc, /anti-bot|Dynapath|x-dynapath-m-token/i);
    assert.match(doc, /결제(까지)?는 자동화하지 않는다|결제는 제외/);
    assert.doesNotMatch(doc, /예약 시 선택할 `--train-index`/);
  }

  assert.match(helper, /x-dynapath-m-token/);
  assert.match(helper, /250601002/);
  assert.match(helper, /def build_parser/);
  assert.match(helper, /train_id/);
});

test("ktx-booking helper python regression tests pass", () => {
  const result = childProcess.spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "scripts", "-p", "test_ktx_booking.py"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PYTHONNOUSERSITE: "1" },
    },
  );

  assert.equal(
    result.status,
    0,
    `expected python KTX helper regression tests to pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
});



test("repository docs advertise the geeknews-search skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "geeknews-search.md");
  const skillPath = path.join(repoRoot, "geeknews-search", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/geeknews-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected geeknews-search/SKILL.md to exist");
  assert.match(readme, /\| 긱뉴스 조회 \|/);
  assert.match(readme, /\[긱뉴스 조회 가이드\]\(docs\/features\/geeknews-search\.md\)/);
  assert.match(install, /--skill geeknews-search/);
});

test("geeknews-search docs lock the RSS-first list-search-detail workflow", () => {
  const skill = read(path.join("geeknews-search", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "geeknews-search.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /feeds\.feedburner\.com\/geeknews-feed/);
    assert.match(doc, /python3 scripts\/geeknews_search\.py list/);
    assert.match(doc, /python3 scripts\/geeknews_search\.py search/);
    assert.match(doc, /python3 scripts\/geeknews_search\.py detail/);
    assert.match(doc, /RSS-first|RSS first|RSS 피드/);
    assert.match(doc, /read-only|읽기 전용/);
  }
});

test("repository docs advertise the subway-lost-property skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "subway-lost-property.md");
  const skillPath = path.join(repoRoot, "subway-lost-property", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/subway-lost-property.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected subway-lost-property/SKILL.md to exist");
  assert.match(readme, /\| 지하철 분실물 조회 \|/);
  assert.match(readme, /\[지하철 분실물 조회 가이드\]\(docs\/features\/subway-lost-property\.md\)/);
  assert.match(install, /--skill subway-lost-property/);
});

test("subway-lost-property docs lock the official LOST112 guidance flow", () => {
  const skill = read(path.join("subway-lost-property", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "subway-lost-property.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /LOST112/);
    assert.match(doc, /seoulmetro\.co\.kr\/kr\/page\.do\?menuIdx=541/);
    assert.match(doc, /python3 scripts\/subway_lost_property\.py/);
    assert.match(doc, /SITE=V/);
    assert.match(doc, /안내형|하이브리드/);
  }
});

test("repository docs advertise the zipcode-search skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "zipcode-search.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/zipcode-search.md to exist");
  assert.match(readme, /\| 우편번호 검색 \|/);
  assert.match(readme, /\[우편번호 검색 가이드\]\(docs\/features\/zipcode-search\.md\)/);
  assert.match(install, /--skill zipcode-search/);
  assert.match(roadmap, /우편번호 검색/);
  assert.match(sources, /우체국 도로명주소 검색: https:\/\/parcel\.epost\.go\.kr\/parcel\/comm\/zipcode\/comm_newzipcd_list\.jsp/);
});

test("zipcode-search docs lock the official postcode plus English-address extraction flow", () => {
  const skillPath = path.join(repoRoot, "zipcode-search", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected zipcode-search/SKILL.md to exist");

  const skill = read(path.join("zipcode-search", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "zipcode-search.md"));
  const readme = read("README.md");
  const sources = read(path.join("docs", "sources.md"));

  assert.match(skill, /^name: zipcode-search$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /https:\/\/www\.epost\.kr\/search\.RetrieveIntegrationNewZipCdList\.comm/);
    assert.match(doc, /viewDetail/);
    assert.match(doc, /English\/집배코드/);
    assert.match(doc, /Rep\. of KOREA/);
    assert.match(doc, /curl --http1\.1 --tls-max 1\.2/);
    assert.match(doc, /--max-time/);
    assert.match(doc, /"--retry",\s+"3"/);
    assert.match(doc, /--retry-all-errors/);
    assert.match(doc, /"--retry-delay",\s+"1"/);
    assert.match(doc, /영문 주소|영문주소/);
    assert.match(doc, /python3 scripts\/zipcode_search\.py/);
    assert.match(doc, /\.\/scripts\/zipcode_search\.py/);
    assert.match(doc, /mktemp|임시 파일/);
    assert.doesNotMatch(doc, /urllib\.request/);
  }

  assert.match(readme, /우편번호 \+ 공식 영문주소 조회/);
  assert.match(sources, /우체국 통합 우편번호\/영문주소 검색: https:\/\/www\.epost\.kr\/search\.RetrieveIntegrationNewZipCdList\.comm/);
  assert.match(skill, /검색 결과가 없으면/i);
  assert.doesNotMatch(skill, /timeout\s*=/);
  assert.doesNotMatch(featureDoc, /timeout\s*=/);
  assert.match(featureDoc, /프로토콜\/클라이언트 제약/i);
});

test("repository docs advertise the delivery-tracking skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "delivery-tracking.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/delivery-tracking.md to exist");
  assert.match(readme, /\| 택배 배송조회 \|/);
  assert.match(readme, /\[택배 배송조회 가이드\]\(docs\/features\/delivery-tracking\.md\)/);
  assert.match(install, /--skill delivery-tracking/);
  assert.match(roadmap, /택배 배송조회 스킬 출시/);
  assert.match(sources, /CJ대한통운 배송조회: https:\/\/www\.cjlogistics\.com\/ko\/tool\/parcel\/tracking/);
  assert.match(sources, /우체국 배송조회: https:\/\/service\.epost\.go\.kr\/trace\.RetrieveRegiPrclDeliv\.postal\?sid1=/);
});

test("delivery-tracking skill documents official CJ and ePost flows with extension guidance", () => {
  const skillPath = path.join(repoRoot, "delivery-tracking", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected delivery-tracking/SKILL.md to exist");

  const skill = read(path.join("delivery-tracking", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "delivery-tracking.md"));

  assert.match(skill, /^name: delivery-tracking$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /https:\/\/www\.cjlogistics\.com\/ko\/tool\/parcel\/tracking/);
    assert.match(doc, /tracking-detail/);
    assert.match(doc, /paramInvcNo/);
    assert.match(doc, /_csrf/);
    assert.match(doc, /10자리 또는 12자리/);
    assert.match(doc, /https:\/\/service\.epost\.go\.kr\/trace\.RetrieveRegiPrclDeliv\.postal\?sid1=/);
    assert.match(doc, /trace\.RetrieveDomRigiTraceList\.comm/);
    assert.match(doc, /sid1/);
    assert.match(doc, /13자리/);
    assert.match(doc, /curl --http1\.1 --tls-max 1\.2/);
    assert.match(doc, /carrier adapter/i);
    assert.match(doc, /다른 택배사/);
  }

  assert.match(skill, /1234567890/);
  assert.match(skill, /1234567890123/);
  assert.match(skill, /python3/);
  assert.match(featureDoc, /JSON/);
  assert.match(featureDoc, /HTML/);
});

test("delivery-tracking published examples lock a shared normalized non-PII schema", () => {
  const skill = read(path.join("delivery-tracking", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "delivery-tracking.md"));
  const expectedTopLevelEntries = {
    cj: [
      ["carrier", '"cj"'],
      ["invoice", 'payload["parcelDetailResultMap"]["paramInvcNo"]'],
      ["status_code", 'latest.get("crgSt")'],
      ["status", 'status_map.get(latest.get("crgSt"), latest.get("scanNm") or "알수없음")'],
      ["timestamp", 'latest.get("dTime")'],
      ["location", 'latest.get("regBranNm")'],
      ["event_count", "len(events)"],
      ["recent_events", "normalized_events[-min(3, len(normalized_events)):]"],
    ],
    epost: [
      ["carrier", '"epost"'],
      ["invoice", 'clean(summary.group("tracking"))'],
      ["status", 'clean(summary.group("result"))'],
      ["timestamp", 'latest_event["timestamp"] if latest_event else None'],
      ["location", 'latest_event["location"] if latest_event else None'],
      ["event_count", "len(normalized_events)"],
      ["recent_events", "normalized_events[-min(3, len(normalized_events)):]"],
    ],
  };
  const expectedRecentEventEntries = {
    cj: [
      ["timestamp", 'event.get("dTime")'],
      ["location", 'event.get("regBranNm")'],
      ["status_code", 'event.get("crgSt")'],
      ["status", 'status_map.get(event.get("crgSt"), event.get("scanNm") or "알수없음")'],
    ],
    epost: [
      ["timestamp", 'f"{day} {time_}"'],
      ["location", "clean_location(location)"],
      ["status", "clean(status)"],
    ],
  };

  assert.doesNotMatch(skill, /"message":\s*latest\.get\("crgNm"\)/);
  assert.doesNotMatch(
    featureDoc,
    /print\(json\.dumps\(payload\["parcelDetailResultMap"\]\["resultList"\]\[-1\],\s*ensure_ascii=False,\s*indent=2\)\)/,
  );

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /공통 포맷/);
    assert.match(doc, /공통 결과 스키마/);
    assert.match(doc, /최근 이벤트/);
    assert.match(doc, /`carrier`/);
    assert.match(doc, /`invoice`/);
    assert.match(doc, /`status`/);
    assert.match(doc, /`timestamp`/);
    assert.match(doc, /`location`/);
    assert.match(doc, /`event_count`/);
    assert.match(doc, /`recent_events`/);
    assert.match(doc, /최근 최대 3개 이벤트/);
    assert.doesNotMatch(doc, /최근 3~5개 이벤트/);
    assert.match(doc, /"invoice":\s*payload\["parcelDetailResultMap"\]\["paramInvcNo"\]/);
    assert.match(doc, /"status_code":\s*latest\.get\("crgSt"\)/);
    assert.match(doc, /"status":\s*status_map\.get\(latest\.get\("crgSt"\),/);
    assert.match(doc, /"timestamp":\s*latest\.get\("dTime"\)/);
    assert.match(doc, /"location":\s*latest\.get\("regBranNm"\)/);
    assert.match(doc, /"event_count":\s*len\(events\)/);
    assert.match(doc, /"recent_events":/);
    assert.match(doc, /"invoice":\s*clean\(summary\.group/);
    assert.match(doc, /"timestamp":\s*latest_event\["timestamp"\] if latest_event else None/);
    assert.match(doc, /"location":\s*latest_event\["location"\] if latest_event else None/);
    assert.match(doc, /"event_count":\s*len\(normalized_events\)/);
    assert.match(doc, /"recent_events":\s*normalized_events\[-min\(3,\s*len\(normalized_events\)\):\]/);
    assert.match(doc, /def clean_location\(raw: str\) -> str:/);
    assert.match(doc, /TEL/);
    assert.match(doc, /\\d\{2,4\}/);
    assert.match(doc, /"location":\s*clean_location\(location\)/);
    assert.doesNotMatch(doc, /"tracking_no":/);
    assert.doesNotMatch(doc, /"latest_event_date":/);
    assert.doesNotMatch(doc, /"latest_event_time":/);
    assert.doesNotMatch(doc, /"latest_event_location":/);
    assert.doesNotMatch(doc, /"delivered_to":/);
    assert.doesNotMatch(doc, /"delivery_result":/);
  }

  for (const [label, doc] of [
    ["skill doc", skill],
    ["feature doc", featureDoc],
  ]) {
    assert.deepEqual(
      extractQuotedEntries(findPrintedObjectBlock(doc, "cj"), 4),
      expectedTopLevelEntries.cj,
      `${label} CJ example must keep the exact normalized top-level mapping`,
    );
    assert.deepEqual(
      extractQuotedEntries(findPrintedObjectBlock(doc, "epost"), 4),
      expectedTopLevelEntries.epost,
      `${label} ePost example must keep the exact normalized top-level mapping`,
    );
    assert.deepEqual(
      extractQuotedEntries(
        findRecentEventsBlock(doc, "cj"),
        8,
      ),
      expectedRecentEventEntries.cj,
      `${label} CJ recent_events entries must keep the exact normalized mapping`,
    );
    assert.deepEqual(
      extractQuotedEntries(
        findRecentEventsBlock(doc, "epost"),
        8,
      ),
      expectedRecentEventEntries.epost,
      `${label} ePost recent_events entries must keep the exact normalized mapping`,
    );
  }

  assert.doesNotMatch(skill, /"message":\s*latest\.get\("crgNm"\)/);
  assert.doesNotMatch(featureDoc, /print\(\{\s*"tracking_no"/);
});

test("delivery-tracking docs publish aligned sample normalized outputs for both carriers", () => {
  const expectedSamples = readJson(
    path.join("scripts", "fixtures", "delivery-tracking-public-samples.json"),
  );
  const skill = read(path.join("delivery-tracking", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "delivery-tracking.md"));
  const cjSkillOutput = findJsonFenceAfterLabel(skill, "CJ 공개 출력 예시");
  const cjFeatureOutput = findJsonFenceAfterLabel(featureDoc, "CJ 공개 출력 예시");
  const epostSkillOutput = findJsonFenceAfterLabel(skill, "우체국 공개 출력 예시");
  const epostFeatureOutput = findJsonFenceAfterLabel(featureDoc, "우체국 공개 출력 예시");

  for (const [docLabel, doc] of [
    ["skill doc", skill],
    ["feature doc", featureDoc],
  ]) {
    for (const [carrier, label] of [
      ["cj", "CJ 공개 출력 예시"],
      ["epost", "우체국 공개 출력 예시"],
    ]) {
      assert.equal(
        findJsonFenceTextAfterLabel(doc, label),
        JSON.stringify(expectedSamples[carrier], null, 2),
        `${docLabel} ${carrier} sample JSON block must stay byte-for-byte aligned with the checked-in public fixture`,
      );
    }
  }
  assert.deepEqual(cjSkillOutput, cjFeatureOutput, "CJ sample output must stay aligned across docs");
  assert.deepEqual(epostSkillOutput, epostFeatureOutput, "ePost sample output must stay aligned across docs");
  assert.deepEqual(cjSkillOutput, expectedSamples.cj, "CJ sample output must stay pinned to the verified public fixture");
  assert.deepEqual(epostSkillOutput, expectedSamples.epost, "ePost sample output must stay pinned to the verified public fixture");
  assertSanitizedPublicOutput(cjSkillOutput, "CJ sample output");
  assertSanitizedPublicOutput(epostSkillOutput, "ePost sample output");
});

test("delivery-tracking docs pin sample provenance to the verified smoke-test date and invoice", () => {
  const expectedProvenance = readJson(
    path.join("scripts", "fixtures", "delivery-tracking-public-provenance.json"),
  );
  const skill = read(path.join("delivery-tracking", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "delivery-tracking.md"));

  for (const [docLabel, doc] of [
    ["skill doc", skill],
    ["feature doc", featureDoc],
  ]) {
    assertSampleProvenance(doc, "CJ 공개 출력 예시", expectedProvenance.cj, docLabel);
    assertSampleProvenance(doc, "우체국 공개 출력 예시", expectedProvenance.epost, docLabel);
  }
});

test("repository docs advertise the daiso-product-search skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "daiso-product-search.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/daiso-product-search.md to exist");
  assert.match(readme, /\| 다이소 상품 조회 \|/);
  assert.match(readme, /\[다이소 상품 조회 가이드\]\(docs\/features\/daiso-product-search\.md\)/);
  assert.match(install, /--skill daiso-product-search/);
});

test("daiso-product-search skill documents the official Daiso Mall lookup flow", () => {
  const skillPath = path.join(repoRoot, "daiso-product-search", "SKILL.md");
  const featureDoc = read(path.join("docs", "features", "daiso-product-search.md"));

  assert.ok(fs.existsSync(skillPath), "expected daiso-product-search/SKILL.md to exist");

  const skill = read(path.join("daiso-product-search", "SKILL.md"));

  assert.match(skill, /^name: daiso-product-search$/m);
  assert.match(skill, /다이소몰/i);
  assert.match(skill, /매장명/);
  assert.match(skill, /상품명|검색어/);
  assert.match(skill, /https:\/\/www\.daisomall\.co\.kr\/api\/ms\/msg\/selStr/);
  assert.match(skill, /https:\/\/www\.daisomall\.co\.kr\/ssn\/search\/SearchGoods/);
  assert.match(skill, /https:\/\/www\.daisomall\.co\.kr\/api\/pd\/pdh\/selStrPkupStck/);
  assert.match(skill, /공식 표면이 매장 내 진열 위치를 주지 않으면 재고 중심/);
  assert.match(featureDoc, /SearchGoods/);
  assert.match(featureDoc, /selStrPkupStck/);
});

test("daiso-product-search package exposes reusable store, product, and stock helpers", () => {
  const pkg = require(path.join(repoRoot, "packages", "daiso-product-search", "src", "index.js"));

  assert.equal(typeof pkg.searchStores, "function");
  assert.equal(typeof pkg.searchProducts, "function");
  assert.equal(typeof pkg.getStorePickupStock, "function");
  assert.equal(typeof pkg.lookupStoreProductAvailability, "function");
});

test("daiso-product-search docs record the shipped feature and official sources", () => {
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));

  assert.match(roadmap, /다이소 상품 조회 스킬 출시/);
  assert.match(sources, /https:\/\/www\.daisomall\.co\.kr\/api\/ms\/msg\/selStr/);
  assert.match(sources, /https:\/\/www\.daisomall\.co\.kr\/ssn\/search\/SearchGoods/);
  assert.match(sources, /https:\/\/www\.daisomall\.co\.kr\/api\/pd\/pdh\/selStrPkupStck/);
});

test("repository docs advertise the market-kurly-search skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "market-kurly-search.md");
  const skillPath = path.join(repoRoot, "market-kurly-search", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/market-kurly-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected market-kurly-search/SKILL.md to exist");
  assert.match(readme, /\| 마켓컬리 상품 조회 \|/);
  assert.match(readme, /\[마켓컬리 상품 조회 가이드\]\(docs\/features\/market-kurly-search\.md\)/);
  assert.match(install, /--skill market-kurly-search/);
  assert.match(install, /npm install -g .* market-kurly-search/);
  assert.match(roadmap, /마켓컬리 상품 조회 스킬 출시/);
  assert.match(sources, /https:\/\/api\.kurly\.com\/search\/v4\/sites\/market\/normal-search/);
  assert.match(sources, /https:\/\/api\.kurly\.com\/search\/v3\/sites\/market\/normal-search\/count/);
  assert.match(sources, /https:\/\/www\.kurly\.com\/goods\/5063110/);
});

test("market-kurly-search skill and docs describe the unauthenticated Kurly search and detail flow", () => {
  const skill = read(path.join("market-kurly-search", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "market-kurly-search.md"));

  assert.match(skill, /^name: market-kurly-search$/m);
  assert.match(skill, /^description: .*마켓컬리.*상품.*가격.*$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /api\.kurly\.com\/search\/v4\/sites\/market\/normal-search/);
    assert.match(doc, /api\.kurly\.com\/search\/v3\/sites\/market\/normal-search\/count/);
    assert.match(doc, /www\.kurly\.com\/goods\/<productNo>|www\.kurly\.com\/goods\/5063110/);
    assert.match(doc, /로그인 없이|비로그인/);
    assert.match(doc, /현재 가격|할인/);
    assert.match(doc, /품절 여부|판매 상태/);
    assert.match(doc, /가격.*달라질 수|시점에 따라 달라질 수/u);
    assert.match(doc, /주문|장바구니/);
    assert.match(doc, /보수적으로|보수적/);
  }
});

test("market-kurly-search package exposes reusable search/count/detail helpers", () => {
  const pkg = require(path.join(repoRoot, "packages", "market-kurly-search", "src", "index.js"));

  assert.equal(typeof pkg.searchProducts, "function");
  assert.equal(typeof pkg.countProducts, "function");
  assert.equal(typeof pkg.getProductDetail, "function");
});

test("repository docs advertise the olive-young-search skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "olive-young-search.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/olive-young-search.md to exist");
  assert.match(readme, /\| 올리브영 검색 \|/);
  assert.match(readme, /\[올리브영 검색 가이드\]\(docs\/features\/olive-young-search\.md\)/);
  assert.match(install, /--skill olive-young-search/);
  assert.match(install, /npm install -g .* daiso/);
  assert.match(roadmap, /올리브영 검색 스킬 출시/);
  assert.match(sources, /https:\/\/github\.com\/hmmhmmhm\/daiso-mcp/);
  assert.match(sources, /https:\/\/www\.npmjs\.com\/package\/daiso/);
  assert.match(sources, /https:\/\/mcp\.aka\.page\/api\/oliveyoung\/stores/);
  assert.match(sources, /https:\/\/mcp\.aka\.page\/api\/oliveyoung\/products/);
  assert.match(sources, /https:\/\/mcp\.aka\.page\/api\/oliveyoung\/inventory/);
});

test("olive-young install docs warn about intermittent public endpoint failures and direct users to retry or clone fallback", () => {
  const install = read(path.join("docs", "install.md"));
  const quickstart = findSection(install, "### `olive-young-search` upstream CLI quickstart");

  assert.match(install, /olive-young-search/);
  assert.match(install, /5xx\/503/);
  assert.match(install, /재시도|retry/i);
  assert.match(install, /clone fallback|git clone https:\/\/github\.com\/hmmhmmhm\/daiso-mcp\.git/i);
  assertOliveYoungCloneFallbackShorthand(quickstart, "olive-young install quickstart");
  assertOliveYoungCloneFallbackCommands(quickstart, "olive-young install quickstart");
});

test("olive-young-search skill documents the upstream daiso CLI flow for stores, products, and inventory", () => {
  const skillPath = path.join(repoRoot, "olive-young-search", "SKILL.md");
  const featureDoc = read(path.join("docs", "features", "olive-young-search.md"));

  assert.ok(fs.existsSync(skillPath), "expected olive-young-search/SKILL.md to exist");

  const skill = read(path.join("olive-young-search", "SKILL.md"));
  const featureTop = findSection(featureDoc, "## 가장 중요한 규칙");
  const featureFallback = findSection(featureDoc, "## 원본 저장소 clone fallback");
  const skillFallback = findSection(skill, "## Fallback: clone the original repository and run the same CLI locally");

  assert.match(skill, /^name: olive-young-search$/m);
  assert.match(skill, /^description: .*올리브영.*매장.*상품.*재고.*$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /hmmhmmhm\/daiso-mcp/);
    assert.match(doc, /https:\/\/github\.com\/hmmhmmhm\/daiso-mcp/);
    assert.match(doc, /npm install -g daiso|npx --yes daiso|npx daiso/);
    assert.match(doc, /git clone https:\/\/github\.com\/hmmhmmhm\/daiso-mcp\.git/);
    assert.match(doc, /npm install/);
    assert.match(doc, /npm run build/);
    assert.match(doc, /MCP 서버를 .*직접 설치.*않고.*CLI/u);
    assert.match(doc, /매장 검색/);
    assert.match(doc, /상품 검색/);
    assert.match(doc, /재고 확인/);
    assert.match(doc, /\/api\/oliveyoung\/stores/);
    assert.match(doc, /\/api\/oliveyoung\/products/);
    assert.match(doc, /\/api\/oliveyoung\/inventory/);
    assert.match(doc, /vendoring 하지 않/);
  }

  assertOliveYoungCloneFallbackShorthand(featureTop, "olive-young feature guide shorthand");

  for (const fallbackDoc of [featureFallback, skillFallback]) {
    assertOliveYoungCloneFallbackCommands(fallbackDoc, "olive-young clone fallback docs");
  }
});

test("repository docs advertise the bunjang-search skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "bunjang-search.md");
  const skillPath = path.join(repoRoot, "bunjang-search", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/bunjang-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected bunjang-search/SKILL.md to exist");
  assert.match(readme, /\| 번개장터 검색 \|/);
  assert.match(readme, /\[번개장터 검색 가이드\]\(docs\/features\/bunjang-search\.md\)/);
  assert.match(install, /--skill bunjang-search/);
  assert.match(install, /npm install -g .* bunjang-cli/);
  assert.match(roadmap, /번개장터 검색 스킬 출시/);
  assert.match(sources, /https:\/\/www\.npmjs\.com\/package\/bunjang-cli/);
  assert.match(sources, /https:\/\/github\.com\/pinion05\/bunjangcli/);
});

test("bunjang-search skill documents bunjang-cli search, detail, favorite, chat, and AI export flows", () => {
  const skill = read(path.join("bunjang-search", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "bunjang-search.md"));
  const install = read(path.join("docs", "install.md"));

  assert.match(skill, /^name: bunjang-search$/m);
  assert.match(skill, /^description: .*번개장터.*검색.*상세.*찜.*채팅.*$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /bunjang-cli/);
    assert.match(doc, /pinion05\/bunjangcli/);
    assert.match(doc, /npx --yes bunjang-cli --help/);
    assert.match(doc, /npx --yes bunjang-cli search /);
    assert.match(doc, /item get/);
    assert.match(doc, /favorite add/);
    assert.match(doc, /favorite remove/);
    assert.match(doc, /favorite list/);
    assert.match(doc, /chat list/);
    assert.match(doc, /chat start/);
    assert.match(doc, /chat send/);
    assert.match(doc, /--start-page/);
    assert.match(doc, /--pages/);
    assert.match(doc, /--max-items/);
    assert.match(doc, /--with-detail/);
    assert.match(doc, /--output/);
    assert.match(doc, /--ai/);
    assert.match(doc, /TOON|toon/i);
    assert.match(doc, /TTY|interactive/);
    assert.match(doc, /로그인.*선택적|선택적.*로그인/u);
    assert.match(
      doc,
      /검색 결과.*(제목.?가격|가격.?제목).*(1차|우선)|title.?price.*(triage|first)/i,
    );
    assert.match(
      doc,
      /(description|status|location).*(item get|--with-detail).*(전|먼저|이후)|((item get|--with-detail).*(description|status|location).*(전|먼저|이후))/i,
    );
    assert.match(doc, /노이즈|noisy|불안정|rely on/i);
  }

  assert.match(install, /### `bunjang-search` upstream CLI quickstart/);
  assert.match(install, /npx --yes bunjang-cli --help/);
  assert.match(install, /npx --yes bunjang-cli search "아이폰"/);
  assert.match(install, /npx --yes bunjang-cli --json item get/);
});

test("repository docs advertise the coupang-product-search skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "coupang-product-search.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/coupang-product-search.md to exist");
  assert.match(readme, /\| 쿠팡 상품 검색 \|/);
  assert.match(readme, /\[쿠팡 상품 검색 가이드\]\(docs\/features\/coupang-product-search\.md\)/);
  assert.match(install, /--skill coupang-product-search/);
});

test("coupang-product-search skill and docs use retention-corp coupang_partners MCP layer", () => {
  const skillPath = path.join(repoRoot, "coupang-product-search", "SKILL.md");
  const wrapperPath = path.join(repoRoot, "coupang-product-search", "scripts", "coupang_partners_mcp.py");
  const featureDoc = read(path.join("docs", "features", "coupang-product-search.md"));
  const sources = read(path.join("docs", "sources.md"));

  assert.ok(fs.existsSync(skillPath), "expected coupang-product-search/SKILL.md to exist");
  assert.ok(fs.existsSync(wrapperPath), "expected retention-corp wrapper script to exist");

  const skill = read(path.join("coupang-product-search", "SKILL.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /retention-corp\/coupang_partners/);
    assert.match(doc, /local:\/\/coupang-mcp/);
    assert.match(doc, /coupang_partners_mcp\.py/);
    assert.match(doc, /--repo-dir/);
    assert.match(doc, /--no-clone/);
    assert.match(doc, /--update/);
    assert.match(doc, /coupang_partners_mcp\.py\s+tools/);
    assert.match(doc, /coupang_partners_mcp\.py\s+init/);
    assert.match(doc, /search_coupang_products/);
    assert.match(doc, /로켓배송/);
    assert.match(doc, /a\.retn\.kr\/v1\/public\/assist/);
    assert.match(doc, /OPENCLAW_SHOPPING_/);
    assert.match(doc, /(파트너스|어필리에이트|affiliate)/i);
    assert.match(doc, /(hosted\s*fallback|호스티드\s*폴백|호스티드\s*fallback)/i);
    assert.doesNotMatch(doc, /yuju777-coupang-mcp\.hf\.space\/mcp/);
    assert.doesNotMatch(doc, /github\.com\/uju777\/coupang-mcp/);
  }

  assert.match(sources, /retention-corp\/coupang_partners/);
  assert.match(sources, /a\.retn\.kr\/v1\/public\/assist/);
  assert.doesNotMatch(sources, /yuju777-coupang-mcp\.hf\.space\/mcp/);
});

test("coupang-product-search docs drop non-allowlisted coupang-mcp-fallback and document openclaw-skill as the allowlisted hosted fallback client-id", () => {
  // Direct probes against https://a.retn.kr/v1/public/assist on 2026-04-21 show that
  // `X-OpenClaw-Client-Id: coupang-mcp-fallback` returns HTTP 403 ("Client is not
  // allowlisted"), while `openclaw-skill` (the upstream default that ships with
  // retention-corp/coupang_partners) returns HTTP 200. Until Retention Corp
  // re-allowlists `coupang-mcp-fallback`, k-skill docs must not recommend it and
  // must document `openclaw-skill` as the value the hosted fallback path uses.
  const skill = read(path.join("coupang-product-search", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "coupang-product-search.md"));
  const wrapper = read(path.join("coupang-product-search", "scripts", "coupang_partners_mcp.py"));
  const sources = read(path.join("docs", "sources.md"));

  for (const doc of [skill, featureDoc, wrapper, sources]) {
    assert.doesNotMatch(doc, /coupang-mcp-fallback/);
  }

  for (const doc of [skill, featureDoc, wrapper]) {
    assert.match(doc, /openclaw-skill/);
  }
});

test("root pack:dry-run script covers all publishable workspaces", () => {
  const packageJson = readJson("package.json");

  assert.match(packageJson.scripts["pack:dry-run"], /workspace k-lotto/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace daiso-product-search/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace market-kurly-search/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace blue-ribbon-nearby/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace kakao-bar-nearby/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace public-restroom-nearby/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace kbl-results/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace kleague-results/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace lck-analytics/);
});

test("repository docs advertise the kbl-results skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "kbl-results.md");
  const skillPath = path.join(repoRoot, "kbl-results", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/kbl-results.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected kbl-results/SKILL.md to exist");
  assert.match(readme, /\| KBL 경기 결과 조회 \|/);
  assert.match(readme, /\[KBL 경기 결과 가이드\]\(docs\/features\/kbl-results\.md\)/);
  assert.match(install, /--skill kbl-results/);
  assert.match(roadmap, /KBL 경기 결과 조회 스킬 출시/);
  assert.match(sources, /KBL 일정\/결과 API: https:\/\/api\.kbl\.or\.kr\/match\/list/);
  assert.match(sources, /KBL 팀 순위 API: https:\/\/api\.kbl\.or\.kr\/league\/rank\/team/);
});

test("kbl-results skill documents the official JSON flow for date, team, and standings lookups", () => {
  const skillPath = path.join(repoRoot, "kbl-results", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected kbl-results/SKILL.md to exist");

  const skill = read(path.join("kbl-results", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "kbl-results.md"));

  assert.match(skill, /^name: kbl-results$/m);
  assert.match(skill, /^description: .*KBL.*경기 결과.*순위.*$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /YYYY-MM-DD/);
    assert.match(doc, /서울 SK|부산 KCC|팀 코드/);
    assert.match(doc, /https:\/\/api\.kbl\.or\.kr\/match\/list/);
    assert.match(doc, /https:\/\/api\.kbl\.or\.kr\/league\/rank\/team/);
    assert.match(doc, /공식 JSON|공식 API|공식 표면/u);
    assert.match(doc, /현재 순위|standings/i);
    assert.match(doc, /kbl-results|KBL 경기 결과/u);
  }
});

test("kbl-results package exports reusable results and standings helpers", () => {
  const pkg = require(path.join(repoRoot, "packages", "kbl-results", "src", "index.js"));

  assert.equal(typeof pkg.getMatchResults, "function");
  assert.equal(typeof pkg.getStandings, "function");
  assert.equal(typeof pkg.getKBLSummary, "function");
});

test("kbl-results package README stays aligned with the official KBL JSON lookup flow", () => {
  const packageReadme = read(path.join("packages", "kbl-results", "README.md"));

  assert.match(packageReadme, /공식 KBL JSON 엔드포인트/u);
  assert.match(packageReadme, /api\.kbl\.or\.kr\/match\/list/);
  assert.match(packageReadme, /league\/rank\/team/);
  assert.match(packageReadme, /getKBLSummary/);
  assert.match(packageReadme, /서울 SK/);
});

test("repository docs advertise the kleague-results skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "kleague-results.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/kleague-results.md to exist");
  assert.match(readme, /\| K리그 경기 결과 조회 \|/);
  assert.match(readme, /\[K리그 결과 가이드\]\(docs\/features\/kleague-results\.md\)/);
  assert.match(install, /--skill kleague-results/);
  assert.match(roadmap, /K리그 경기 결과 조회 스킬 출시/);
  assert.match(sources, /K League 일정\/결과 JSON: https:\/\/www\.kleague\.com\/getScheduleList\.do/);
  assert.match(sources, /K League 팀 순위 JSON: https:\/\/www\.kleague\.com\/record\/teamRank\.do/);
});

test("kleague-results skill documents the official JSON flow for date, team, and standings lookups", () => {
  const skillPath = path.join(repoRoot, "kleague-results", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected kleague-results/SKILL.md to exist");

  const skill = read(path.join("kleague-results", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "kleague-results.md"));

  assert.match(skill, /^name: kleague-results$/m);
  assert.match(skill, /^description: .*케이리그.*경기 결과.*순위.*$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /YYYY-MM-DD/);
    assert.match(doc, /K리그1|K리그2/);
    assert.match(doc, /FC서울|서울 이랜드|팀 코드/);
    assert.match(doc, /https:\/\/www\.kleague\.com\/getScheduleList\.do/);
    assert.match(doc, /https:\/\/www\.kleague\.com\/record\/teamRank\.do/);
    assert.match(doc, /공식 JSON|공식 API|공식 표면/u);
    assert.match(doc, /현재 순위|standings/i);
    assert.match(doc, /kleague-results|K리그 결과 조회/u);
  }
});

test("kleague-results package exports reusable results and standings helpers", () => {
  const pkg = require(path.join(repoRoot, "packages", "kleague-results", "src", "index.js"));

  assert.equal(typeof pkg.getMatchResults, "function");
  assert.equal(typeof pkg.getStandings, "function");
  assert.equal(typeof pkg.getKLeagueSummary, "function");
});

test("kleague-results package README stays aligned with the official K League JSON lookup flow", () => {
  const packageReadme = read(path.join("packages", "kleague-results", "README.md"));

  assert.match(packageReadme, /공식 K리그 JSON 엔드포인트/u);
  assert.match(packageReadme, /getScheduleList\.do/);
  assert.match(packageReadme, /teamRank\.do/);
  assert.match(packageReadme, /getKLeagueSummary/);
  assert.match(packageReadme, /FC서울/);
});

test("repository docs advertise the blue-ribbon-nearby skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "blue-ribbon-nearby.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/blue-ribbon-nearby.md to exist");
  assert.match(readme, /\| ~~근처 블루리본 맛집~~ ⚠️ 지원 중단 \|/);
  assert.match(readme, /\[근처 블루리본 맛집 가이드\]\(docs\/features\/blue-ribbon-nearby\.md\)/);
  assert.match(readme, /블루리본 측이 `www\.bluer\.co\.kr` 에 자동화 접근 전면 차단/);
  assert.match(install, /--skill blue-ribbon-nearby/);
  assert.match(roadmap, /근처 블루리본 맛집 스킬 출시/);
  assert.match(sources, /블루리본 지역 검색: https:\/\/www\.bluer\.co\.kr\/search\/zone/);
  assert.match(sources, /블루리본 주변 맛집 JSON: https:\/\/www\.bluer\.co\.kr\/restaurants\/map/);
});

test("blue-ribbon-nearby skill documents mandatory location prompting and official Blue Ribbon nearby search flow", () => {
  const skillPath = path.join(repoRoot, "blue-ribbon-nearby", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected blue-ribbon-nearby/SKILL.md to exist");

  const skill = read(path.join("blue-ribbon-nearby", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "blue-ribbon-nearby.md"));

  assert.match(skill, /^name: blue-ribbon-nearby$/m);
  assert.match(skill, /^description: .*근처 맛집.*블루리본.*$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /반드시.*현재 위치/u);
    assert.match(doc, /맛집.*기본적으로.*blue-ribbon-nearby|맛집.*기본적으로.*블루리본/u);
    assert.match(doc, /https:\/\/www\.bluer\.co\.kr\/search\/zone/);
    assert.match(doc, /https:\/\/www\.bluer\.co\.kr\/restaurants\/map/);
    assert.match(doc, /zone2Lat/);
    assert.match(doc, /zone2Lng/);
    assert.match(doc, /isAround=true/);
    assert.match(doc, /ribbon=true/);
    assert.match(doc, /위도|경도|동네|역명/u);
    assert.match(doc, /blue-ribbon-nearby|근처 블루리본 맛집/u);
  }
});

test("blue-ribbon-nearby package README stays aligned with the location-first and official-surface guidance", () => {
  const packageReadme = read(path.join("packages", "blue-ribbon-nearby", "README.md"));

  assert.match(packageReadme, /먼저 현재 위치를 묻/u);
  assert.match(packageReadme, /코엑스.*삼성동\/대치동/u);
  assert.match(packageReadme, /https:\/\/www\.bluer\.co\.kr\/search\/zone/);
  assert.match(packageReadme, /https:\/\/www\.bluer\.co\.kr\/restaurants\/map/);
  assert.match(packageReadme, /searchNearbyByLocationQuery/);
});



test("repository docs advertise the kakao-bar-nearby skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "kakao-bar-nearby.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/kakao-bar-nearby.md to exist");
  assert.match(readme, /\| 근처 술집 조회 \|/);
  assert.match(readme, /\[근처 술집 조회 가이드\]\(docs\/features\/kakao-bar-nearby\.md\)/);
  assert.match(install, /--skill kakao-bar-nearby/);
  assert.match(roadmap, /근처 술집 조회 스킬 출시/);
  assert.match(sources, /카카오맵 모바일 검색: https:\/\/m\.map\.kakao\.com\/actions\/searchView/);
  assert.match(sources, /카카오맵 장소 패널 JSON: https:\/\/place-api\.map\.kakao\.com\/places\/panel3\//);
});

test("kakao-bar-nearby skill documents location-first Kakao Map search with open-now/menu/seating hints", () => {
  const skillPath = path.join(repoRoot, "kakao-bar-nearby", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected kakao-bar-nearby/SKILL.md to exist");

  const skill = read(path.join("kakao-bar-nearby", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "kakao-bar-nearby.md"));

  assert.match(skill, /^name: kakao-bar-nearby$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /현재 위치/);
    assert.match(doc, /서울역|강남|사당|논현/);
    assert.match(doc, /https:\/\/m\.map\.kakao\.com\/actions\/searchView/);
    assert.match(doc, /https:\/\/place-api\.map\.kakao\.com\/places\/panel3\//);
    assert.match(doc, /영업 중|영업전|영업 상태/);
    assert.match(doc, /메뉴/);
    assert.match(doc, /단체석|좌석 옵션|인원 수용/);
    assert.match(doc, /전화번호/);
    assert.match(doc, /kakao-bar-nearby|근처 술집 조회/u);
  }
});

test("kakao-bar-nearby package README stays aligned with the Kakao Map live lookup flow", () => {
  const packageReadme = read(path.join("packages", "kakao-bar-nearby", "README.md"));

  assert.match(packageReadme, /현재 위치를 먼저 물어본다/u);
  assert.match(packageReadme, /서울역 술집/);
  assert.match(packageReadme, /https:\/\/m\.map\.kakao\.com\/actions\/searchView/);
  assert.match(packageReadme, /https:\/\/place-api\.map\.kakao\.com\/places\/panel3\//);
  assert.match(packageReadme, /searchNearbyBarsByLocationQuery/);
});

test("kakao-bar-nearby feature doc keeps the verified 2026-03-29 sadang smoke snapshot current", () => {
  const featureDoc = read(path.join("docs", "features", "kakao-bar-nearby.md"));
  const smoke = findJsonFenceAfterLabel(featureDoc, "## 검증된 live smoke 예시");

  assertKakaoBarNearbySadangSmokeSnapshot(smoke, "feature doc smoke snapshot");
});

test("kakao-bar-nearby package README live smoke snapshot matches the verified 2026-03-29 sadang output", () => {
  const packageReadme = read(path.join("packages", "kakao-bar-nearby", "README.md"));
  const smoke = findJsonFenceAfterLabel(packageReadme, "## Live smoke snapshot");

  assertKakaoBarNearbySadangSmokeSnapshot(smoke, "package README smoke snapshot");
});

test("repository docs advertise the fine-dust-location skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const secretsExample = read(path.join("examples", "secrets.env.example"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "fine-dust-location.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/fine-dust-location.md to exist");
  assert.match(readme, /\| 사용자 위치 미세먼지 조회 \|/);
  assert.match(readme, /\[사용자 위치 미세먼지 조회 가이드\]\(docs\/features\/fine-dust-location\.md\)/);
  assert.match(install, /--skill fine-dust-location/);
  assert.match(roadmap, /사용자 위치 미세먼지 조회 스킬 출시/);
  assert.match(sources, /에어코리아 대기오염정보: https:\/\/www\.data\.go\.kr\/data\/15073861\/openapi\.do/);
  assert.match(sources, /에어코리아 측정소정보: https:\/\/www\.data\.go\.kr\/data\/15073877\/openapi\.do/);
  assert.match(setup, /AIR_KOREA_OPEN_API_KEY/);
  assert.match(security, /AIR_KOREA_OPEN_API_KEY/);
  assert.match(secretsExample, /^AIR_KOREA_OPEN_API_KEY=replace-me$/m);
});

test("fine-dust-location skill documents the official two-api flow and fallback handling", () => {
  const skillPath = path.join(repoRoot, "fine-dust-location", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected fine-dust-location/SKILL.md to exist");

  const skill = read(path.join("fine-dust-location", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "fine-dust-location.md"));

  assert.match(skill, /^name: fine-dust-location$/m);
  assert.match(skill, /^description: .*미세먼지.*초미세먼지.*위치.*$/m);
  assert.match(skill, /k-skill-proxy\.nomadamas\.org\/v1\/fine-dust\/report/);
  assert.match(skill, /행정구역 이름/u);
  assert.match(skill, /강남구/);
  assert.match(skill, /python3 scripts\/fine_dust\.py/);
  assert.match(skill, /docs\/features\/fine-dust-location\.md/);
  assert.match(skill, /docs\/features\/k-skill-proxy\.md/);
  assert.match(skill, /PM10/);
  assert.match(skill, /PM2\.5|PM25/);
  assert.match(skill, /통합대기등급/);

  for (const doc of [featureDoc]) {
    assert.match(doc, /AIR_KOREA_OPEN_API_KEY/);
    assert.match(doc, /B552584\/MsrstnInfoInqireSvc\/getMsrstnList/);
    assert.match(doc, /B552584\/ArpltnInforInqireSvc\/getMsrstnAcctoRltmMesureDnsty/);
    assert.match(doc, /getCtprvnRltmMesureDnsty/);
    assert.match(doc, /PM10/);
    assert.match(doc, /PM2\.5|PM25/);
    assert.match(doc, /행정구역|지역명/);
    assert.match(doc, /fallback|폴백|대체 흐름/i);
    assert.match(doc, /후보 측정소|candidate_stations/);
    assert.match(doc, /조회 시각|조회 시점/);
    assert.match(doc, /python3 scripts\/fine_dust\.py/);
  }
});

test("fine-dust helper python regression tests pass", () => {
  const result = childProcess.spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "scripts", "-p", "test_fine_dust.py"],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    `expected python fine-dust helper regression tests to pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
});

test("repository docs advertise the toss-securities skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "toss-securities.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/toss-securities.md to exist");
  assert.match(readme, /\| 토스증권 조회 \|/);
  assert.match(readme, /\[토스증권 조회 가이드\]\(docs\/features\/toss-securities\.md\)/);
  assert.match(install, /--skill toss-securities/);
  assert.match(roadmap, /토스증권 조회 스킬 출시/);
  assert.match(sources, /tossinvest-cli: https:\/\/github\.com\/JungHoonGhae\/tossinvest-cli/);
});

test("repository docs advertise the hipass-receipt skill across the documented surfaces", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const setup = read(path.join("docs", "setup.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "hipass-receipt.md");
  const skillPath = path.join(repoRoot, "hipass-receipt", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/hipass-receipt.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected hipass-receipt/SKILL.md to exist");
  assert.match(readme, /\| 하이패스 영수증 발급 \|/);
  assert.match(readme, /\[하이패스 영수증 발급 가이드\]\(docs\/features\/hipass-receipt\.md\)/);
  assert.match(install, /--skill hipass-receipt/);
  assert.match(setup, /하이패스 영수증 발급 \| 사용자 시크릿 불필요 \(로그인된 브라우저 세션 필요\)/);
  assert.match(roadmap, /하이패스 영수증 발급 스킬 출시/);
  assert.match(sources, /https:\/\/www\.hipass\.co\.kr\/main\.do/);
  assert.match(sources, /https:\/\/www\.hipass\.co\.kr\/html\/guide\/siteguide_6\.jsp/);
});

test("toss-securities skill documents the tossctl install, auth, and read-only workflow", () => {
  const skillPath = path.join(repoRoot, "toss-securities", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected toss-securities/SKILL.md to exist");

  const skill = read(path.join("toss-securities", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "toss-securities.md"));

  assert.match(skill, /^name: toss-securities$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /tossctl/);
    assert.match(doc, /JungHoonGhae\/tossinvest-cli/);
    assert.match(doc, /auth login/);
    assert.match(doc, /account summary/);
    assert.match(doc, /portfolio positions/);
    assert.match(doc, /quote get/);
    assert.match(doc, /watchlist list/);
    assert.match(doc, /read-only|조회 전용/u);
    assert.doesNotMatch(doc, /order place/);
  }
});

test("hipass-receipt skill documents the logged-in browser session contract", () => {
  const skillPath = path.join(repoRoot, "hipass-receipt", "SKILL.md");
  const packageReadmePath = path.join(repoRoot, "packages", "hipass-receipt", "README.md");

  assert.ok(fs.existsSync(skillPath), "expected hipass-receipt/SKILL.md to exist");
  assert.ok(fs.existsSync(packageReadmePath), "expected packages/hipass-receipt/README.md to exist");

  const skill = read(path.join("hipass-receipt", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "hipass-receipt.md"));
  const packageReadme = read(path.join("packages", "hipass-receipt", "README.md"));

  assert.match(skill, /^name: hipass-receipt$/m);
  assert.match(skill, /로그인은 반드시 사용자가 직접 해야 한다/);
  assert.match(skill, /Playwright persistent context|user-data-dir/);
  assert.match(skill, /세션이 만료되면 즉시 중단하고 다시 로그인/);
  assert.match(featureDoc, /20분/);
  assert.match(featureDoc, /영수증선택출력|영수증전체출력/);
  assert.match(featureDoc, /로그인된 브라우저 세션에서만 동작/);
  assert.match(featureDoc, /playwright-core/);
  assert.match(skill, /--encrypted-card-number/);
  assert.match(packageReadme, /buildUsageHistoryQuery/);
  assert.match(packageReadme, /parseUsageHistoryList/);
  assert.match(packageReadme, /inspectHipassPage/);
  assert.match(packageReadme, /playwright-core/);
});

test("toss-securities package exposes safe read-only tossctl helpers", () => {
  const pkg = require(path.join(repoRoot, "packages", "toss-securities", "src", "index.js"));

  assert.equal(typeof pkg.buildReadOnlyCommand, "function");
  assert.equal(typeof pkg.runReadOnlyCommand, "function");
  assert.equal(typeof pkg.getAccountSummary, "function");
  assert.equal(typeof pkg.getPortfolioPositions, "function");
  assert.equal(typeof pkg.getQuote, "function");
  assert.equal(typeof pkg.getQuoteBatch, "function");
  assert.equal(typeof pkg.listWatchlist, "function");
});

test("hipass-receipt package exposes fixture-friendly query, parse, and session helpers", () => {
  const pkg = require(path.join(repoRoot, "packages", "hipass-receipt", "src", "index.js"));

  assert.equal(pkg.HIPASS_ENDPOINTS.loginPage, "https://www.hipass.co.kr/comm/lginpg.do");
  assert.equal(typeof pkg.buildUsageHistoryQuery, "function");
  assert.equal(typeof pkg.parseUsageHistoryList, "function");
  assert.equal(typeof pkg.inspectHipassPage, "function");
  assert.equal(typeof pkg.buildReceiptRequest, "function");
});

test("toss-securities package README stays aligned with the read-only tossctl wrapper contract", () => {
  const packageReadme = read(path.join("packages", "toss-securities", "README.md"));

  assert.match(packageReadme, /read-only tossctl wrapper/i);
  assert.match(packageReadme, /brew tap JungHoonGhae\/tossinvest-cli/);
  assert.match(packageReadme, /account summary/);
  assert.match(packageReadme, /quote get/);
  assert.match(packageReadme, /order place/);
  assert.match(packageReadme, /지원하지 않음|not supported/u);
});

test("hipass-receipt package README and npm metadata stay aligned with the helper contract", () => {
  const packageReadme = read(path.join("packages", "hipass-receipt", "README.md"));
  const packageJson = readJson(path.join("packages", "hipass-receipt", "package.json"));

  assert.equal(packageJson.name, "hipass-receipt");
  assert.match(packageJson.description, /Hi-Pass/);
  assert.ok(packageJson.files.includes("test/fixtures"));
  assert.match(packageReadme, /logged-in browser session/i);
  assert.match(packageReadme, /Playwright/);
  assert.equal(typeof packageJson.dependencies?.["playwright-core"], "string");
  assert.match(packageReadme, /playwright-core/);
  assert.match(packageReadme, /buildReceiptRequest/);
  assert.match(packageReadme, /test\/fixtures\/usage-history-list\.html/);
});

test("hipass-receipt pack dry-run ships fixture-demo assets for the published README workflow", () => {
  const packResult = JSON.parse(
    childProcess.execFileSync("npm", ["pack", "--workspace", "hipass-receipt", "--json", "--dry-run"], {
      cwd: repoRoot,
      encoding: "utf8"
    }),
  );

  const files = packResult[0]?.files?.map((entry) => entry.path) || [];
  assert.ok(files.includes("test/fixtures/usage-history-list.html"));
  assert.ok(files.includes("test/fixtures/login-page.html"));
  assert.ok(files.includes("README.md"));
});

test("pack:dry-run includes the toss-securities workspace", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.match(packageJson.scripts["pack:dry-run"], /workspace toss-securities/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace hipass-receipt/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace used-car-price-search/);
});

test("package-lock captures the toss-securities workspace metadata for npm ci", () => {
  const packageLock = readJson("package-lock.json");

  assert.deepEqual(packageLock.packages[""].workspaces, ["packages/*"]);
  assert.deepEqual(packageLock.packages["node_modules/toss-securities"], {
    resolved: "packages/toss-securities",
    link: true,
  });
  assert.equal(packageLock.packages["packages/toss-securities"].version, "0.2.0");
  assert.equal(packageLock.packages["packages/toss-securities"].license, "MIT");
  assert.equal(packageLock.packages["packages/toss-securities"].engines.node, ">=18");
});

test("repository docs advertise the korean-law-search skill with mode-specific korean-law-mcp setup guidance", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "korean-law-search.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-law-search.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korean-law-search.md to exist");
  assert.match(readme, /\| 한국 법령 검색 \|/);
  assert.match(readme, /\[한국 법령 검색 가이드\]\(docs\/features\/korean-law-search\.md\)/);
  assert.match(readme, /\| 한국 법령 검색 \| .* \| 불필요 \|/);
  assert.match(install, /--skill korean-law-search/);
  assert.match(install, /로컬 CLI\/MCP 경로는 `LAW_OC`/);
  assert.match(install, /remote endpoint는 `LAW_OC` 없이 `url`만/);
  assert.match(setup, /한국 법령 검색의 로컬 CLI\/MCP 경로용 `LAW_OC`/);
  assert.match(setup, /remote MCP endpoint는 사용자 `LAW_OC` 없이 `url`만으로 연결/);
  assert.match(featureDoc, /로컬 CLI 또는 로컬 MCP server 경로는 `LAW_OC`/);
  assert.match(featureDoc, /remote MCP endpoint는 사용자 `LAW_OC` 없이 `url`만으로 연결/);
  assert.match(setupSkill, /로컬 한국 법령 검색: `LAW_OC` \+ `korean-law-mcp`/);
  assert.match(setupSkill, /remote endpoint: 사용자 `LAW_OC` 없이 `url`만 등록/);

  for (const doc of [setup, security, setupSkill]) {
    assert.match(doc, /LAW_OC/);
    assert.match(doc, /korean-law-mcp/);
  }

  assert.match(sources, /korean-law-mcp: https:\/\/github\.com\/chrisryugj\/korean-law-mcp/);
  assert.match(sources, /beopmang: https:\/\/api\.beopmang\.org/);
  assert.match(roadmap, /한국 법령 검색 스킬 출시/);
});

test("korean-law-search skill keeps korean-law-mcp-first guidance while documenting the approved Beopmang fallback", () => {
  const skillPath = path.join(repoRoot, "korean-law-search", "SKILL.md");
  const featureDoc = read(path.join("docs", "features", "korean-law-search.md"));
  const examplesSecrets = read(path.join("examples", "secrets.env.example"));
  const packageJson = readJson("package.json");

  assert.ok(fs.existsSync(skillPath), "expected korean-law-search/SKILL.md to exist");

  const skill = read(path.join("korean-law-search", "SKILL.md"));
  const doneSectionMatch = skill.match(/## Done when([\s\S]*?)## Notes/);

  assert.match(skill, /^name: korean-law-search$/m);
  assert.ok(doneSectionMatch, "expected korean-law-search skill to include a Done when section");

  const doneSection = doneSectionMatch[1];

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /korean-law-mcp.*먼저|먼저.*korean-law-mcp|항상 `korean-law-mcp`를 먼저 사용/u);
    assert.match(doc, /npm install -g korean-law-mcp/);
    assert.match(doc, /로컬 CLI 또는 로컬 MCP server 경로는 `LAW_OC`/);
    assert.match(doc, /remote MCP endpoint는 사용자 `LAW_OC` 없이 `url`만으로 연결/);
    assert.match(doc, /open\.law\.go\.kr/);
    assert.match(doc, /search_law/);
    assert.match(doc, /get_law_text/);
    assert.match(doc, /search_precedents/);
    assert.match(doc, /search_interpretations/);
    assert.match(doc, /search_ordinance/);
    assert.match(doc, /https:\/\/korean-law-mcp\.fly\.dev\/mcp/);
    assert.match(doc, /법망|Beopmang/i);
    assert.match(doc, /https:\/\/api\.beopmang\.org/);
    assert.match(doc, /fallback/i);
    assert.match(doc, /MCP/i);
    assert.match(doc, /CLI/i);
    assert.doesNotMatch(doc, /packages\/korean-law-search/);
    assert.doesNotMatch(doc, /python-packages\/korean-law-search/);
  }

  assert.match(doneSection, /search_interpretations/);
  assert.match(doneSection, /search_ordinance/);
  assert.match(doneSection, /법망|Beopmang/i);
  assert.match(doneSection, /fallback/i);

  assert.doesNotMatch(
    featureDoc,
    /[ \t]+$/m,
    "expected docs/features/korean-law-search.md to avoid trailing whitespace so git diff --check stays clean",
  );

  assert.match(examplesSecrets, /^LAW_OC=replace-me$/m);
  assert.ok(
    !packageJson.workspaces.some((workspace) => workspace.includes("korean-law")),
    "expected no repo workspace to be added for korean-law-search",
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "packages", "korean-law-search")), false);
});

test("repository docs advertise the joseon-sillok-search skill and helper", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "joseon-sillok-search.md");
  const featureDoc = read(path.join("docs", "features", "joseon-sillok-search.md"));
  const skillPath = path.join(repoRoot, "joseon-sillok-search", "SKILL.md");
  const skill = read(path.join("joseon-sillok-search", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/joseon-sillok-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected joseon-sillok-search/SKILL.md to exist");
  assert.match(readme, /\| 조선왕조실록 검색 \|/);
  assert.match(readme, /\[조선왕조실록 검색 가이드\]\(docs\/features\/joseon-sillok-search\.md\)/);
  assert.match(install, /--skill joseon-sillok-search/);
  assert.match(install, /python3 scripts\/sillok_search\.py --query "훈민정음" --king 세종 --year 1443/);
  assert.match(skill, /sillok\.history\.go\.kr/);
  assert.match(skill, /--king/);
  assert.match(skill, /--year/);
  assert.match(featureDoc, /python3 scripts\/sillok_search\.py --query "훈민정음"/);
  assert.match(featureDoc, /1443/);
  assert.match(featureDoc, /kda_12512030_002/);
  assert.match(sources, /https:\/\/sillok\.history\.go\.kr/);
  assert.match(sources, /https:\/\/sillok\.history\.go\.kr\/search\/searchResultList\.do/);
  assert.match(roadmap, /조선왕조실록 검색 스킬 출시/);
});

test("joseon-sillok-search install payload includes the documented helper command", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "joseon-sillok-"));
  const installedSkillPath = path.join(tempRoot, "joseon-sillok-search");
  const bundledHelperPath = path.join(installedSkillPath, "scripts", "sillok_search.py");

  try {
    fs.cpSync(path.join(repoRoot, "joseon-sillok-search"), installedSkillPath, { recursive: true });

    assert.ok(fs.existsSync(bundledHelperPath), "expected joseon-sillok-search/scripts/sillok_search.py to exist");

    const helpText = childProcess.execFileSync("python3", ["scripts/sillok_search.py", "--help"], {
      cwd: installedSkillPath,
      encoding: "utf8",
    });

    assert.match(helpText, /Search Joseon Sillok records from sillok\.history\.go\.kr/);
    assert.match(helpText, /--query/);
    assert.match(helpText, /--king/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("repository docs advertise the korean-patent-search skill and official KIPRIS Plus API setup", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const examplesSecrets = read(path.join("examples", "secrets.env.example"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-patent-search.md");
  const featureDoc = read(path.join("docs", "features", "korean-patent-search.md"));
  const skillPath = path.join(repoRoot, "korean-patent-search", "SKILL.md");
  const skill = read(path.join("korean-patent-search", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const packageJson = readJson("package.json");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korean-patent-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected korean-patent-search/SKILL.md to exist");

  assert.match(readme, /\| 한국 특허 정보 검색 \|/);
  assert.match(readme, /\[한국 특허 정보 검색 가이드\]\(docs\/features\/korean-patent-search\.md\)/);
  assert.match(install, /--skill korean-patent-search/);
  assert.match(install, /KIPRIS_PLUS_API_KEY/);
  assert.match(install, /python3 scripts\/patent_search\.py --query "배터리"/);
  assert.match(setup, /한국 특허 정보 검색의 KIPRIS Plus 경로용 `KIPRIS_PLUS_API_KEY`/);
  assert.match(security, /KIPRIS_PLUS_API_KEY/);
  assert.match(setupSkill, /한국 특허 정보 검색: `KIPRIS_PLUS_API_KEY`/);
  assert.match(examplesSecrets, /^KIPRIS_PLUS_API_KEY=replace-me$/m);
  assert.match(skill, /^name: korean-patent-search$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /KIPRIS Plus/i);
    assert.match(doc, /getWordSearch/);
    assert.match(doc, /getBibliographyDetailInfoSearch/);
    assert.match(doc, /ServiceKey/);
    assert.match(doc, /python3 scripts\/patent_search\.py/);
    assert.match(doc, /Done when/i);
    assert.doesNotMatch(doc, /packages\/korean-patent-search/);
    assert.doesNotMatch(doc, /python-packages\/korean-patent-search/);
  }

  assert.match(sources, /https:\/\/plus\.kipris\.or\.kr\/portal\/data\/service\/List\.do\?subTab=SC001&entYn=N&menuNo=200100/);
  assert.match(sources, /https:\/\/www\.data\.go\.kr\/data\/15058788\/openapi\.do/);
  assert.match(roadmap, /한국 특허 정보 검색 스킬 출시/);
  assert.ok(
    !packageJson.workspaces.some((workspace) => workspace.includes("korean-patent-search")),
    "expected no repo workspace to be added for korean-patent-search",
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "packages", "korean-patent-search")), false);
});

test("korean-patent-search install payload includes the documented helper command", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "korean-patent-search-"));
  const installedSkillPath = path.join(tempRoot, "korean-patent-search");
  const bundledHelperPath = path.join(installedSkillPath, "scripts", "patent_search.py");

  try {
    fs.cpSync(path.join(repoRoot, "korean-patent-search"), installedSkillPath, { recursive: true });

    assert.ok(fs.existsSync(bundledHelperPath), "expected korean-patent-search/scripts/patent_search.py to exist");

    const helpText = childProcess.execFileSync("python3", ["scripts/patent_search.py", "--help"], {
      cwd: installedSkillPath,
      encoding: "utf8",
    });

    assert.match(helpText, /Search Korean patent information via the official KIPRIS Plus Open API/);
    assert.match(helpText, /--query/);
    assert.match(helpText, /--application-number/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("repository docs advertise the real-estate-search skill and proxy-based approach", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "real-estate-search.md");
  const featureDoc = read(path.join("docs", "features", "real-estate-search.md"));
  const skillPath = path.join(repoRoot, "real-estate-search", "SKILL.md");
  const skill = read(path.join("real-estate-search", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const packageJson = readJson("package.json");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/real-estate-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected real-estate-search/SKILL.md to exist");

  assert.match(readme, /\| 한국 부동산 실거래가 조회 \|/);
  assert.match(readme, /\[한국 부동산 실거래가 조회 가이드\]\(docs\/features\/real-estate-search\.md\)/);
  assert.match(install, /--skill real-estate-search/);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /https:\/\/github\.com\/tae0y\/real-estate-mcp\/tree\/main/);
    assert.match(doc, /k-skill-proxy\.nomadamas\.org/);
    assert.match(doc, /\/v1\/real-estate\//);
    assert.match(doc, /apartment\/trade|apartment\/rent/);
    assert.match(doc, /region-code/);
    assert.doesNotMatch(doc, /packages\/real-estate-search/);
    assert.doesNotMatch(doc, /python-packages\/real-estate-search/);
  }

  for (const doc of [install]) {
    assert.match(doc, /https:\/\/github\.com\/tae0y\/real-estate-mcp\/tree\/main/);
    assert.match(doc, /k-skill-proxy\.nomadamas\.org|hosted proxy/);
  }

  for (const doc of [setup, security, setupSkill]) {
    assert.match(doc, /DATA_GO_KR_API_KEY/);
  }

  assert.match(sources, /real-estate-mcp: https:\/\/github\.com\/tae0y\/real-estate-mcp\/tree\/main/);
  assert.match(roadmap, /한국 부동산 실거래가 조회 스킬 출시/);
  assert.ok(
    !packageJson.workspaces.some((workspace) => workspace.includes("real-estate-search")),
    "expected no repo workspace to be added for real-estate-search",
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "packages", "real-estate-search")), false);
});

test("repository docs advertise the korean-scholarship-search skill and official-source workflow", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-scholarship-search.md");
  const featureDoc = read(path.join("docs", "features", "korean-scholarship-search.md"));
  const skillPath = path.join(repoRoot, "korean-scholarship-search", "SKILL.md");
  const skill = read(path.join("korean-scholarship-search", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const helperPath = path.join(repoRoot, "korean-scholarship-search", "scripts", "scholarship_filter.py");
  const plannerPath = path.join(repoRoot, "korean-scholarship-search", "scripts", "university_search_plan.py");
  const searchCluesPath = path.join(repoRoot, "korean-scholarship-search", "references", "search-clues.md");
  const reportFormatPath = path.join(repoRoot, "korean-scholarship-search", "references", "report-format.md");
  const packageJson = readJson("package.json");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korean-scholarship-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected korean-scholarship-search/SKILL.md to exist");
  assert.ok(fs.existsSync(helperPath), "expected korean-scholarship-search/scripts/scholarship_filter.py to exist");
  assert.ok(fs.existsSync(plannerPath), "expected korean-scholarship-search/scripts/university_search_plan.py to exist");
  assert.ok(fs.existsSync(searchCluesPath), "expected korean-scholarship-search/references/search-clues.md to exist");
  assert.ok(fs.existsSync(reportFormatPath), "expected korean-scholarship-search/references/report-format.md to exist");

  assert.match(readme, /\| 장학금 검색 및 조회 \|/);
  assert.match(readme, /\[장학금 검색 및 조회 가이드\]\(docs\/features\/korean-scholarship-search\.md\)/);
  assert.match(install, /--skill korean-scholarship-search/);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /장학금 검색 및 조회/);
    assert.match(doc, /kosaf\.go\.kr/);
    assert.match(doc, /\*\.ac\.kr/);
    assert.match(doc, /전국 대학교|전국 대학/);
    assert.match(doc, /공식 공고 우선/);
    assert.match(doc, /학자금 지원구간/);
    assert.match(doc, /scholarship_filter\.py/);
    assert.match(doc, /university_search_plan\.py/);
    assert.match(doc, /학과/);
    assert.match(doc, /외부 장학 추천|등록금 감면|생활비 지원/);
  }

  assert.match(sources, /한국장학재단 학자금 지원구간 산정절차/);
  assert.match(sources, /한국장학재단 푸른등대 기부장학금/);
  assert.match(sources, /삼성꿈장학재단/);
  assert.match(roadmap, /장학금 검색 및 조회 스킬 출시/);
  assert.ok(
    !packageJson.workspaces.some((workspace) => workspace.includes("korean-scholarship-search")),
    "expected no repo workspace to be added for korean-scholarship-search",
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "packages", "korean-scholarship-search")), false);
});

test("korean-scholarship-search helper filters normalized records, renders reports, and returns eligibility verdicts", () => {
  const helperPath = path.join(repoRoot, "korean-scholarship-search", "scripts", "scholarship_filter.py");
  const plannerPath = path.join(repoRoot, "korean-scholarship-search", "scripts", "university_search_plan.py");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k-skill-scholarship-"));

  try {
    const inputPath = path.join(tempRoot, "scholarships.json");
    fs.writeFileSync(
      inputPath,
      JSON.stringify(
        [
          {
            name: "테스트재단 생활비 장학금",
            organization: { name: "테스트재단", type: "foundation" },
            source_url: "https://foundation.example.com/notice/1",
            apply_url: "https://foundation.example.com/apply/1",
            amount: { text: "학기당 250만 원", per_semester_krw: 2500000, category: "living" },
            eligibility: {
              student_levels: ["undergraduate"],
              school_kinds: ["university"],
              school_names: ["서울대학교", "연세대학교"],
              department_names: ["컴퓨터공학부"],
              grade_years: [2, 3, 4],
              gpa_min: 3.2,
              income_band_min: 0,
              income_band_max: 6,
            },
            deadline: { start: "2026-04-01", end: "2026-04-16" },
          },
          {
            name: "교내 성적우수 장학금",
            organization: { name: "샘플대학교", type: "school" },
            source_url: "https://sample.ac.kr/notice/2",
            apply_url: "https://sample.ac.kr/apply/2",
            amount: { text: "등록금 전액", category: "tuition" },
            eligibility: {
              student_levels: ["undergraduate"],
              school_kinds: ["university"],
              school_names: ["샘플대학교"],
              grade_years: [1],
              gpa_min: 4.0,
              income_band_min: 0,
              income_band_max: 10,
            },
            deadline: { start: "2026-05-01", end: "2026-05-20" },
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    const helpText = childProcess.execFileSync("python3", [helperPath, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.match(helpText, /Filter normalized Korean scholarship records/);
    assert.match(helpText, /\bfilter\b/);
    assert.match(helpText, /\beligibility\b/);
    assert.match(helpText, /\breport\b/);

    const plannerHelpText = childProcess.execFileSync("python3", [plannerPath, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.match(plannerHelpText, /nationwide/i);
    assert.match(plannerHelpText, /school-name/);

    const filtered = JSON.parse(
      childProcess.execFileSync(
        "python3",
        [
          helperPath,
          "filter",
          "--input",
          inputPath,
          "--org-type",
          "foundation",
          "--student-level",
          "undergraduate",
          "--department-name",
          "컴퓨터공학부",
          "--income-band",
          "4",
          "--min-amount",
          "2000000",
          "--today",
          "2026-04-14",
          "--deadline-within-days",
          "7",
        ],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    );

    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].name, "테스트재단 생활비 장학금");
    assert.equal(filtered.items[0]._match.amount_krw, 2500000);
    assert.equal(filtered.items[0]._match.deadline.status, "open");
    assert.equal(filtered.items[0]._match.deadline.days_until_end, 2);

    const report = childProcess.execFileSync(
      "python3",
      [
        helperPath,
        "report",
        "--input",
        inputPath,
        "--today",
        "2026-04-14",
        "--only-open-now",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.match(report, /# 장학금 검색 및 조회 리포트/);
    assert.match(report, /## 지금 지원 가능/);
    assert.match(report, /테스트재단 생활비 장학금/);
    assert.match(report, /D-2/);

    const plannerPayload = JSON.parse(
      childProcess.execFileSync(
        "python3",
        [
          plannerPath,
          "--school-name",
          "부산대학교",
          "--department",
          "컴퓨터공학과",
          "--year",
          "2026",
        ],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    );
    assert.equal(plannerPayload.scope, "school");
    assert.equal(plannerPayload.school_name, "부산대학교");
    assert.match(plannerPayload.search_queries.join("\n"), /컴퓨터공학과/);

    const nationwidePayload = JSON.parse(
      childProcess.execFileSync(
        "python3",
        [plannerPath, "--nationwide", "--year", "2026"],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    );
    assert.equal(nationwidePayload.scope, "nationwide-universities");
    assert.match(nationwidePayload.search_queries.join("\n"), /site:\*\.ac\.kr 2026 장학 공고/);

    const eligibility = JSON.parse(
      childProcess.execFileSync(
        "python3",
        [
          helperPath,
          "eligibility",
          "--input",
          inputPath,
          "--school-name",
          "서울대학교",
          "--student-level",
          "undergraduate",
          "--grade-year",
          "2",
          "--gpa",
          "3.5",
          "--income-band",
          "4",
        ],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    );

    assert.equal(eligibility.total, 2);
    assert.equal(eligibility.results[0].status, "eligible");
    assert.equal(eligibility.results[1].status, "not_eligible");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("real-estate-search skill uses proxy endpoints not MCP self-host", () => {
  const featureDoc = read(path.join("docs", "features", "real-estate-search.md"));
  const skill = read(path.join("real-estate-search", "SKILL.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /k-skill-proxy\.nomadamas\.org\/v1\/real-estate/);
    assert.match(doc, /curl/);
    assert.doesNotMatch(doc, /uv run/);
    assert.doesNotMatch(doc, /codex mcp add/);
    assert.doesNotMatch(doc, /Cloudflare Tunnel/i);
    assert.doesNotMatch(doc, /launchd/i);
    assert.doesNotMatch(doc, /docker compose/i);
  }
});

test("repository docs advertise the korean-stock-search skill and proxy-backed KRX approach", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-stock-search.md");
  const featureDoc = read(path.join("docs", "features", "korean-stock-search.md"));
  const skillPath = path.join(repoRoot, "korean-stock-search", "SKILL.md");
  const skill = read(path.join("korean-stock-search", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const proxyReadme = read(path.join("packages", "k-skill-proxy", "README.md"));
  const proxyDoc = read(path.join("docs", "features", "k-skill-proxy.md"));
  const packageJson = readJson("package.json");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korean-stock-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected korean-stock-search/SKILL.md to exist");

  assert.match(readme, /\| 한국 주식 정보 조회 \|/);
  assert.match(readme, /\[한국 주식 정보 조회 가이드\]\(docs\/features\/korean-stock-search\.md\)/);
  assert.match(install, /--skill korean-stock-search/);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /https:\/\/github\.com\/jjlabsio\/korea-stock-mcp/);
    assert.match(doc, /k-skill-proxy\.nomadamas\.org/);
    assert.match(doc, /\/v1\/korean-stock\/search/);
    assert.match(doc, /\/v1\/korean-stock\/base-info/);
    assert.match(doc, /\/v1\/korean-stock\/trade-info/);
    assert.match(doc, /KRX_API_KEY/);
    assert.match(doc, /사용자.*KRX_API_KEY.*(불필요|준비할 필요가 없)/u);
    assert.doesNotMatch(doc, /packages\/korean-stock-search/);
    assert.doesNotMatch(doc, /python-packages\/korean-stock-search/);
  }

  for (const doc of [setup, security, setupSkill]) {
    assert.match(doc, /KRX_API_KEY/);
  }

  for (const doc of [proxyReadme, proxyDoc]) {
    assert.match(doc, /\/v1\/korean-stock\/search/);
    assert.match(doc, /\/v1\/korean-stock\/base-info/);
    assert.match(doc, /\/v1\/korean-stock\/trade-info/);
  }

  assert.match(sources, /korea-stock-mcp: https:\/\/github\.com\/jjlabsio\/korea-stock-mcp/);
  assert.match(roadmap, /한국 주식 정보 조회 스킬 출시/);
  assert.ok(
    !packageJson.workspaces.some((workspace) => workspace.includes("korean-stock-search")),
    "expected no repo workspace to be added for korean-stock-search",
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "packages", "korean-stock-search")), false);
});

test("korean-stock-search skill stays proxy-first and does not require local MCP install", () => {
  const featureDoc = read(path.join("docs", "features", "korean-stock-search.md"));
  const skill = read(path.join("korean-stock-search", "SKILL.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /k-skill-proxy\.nomadamas\.org\/v1\/korean-stock/);
    assert.match(doc, /curl/);
    assert.match(doc, /proxy.*서버.*KRX_API_KEY|KRX_API_KEY.*proxy.*서버/u);
    assert.doesNotMatch(doc, /npx\s+(?:-y|--yes)\s+korea-stock-mcp/);
    assert.doesNotMatch(doc, /codex mcp add/);
    assert.doesNotMatch(doc, /claude_desktop_config\.json/);
    assert.doesNotMatch(doc, /DART_API_KEY/);
  }
});

test("repository docs advertise the shipped korean-spell-check helper assets", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-spell-check.md");
  const helperPath = path.join(repoRoot, "scripts", "korean_spell_check.py");

  assert.equal(fs.existsSync(featureDocPath), true);
  assert.equal(fs.existsSync(helperPath), true);
  assert.match(readme, /\[한국어 맞춤법 검사 가이드\]\(docs\/features\/korean-spell-check\.md\)/);
  assert.match(install, /python3 scripts\/korean_spell_check\.py/);
});

test("repository docs advertise the korean-character-count skill and deterministic counting contract", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-character-count.md");
  const featureDoc = read(path.join("docs", "features", "korean-character-count.md"));
  const skillPath = path.join(repoRoot, "korean-character-count", "SKILL.md");
  const skill = read(path.join("korean-character-count", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const packageJson = readJson("package.json");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korean-character-count.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected korean-character-count/SKILL.md to exist");

  assert.match(readme, /\| 한국어 글자 수 세기 \|/);
  assert.match(readme, /\[한국어 글자 수 세기 가이드\]\(docs\/features\/korean-character-count\.md\)/);
  assert.match(install, /--skill korean-character-count/);
  assert.match(
    install,
    /--skill k-schoollunch-menu \\\n  --skill korean-character-count/,
    "docs/install.md selective-install block should keep k-schoollunch-menu and korean-character-count in the same continued shell command",
  );
  assert.match(install, /node scripts\/korean_character_count\.js --text "가나다"/);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /grapheme|extended grapheme/i);
    assert.match(doc, /UTF-8/);
    assert.match(doc, /NEIS/i);
    assert.match(doc, /CRLF|U\+2028|U\+2029/);
    assert.match(doc, /node scripts\/korean_character_count\.js/);
    assert.doesNotMatch(doc, /packages\/korean-character-count/);
    assert.doesNotMatch(doc, /python-packages\/korean-character-count/);
  }

  assert.match(sources, /https:\/\/www\.unicode\.org\/reports\/tr29\//);
  assert.match(sources, /https:\/\/encoding\.spec\.whatwg\.org\//);
  assert.match(sources, /https:\/\/nodejs\.org\/api\/buffer\.html/);
  assert.match(roadmap, /한국어 글자 수 세기 스킬 출시/);
  assert.ok(
    !packageJson.workspaces.some((workspace) => workspace.includes("korean-character-count")),
    "expected no repo workspace to be added for korean-character-count",
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "packages", "korean-character-count")), false);
});

test("korean-character-count feature doc NEIS example matches live helper output", () => {
  const featureDoc = read(path.join("docs", "features", "korean-character-count.md"));
  const helperOutput = childProcess.execFileSync(
    "node",
    [
      "scripts/korean_character_count.js",
      "--text",
      "첫 줄\n둘째 줄🙂",
      "--profile",
      "neis",
      "--format",
      "text",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const bytesMatch = helperOutput.match(/^bytes:\s+(\d+)$/m);

  assert.ok(bytesMatch, `expected helper text output to include a bytes line, got: ${helperOutput}`);
  assert.equal(bytesMatch[1], "23");
  assert.match(featureDoc, new RegExp(String.raw`bytes:\s+${bytesMatch[1]}`));
  assert.match(featureDoc, /bytes=23/);
});

test("korean-character-count install payload includes the documented helper command", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "korean-character-count-"));
  const installedSkillPath = path.join(tempRoot, "korean-character-count");
  const bundledHelperPath = path.join(installedSkillPath, "scripts", "korean_character_count.js");

  try {
    fs.cpSync(path.join(repoRoot, "korean-character-count"), installedSkillPath, { recursive: true });

    assert.ok(
      fs.existsSync(bundledHelperPath),
      "expected korean-character-count/scripts/korean_character_count.js to exist",
    );

    const helpText = childProcess.execFileSync("node", ["scripts/korean_character_count.js", "--help"], {
      cwd: installedSkillPath,
      encoding: "utf8",
    });

    assert.match(helpText, /--profile/);
    assert.match(helpText, /default/);
    assert.match(helpText, /neis/i);
    assert.match(helpText, /--stdin/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("repository docs advertise the cheap-gas-nearby skill and Opinet key requirements", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const examplesSecrets = read(path.join("examples", "secrets.env.example"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "cheap-gas-nearby.md");
  const skillPath = path.join(repoRoot, "cheap-gas-nearby", "SKILL.md");

  assert.equal(fs.existsSync(featureDocPath), true);
  assert.equal(fs.existsSync(skillPath), true);
  assert.match(readme, /\| 근처 가장 싼 주유소 찾기 \|/);
  assert.match(readme, /\[근처 가장 싼 주유소 찾기 가이드\]\(docs\/features\/cheap-gas-nearby\.md\)/);
  assert.match(install, /--skill cheap-gas-nearby/);

  for (const doc of [setup, security, setupSkill]) {
    assert.match(doc, /주유소 가격|OPINET_API_KEY/);
    assert.match(doc, /hosted proxy|proxy.*경유/);
  }

  assert.doesNotMatch(examplesSecrets, /^OPINET_API_KEY=replace-me$/m);
  assert.match(sources, /https:\/\/www\.opinet\.co\.kr\/user\/custapi\/openApiInfo\.do/);
  assert.match(sources, /https:\/\/www\.opinet\.co\.kr\/api\/aroundAll\.do/);
  assert.match(sources, /https:\/\/www\.opinet\.co\.kr\/api\/detailById\.do/);
  assert.match(roadmap, /근처 가장 싼 주유소 찾기 스킬 출시/);
});

test("cheap-gas-nearby skill docs require location-first prompts and official Opinet surfaces", () => {
  const skill = read(path.join("cheap-gas-nearby", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "cheap-gas-nearby.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /현재 위치를 알려주세요/);
    assert.match(doc, /OPINET_API_KEY/);
    assert.match(doc, /aroundAll\.do/);
    assert.match(doc, /detailById\.do/);
    assert.match(doc, /areaCode\.do/);
    assert.match(doc, /휘발유|경유/);
    assert.match(doc, /KATEC/);
    assert.match(doc, /카카오맵|Kakao Map/);
  }
});

test("repository docs advertise the han-river-water-level skill and rollout-pending proxy workflow", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const proxyDoc = read(path.join("docs", "features", "k-skill-proxy.md"));
  const proxyReadme = read(path.join("packages", "k-skill-proxy", "README.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "han-river-water-level.md");
  const featureDoc = read(path.join("docs", "features", "han-river-water-level.md"));
  const skillPath = path.join(repoRoot, "han-river-water-level", "SKILL.md");
  const skill = read(path.join("han-river-water-level", "SKILL.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/han-river-water-level.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected han-river-water-level/SKILL.md to exist");

  assert.match(readme, /\| 한강 수위 정보 조회 \|/);
  assert.match(readme, /\[한강 수위 정보 가이드\]\(docs\/features\/han-river-water-level\.md\)/);
  assert.match(install, /--skill han-river-water-level/);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /\/v1\/han-river\/water-level/);
    assert.match(doc, /stationName|station_code|stationCode/);
    assert.match(doc, /수위|유량/);
    assert.match(doc, /candidate_stations|ambiguous_station/);
    assert.match(doc, /KSKILL_PROXY_BASE_URL/);
  }

  assert.match(featureDoc, /HRFCO_OPEN_API_KEY/);

  assert.match(skill, /기본적으로 `https:\/\/k-skill-proxy\.nomadamas\.org\/v1\/han-river\/water-level`/);
  assert.doesNotMatch(featureDoc, /기본 hosted 조회:/);

  for (const doc of [proxyDoc, proxyReadme]) {
    assert.match(doc, /\/v1\/han-river\/water-level/);
    assert.match(doc, /HRFCO_OPEN_API_KEY/);
    assert.match(doc, /waterlevel\/info\.json/);
    assert.match(doc, /waterlevel\/list\/10M/);
  }

  assert.match(setup, /한강 수위 정보 조회 \| 사용자 시크릿 불필요/);
  assert.match(setup, /한강 수위.*기본 hosted p/i);
  assert.match(security, /KSKILL_PROXY_BASE_URL.*서울 지하철.*route가 실제 배포된 proxy URL/);
  assert.match(sources, /hrfco\.go\.kr\/web\/openapiPage\/reference\.do/);
  assert.match(sources, /api\.hrfco\.go\.kr/);
  assert.match(roadmap, /한강 수위 정보 조회 스킬 출시/);
});


test("repository docs advertise the MFDS drug and food safety skills", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const sources = read(path.join("docs", "sources.md"));
  const drugFeatureDocPath = path.join(repoRoot, "docs", "features", "mfds-drug-safety.md");
  const foodFeatureDocPath = path.join(repoRoot, "docs", "features", "mfds-food-safety.md");
  const drugSkillPath = path.join(repoRoot, "mfds-drug-safety", "SKILL.md");
  const foodSkillPath = path.join(repoRoot, "mfds-food-safety", "SKILL.md");

  assert.equal(fs.existsSync(drugFeatureDocPath), true);
  assert.equal(fs.existsSync(foodFeatureDocPath), true);
  assert.equal(fs.existsSync(drugSkillPath), true);
  assert.equal(fs.existsSync(foodSkillPath), true);
  assert.match(readme, /\| 의약품 안전 체크 \|/);
  assert.match(readme, /\| 식품 안전 체크 \|/);
  assert.match(readme, /\[의약품 안전 체크 가이드\]\(docs\/features\/mfds-drug-safety\.md\)/);
  assert.match(readme, /\[식품 안전 체크 가이드\]\(docs\/features\/mfds-food-safety\.md\)/);
  assert.match(install, /--skill mfds-drug-safety/);
  assert.match(install, /--skill mfds-food-safety/);
  assert.match(sources, /15075057\/openapi\.do/);
  assert.match(sources, /15097208\/openapi\.do/);
  assert.match(sources, /15056516\/openapi\.do/);
  assert.match(sources, /foodsafetykorea\.go\.kr\/api\/openApiInfo\.do/);
});

test("MFDS public-health skill docs require interview-first safety flow and official endpoints", () => {
  const drugSkill = read(path.join("mfds-drug-safety", "SKILL.md"));
  const foodSkill = read(path.join("mfds-food-safety", "SKILL.md"));
  const drugFeatureDoc = read(path.join("docs", "features", "mfds-drug-safety.md"));
  const foodFeatureDoc = read(path.join("docs", "features", "mfds-food-safety.md"));
  const sources = read(path.join("docs", "sources.md"));
  const proxyReadme = read(path.join("packages", "k-skill-proxy", "README.md"));
  const proxyDoc = read(path.join("docs", "features", "k-skill-proxy.md"));

  for (const doc of [drugSkill, drugFeatureDoc]) {
    assert.match(doc, /증상.*바로 단정하지 말고.*먼저 되묻/);
    assert.match(doc, /호흡곤란|의식저하|심한 발진/);
    assert.match(doc, /DrbEasyDrugInfoService\/getDrbEasyDrugList/);
    assert.match(doc, /SafeStadDrugService\/getSafeStadDrugInq/);
    assert.match(doc, /KSKILL_PROXY_BASE_URL|k-skill-proxy\.nomadamas\.org/);
    assert.match(doc, /사용자.*시크릿 없음|사용자 API key 없이/u);
    assert.match(doc, /DATA_GO_KR_API_KEY.*프록시 운영 서버/u);
    assert.match(doc, /\/v1\/mfds\/drug-safety\/lookup/);
    assert.match(doc, /python3 scripts\/mfds_drug_safety\.py/);
  }

  for (const doc of [foodSkill, foodFeatureDoc]) {
    assert.match(doc, /증상.*바로 단정하지 말고.*먼저 되묻/);
    assert.match(doc, /혈변|탈수|호흡곤란/);
    assert.match(doc, /PrsecImproptFoodInfoService03\/getPrsecImproptFoodList01/);
    assert.match(doc, /I0490/);
    assert.match(doc, /KSKILL_PROXY_BASE_URL|k-skill-proxy\.nomadamas\.org/);
    assert.match(doc, /사용자.*시크릿 없음|사용자 API key 없이/u);
    assert.match(doc, /DATA_GO_KR_API_KEY.*프록시 운영 서버/u);
    assert.match(doc, /FOODSAFETYKOREA_API_KEY/);
    assert.match(doc, /\/v1\/mfds\/food-safety\/search/);
    assert.match(doc, /python3 scripts\/mfds_food_safety\.py/);
    assert.match(doc, /https:\/\/openapi\.foodsafetykorea\.go\.kr\/api\/sample\/I0490\/json\/1\/5/);
    assert.doesNotMatch(doc, /http:\/\/openapi\.foodsafetykorea\.go\.kr/);
  }

  assert.match(sources, /https:\/\/openapi\.foodsafetykorea\.go\.kr\/api\/sample\/I0490\/json\/1\/5/);
  assert.doesNotMatch(sources, /http:\/\/openapi\.foodsafetykorea\.go\.kr/);
  for (const doc of [proxyReadme, proxyDoc]) {
    assert.match(doc, /\/v1\/mfds\/drug-safety\/lookup/);
    assert.match(doc, /\/v1\/mfds\/food-safety\/search/);
    assert.match(doc, /FOODSAFETYKOREA_API_KEY/);
  }
});

test("docs/setup.md and k-skill-setup document hosted household waste proxy flow", () => {
  const setup = read(path.join("docs", "setup.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  
  assert.match(
    setup,
    /한국 주식 정보 조회, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 기본 hosted proxy를 쓰므로/,
    "setup.md intro should list household waste, school lunch, and MFDS skills among hosted-proxy features with no user-side key",
  );
  assert.match(setup, /DATA_GO_KR_API_KEY.*서버에 설정/);
  assert.match(
    setup,
    /미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL` 을 비워 두면 기본 hosted path\(`k-skill-proxy\.nomadamas\.org`\)/,
    "setup.md should list fine dust, Han River, gas, household waste, school lunch, and MFDS skills when KSKILL_PROXY_BASE_URL is unset",
  );
  assert.match(
    setupSkill,
    /미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL`/,
    "k-skill-setup SKILL should mirror setup.md hosted-proxy unset-base-URL guidance including MFDS skills",
  );

  assert.match(setup, /\| 생활쓰레기 배출정보 조회 \|/);
  assert.match(setup, /DATA_GO_KR_API_KEY/);
  assert.match(setup, /pageNo=1.*numOfRows=100|numOfRows=100.*pageNo=1/);
  assert.match(setup, /\[생활쓰레기 배출정보 조회 가이드\]\(features\/household-waste-info\.md\)/);

  assert.match(setupSkill, /\/v1\/household-waste\/info/);
  assert.match(setupSkill, /DATA_GO_KR_API_KEY/);
  assert.match(setupSkill, /생활쓰레기 배출정보 조회: 사용자 시크릿 불필요/);
});

test("docs/setup.md and k-skill-setup document hosted school lunch proxy flow", () => {
  const setup = read(path.join("docs", "setup.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const examplesSecrets = read(path.join("examples", "secrets.env.example"));
  assert.match(setup, /학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 기본 hosted proxy/);
  assert.match(setup, /KEDU_INFO_KEY.*서버에 설정/);
  assert.match(
    setup,
    /미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL` 을 비워 두면 기본 hosted path\(`k-skill-proxy\.nomadamas\.org`\)/,
    "setup.md should list fine dust, Han River, gas, household waste, school lunch, and MFDS skills when KSKILL_PROXY_BASE_URL is unset",
  );
  assert.match(
    setupSkill,
    /미세먼지, 한강 수위, 주유소 가격, 생활쓰레기 배출정보 조회, 학교 급식 식단 조회, 의약품 안전 체크, 식품 안전 체크는 `KSKILL_PROXY_BASE_URL`/,
    "k-skill-setup SKILL should mirror setup.md hosted-proxy unset-base-URL guidance including MFDS skills",
  );

  assert.match(setup, /\| 학교 급식 식단 조회 \|/);
  assert.match(setup, /KEDU_INFO_KEY/);
  assert.match(setup, /\[학교 급식 식단 조회 가이드\]\(features\/k-schoollunch-menu\.md\)/);

  assert.match(setupSkill, /\/v1\/neis\/school-search/);
  assert.match(setupSkill, /\/v1\/neis\/school-meal/);
  assert.match(setupSkill, /KEDU_INFO_KEY/);
  assert.match(setupSkill, /학교 급식 식단 조회: 사용자 시크릿 불필요/);

  assert.doesNotMatch(
    examplesSecrets,
    /^KEDU_INFO_KEY=/m,
    "client secrets example must not encourage KEDU_INFO_KEY (proxy server only)",
  );
});

test("repository docs advertise the hola-poke-yeoksam skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const sources = read(path.join("docs", "sources.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "hola-poke-yeoksam.md");
  const skillPath = path.join(repoRoot, "hola-poke-yeoksam", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/hola-poke-yeoksam.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected hola-poke-yeoksam/SKILL.md to exist");

  const featureDoc = read(path.join("docs", "features", "hola-poke-yeoksam.md"));
  const skill = read(path.join("hola-poke-yeoksam", "SKILL.md"));

  assert.match(readme, /\| 올라포케 역삼 포케 \|/);
  assert.match(readme, /\[올라포케 역삼 포케 가이드\]\(docs\/features\/hola-poke-yeoksam\.md\)/);
  assert.match(install, /--skill hola-poke-yeoksam/);
  assert.match(sources, /mnspkm\/hola-poke-yeoksam-skill/);
  assert.match(roadmap, /올라포케 역삼 포케 스킬 출시/);
});

test("hola-poke-yeoksam docs pin the verified remote MCP contract snapshot and phone-only event flow", () => {
  const fixture = readJson(path.join("scripts", "fixtures", "hola-poke-yeoksam-contract-smoke.json"));
  const skill = read(path.join("hola-poke-yeoksam", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "hola-poke-yeoksam.md"));
  const snapshotLabels = [
    ["initialize 결과", "initialize", "initialize snapshot"],
    ["tools/list 결과", "tools_list", "tools/list snapshot"],
    ["get_menu 구조 예시", "get_menu", "get_menu snapshot"],
    ["get_shop_info 구조 예시", "get_shop_info", "get_shop_info snapshot"],
    ["enter_event(phone='010-12') 예시", "enter_event_invalid_phone", "invalid-phone snapshot"],
    ["enter_event 성공 응답 필수 필드", "enter_event_success_contract", "success-contract snapshot"],
  ];

  assert.match(skill, /^name: hola-poke-yeoksam$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /올라포케 역삼점/);
    assert.match(doc, /get_menu/);
    assert.match(doc, /get_shop_info/);
    assert.match(doc, /enter_event/);
    assert.match(doc, /이름(?:·|\/)?이메일.*받지 않/);
    assert.match(doc, /already_entered_today/);
    assert.match(doc, /message.*글자 그대로/);
    assert.match(doc, /주문\/결제\/배달앱 자동화는 하지 않/);
    assert.match(doc, /성공 경로는.*(?:fixture|스냅샷|recorded)/i);
    assert.match(doc, /라이브 스모크.*invalid-phone|invalid-phone.*라이브 스모크/i);
    assert.match(doc, /01012345678|010-1234-5678/);
    assert.match(doc, /hola-poke-yeoksam-skill\.onrender\.com\/mcp/);

    for (const [label, key, message] of snapshotLabels) {
      assert.equal(
        findJsonFenceTextAfterLabel(doc, label),
        JSON.stringify(fixture[key], null, 2),
        `${message} must stay byte-aligned with the checked-in fixture`,
      );
    }
  }

  assert.deepEqual(
    fixture.tools_list.tools.map((tool) => tool.name),
    ["get_menu", "get_shop_info", "enter_event"],
    "tools/list fixture must pin the expected remote tool roster",
  );
  assert.equal(fixture.get_shop_info.group_order_url, "");
  assert.match(fixture.get_shop_info.group_order_note, /단체주문|네이버페이/);
  assert.deepEqual(fixture.enter_event_success_contract.required_fields, ["message", "code", "next_action"]);
  assert.equal(fixture.enter_event_invalid_phone.error, "phone_format");
  assert.match(fixture.enter_event_invalid_phone.message, /01012345678|010-1234-5678/);
});

test("repository docs advertise the library-book-search skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const sources = read(path.join("docs", "sources.md"));
  const proxyDoc = read(path.join("docs", "features", "k-skill-proxy.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "library-book-search.md");
  const skillPath = path.join(repoRoot, "library-book-search", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/library-book-search.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected library-book-search/SKILL.md to exist");

  const featureDoc = read(path.join("docs", "features", "library-book-search.md"));
  const skill = read(path.join("library-book-search", "SKILL.md"));

  assert.match(skill, /^name: library-book-search$/m);
  assert.match(readme, /\| 도서관 도서 조회 \|/);
  assert.match(readme, /\[도서관 도서 조회 가이드\]\(docs\/features\/library-book-search\.md\)/);
  assert.match(install, /--skill library-book-search/);
  assert.match(install, /DATA4LIBRARY_AUTH_KEY/);
  assert.match(sources, /data4library\.kr\/apiUtilization/);
  assert.match(proxyDoc, /\/v1\/data4library\/book-search/);
  assert.match(proxyDoc, /DATA4LIBRARY_AUTH_KEY/);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /도서관 정보나루/);
    assert.match(doc, /\/v1\/data4library\/book-search/);
    assert.match(doc, /\/v1\/data4library\/book-detail/);
    assert.match(doc, /\/v1\/data4library\/book-exists/);
    assert.match(doc, /\/v1\/data4library\/libraries-by-book/);
    assert.match(doc, /DATA4LIBRARY_AUTH_KEY.*프록시 서버/s);
    assert.match(doc, /사용자.*시크릿.*없/);
  }
});

test("repository docs advertise the korean-privacy-terms thin-wrapper skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const roadmap = read(path.join("docs", "roadmap.md"));
  const sources = read(path.join("docs", "sources.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "korean-privacy-terms.md");
  const skillPath = path.join(repoRoot, "korean-privacy-terms", "SKILL.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/korean-privacy-terms.md to exist");
  assert.ok(fs.existsSync(skillPath), "expected korean-privacy-terms/SKILL.md to exist");
  assert.match(readme, /\| 한국 개인정보처리방침·이용약관 자동 생성 \|/);
  assert.match(
    readme,
    /\[한국 개인정보처리방침·이용약관 자동 생성 가이드\]\(docs\/features\/korean-privacy-terms\.md\)/,
  );
  assert.match(install, /--skill korean-privacy-terms/);
  assert.match(roadmap, /한국 개인정보처리방침.이용약관 스킬 출시/);
  assert.match(sources, /https:\/\/github\.com\/kimlawtech\/korean-privacy-terms/);
  assert.match(sources, /Apache-2\.0/);
});

test("korean-privacy-terms skill is a thin wrapper that cites upstream and enforces a legal disclaimer", () => {
  const skillPath = path.join(repoRoot, "korean-privacy-terms", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected korean-privacy-terms/SKILL.md to exist");

  const skill = read(path.join("korean-privacy-terms", "SKILL.md"));

  assert.match(skill, /^name: korean-privacy-terms$/m);
  assert.match(skill, /^license: Apache-2\.0$/m);
  assert.match(skill, /^description: .*개인정보처리방침.*이용약관.*$/m);
  assert.match(
    skill,
    /\[?kimlawtech\/korean-privacy-terms\]?.*https:\/\/github\.com\/kimlawtech\/korean-privacy-terms/,
  );
  assert.match(skill, /Apache-2\.0/);
  assert.match(skill, /참고용 초안/);
  assert.match(skill, /법률 자문/);
  assert.match(skill, /변호사 검토/);
  assert.match(skill, /2026\.9\.11/);
  assert.match(skill, /되묻/);
  assert.match(skill, /개인정보처리방침/);
  assert.match(skill, /이용약관/);
  assert.match(skill, /쿠키 배너/);
  assert.match(skill, /~\/\.claude\/skills\/korean-privacy-terms/);
  assert.match(skill, /~\/\.agents\/skills\/korean-privacy-terms/);
  assert.match(skill, /scripts\/install\.sh/);
  assert.match(skill, /scripts\/upstream\.pin/);
  assert.match(skill, /DISCLAIMER\.md/);
  assert.match(skill, /## Notes/);
  assert.doesNotMatch(skill, /AskUserQuestion/);
});

test("korean-privacy-terms preserves upstream NOTICE and DISCLAIMER for Apache-2.0 compliance", () => {
  const noticePath = path.join(repoRoot, "korean-privacy-terms", "NOTICE");
  const disclaimerPath = path.join(repoRoot, "korean-privacy-terms", "DISCLAIMER.md");

  assert.ok(fs.existsSync(noticePath), "expected korean-privacy-terms/NOTICE to exist");
  assert.ok(fs.existsSync(disclaimerPath), "expected korean-privacy-terms/DISCLAIMER.md to exist");

  const notice = fs.readFileSync(noticePath, "utf8");
  const disclaimer = fs.readFileSync(disclaimerPath, "utf8");

  assert.match(notice, /korean-privacy-terms/);
  assert.match(notice, /Copyright 2026 kimlawtech/);
  assert.match(notice, /Apache License, Version 2\.0/);
  assert.match(notice, /kimlawtech/i);

  assert.match(disclaimer, /한국어/);
  assert.match(disclaimer, /English/);
  assert.match(disclaimer, /참고용 초안/);
  assert.match(disclaimer, /reference drafts/i);
  assert.match(disclaimer, /legal advice/i);
  assert.match(disclaimer, /개인정보보호법/);
});

test("korean-privacy-terms ships an install.sh wrapper and a pinned upstream SHA", () => {
  const pinPath = path.join(repoRoot, "korean-privacy-terms", "scripts", "upstream.pin");
  const installPath = path.join(repoRoot, "korean-privacy-terms", "scripts", "install.sh");

  assert.ok(fs.existsSync(pinPath), "expected korean-privacy-terms/scripts/upstream.pin to exist");
  assert.ok(fs.existsSync(installPath), "expected korean-privacy-terms/scripts/install.sh to exist");

  const pin = fs.readFileSync(pinPath, "utf8").trim();

  assert.match(pin, /^[0-9a-f]{40}$/, "upstream.pin must contain a single 40-char git SHA");
  assert.notStrictEqual(
    pin,
    "0".repeat(40),
    "upstream.pin must not be a placeholder all-zero SHA",
  );
  assert.notStrictEqual(
    pin,
    "f".repeat(40),
    "upstream.pin must not be a placeholder all-f SHA",
  );

  const install = fs.readFileSync(installPath, "utf8");

  assert.match(install, /^#!\/(?:usr\/bin\/env bash|bin\/bash)/m, "install.sh must start with a bash shebang");
  assert.match(install, /set -euo pipefail/, "install.sh must opt into strict bash mode");
  assert.match(install, /~\/\.claude\/skills\/korean-privacy-terms/);
  assert.match(install, /~\/\.agents\/skills\/korean-privacy-terms/);
  assert.match(
    install,
    /https:\/\/github\.com\/kimlawtech\/korean-privacy-terms\.git/,
    "install.sh must reference the full upstream clone URL",
  );
  assert.match(
    install,
    /git clone --filter=blob:none/,
    "install.sh must perform a blobless git clone of the upstream repo",
  );
  assert.match(install, /upstream\.pin/);

  const stat = fs.statSync(installPath);

  assert.ok(
    (stat.mode & 0o111) !== 0,
    "install.sh must have the executable bit set on at least one of user/group/other",
  );
});

test("korean-privacy-terms bundles the Apache-2.0 LICENSE per §4(a) redistribution requirement", () => {
  const licensePath = path.join(repoRoot, "korean-privacy-terms", "LICENSE.upstream");

  assert.ok(
    fs.existsSync(licensePath),
    "expected korean-privacy-terms/LICENSE.upstream to exist (Apache-2.0 §4(a) requires redistributors to give recipients a copy of this License)",
  );

  const license = fs.readFileSync(licensePath, "utf8");

  assert.match(license, /Apache License/);
  assert.match(license, /Version 2\.0, January 2004/);
  assert.match(license, /http:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0/);
  assert.match(license, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
  assert.match(license, /Redistribution\. You may reproduce and distribute/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.match(license, /APPENDIX: How to apply the Apache License/);
  assert.match(license, /Copyright 2026 kimlawtech/);

  const skill = read(path.join("korean-privacy-terms", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "korean-privacy-terms.md"));

  assert.match(
    skill,
    /LICENSE\.upstream/,
    "SKILL.md Notes section must link to LICENSE.upstream so §4(a) is satisfied even before install.sh runs",
  );
  assert.match(
    featureDoc,
    /LICENSE\.upstream/,
    "docs/features/korean-privacy-terms.md must reference LICENSE.upstream",
  );
});

test("korean-privacy-terms feature doc documents the thin-wrapper install flow and legal disclaimer", () => {
  const featureDoc = read(path.join("docs", "features", "korean-privacy-terms.md"));

  assert.match(featureDoc, /kimlawtech\/korean-privacy-terms/);
  assert.match(featureDoc, /Apache-2\.0/);
  assert.match(featureDoc, /~\/\.claude\/skills\/korean-privacy-terms/);
  assert.match(featureDoc, /~\/\.agents\/skills\/korean-privacy-terms/);
  assert.match(featureDoc, /scripts\/install\.sh/);
  assert.match(featureDoc, /scripts\/upstream\.pin/);
  assert.match(featureDoc, /참고용 초안/);
  assert.match(featureDoc, /법률 자문/);
  assert.match(featureDoc, /변호사 검토/);
  assert.match(featureDoc, /2026\.9\.11/);
  assert.match(featureDoc, /Next\.js/);
});
