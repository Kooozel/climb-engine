/**
 * check-no-node-imports.mjs — nothing in the published library may need Node.
 *
 * The root entry point is bundled into an MV3 service worker, where a `node:`
 * specifier is not a slow path but a resolution failure. dist/climb-cli.mjs is
 * the one exception: it *is* the Node program.
 *
 * This is also what keeps `./ride` honest. `analyzeRide` takes GPX *content*,
 * not a path, so the analysis half of the CLI runs anywhere; the moment someone
 * reaches for `node:fs` inside it, that stops being true and this fails.
 *
 * Run after a build — `npm run build && node scripts/check-no-node-imports.mjs`.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const DIST = "dist";
const ALLOWED = new Set(["climb-cli.mjs"]);
const NODE_SPECIFIER = /\bfrom\s*["']node:|\brequire\(\s*["']node:|\bimport\(\s*["']node:/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const offenders = [];
for await (const path of walk(DIST)) {
  const rel = relative(DIST, path);
  if (ALLOWED.has(rel) || !/\.(js|mjs|d\.ts)$/.test(rel)) continue;
  if (NODE_SPECIFIER.test(await readFile(path, "utf8"))) offenders.push(rel);
}

if (offenders.length > 0) {
  console.error(
    `Emitted files reach for node: builtins, which the browser cannot resolve:\n` +
      offenders.map((f) => `  ${DIST}/${f}`).join("\n") +
      `\n\nOnly ${[...ALLOWED].join(", ")} may — it is the Node executable.`
  );
  process.exit(1);
}

console.log(`${DIST}/ is free of node: imports outside ${[...ALLOWED].join(", ")}.`);
