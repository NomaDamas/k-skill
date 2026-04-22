"use strict";

const path = require("node:path");

const lib = require("./index");

const PKG_VERSION = require("../package.json").version;

const USAGE = `k-skill-rhwp <command> [options]

Commands:
  info <input>                                Print document info as JSON
  list-paragraphs <input> [--section N]       List paragraph lengths in a section
  search <input> --query TEXT [--from-section N] [--from-paragraph N] [--from-char N]
                                              Find first occurrence (forward, body paragraphs only)
  insert-text <input> <output> --section N --paragraph N --offset N --text TEXT
  delete-text <input> <output> --section N --paragraph N --offset N --count N
  replace-all <input> <output> --query TEXT --replacement TEXT [--case-sensitive]
                                              Replace every occurrence (body paragraphs only;
                                              rejects replacements with newline/paragraph breaks)
  create-table <input> <output> --section N --paragraph N --offset N --rows N --cols N
  set-cell-text <input> <output> --section N --parent-paragraph N --control N --cell N
                --text TEXT [--cell-paragraph N] [--no-replace]
  create-blank <output>                       Write a blank HWP document to <output>
  render <input> [--page N] [--format svg|html]
                                              Print rendered SVG/HTML to stdout

Scope note:
  'search' and 'replace-all' scan body paragraphs only. Text inside table cells,
  headers/footers, and footnotes is NOT covered. For cell text, use 'info' or
  'list-paragraphs' to locate the table, then 'set-cell-text' to write.
  Case-insensitive 'replace-all' (the default) refuses inputs whose case folding
  changes UTF-16 length (e.g. Turkish 'İ' U+0130) because those inputs would
  silently drift every subsequent offset. Rerun with --case-sensitive for those
  documents. ASCII and Hangul workflows are unaffected.

Global options:
  --json           Output machine-readable JSON (default for info/list/search)
  --help, -h       Show this help
  --version, -v    Print package version

Examples:
  k-skill-rhwp info sample.hwp
  k-skill-rhwp insert-text sample.hwp out.hwp --section 0 --paragraph 0 --offset 0 --text "hello"
  k-skill-rhwp replace-all sample.hwp out.hwp --query 2025 --replacement 2026
`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === "--") {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      let name;
      let value;
      if (eq !== -1) {
        name = token.slice(2, eq);
        value = token.slice(eq + 1);
      } else {
        name = token.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("-")) {
          value = true;
        } else {
          value = next;
          i += 1;
        }
      }
      args.flags[name] = value;
    } else if (token === "-h") {
      args.flags.help = true;
    } else if (token === "-v") {
      args.flags.version = true;
    } else {
      args._.push(token);
    }
    i += 1;
  }
  return args;
}

function requireFlag(flags, name, { numeric = false } = {}) {
  const raw = flags[name];
  if (raw === undefined || raw === true || raw === "") {
    throw new Error(`missing required --${name}`);
  }
  if (numeric) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new Error(`--${name} must be a non-negative integer, got ${raw}`);
    }
    return n;
  }
  return String(raw);
}

