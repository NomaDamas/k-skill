const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const childProcess = require("node:child_process");

const {
  assemble,
  assetRelativePaths,
  bundledFiles,
  listSkills,
  readBundledAsset,
  renderTemplate,
  resolveBundledAsset,
  KNOWN_PROFILES,
} = require("../src/assemble");
const { detectRuntime } = require("../src/detect");
const { resolveRunner, runBundledScript } = require("../src/execute");

const packageRoot = path.join(__dirname, "..");
const binPath = path.join(packageRoot, "bin", "k-skill.js");

const GENERIC = { mode: "generic", dolshoi: false, cloakBrowser: false };
const DOLSHOI = { mode: "dolshoi", dolshoi: true, cloakBrowser: true };

test("detectRuntime is capability-based", () => {
  assert.equal(detectRuntime({}).mode, "generic");
  assert.equal(detectRuntime({ DOLSHOI_ACTION_BROKER_URL: "http://x" }).mode, "dolshoi");
  assert.equal(detectRuntime({ CLOAKBROWSER_PEEK_TOKEN: "t" }).mode, "generic");
  assert.equal(detectRuntime({ CLOAKBROWSER_PEEK_TOKEN: "t" }).cloakBrowser, true);
});

test("renderTemplate emits only always + matching mode sections", () => {
  const raw = "<!-- mode:always -->\n- both\n<!-- mode:dolshoi -->\n- dolshoi only\n<!-- mode:generic -->\n- generic only\n";

  assert.equal(renderTemplate(raw, "dolshoi"), "- both\n- dolshoi only");
  assert.equal(renderTemplate(raw, "generic"), "- both\n- generic only");
});

test("renderTemplate treats CRLF mode markers like LF mode markers", () => {
  const raw = "<!-- mode:always -->\r\n- both\r\n<!-- mode:dolshoi -->\r\n- dolshoi only\r\n<!-- mode:generic -->\r\n- generic only\r\n";

  assert.equal(renderTemplate(raw, "dolshoi"), "- both\n- dolshoi only");
  assert.equal(renderTemplate(raw, "generic"), "- both\n- generic only");
});

test("every bundled skill declares only known profiles and assembles in both modes", () => {
  const skills = listSkills();

  assert.ok(skills.length >= 5, "expected at least the five pilot skills to be bundled");

  for (const skillName of skills) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "skills", skillName, "skill.json"), "utf8"),
    );

    for (const profile of manifest.profiles) {
      assert.ok(KNOWN_PROFILES.includes(profile), `${skillName} profile ${profile} must be known`);
    }

    for (const runtime of [GENERIC, DOLSHOI]) {
      const output = assemble(skillName, runtime);

      assert.match(output, /^# .+ — assembled instructions/, `${skillName} ${runtime.mode} header`);
      assert.match(output, /## Runtime rules/);
      assert.match(output, /call `clarify`/, `${skillName} must keep the clarify boundary in ${runtime.mode}`);
      assert.match(
        output,
        /npx -y @nomadamas\/k-skill@0 update/,
        `${skillName} must tell agents to version-check the CLI in ${runtime.mode}`,
      );
      assert.doesNotMatch(output, /<!-- mode:/, `${skillName} ${runtime.mode} must not leak mode markers`);
    }
  }
});

