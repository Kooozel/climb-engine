/**
 * check-fixture-hash.mjs — detection output cannot move without a version bump.
 *
 * Three consumers install this package from a git tag, and the thing they
 * install is a *detector*. A change to it does not break a build: it silently
 * rewrites someone's stored training history. `CONTRIBUTING.md` therefore calls
 * a change that moves the fixture suite's output breaking even when every
 * signature is untouched — and until this file existed that rule was enforced
 * by nobody but the reviewer.
 *
 * `test/fixtures/expected.js` cannot do the job: its assertions carry
 * tolerances (`elevationM: ±12`) to absorb GPS float noise, so a retune that
 * moves a climb 100 m or shifts a summit coordinate passes it green. The rule
 * needs an *equality* test over the whole result, which is what the digest is.
 *
 * Two layers, and they answer different questions:
 *
 *   1. Freshness — the recomputed digests match test/fixtures/output.sha256.
 *      Catches a change that moved the output and left the file behind.
 *   2. The version rule — where the *committed* digests differ from the base
 *      branch's, package.json must have moved in the breaking position.
 *      Layer 1 alone passes the moment someone regenerates the file, bump or
 *      no bump, so layer 2 is the half that actually enforces the rule.
 *
 * Usage:
 *   npm run fixtures:hash                        regenerate the committed file
 *   node scripts/check-fixture-hash.mjs          layer 1 (layer 2 skips itself)
 *   BASE_REF=main node scripts/check-fixture-hash.mjs        both layers
 *
 * Reads dist/, so it runs after a build — which is why `fixtures:hash` builds
 * first, and why the import below is lazy: test/fixture-hash.test.js loads this
 * module for its pure helpers during `npm test`, before any build has run.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = join(ROOT, "test", "fixtures");
const HASH_PATH = "test/fixtures/output.sha256";
const HASH_FILE = join(ROOT, HASH_PATH);

/**
 * Normalisation revision. A change to how the payload below is built or rounded
 * moves every digest without moving any output, so the committed file records
 * which revision produced it: layer 2 then reports the two files as
 * incomparable rather than as a detector retune nobody made.
 */
export const FORMAT = 1;

/**
 * Significant digits kept before hashing. Nine is ~1 mm over 1000 km and far
 * finer than a GPX coordinate's own precision, so it absorbs the last-bit
 * reassociation a pure refactor causes — reordering a floating-point sum — while
 * catching anything a human could see. Without it, a loop rewrite that changes
 * no real number would demand a minor bump.
 */
const PRECISION = 9;

/**
 * Scoring is in the digest alongside detection because retuning an ASO
 * threshold recategorises every stored climb just as surely as retuning the
 * detector does, and scoring.ts lives in this repo.
 */
const MODELS = ["aso", "garmin", "hiking"];

/** Round every finite number to PRECISION significant digits, in place in the tree. */
export function normalise(value) {
  if (typeof value === "number") {
    // NaN and Infinity would both JSON.stringify to null, which would hide one
    // becoming the other. As strings they stay distinguishable.
    return Number.isFinite(value) ? Number(value.toPrecision(PRECISION)) : String(value);
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) out[key] = normalise(nested);
    return out;
  }
  return value;
}

async function loadEngine() {
  try {
    const [engine, gpx] = await Promise.all([
      import(pathToFileURL(join(ROOT, "dist", "index.js")).href),
      import(pathToFileURL(join(ROOT, "dist", "gpx.js")).href),
    ]);
    return { detectClimbs: engine.detectClimbs, score: engine.score, parseGpx: gpx.parseGpx };
  } catch (err) {
    console.error(
      `Cannot read dist/ — the digest is computed from the built library.\n` +
        `Run \`npm run build\` first, or \`npm run fixtures:hash\`, which builds.\n\n${err.message}`
    );
    process.exit(1);
  }
}

/** Fixture filename → SHA-256 of its normalised detection + scoring output. */
export async function digestFixtures() {
  const { detectClimbs, score, parseGpx } = await loadEngine();

  const files = readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".gpx"))
    .sort();

  const digests = new Map();
  for (const file of files) {
    const { tuples } = parseGpx(readFileSync(join(FIXTURES_DIR, file), "utf8"));
    const detection = detectClimbs(tuples);
    // Only difficulty and category from the scored view: the rest of a
    // ScoredClimb is the MeasuredClimb already in `detection`.
    const scored = Object.fromEntries(
      MODELS.map((model) => [
        model,
        score(detection, model).map(({ difficulty, category }) => ({ difficulty, category })),
      ])
    );
    const payload = JSON.stringify(normalise({ detection, scored }));
    digests.set(file, createHash("sha256").update(payload).digest("hex"));
  }
  return digests;
}

export function formatHashFile(digests) {
  return [
    "# SHA-256 over detectClimbs + score() output for every .gpx in this directory.",
    "# Regenerate with `npm run fixtures:hash`; never edit a line by hand.",
    "#",
    "# A line that moves is a breaking change even when no signature did — see",
    '# CONTRIBUTING.md "Breaking changes". scripts/check-fixture-hash.mjs enforces',
    "# that. `format` is the normalisation revision, not the package version.",
    `format: ${FORMAT}`,
    ...[...digests].map(([file, digest]) => `${digest}  ${file}`),
    "",
  ].join("\n");
}

export function parseHashFile(text) {
  const digests = new Map();
  let format = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const version = /^format:\s*(\d+)$/.exec(trimmed);
    if (version !== null) {
      format = Number(version[1]);
      continue;
    }
    const entry = /^([0-9a-f]{64})\s+(\S+)$/.exec(trimmed);
    if (entry === null) throw new Error(`${HASH_PATH}: cannot read line: ${line}`);
    digests.set(entry[2], entry[1]);
  }
  return { format, digests };
}

