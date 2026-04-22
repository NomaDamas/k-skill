"use strict";

/**
 * Lazy WASM initialization for @rhwp/core in Node.js.
 *
 * @rhwp/core is an ESM package shipping a WebAssembly binary meant for browsers.
 * Two Node-specific concerns are handled here:
 *
 * 1. The WASM imports a `globalThis.measureTextWidth(font, text)` callback that is
 *    used for text layout (line breaking, justification). The canonical browser
 *    implementation uses a `<canvas>` 2D context. Headless Node has no Canvas.
 *    We install a deterministic approximation shim that treats CJK code points as
 *    full-width (≈ font size) and Latin as half-width (≈ 0.55 × font size).
 *    Accurate enough for round-trip editing and smoke tests; do not rely on it
 *    for pixel-perfect rendering.
 *
 * 2. The default `init(undefined)` path assumes `import.meta.url` and `fetch()`,
 *    neither of which point at a local filesystem WASM binary in Node. We
 *    resolve the shipped `rhwp_bg.wasm` via `require.resolve` and hand its bytes
 *    to init explicitly, which avoids any fetch/network I/O.
 *
 * The module is side-effect free: calling `getRhwpCore()` more than once returns
 * the same promise. Callers are expected to reuse the resolved module object.
 */

const fs = require("node:fs");

let initPromise = null;

/**
 * Install the `measureTextWidth` shim on globalThis if none exists yet.
 *
 * A user-supplied shim (for example node-canvas based) takes precedence.
 *
 * @returns {boolean} true when a shim was installed by this call.
 */
function installMeasureTextWidthShim() {
  if (typeof globalThis.measureTextWidth === "function") {
    return false;
  }
  globalThis.measureTextWidth = (font, text) => {
    const match = String(font || "").match(/([0-9.]+)px/);
    const size = match ? parseFloat(match[1]) : 12;
    let width = 0;
    const source = String(text || "");
    for (const ch of source) {
      const cp = ch.codePointAt(0) ?? 0;
      // CJK / full-width Hangul-Jamo..Halfwidth block roughly fills a square.
      // Latin, digits, punctuation are closer to half-width.
      if (cp >= 0x1100 && cp <= 0xffdc) {
        width += size;
      } else {
        width += size * 0.55;
      }
    }
    return width;
  };
  return true;
}

/**
 * Resolve the absolute path of the @rhwp/core WASM binary shipped with the
 * package. The resolution is deliberately subpath-based so workspaces, globally
 * linked copies, and hoisted node_modules all work.
 *
 * @returns {string}
 */
function resolveRhwpWasmPath() {
  return require.resolve("@rhwp/core/rhwp_bg.wasm");
}

/**
 * Lazily load and initialize @rhwp/core. Returns the ESM namespace object so
 * callers can use `HwpDocument`, `version`, `extractThumbnail`, etc.
 *
 * Safe to call many times; the WASM is initialized exactly once.
 *
 * @returns {Promise<typeof import("@rhwp/core")>}
 */
function getRhwpCore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    installMeasureTextWidthShim();
    const core = await import("@rhwp/core");
    const wasmPath = resolveRhwpWasmPath();
    const wasmBytes = fs.readFileSync(wasmPath);
    await core.default({ module_or_path: wasmBytes });
    return core;
  })();
  return initPromise;
}

function _resetForTests() {
  initPromise = null;
}

module.exports = {
  getRhwpCore,
  installMeasureTextWidthShim,
  resolveRhwpWasmPath,
  _resetForTests
};
