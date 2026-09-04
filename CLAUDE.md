# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Commands

```sh
npm ci
npm run typecheck   # tsc --noEmit && tsc -p tsconfig.engine.json
npm run lint        # eslint src/ scripts/ eslint.config.js
npm test            # vitest run (all suites in test/)
npm run test:watch
npm run build       # clean → tsc -p tsconfig.build.json → esbuild bin
npm run format      # prettier --write src/ test/
node scripts/check-no-node-imports.mjs   # after a build
```

Run a single suite:

```sh
npx vitest run test/climb-engine.test.js
```

## What this is

The climb-detection engine extracted verbatim from
[MapyClimbs](https://github.com/Kooozel/MapyClimbs) at `a9deda7`, packaged as a library. Three
consumers need the same detector — the extension, `~/sport`, and krpaly — and a vendored copy in
each is not a plan.

Distribution is a git tag (`npm i github:Kooozel/climb-engine#v0.1.0`), not a registry. `"private":
true` is deliberate: a git install ignores it, and it turns an accidental `npm publish` into an
error rather than an irreversible public artifact.

## The pipeline

`detectClimbs` is five steps over `[[distance_m, elevation_m, lat, lon], …]`: resample to a fixed
interval, interpolate across recording gaps, smooth the elevation profile, identify and merge climb
candidates, then trim and measure each one. All of its numeric constants live in
`src/climb-engine.config.ts` as one exported object, `DEFAULT_CLIMB_CONFIG`. A consumer overrides
any subset at the call site — `detectClimbs(tuples, { config: { CLIMB_START_GRADE_PCT: 4 } })` —
which is shallow-merged over the defaults once, at the top of `detectClimbs`, and threaded through
as `cfg`. Two keys, `SPIKE_MAX_SEGMENT_M` and `TRIM_START_GRADE_PCT`, are *computed* from another
key to produce their default and are then plain keys: overriding what they derive from does not
move them, so set both. Nothing is validated — a wrong number produces wrong climbs, which is the
consumer's business.

Two different figures are called a "max gradient", and both come from the single scan in
`src/max-gradient.ts` so they cannot drift apart again: `MeasuredClimb.maxSustainedGradient`
(measured in `climb-engine.ts`) reads the dense smoothed segments over a 200 m window and feeds the
hiking score and the CLI's `max_grade` column, while MapyClimbs' `maxPitchGradient`
(`gradient-zones.ts`, which stayed in the extension) reads the simplified chart profile and is the
card's "Max grade" stat. That cross-check lives in MapyClimbs, where the invariant it defends is
enforced; what lives here is the shared kernel, exercised at both windows in
`test/max-gradient.test.js`.

## Three rules, and the two checks that enforce them

- **`detectClimbs` is deterministic.** No clock, no ambient state: same input, same output, so
  snapshot tests and byte-comparing consumers work. `DetectionResult` therefore has no `timestamp`
  and no `routeMode` — a consumer that needs those stamps them at its own storage boundary.
- **The core measures; it does not judge.** `detectClimbs` takes no scoring model and returns every
  candidate as a `MeasuredClimb` — geometry only. Whether a climb counts is the consumer's
  question, and the models disagree substantially about it, so `score(result, model)` is a
  separate, pluggable view returning `ScoredClimb`s whose `category` is `null` when nothing was
  cleared. The consumer filters.
- **The root entry point imports nothing environmental.** No DOM, no `node:`, no third-party
  package. It is what MapyClimbs bundles into an MV3 service worker, where a `node:` specifier is
  not a slow path but a resolution failure.

Everything not on the public surface carries an `_` prefix, which is the marker that it carries no
semver promise and exists for tests.

Two checks stand behind those rules, and **a file joining the engine must be added to both lists**:

- `tsconfig.engine.json` compiles the closure with no DOM lib and no ambient types, so a stray
  `document.` or `chrome.` fails there. `src/cli/**` is deliberately outside it — that layer
  imports `node:` by design.
- `scripts/build-cli.mjs` walks the module graph esbuild actually resolves from the three pure
  entry points (`src/index.ts`, `src/gpx.ts`, `src/geo.ts`) and fails on any input outside
  `ENGINE_CLOSURE`.

`scripts/check-no-node-imports.mjs` is the third, after a build: no emitted file under `dist/`
except `climb-cli.mjs` may contain a `node:` specifier. It is what keeps `./ride` honest —
`analyzeRide` takes GPX *content*, not a path, and nothing should quietly change that.

Neither the closure check nor the engine tsconfig catches a *type-only* import of a foreign type,
which esbuild erases and tsc accepts. That one is on review.

## Layout

```
src/index.ts              the root barrel — the public surface, written out by hand
src/climb-engine.ts       the 5-step pipeline (pure)
src/climb-engine.config.ts  DEFAULT_CLIMB_CONFIG
src/climb-types.ts        the domain types
src/max-gradient.ts       the one max-gradient window scan
src/scoring.ts            score() + ASO / GARMIN / HIKING — a view, not a pipeline step
src/gpx.ts                the GPX reader: scans the XML itself, no DOMParser, no node:
src/geo.ts                haversineDistance
src/cli/analyze-ride.ts   the `./ride` subpath: ride GPX → the consumer's output contract
src/cli/ride-metrics.ts   moving time and HR-zone aggregation (VAM is on moving time)
src/cli/index.ts          the only impure file: args, file reads, printing
```

`cli/analyze-ride.ts` is an output contract: every `climbs[]` key maps 1:1 onto a column of the
downstream `climbs` table, so keys are **snake_case** there and camelCase↔snake_case conversion
happens in that file and nowhere else. HR zone boundaries are personal data and are never
committed — they come in via `--zones`.

`src/cli/index.ts` is excluded from `tsconfig.build.json`: it ships only as the esbuild bundle
`bin` points at, so `dist/` carries no unbundled copy and no `node:fs` import.

## Tests

Plain JS in `test/`, Vitest, **no DOM environment and no happy-dom dependency** — that absence is a
result of the extraction, not an oversight. Beware writing the literal string
`@vitest-environment <name>` in a suite's header comment: vitest's docblock scanner reads it as the
directive even inside prose.

`test/fixtures/` holds seven real Mapy.cz route exports plus `ride-synthetic.gpx`, a generated
ride-shaped track (1 Hz noise, stops, recording gaps, heart rate) so CLI behaviour can be tested
without committing a real ride. `test/gpx-integration.test.js` runs every route fixture through
`parseGpx` → `detectClimbs` → `score` against `test/fixtures/expected.js` — that suite is the
detection contract.

`detectClimbs` takes an optional `ClimbDebugSink` (`src/climb-types.ts`) emitting one structured
event per decision point. `climb-cli --debug` writes it as NDJSON to stderr, and `DEBUG_PIPELINE=1`
renders it in the integration test — both need their flag, since vitest's default reporter hides
`console.log` from passing tests.

## Versioning

Detection output is the contract, not just the type signatures. **Any change that moves the output
of the fixture suite is a breaking bump**, even when the API is untouched — a retuned detector
silently rewriting someone's training history is the exact failure this repo exists to prevent.
