const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  convertToMiddleKoreanStyle,
  createReport,
  parseArgs,
} = require("./korean_middle_korean.js");

const ISSUE_SAMPLE =
  '야 이 맛국노야 설마 2015년 7월 21일 새벽에 배우 채수빈이 구자욱이랑 거리에서 손잡고 걸어다니는 모습이 찍혀 열애설이 터지고 구자욱은 열애설을 인정했지만 채수빈은 "맛보기한 느낌이랄까? 열애설이 이런 기분이구나"라고 말해 구자욱이 맛자욱이 된 그 사건을 말하는 것이냐.';

test("convertToMiddleKoreanStyle applies the issue #270 medieval Korean style markers", () => {
  const output = convertToMiddleKoreanStyle(ISSUE_SAMPLE);

  assert.match(output, /이 맛國노〮야/);
  assert.match(output, /2015年 7月 21日/);
  assert.match(output, /俳優/);
  assert.match(output, /街里/);
  assert.match(output, /熱愛說/);
  assert.match(output, /인졍ᄒᆞ/);
  assert.match(output, /기븐〮이로다/);
  assert.match(output, /ᄆᆞᆯᄒᆞᄂᆞᆫ 것이냐〮[.]?$/);
});

test("converter preserves names and numbers while archaising particles and endings", () => {
  const output = convertToMiddleKoreanStyle("민수는 3월 5일 학교에서 공부했다.");

  assert.match(output, /민수ᄋᆞᆫ/);
  assert.match(output, /3月 5日/);
  assert.match(output, /學校/);
  assert.match(output, /공부ᄒᆞ/);
  assert.match(output, /ᄒᆞ엿다〮[.]?$/);
  assert.match(convertToMiddleKoreanStyle("전설이 된 이야기."), /ᄃᆞᆫ 이야기/);
});

test("createReport exposes deterministic metadata and replacement evidence", () => {
  const report = createReport("열애설을 인정했다.");

  assert.equal(report.profile, "middle-korean-style-v1");
  assert.equal(report.input, "열애설을 인정했다.");
  assert.match(report.output, /熱愛說ᄋᆞᆯ/);
  assert.match(report.output, /인졍ᄒᆞ엿다/);
  assert.ok(report.replacements.some((replacement) => replacement.kind === "lexicon"));
  assert.match(report.contract, /deterministic/i);
});

test("parseArgs enforces a single input source", () => {
  assert.deepEqual(parseArgs(["--text", "가나다"]), {
    format: "json",
    inputMode: "text",
    text: "가나다",
  });

  assert.throws(() => parseArgs(["--text", "가", "--stdin"]), /exactly one input source/i);
  assert.throws(() => parseArgs(["--format", "xml", "--text", "가"]), /unknown format/i);
});

test("CLI accepts text, file, and stdin input", () => {
  const repoRoot = path.join(__dirname, "..");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "korean-middle-korean-cli-"));
  const samplePath = path.join(tempDir, "sample.txt");

  try {
    fs.writeFileSync(samplePath, "열애설을 인정했다.", "utf8");

    const textOutput = JSON.parse(
      childProcess.execFileSync("node", ["scripts/korean_middle_korean.js", "--text", "학교에서 공부했다.", "--format", "json"], {
        cwd: repoRoot,
        encoding: "utf8",
      }),
    );
    assert.match(textOutput.output, /學校/);
    assert.match(textOutput.output, /공부ᄒᆞ엿다/);

    const fileOutput = JSON.parse(
      childProcess.execFileSync("node", ["scripts/korean_middle_korean.js", "--file", samplePath], {
        cwd: repoRoot,
        encoding: "utf8",
      }),
    );
    assert.match(fileOutput.output, /熱愛說ᄋᆞᆯ/);

    const stdinOutput = childProcess.execFileSync("node", ["scripts/korean_middle_korean.js", "--stdin", "--format", "text"], {
      cwd: repoRoot,
      encoding: "utf8",
      input: "기분이구나.",
    });
    assert.match(stdinOutput, /기븐〮이로다/);

    const installedSkillOutput = childProcess.execFileSync(
      "node",
      ["scripts/korean_middle_korean.js", "--text", "학교에서 공부했다.", "--format", "text"],
      {
        cwd: path.join(repoRoot, "korean-middle-korean"),
        encoding: "utf8",
      },
    );
    assert.match(installedSkillOutput, /學校애 공부ᄒᆞ엿다/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