export function parseVersion(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (parts === null) throw new Error(`not a semver version: ${version}`);
  return { major: Number(parts[1]), minor: Number(parts[2]), patch: Number(parts[3]) };
}

/**
 * Whether `head` is incompatible with `base` the way npm's `^` reads it.
 *
 * Under 0.x the *minor* is the breaking position — `^0.1.0` rejects `0.2.0` and
 * accepts `0.1.9` — and it graduates to the major at 1.0.0. That is read off the
 * base version rather than hard-coded, so this needs no edit on the day 1.0.0
 * lands. (Issue #1 said "major" and also said start at 0.1.0; those disagree,
 * and this is the half that is right.)
 */
export function isBreakingBump(baseVersion, headVersion) {
  const base = parseVersion(baseVersion);
  const head = parseVersion(headVersion);
  return base.major === 0 ? head.major > 0 || head.minor > base.minor : head.major > base.major;
}

/** The lowest version that would satisfy isBreakingBump against `base`. */
export function nextBreakingVersion(baseVersion) {
  const { major, minor } = parseVersion(baseVersion);
  return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
}

function gitShow(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const computed = await digestFixtures();

  if (process.argv.includes("--write")) {
    writeFileSync(HASH_FILE, formatHashFile(computed));
    console.log(`Wrote ${HASH_PATH} — ${computed.size} fixtures, format ${FORMAT}.`);
    return;
  }

  // ── Layer 1: the committed file is fresh ──────────────────────────────────

  let committedText;
  try {
    committedText = readFileSync(HASH_FILE, "utf8");
  } catch {
    fail(`${HASH_PATH} is missing. Run \`npm run fixtures:hash\` and commit it.`);
  }
  const committed = parseHashFile(committedText);

  if (committed.format !== FORMAT) {
    fail(
      `${HASH_PATH} was written by digest format ${committed.format}, and this is format ${FORMAT}.\n` +
        `The normalisation changed, so the committed digests cannot be compared.\n` +
        `Run \`npm run fixtures:hash\` and commit the result.`
    );
  }

  const stale = [...computed].filter(([file, digest]) => committed.digests.get(file) !== digest);
  const gone = [...committed.digests.keys()].filter((file) => !computed.has(file));

  if (stale.length > 0 || gone.length > 0) {
    fail(
      `Detection output does not match ${HASH_PATH}:\n` +
        stale.map(([file]) => `  ${file}  moved or is not listed`).join("\n") +
        (stale.length > 0 && gone.length > 0 ? "\n" : "") +
        gone.map((file) => `  ${file}  listed but no longer a fixture`).join("\n") +
        `\n\nRun \`npm run fixtures:hash\` and commit the result. If you did not mean to` +
        ` move\nthe detector, that movement is the thing this check exists to show you.`
    );
  }

  console.log(`${HASH_PATH} matches — ${computed.size} fixtures, format ${FORMAT}.`);

  // ── Layer 2: a moved digest needs a breaking version bump ─────────────────

  const baseRef = (process.env.BASE_REF ?? "").trim();
  const skip = (reason) => console.log(`Version rule not checked: ${reason}.`);

  if (baseRef === "") return skip("BASE_REF is unset, so there is no base to compare against");

  const baseHashText = gitShow(baseRef, HASH_PATH);
  const basePkgText = gitShow(baseRef, "package.json");
  if (baseHashText === null || basePkgText === null) {
    return skip(`${baseRef} has no ${HASH_PATH} or no package.json`);
  }

  const base = parseHashFile(baseHashText);
  if (base.format !== committed.format) {
    return skip(
      `${baseRef} is digest format ${base.format} and this is ${committed.format},` +
        ` so the digests are not comparable`
    );
  }

  // Only fixtures present on both sides: adding or removing a fixture changes
  // what is measured, not what the detector does with it.
  const changed = [...committed.digests]
    .filter(([file, digest]) => base.digests.has(file) && base.digests.get(file) !== digest)
    .map(([file]) => file);

  if (changed.length === 0) {
    return console.log(`No fixture output moved against ${baseRef}.`);
  }

  const baseVersion = JSON.parse(basePkgText).version;
  const headVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

  if (isBreakingBump(baseVersion, headVersion)) {
    console.log(
      `Fixture output moved against ${baseRef} (${changed.join(", ")}), and` +
        ` package.json went ${baseVersion} → ${headVersion} — a breaking bump. OK.`
    );
    return;
  }

  fail(
    `Detection output moved without a breaking version bump.\n\n` +
      `  Fixtures whose output changed against ${baseRef}:\n` +
      changed.map((file) => `    ${file}`).join("\n") +
      `\n\n  package.json: ${baseVersion} → ${headVersion}\n\n` +
      `Detection output is the contract, not just the type signatures: a retuned\n` +
      `detector silently rewrites a consumer's stored training history, which is the\n` +
      `failure this repository exists to prevent.\n\n` +
      `While the version is 0.x the minor is the breaking position — ^0.1.0 rejects\n` +
      `0.2.0 and accepts 0.1.9 — so bump package.json to ${nextBreakingVersion(baseVersion)} or higher, mark the\n` +
      `pull request title with \`!\`, and explain the movement in the description.\n` +
      `See CONTRIBUTING.md "Breaking changes".`
  );
}

// Only when run as a script: test/fixture-hash.test.js imports the helpers above.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
