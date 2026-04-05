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

test("hwp skill documents environment-aware routing and supported operations", () => {
  const skillPath = path.join(repoRoot, "hwp", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected hwp/SKILL.md to exist");

  const skill = read(path.join("hwp", "SKILL.md"));

  assert.match(skill, /^name: hwp$/m);
  assert.match(skill, /@ohah\/hwpjs/);
  assert.match(skill, /\bhwp-mcp\b/);
  assert.match(skill, /Windows/i);
  assert.match(skill, /JSON/i);
  assert.match(skill, /Markdown/i);
  assert.match(skill, /HTML/i);
  assert.match(skill, /image/i);
  assert.match(skill, /batch/i);
});

test("hwp skill documents inline image verification for markdown output", () => {
  const skill = read(path.join("hwp", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "hwp.md"));

  assert.match(skill, /hwpjs to-markdown document\.hwp -o output\.md --include-images/);
  assert.match(skill, /Markdown:.*(data:|base64)/);
  assert.match(skill, /--images-dir/);
  assert.doesNotMatch(skill, /Markdown:.*이미지 경로 생성 여부 확인/);
  assert.match(featureDoc, /--images-dir/);
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
  assert.match(featureDoc, /--include-images/);
  assert.match(featureDoc, /(data:|base64)/);
  assert.match(featureDoc, /Markdown 출력.*(data:|base64)/);
  assert.doesNotMatch(featureDoc, /Markdown 출력.*이미지 (파일 )?경로 생성 여부 확인/);
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
    /npm install -g @ohah\/hwpjs kbo-game kleague-results toss-securities k-lotto coupang-product-search used-car-price-search korean-law-mcp/,
  );
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

  assert.match(readme, /\| 서울 지하철 도착정보 조회 \| .* \| 프록시 URL 필요 \|/);
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

test("kakaotalk-mac skill documents safe macOS kakaocli usage", () => {
  const skillPath = path.join(repoRoot, "kakaotalk-mac", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected kakaotalk-mac/SKILL.md to exist");

  const skill = read(path.join("kakaotalk-mac", "SKILL.md"));

  assert.match(skill, /^name: kakaotalk-mac$/m);
  assert.match(skill, /kakaocli/);
  assert.match(skill, /macOS/i);
  assert.match(skill, /KakaoTalk/i);
  assert.match(skill, /Full Disk Access/i);
  assert.match(skill, /Accessibility/i);
  assert.match(skill, /--me/);
  assert.match(skill, /confirm before sending/i);
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

test("zipcode-search docs lock the official ePost extraction flow and reliable transport example", () => {
  const skillPath = path.join(repoRoot, "zipcode-search", "SKILL.md");

  assert.ok(fs.existsSync(skillPath), "expected zipcode-search/SKILL.md to exist");

  const skill = read(path.join("zipcode-search", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "zipcode-search.md"));

  assert.match(skill, /^name: zipcode-search$/m);

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /parcel\.epost\.go\.kr\/parcel\/comm\/zipcode\/comm_newzipcd_list\.jsp/);
    assert.match(doc, /sch_zipcode/);
    assert.match(doc, /sch_address1/);
    assert.match(doc, /sch_bdNm/);
    assert.match(doc, /curl --http1\.1 --tls-max 1\.2/);
    assert.match(doc, /--max-time/);
    assert.match(doc, /"--retry",\s+"3"/);
    assert.match(doc, /--retry-all-errors/);
    assert.match(doc, /"--retry-delay",\s+"1"/);
    assert.match(doc, /mktemp|임시 파일/);
    assert.match(doc, /curl: \(23\)/);
    assert.match(doc, /짧은 도로명 \+ 건물번호/);
    assert.match(doc, /시\/군\/구 포함 전체 주소/);
    assert.doesNotMatch(doc, /urllib\.request/);
    assert.doesNotMatch(doc, /urlopen/);
  }

  assert.match(skill, /검색 결과가 없으면/i);
  assert.doesNotMatch(skill, /timeout\s*=/);
  assert.doesNotMatch(featureDoc, /timeout\s*=/);
  assert.match(skill, /`curl` 자체 제한/);
  assert.match(featureDoc, /프로토콜\/클라이언트 제약/i);
  assert.match(featureDoc, /`curl` 자체 제한/);
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

test("repository docs advertise the coupang-product-search skill", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const featureDocPath = path.join(repoRoot, "docs", "features", "coupang-product-search.md");

  assert.ok(fs.existsSync(featureDocPath), "expected docs/features/coupang-product-search.md to exist");
  assert.match(readme, /\| 쿠팡 상품 검색 \|/);
  assert.match(readme, /\[쿠팡 상품 검색 가이드\]\(docs\/features\/coupang-product-search\.md\)/);
  assert.match(install, /--skill coupang-product-search/);
});

test("coupang-product-search skill and docs reference coupang-mcp", () => {
  const skillPath = path.join(repoRoot, "coupang-product-search", "SKILL.md");
  const featureDoc = read(path.join("docs", "features", "coupang-product-search.md"));

  assert.ok(fs.existsSync(skillPath), "expected coupang-product-search/SKILL.md to exist");

  const skill = read(path.join("coupang-product-search", "SKILL.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /coupang-mcp/);
    assert.match(doc, /yuju777-coupang-mcp\.hf\.space\/mcp/);
    assert.match(doc, /search_coupang_products/);
    assert.match(doc, /로켓배송/);
  }
});

test("root pack:dry-run script covers all publishable workspaces", () => {
  const packageJson = readJson("package.json");

  assert.match(packageJson.scripts["pack:dry-run"], /workspace k-lotto/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace daiso-product-search/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace blue-ribbon-nearby/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace kakao-bar-nearby/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace kleague-results/);
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
  assert.match(readme, /\| 근처 블루리본 맛집 \|/);
  assert.match(readme, /\[근처 블루리본 맛집 가이드\]\(docs\/features\/blue-ribbon-nearby\.md\)/);
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

test("toss-securities package README stays aligned with the read-only tossctl wrapper contract", () => {
  const packageReadme = read(path.join("packages", "toss-securities", "README.md"));

  assert.match(packageReadme, /read-only tossctl wrapper/i);
  assert.match(packageReadme, /brew tap JungHoonGhae\/tossinvest-cli/);
  assert.match(packageReadme, /account summary/);
  assert.match(packageReadme, /quote get/);
  assert.match(packageReadme, /order place/);
  assert.match(packageReadme, /지원하지 않음|not supported/u);
});

test("pack:dry-run includes the toss-securities workspace", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.match(packageJson.scripts["pack:dry-run"], /workspace toss-securities/);
  assert.match(packageJson.scripts["pack:dry-run"], /workspace used-car-price-search/);
});

test("used-car-price-search ships with a changeset for release automation", () => {
  const changesetDir = path.join(repoRoot, ".changeset");
  const changesetFiles = fs
    .readdirSync(changesetDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => read(path.join(".changeset", name)));

  assert.ok(
    changesetFiles.some((doc) => /["']used-car-price-search["']:\s*(patch|minor|major)/.test(doc)),
    "expected a changeset entry that releases used-car-price-search",
  );
});

test("package-lock captures the toss-securities workspace metadata for npm ci", () => {
  const packageLock = readJson("package-lock.json");

  assert.deepEqual(packageLock.packages[""].workspaces, ["packages/*"]);
  assert.deepEqual(packageLock.packages["node_modules/toss-securities"], {
    resolved: "packages/toss-securities",
    link: true,
  });
  assert.equal(packageLock.packages["packages/toss-securities"].version, "0.1.0");
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
  assert.match(readme, /로컬 CLI\/MCP면 `LAW_OC` 필요, remote endpoint\/법망 fallback은 불필요/);
  assert.match(readme, /법망 fallback/i);
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

test("repository docs advertise the real-estate-search skill and upstream self-host guidance", () => {
  const readme = read("README.md");
  const install = read(path.join("docs", "install.md"));
  const setup = read(path.join("docs", "setup.md"));
  const security = read(path.join("docs", "security-and-secrets.md"));
  const setupSkill = read(path.join("k-skill-setup", "SKILL.md"));
  const examplesSecrets = read(path.join("examples", "secrets.env.example"));
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
    assert.match(doc, /DATA_GO_KR_API_KEY/);
    assert.match(doc, /get_apartment_trades/);
    assert.match(doc, /get_apartment_rent/);
    assert.match(doc, /get_region_code/);
    assert.match(doc, /Codex CLI|Claude Desktop/);
    assert.match(doc, /Cloudflare Tunnel/i);
    assert.match(doc, /launchd/i);
    assert.match(doc, /uv run/);
    assert.match(doc, /cloudflared tunnel/i);
    assert.doesNotMatch(doc, /packages\/real-estate-search/);
    assert.doesNotMatch(doc, /python-packages\/real-estate-search/);
  }

  for (const doc of [install]) {
    assert.match(doc, /https:\/\/github\.com\/tae0y\/real-estate-mcp\/tree\/main/);
    assert.match(doc, /DATA_GO_KR_API_KEY/);
    assert.match(doc, /Codex CLI/);
    assert.match(doc, /Cloudflare Tunnel/i);
    assert.match(doc, /launchd/i);
    assert.match(doc, /uv run/);
    assert.match(doc, /cloudflared tunnel/i);
  }

  for (const doc of [setup, security, setupSkill]) {
    assert.match(doc, /DATA_GO_KR_API_KEY/);
    assert.match(doc, /real-estate-mcp/);
  }

  assert.match(examplesSecrets, /^DATA_GO_KR_API_KEY=replace-me$/m);
  assert.match(sources, /real-estate-mcp: https:\/\/github\.com\/tae0y\/real-estate-mcp\/tree\/main/);
  assert.match(roadmap, /한국 부동산 실거래가 조회 스킬 출시/);
  assert.ok(
    !packageJson.workspaces.some((workspace) => workspace.includes("real-estate-search")),
    "expected no repo workspace to be added for real-estate-search",
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "packages", "real-estate-search")), false);
});

test("real-estate-search docs keep the upstream Onbid WIP caveat and avoid launchd daemonize loops", () => {
  const featureDoc = read(path.join("docs", "features", "real-estate-search.md"));
  const installDoc = read(path.join("docs", "install.md"));
  const skill = read(path.join("real-estate-search", "SKILL.md"));

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /get_public_auction_items/);
    assert.match(doc, /get_public_auction_item_detail/);
    assert.match(doc, /WIP|작업 중|준비 중/);
  }

  const skillLaunchdSection = skill.match(/##\s+.*launchd[\s\S]*?(?=\n##\s+|\n#\s+|$)/i)?.[0];
  const featureLaunchdSection = featureDoc.match(/###+\s+.*launchd[\s\S]*?(?=\n##\s+|\n#\s+|$)/i)?.[0];

  assert.ok(skillLaunchdSection, "expected skill launchd section");
  assert.ok(featureLaunchdSection, "expected feature guide launchd section");

  for (const section of [skillLaunchdSection, featureLaunchdSection]) {
    assert.doesNotMatch(section, /com\.kskill\.real-estate-mcp\.server/);
    assert.doesNotMatch(section, /launchctl .*real-estate-mcp\.server/i);
    assert.match(section, /restart:\s*unless-stopped|Docker (Desktop|Engine).*재기동|Docker.*자동 재시작/i);
    assert.match(section, /cloudflared[\s\S]*tunnel[\s\S]*run[\s\S]*real-estate-mcp/i);
  }

  assert.doesNotMatch(installDoc, /launchd\s*로\s*서버\/터널을?\s*자동 실행/i);
  assert.match(installDoc, /launchd[\s\S]*(Cloudflare Tunnel|터널).*(만|전용)/i);
  assert.match(
    installDoc,
    /restart:\s*unless-stopped|Docker (Desktop|Engine).*재기동|Docker.*자동 재시작/i,
  );
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
    assert.match(doc, /ServiceKey|API key/);
    assert.match(doc, /candidate_stations|ambiguous_station/);
    assert.match(doc, /KSKILL_PROXY_BASE_URL|self-host|로컬 proxy/);
    assert.match(doc, /배포 확인이 끝나기 전|배포 전|pending deployment/);
  }

  assert.doesNotMatch(skill, /기본적으로 `https:\/\/k-skill-proxy\.nomadamas\.org\/v1\/han-river\/water-level`/);
  assert.doesNotMatch(featureDoc, /기본 hosted 조회:/);

  for (const doc of [proxyDoc, proxyReadme]) {
    assert.match(doc, /\/v1\/han-river\/water-level/);
    assert.match(doc, /HRFCO_OPEN_API_KEY/);
    assert.match(doc, /waterlevel\/info\.json/);
    assert.match(doc, /waterlevel\/list\/10M/);
  }

  assert.match(setup, /한강 수위 정보 조회 \| 사용자 시크릿 불필요/);
  assert.match(setup, /한강 수위 정보도 hosted public route rollout 이 끝나기 전까지 .*KSKILL_PROXY_BASE_URL/);
  assert.match(security, /KSKILL_PROXY_BASE_URL.*서울 지하철.*한강 수위.*route가 실제 배포된 proxy URL/);
  assert.match(sources, /hrfco\.go\.kr\/web\/openapiPage\/reference\.do/);
  assert.match(sources, /api\.hrfco\.go\.kr/);
  assert.match(roadmap, /한강 수위 정보 조회 스킬 출시/);
});
