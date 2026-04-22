"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Writable } = require("node:stream");

const { parseArgs, main, USAGE } = require("../src/cli");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k-skill-rhwp-cli-"));

test.after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function collectStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    }
  });
  Object.defineProperty(stream, "buffer", {
    get: () => Buffer.concat(chunks).toString("utf8")
  });
  return stream;
}

test("parseArgs handles positional args, --flag value, --flag=value, and boolean flags", () => {
  const a = parseArgs([
    "insert-text",
    "in.hwp",
    "out.hwp",
    "--section",
    "0",
    "--paragraph=1",
    "--text",
    "hi",
    "--case-sensitive"
  ]);
  assert.deepEqual(a._, ["insert-text", "in.hwp", "out.hwp"]);
  assert.equal(a.flags.section, "0");
  assert.equal(a.flags.paragraph, "1");
  assert.equal(a.flags.text, "hi");
  assert.equal(a.flags["case-sensitive"], true);
});

test("parseArgs supports -- to pass remaining tokens positionally", () => {
  const a = parseArgs(["cmd", "--", "--weird-text", "with --dashes"]);
  assert.deepEqual(a._, ["cmd", "--weird-text", "with --dashes"]);
});

test("main prints usage with --help", async () => {
  const stdout = collectStream();
  const stderr = collectStream();
  const code = await main(["--help"], { stdout, stderr });
  assert.equal(code, 0);
  assert.ok(stdout.buffer.includes("k-skill-rhwp"));
  assert.ok(stdout.buffer.includes("info <input>"));
  assert.equal(stderr.buffer, "");
  assert.ok(USAGE.length > 100);
});

test("main prints version with -v", async () => {
  const stdout = collectStream();
  const stderr = collectStream();
  const code = await main(["-v"], { stdout, stderr });
  assert.equal(code, 0);
  assert.match(stdout.buffer, /k-skill-rhwp \d+\.\d+\.\d+/);
});

test("main returns exit code 1 for unknown command with a helpful message", async () => {
  const stdout = collectStream();
  const stderr = collectStream();
  const code = await main(["totally-fake-command"], { stdout, stderr });
  assert.equal(code, 1);
  assert.match(stderr.buffer, /unknown command: totally-fake-command/);
});

test("main info on a generated blank document prints valid JSON with sectionCount >= 1", async () => {
  const blank = path.join(tmpRoot, "cli-blank.hwp");
  const createOut = collectStream();
  const createErr = collectStream();
  const createCode = await main(["create-blank", blank], {
    stdout: createOut,
    stderr: createErr
  });
  assert.equal(createCode, 0, `create-blank failed: ${createErr.buffer}`);
  assert.ok(fs.existsSync(blank));

  const infoOut = collectStream();
  const infoErr = collectStream();
  const infoCode = await main(["info", blank], { stdout: infoOut, stderr: infoErr });
  assert.equal(infoCode, 0, `info failed: ${infoErr.buffer}`);
  const parsed = JSON.parse(infoOut.buffer);
  assert.equal(parsed.sourceFormat, "hwp");
  assert.equal(parsed.sectionCount, 1);
  assert.ok(Array.isArray(parsed.sections));
});

test("main insert-text + info end-to-end round-trip through the CLI layer", async () => {
  const blank = path.join(tmpRoot, "cli-rt-blank.hwp");
  const edited = path.join(tmpRoot, "cli-rt-edited.hwp");
  const nul = collectStream();
  await main(["create-blank", blank], { stdout: nul, stderr: collectStream() });

  const insertOut = collectStream();
  const insertErr = collectStream();
  const insertCode = await main(
    [
      "insert-text",
      blank,
      edited,
      "--section",
      "0",
      "--paragraph",
      "0",
      "--offset",
      "0",
      "--text",
      "안녕 CLI"
    ],
    { stdout: insertOut, stderr: insertErr }
  );
  assert.equal(insertCode, 0, `insert-text failed: ${insertErr.buffer}`);
  const insertResult = JSON.parse(insertOut.buffer);
  assert.equal(insertResult.ok, true);

  const infoOut = collectStream();
  await main(["info", edited], { stdout: infoOut, stderr: collectStream() });
  const infoResult = JSON.parse(infoOut.buffer);
  assert.equal(infoResult.sections[0].paragraphs[0].length, "안녕 CLI".length);
});

test("main reports missing required --section flag to stderr and exits 1", async () => {
  const blank = path.join(tmpRoot, "cli-missing-flag.hwp");
  await main(["create-blank", blank], { stdout: collectStream(), stderr: collectStream() });
  const stdout = collectStream();
  const stderr = collectStream();
  const code = await main(
    [
      "insert-text",
      blank,
      path.join(tmpRoot, "cli-missing-out.hwp"),
      "--paragraph",
      "0",
      "--offset",
      "0",
      "--text",
      "hi"
    ],
    { stdout, stderr }
  );
  assert.equal(code, 1);
  assert.match(stderr.buffer, /missing required --section/);
});
