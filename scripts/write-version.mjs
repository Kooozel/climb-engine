/**
 * write-version.mjs — the provenance file a release attaches.
 *
 * `~/sport/vendor/climb-engine/VERSION` records which build produced the rows
 * in its `climbs` table, and until now every field in it was typed by hand.
 * This writes the same shape, generated, so a vendorer's whole job becomes
 *
 *   curl -L <release asset URL> -o VERSION
 *   echo "vendored_on:   $(date -I)" >> VERSION
 *
 * `vendored_on` is deliberately the one field left out: it is a fact about the
 * copy, not about the build, and only the vendorer knows it.
 *
 * Writes dist/VERSION, and is called by the release workflow rather than by
 * `npm run build` — a tarball carrying a VERSION from whenever `dist/` was last
 * built would be a provenance file that lies.
 *
 * Usage — `node scripts/write-version.mjs`, after a build.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

// GITHUB_REF_NAME is the tag that triggered the release; the fallback is for a
// local dry run, where the tag does not exist yet.
const tag = process.env.GITHUB_REF_NAME ?? `v${version}`;

const contents = `version:       ${version}
tag:           ${tag}
source_repo:   github.com/Kooozel/climb-engine
source_commit: ${git("rev-parse", "HEAD")}
commit_date:   ${git("log", "-1", "--format=%cI")}
built_with:    npm run build  (tsc + esbuild, bundle, esm, node20)
files:         climb-engine.mjs (library), climb-cli.mjs (executable)

This is a VERSIONED COPY, deliberately not a symlink. Stored climb rows were
produced by exactly this build. Retuning the detector upstream must never
silently rewrite training history: to adopt a new engine, re-vendor here, bump
this file, and re-run the backfill explicitly.

Detection output is the contract. A release whose fixture digests moved carries
a bumped breaking position — the minor while the version is 0.x — so a version
that differs from yours in that position is a detector you have not adopted.
`;

writeFileSync(join(ROOT, "dist", "VERSION"), contents);
console.log(`dist/VERSION — ${tag}`);