function runtimeRulesSection(output) {
  const match = output.match(/## Runtime rules\n([\s\S]*?)\n\n# /);
  assert.ok(match, "expected a Runtime rules section followed by the skill body");
  return match[1];
}

test("dolshoi and generic runtime rules differ for vault/browser skills", () => {
  const generic = runtimeRulesSection(assemble("foresttrip-vacancy", GENERIC));
  const dolshoi = runtimeRulesSection(assemble("foresttrip-vacancy", DOLSHOI));

  assert.match(dolshoi, /request_vault_credential/);
  assert.doesNotMatch(generic, /request_vault_credential/);
  assert.match(generic, /~\/\.config\/k-skill\/secrets\.env/);
  assert.doesNotMatch(dolshoi, /secrets\.env/);
  assert.match(dolshoi, /CloakBrowser first/);
  assert.match(generic, /Do not automate payment here/);
  assert.doesNotMatch(dolshoi, /Do not automate payment here/);
});

test("generic browser instructions publish the platform-aware auto provider order", () => {
  const generic = runtimeRulesSection(assemble("foresttrip-vacancy", GENERIC));

  assert.match(generic, /On macOS it tries Aside Browser first/);
  assert.match(generic, /then BrowserOS CDP/);
  assert.match(generic, /then user-launched Chrome\/Chromium CDP/);
  assert.match(generic, /on other platforms it tries BrowserOS CDP/);
});

test("bundledFiles lists helper files for directory-package skills", () => {
  const files = bundledFiles("kosis-stats").map((file) => file.split(path.sep).join("/"));

  assert.ok(files.some((f) => f.endsWith("scripts/run_kosis_stats.py")));
  assert.ok(files.some((f) => f.endsWith("references/kosis-openapi-guide.md")));
  assert.ok(
    bundledFiles("railway-timetable")
      .map((file) => file.split(path.sep).join("/"))
      .some((f) => f.endsWith("scripts/railway_timetable.py")),
  );
});

test("all bundled assets are exposed through exec/read/path instructions", () => {
  let assetSkills = 0;

  for (const skillName of listSkills()) {
    const assets = assetRelativePaths(skillName).filter(
      (item) => item.startsWith("scripts/") || item.startsWith("references/"),
    );
    if (!assets.length) continue;
    assetSkills += 1;

    const output = assemble(skillName, DOLSHOI);
    const scripts = assets.filter((item) => item.startsWith("scripts/"));
    const references = assets.filter((item) => item.startsWith("references/"));

    if (scripts.length) {
      assert.match(output, new RegExp(`exec ${skillName} scripts/<file> --`));
      assert.doesNotMatch(
        output,
        new RegExp(
          `(?:python3?|node|bash|uv\\s+run)\\s+(?:\"?\\$SKILL_DIR/|\\./${skillName}/|${skillName}/|\\./)?scripts/`,
        ),
        `${skillName} assembled instructions must not execute a relative bundled script`,
      );
      assert.doesNotMatch(
        output,
        /(^|[|;&]\s*)\.\/scripts\//m,
        `${skillName} assembled instructions must not directly execute ./scripts`,
      );
    }

    if (references.length) {
      assert.match(output, new RegExp(`read ${skillName} references/<file>`));
      assert.doesNotMatch(
        output,
        /\]\((?:\.\/)?references\//,
        `${skillName} assembled instructions must not publish unresolved relative reference links`,
      );
    }
  }

  // Source skill directories own their bundled assets.
  assert.ok(assetSkills >= 92, `expected at least 92 asset-owning skills, got ${assetSkills}`);
});

test("asset resolution rejects traversal and reads bundled references", () => {
  assert.ok(resolveBundledAsset("kosis-stats", "scripts/run_kosis_stats.py").endsWith("run_kosis_stats.py"));
  assert.match(readBundledAsset("kosis-stats", "references/kosis-openapi-guide.md"), /KOSIS/);
  assert.throws(
    () => resolveBundledAsset("kosis-stats", "../../package.json"),
    (error) => error.code === "EASSETPATH",
  );
  assert.throws(
    () => resolveBundledAsset("kosis-stats", "scripts/missing.py"),
    (error) => error.code === "EASSETNOTFOUND",
  );
});

test("runner selection honors shebangs and executes bundled Node helpers", () => {
  const popbill = resolveBundledAsset("popbill", "scripts/popbill_cli.py");
  const runner = resolveRunner(popbill);
  assert.equal(runner.command, "uv");
  assert.deepEqual(runner.args.slice(0, 2), ["run", "--script"]);

  const result = runBundledScript(
    "korean-character-count",
    "scripts/korean_character_count.js",
    ["--text", "가나다", "--format", "json"],
    { encoding: "utf8", stdio: "pipe" },
  );
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).counts.characters, 3);
});