function optionalNumber(flags, name, fallback) {
  if (flags[name] === undefined) return fallback;
  const n = Number(flags[name]);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative integer, got ${flags[name]}`);
  }
  return n;
}

function boolFlag(flags, name) {
  return flags[name] === true || flags[name] === "true";
}

function printJson(obj, stdout) {
  stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function resolveInput(positional, index, label) {
  const raw = positional[index];
  if (!raw) {
    throw new Error(`missing positional argument: ${label}`);
  }
  return path.resolve(raw);
}

async function dispatch(command, args, { stdout = process.stdout } = {}) {
  const { flags } = args;
  switch (command) {
    case "info": {
      const input = resolveInput(args._, 1, "<input>");
      const info = await lib.getDocumentInfo(input);
      printJson(info, stdout);
      return 0;
    }
    case "list-paragraphs": {
      const input = resolveInput(args._, 1, "<input>");
      const section = optionalNumber(flags, "section", 0);
      const result = await lib.listParagraphs(input, section);
      printJson(result, stdout);
      return 0;
    }
    case "search": {
      const input = resolveInput(args._, 1, "<input>");
      const query = requireFlag(flags, "query");
      const fromSection = optionalNumber(flags, "from-section", 0);
      const fromParagraph = optionalNumber(flags, "from-paragraph", 0);
      const fromChar = optionalNumber(flags, "from-char", 0);
      const forward = !boolFlag(flags, "backward");
      const caseSensitive = boolFlag(flags, "case-sensitive");
      const result = await lib.searchText({
        input,
        query,
        fromSection,
        fromParagraph,
        fromChar,
        forward,
        caseSensitive
      });
      printJson(result, stdout);
      return 0;
    }
    case "insert-text": {
      const input = resolveInput(args._, 1, "<input>");
      const output = resolveInput(args._, 2, "<output>");
      const result = await lib.insertText({
        input,
        output,
        section: requireFlag(flags, "section", { numeric: true }),
        paragraph: requireFlag(flags, "paragraph", { numeric: true }),
        offset: requireFlag(flags, "offset", { numeric: true }),
        text: requireFlag(flags, "text")
      });
      printJson(result, stdout);
      return 0;
    }
    case "delete-text": {
      const input = resolveInput(args._, 1, "<input>");
      const output = resolveInput(args._, 2, "<output>");
      const result = await lib.deleteText({
        input,
        output,
        section: requireFlag(flags, "section", { numeric: true }),
        paragraph: requireFlag(flags, "paragraph", { numeric: true }),
        offset: requireFlag(flags, "offset", { numeric: true }),
        count: requireFlag(flags, "count", { numeric: true })
      });
      printJson(result, stdout);
      return 0;
    }
    case "replace-all": {
      const input = resolveInput(args._, 1, "<input>");
      const output = resolveInput(args._, 2, "<output>");
      const result = await lib.replaceAll({
        input,
        output,
        query: requireFlag(flags, "query"),
        replacement: flags.replacement === undefined ? "" : String(flags.replacement),
        caseSensitive: boolFlag(flags, "case-sensitive")
      });
      printJson(result, stdout);
      return 0;
    }
    case "create-table": {
      const input = resolveInput(args._, 1, "<input>");
      const output = resolveInput(args._, 2, "<output>");
      const result = await lib.createTable({
        input,
        output,
        section: requireFlag(flags, "section", { numeric: true }),
        paragraph: requireFlag(flags, "paragraph", { numeric: true }),
        offset: requireFlag(flags, "offset", { numeric: true }),
        rows: requireFlag(flags, "rows", { numeric: true }),
        cols: requireFlag(flags, "cols", { numeric: true })
      });
      printJson(result, stdout);
      return 0;
    }
    case "set-cell-text": {
      const input = resolveInput(args._, 1, "<input>");
      const output = resolveInput(args._, 2, "<output>");
      const result = await lib.setCellText({
        input,
        output,
        section: requireFlag(flags, "section", { numeric: true }),
        parentParagraph: requireFlag(flags, "parent-paragraph", { numeric: true }),
        control: requireFlag(flags, "control", { numeric: true }),
        cell: requireFlag(flags, "cell", { numeric: true }),
        cellParagraph: optionalNumber(flags, "cell-paragraph", 0),
        text: requireFlag(flags, "text"),
        replace: !boolFlag(flags, "no-replace")
      });
      printJson(result, stdout);
      return 0;
    }
    case "create-blank": {
      const output = resolveInput(args._, 1, "<output>");
      const result = await lib.createBlank(output);
      printJson(result, stdout);
      return 0;
    }
    case "render": {
      const input = resolveInput(args._, 1, "<input>");
      const page = optionalNumber(flags, "page", 0);
      const format = flags.format ? String(flags.format) : "svg";
      const output = await lib.renderPage(input, page, format);
      stdout.write(output);
      if (!output.endsWith("\n")) stdout.write("\n");
      return 0;
    }
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const parsed = parseArgs(argv);
  if (parsed.flags.version === true) {
    stdout.write(`k-skill-rhwp ${PKG_VERSION}\n`);
    return 0;
  }
  if (parsed.flags.help === true || parsed._.length === 0) {
    stdout.write(USAGE);
    return 0;
  }
  const [command] = parsed._;
  try {
    return await dispatch(command, parsed, { stdout });
  } catch (err) {
    stderr.write(`k-skill-rhwp: ${err && err.message ? err.message : err}\n`);
    return 1;
  }
}

module.exports = {
  parseArgs,
  main,
  USAGE
};
