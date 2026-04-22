# k-skill-rhwp

Node-side HWP editing CLI that wraps [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core)
(Rust + WebAssembly, MIT, by Edward Kim) as subcommands.

- **Ships the `k-skill-rhwp` binary** for the `rhwp-edit` skill in
  [NomaDamas/k-skill](https://github.com/NomaDamas/k-skill).
- **Round-trip safe HWP 5.x editing** — insert/delete text, replace-all, create
  tables, set cell text, and render pages to SVG or HTML.
- **Node 18+ only.** No Rust toolchain required; the shipped WASM does the work.

For debugging the upstream `rhwp` Rust CLI (`export-svg --debug-overlay`,
`dump`, `ir-diff`, `thumbnail`, `convert`), see the `rhwp-advanced` skill —
this package does not wrap those commands.

For `.hwp` → Markdown / JSON / form-field extraction, see the `hwp` skill
(kordoc-based). This package is editing-only.

## Install

```bash
npm install k-skill-rhwp
# or run one-off
npx --yes k-skill-rhwp --help
```

## CLI

```bash
# Metadata / structure
k-skill-rhwp info <input.hwp>
k-skill-rhwp list-paragraphs <input.hwp> [--section N]
k-skill-rhwp search <input.hwp> --query TEXT [--from-section N] [--from-paragraph N] [--from-char N] [--case-sensitive]

# Body editing
k-skill-rhwp insert-text <input> <output> --section N --paragraph N --offset N --text TEXT
k-skill-rhwp delete-text <input> <output> --section N --paragraph N --offset N --count N
k-skill-rhwp replace-all <input> <output> --query TEXT --replacement TEXT [--case-sensitive]

# Tables
k-skill-rhwp create-table <input> <output> --section N --paragraph N --offset N --rows N --cols N
k-skill-rhwp set-cell-text <input> <output> --section N --parent-paragraph N --control N --cell N --text TEXT [--cell-paragraph N] [--no-replace]

# Rendering / creation
k-skill-rhwp create-blank <output.hwp>
k-skill-rhwp render <input.hwp> [--page N] [--format svg|html]
```

Every editing subcommand writes a brand-new HWP file (never overwrites the
input) and prints a JSON summary including `ok`, post-edit cursor position,
`bytesWritten`, and the resolved `outputPath`.

### Scope of `search` and `replace-all`

Both `search` and `replace-all` operate on **body paragraphs only**. Text
inside table cells, headers/footers, or footnotes is not scanned. This
mirrors the upstream `@rhwp/core` `searchText` scope. For cell text, use
`info` or `list-paragraphs` to locate the table and then `set-cell-text` to
write. `replace-all` also rejects any `--replacement` that contains newline
or paragraph-break characters (`\n`, `\r`, U+2028, U+2029) because they would
split a paragraph — split those into multiple `insert-text` calls instead.
`replace-all` uses **non-overlapping** replacement semantics: matches are
computed against the original text before any replacement runs, so
`--query a --replacement aa` against `aaa` replaces 3 originals and yields
`aaaaaa`, not an infinite loop.

Case-insensitive matching (the default) relies on `String.prototype.toLowerCase()`
preserving UTF-16 length so offsets taken in the lowercased haystack still apply
to the original text. A handful of Unicode characters (notably Turkish `İ`
U+0130, which lowercases to `i` + combining dot above U+0307) violate that
invariant. When either the query or a paragraph contains such a character,
`replace-all` refuses the operation with exit code 1 and a `case-insensitive
matching is unsafe because case folding changes the UTF-16 length` message
rather than silently drifting every subsequent offset. Rerun with
`--case-sensitive`, or normalize the input. ASCII, Hangul, and the common HWP
use cases (e.g. `2025 → 2026`) are not affected.

## Node API

```js
const { insertText, createTable, setCellText, getDocumentInfo } = require("k-skill-rhwp");

await insertText({
  input: "./draft.hwp",
  output: "./draft-with-title.hwp",
  section: 0,
  paragraph: 0,
  offset: 0,
  text: "2026년 신청서"
});

console.log(await getDocumentInfo("./draft-with-title.hwp"));
```

The first call loads `@rhwp/core` WASM once per process. The WASM requires a
`globalThis.measureTextWidth(font, text)` callback for text layout; this
package auto-installs a deterministic approximation shim on first use so it
works headless on Node without `canvas`. Replace the shim before the first
call if you need pixel-accurate metrics.

## Known limitations

- **HWPX round-trip is disabled upstream (rhwp #196).** HWPX input is
  accepted, but output is always written as HWP 5.x binary.
- **rhwp v0.7.x is beta.** Complex tables, images, charts, or form fields may
  occasionally lose fidelity on round-trip; verify with `info` and visual
  render after non-trivial edits.
- **Windows security modules, Hancom GUI automation, read-only distribution
  documents beyond `rhwp convert`** are out of scope.

## Upstream references

- rhwp (Rust): <https://github.com/edwardkim/rhwp>
- @rhwp/core (npm): <https://www.npmjs.com/package/@rhwp/core>
- k-skill repo: <https://github.com/NomaDamas/k-skill>

## License

MIT
