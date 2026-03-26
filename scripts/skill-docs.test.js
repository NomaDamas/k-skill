const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("root npm test script includes the skill docs regression suite", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.match(packageJson.scripts.test, /node --test scripts\/skill-docs\.test\.js/);
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

test("delivery-tracking docs avoid raw CJ personal fields in published examples", () => {
  const skill = read(path.join("delivery-tracking", "SKILL.md"));
  const featureDoc = read(path.join("docs", "features", "delivery-tracking.md"));

  assert.doesNotMatch(skill, /"message":\s*latest\.get\("crgNm"\)/);
  assert.doesNotMatch(
    featureDoc,
    /print\(json\.dumps\(payload\["parcelDetailResultMap"\]\["resultList"\]\[-1\],\s*ensure_ascii=False,\s*indent=2\)\)/,
  );

  for (const doc of [skill, featureDoc]) {
    assert.match(doc, /"status_code":\s*latest\.get\("crgSt"\)/);
    assert.match(doc, /"status":\s*status_map\.get\(latest\.get\("crgSt"\),/);
    assert.match(doc, /"timestamp":\s*latest\.get\("dTime"\)/);
    assert.match(doc, /"location":\s*latest\.get\("regBranNm"\)/);
    assert.match(doc, /"event_count":\s*len\(events\)/);
  }
});