test("runner selection lets KSKILL_PYTHON override Python shebangs", () => {
  const pythonScript = resolveBundledAsset("seoul-weather-risk", "scripts/seoul_weather_risk.py");
  const defaultRunner = resolveRunner(pythonScript);
  const runner = resolveRunner(pythonScript, { KSKILL_PYTHON: "python-custom" });

  assert.equal(defaultRunner.command, process.platform === "win32" ? "python" : "python3");
  assert.equal(runner.command, "python-custom");
  assert.deepEqual(runner.args, [pythonScript]);
});

test("assembled modes preserve workflows and portable bundled helper/reference access", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "k-skill-assembly-"));

  try {
    const fixtureRoot = path.join(tempDir, "cli");
    const sourceDir = path.join(fixtureRoot, "src");
    const templatesDir = path.join(fixtureRoot, "templates");
    const skillName = "workflow-fixture";
    const skillDir = path.join(fixtureRoot, "skills", skillName);
    const workDir = path.join(tempDir, "unrelated-cwd");
    for (const dir of [
      sourceDir,
      templatesDir,
      path.join(skillDir, "scripts"),
      path.join(skillDir, "references"),
      workDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Do not inherit an unrelated package.json's module type from the temp directory.
    fs.writeFileSync(path.join(fixtureRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
    for (const file of ["assemble.js", "execute.js"]) {
      fs.copyFileSync(path.join(packageRoot, "src", file), path.join(sourceDir, file));
    }

    for (const profile of ["core", "lookup"]) {
      fs.writeFileSync(
        path.join(templatesDir, `${profile}.md`),
        [
          "<!-- mode:always -->",
          `${profile}-shared-start`,
          "<!-- mode:generic -->",
          `${profile}-generic-only`,
          "<!-- mode:dolshoi -->",
          `${profile}-dolshoi-only`,
          "<!-- mode:always -->",
          `${profile}-shared-end`,
        ].join("\n"),
      );
    }
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ name: skillName, profiles: ["lookup"] }),
    );
    fs.writeFileSync(
      path.join(skillDir, "instruction.md"),
      [
        "<!-- mode:always -->",
        "site-shared-start",
        "Read [factor table](references/factors.json) before calculating.",
        "<!-- mode:generic -->",
        "site-generic-only",
        "```sh",
        "node scripts/calculate.js 6 7",
        "```",
        "<!-- mode:dolshoi -->",
        "site-dolshoi-only",
        "```sh",
        "node scripts/calculate.js 8 9",
        "```",
        "<!-- mode:always -->",
        "site-shared-end",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(skillDir, "references", "factors.json"),
      JSON.stringify({ multiplier: 3 }),
    );
    fs.writeFileSync(
      path.join(skillDir, "scripts", "calculate.js"),
      [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        "const factors = JSON.parse(fs.readFileSync(",
        '  path.join(process.env.KSKILL_BUNDLED_SKILL_DIR, "references", "factors.json"), "utf8"));',
        "const total = process.argv.slice(2).map(Number).reduce((sum, value) => sum + value, 0)",
        "  * factors.multiplier;",
        "process.stdout.write(JSON.stringify({ total, cwd: process.cwd() }));",
      ].join("\n"),
    );

    const fixtureAssemblePath = path.join(sourceDir, "assemble.js");
    const { assemble: assembleFixture } = require(fixtureAssemblePath);
    const { runBundledScript: runFixtureScript } = require(path.join(sourceDir, "execute.js"));
    for (const runtime of [GENERIC, DOLSHOI]) {
      const output = assembleFixture(skillName, runtime);
      const lines = output.split("\n");
      const otherMode = runtime.mode === "generic" ? "dolshoi" : "generic";
      for (const section of ["core", "lookup", "site"]) {
        for (const suffix of ["shared-start", `${runtime.mode}-only`, "shared-end"]) {
          assert.ok(lines.includes(`${section}-${suffix}`), `${runtime.mode} keeps ${section}-${suffix}`);
        }
        assert.ok(!lines.includes(`${section}-${otherMode}-only`), `${runtime.mode} excludes ${section}-${otherMode}`);
      }
      assert.doesNotMatch(output, /<!-- mode:/);
      assert.doesNotMatch(output, /node scripts\/|\]\(references\//);

      // Extract concrete workflow commands, not the generic access-rule placeholders.
      const execCommands = [...output.matchAll(/\bexec ([\w-]+) (scripts\/[\w./-]+) -- (\d+) (\d+)/g)];
      const readCommands = [...output.matchAll(/\bread ([\w-]+) (references\/[\w./-]+)/g)];
      assert.equal(execCommands.length, 1, `${runtime.mode} preserves exactly its own helper workflow`);
      assert.equal(readCommands.length, 1, `${runtime.mode} preserves the shared reference workflow`);
      const [, execSkill, scriptPath, ...args] = execCommands[0];
      const result = runFixtureScript(execSkill, scriptPath, args, {
        cwd: workDir,
        encoding: "utf8",
        stdio: "pipe",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        total: runtime.mode === "generic" ? 39 : 51,
        cwd: fs.realpathSync(workDir),
      });

      const [, readSkill, referencePath] = readCommands[0];
      const reference = childProcess.spawnSync(
        process.execPath,
        [
          "-e",
          "const { readBundledAsset } = require(process.argv[1]); process.stdout.write(readBundledAsset(process.argv[2], process.argv[3]));",
          fixtureAssemblePath,
          readSkill,
          referencePath,
        ],
        { cwd: workDir, encoding: "utf8" },
      );
      assert.equal(reference.status, 0, reference.stderr);
      assert.deepEqual(JSON.parse(reference.stdout), { multiplier: 3 });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI binary handles instruct, files, list, and errors", () => {
  const run = (args, env = {}) =>
    childProcess.spawnSync("node", [binPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, DOLSHOI_ACTION_BROKER_URL: "", CLOAKBROWSER_PEEK_TOKEN: "", ...env },
    });

  const list = run(["list"]);
  assert.equal(list.status, 0);
  assert.ok(list.stdout.includes("railway-timetable"));

  const generic = run(["instruct", "railway-timetable"]);
  assert.equal(generic.status, 0);
  assert.match(generic.stdout, /Runtime mode: generic/);

  const dolshoi = run(["instruct", "railway-timetable"], { DOLSHOI_ACTION_BROKER_URL: "http://x" });
  assert.match(dolshoi.stdout, /Runtime mode: dolshoi/);

  const unknown = run(["instruct", "nope"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown skill/);

  const exec = run([
    "exec",
    "korean-character-count",
    "scripts/korean_character_count.js",
    "--",
    "--text",
    "가나다",
    "--format",
    "json",
  ]);
  assert.equal(exec.status, 0);
  assert.equal(JSON.parse(exec.stdout).counts.characters, 3);

  const read = run(["read", "kosis-stats", "references/kosis-openapi-guide.md"]);
  assert.equal(read.status, 0);
  assert.match(read.stdout, /KOSIS/);

  const pathResult = run(["path", "kosis-stats", "scripts/run_kosis_stats.py"]);
  assert.equal(pathResult.status, 0);
  assert.match(pathResult.stdout, /run_kosis_stats\.py/);

  const traversal = run(["path", "kosis-stats", "../../package.json"]);
  assert.equal(traversal.status, 1);
  assert.match(traversal.stderr, /must stay inside/);

  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /exec <skill> <script>/);
  assert.match(help.stdout, /read <skill> <file>/);
  assert.match(help.stdout, /version/);
});

test("CLI prints the installed package version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const run = (args) =>
    childProcess.spawnSync("node", [binPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, DOLSHOI_ACTION_BROKER_URL: "", CLOAKBROWSER_PEEK_TOKEN: "" },
    });

  for (const args of [["version"], ["--version"], ["-V"], ["-v"]]) {
    const result = run(args);
    assert.equal(result.status, 0, args.join(" "));
    assert.equal(result.stdout, `${pkg.version}\n`);
    assert.equal(result.stderr, "");
  }
});
