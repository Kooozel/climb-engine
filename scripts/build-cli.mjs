/**
 * build-cli.mjs — bundle the engine and the CLI, and assert the engine's closure.
 *
 * Emits two dependency-free ESM files: dist/climb-engine.mjs, the whole library
 * in one file, and dist/climb-cli.mjs, the executable that `bin` points at.
 * Those two plus a generated VERSION are the assets a release attaches, which
 * is what makes vendoring a curl against an immutable URL rather than a clone.
 * The rest of dist/ is the unbundled tree written by `tsc -p
 * tsconfig.build.json`, which has already run by the time this does — hence no
 * rm of the output directory here; `npm run clean` owns that.
 *
 * The engine's whole transitive closure is local — climb-types.ts, scoring.ts,
 * climb-engine.config.ts, max-gradient.ts, plus gpx.ts and geo.ts behind the
 * reader's own entry point — with no DOM, chrome.*, or third-party imports, so
 * the bundle needs no shims and installs nothing. The CLI additionally imports
 * node: builtins, which are part of the runtime, not dependencies.
 *
 * That closure is asserted here rather than assumed — see ENGINE_CLOSURE below.
 * It is why this script outlived the extraction: it is what keeps the root
 * entry point importable from an MV3 service worker.
 */

import { build } from "esbuild";
import { chmod, stat } from "node:fs/promises";

const OUT_DIR = "dist";

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "bundle",
  logLevel: "warning",
};

/**
 * Every file the engine is allowed to pull in, walked from the library's own
 * entry points. An import reaching outside this set — anything under cli/,
 * anything third-party — would make the root unloadable in a browser
 * extension's service worker, the one environment this package cannot
 * negotiate with. A third-party package shows up as a node_modules/ input,
 * because `packages: "bundle"` inlines it rather than leaving it external.
 *
 * This is the value-level half of the boundary; tsconfig.engine.json is the
 * other half, compiling these same files with no DOM lib and no ambient types
 * so a stray `document.` or `chrome.` fails there. Neither catches a *type-only*
 * import of an extension type, which esbuild erases and tsc accepts: that one
 * is on review, and on the explicit file list both configs carry.
 */
const ENGINE_CLOSURE = new Set([
  "src/index.ts",
  "src/climb-engine.ts",
  "src/climb-engine.config.ts",
  "src/climb-types.ts",
  "src/geo.ts",
  "src/gpx.ts",
  "src/max-gradient.ts",
  "src/scoring.ts",
]);

// The library's three DOM-free, node:-free entry points, per the `exports` map:
// the root barrel, the GPX reader and the distance kernel. `./ride` is left out
// on purpose — it lives under cli/, which is outside the closure by design.
// Built for the metafile alone; tsc has already emitted the real dist/ files.
//
// platform "browser" rather than the shared "node": a `node:` builtin is
// *external* to a node build and so never reaches the metafile, which would let
// one slip past the closure check below. Resolved as a browser would, it fails
// here instead — which is the claim these three entry points actually make.
const surface = await Promise.all(
  ["src/index.ts", "src/gpx.ts", "src/geo.ts"].map((entry) =>
    build({ ...shared, platform: "browser", entryPoints: [entry], write: false, metafile: true })
  )
);

const strays = [
  ...new Set(surface.flatMap((result) => Object.keys(result.metafile.inputs))),
].filter((file) => !ENGINE_CLOSURE.has(file));
if (strays.length > 0) {
  console.error(
    `The climb engine reached outside its closure:\n` +
      strays.map((f) => `  ${f}`).join("\n") +
      `\n\nEither the import belongs somewhere else, or the file joins the engine —` +
      ` in which case add it to ENGINE_CLOSURE here and to tsconfig.engine.json.`
  );
  process.exit(1);
}

// Both bundles are written only once the closure holds, so a build that fails
// the check above leaves no artifact behind for a release to pick up.
//
// The library bundle is the root barrel resolved as a browser resolves it —
// the same claim the metafile pass just checked, now written out. It is emitted
// by every build rather than only at release time: the pass costs milliseconds,
// and emitting it always is what puts it under check-no-node-imports.mjs and
// inside `npm pack`.
await build({
  ...shared,
  platform: "browser",
  entryPoints: ["src/index.ts"],
  outfile: `${OUT_DIR}/climb-engine.mjs`,
});

await build({
  ...shared,
  entryPoints: ["src/cli/index.ts"],
  outfile: `${OUT_DIR}/climb-cli.mjs`,
  banner: { js: "#!/usr/bin/env node" },
});

// esbuild does not set the mode, and `bin` entries are executed directly.
await chmod(`${OUT_DIR}/climb-cli.mjs`, 0o755);

for (const name of ["climb-engine.mjs", "climb-cli.mjs"]) {
  const { size } = await stat(`${OUT_DIR}/${name}`);
  console.log(`${OUT_DIR}/${name}  ${(size / 1024).toFixed(1)} KB`);
}
