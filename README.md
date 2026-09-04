# climb-engine

The climb-detection engine extracted from
[MapyClimbs](https://github.com/Kooozel/MapyClimbs), as a standalone library.

Elevation profile in, categorised climbs out. No DOM, no `chrome.*`, no
third-party imports — so the same detector can run inside a browser extension,
a Node CLI, and a batch derivation pipeline and return identical results.

## Why it exists

Three consumers now need the same detector, and a vendored copy in each is not
a plan:

| Consumer | Uses it for |
| --- | --- |
| [MapyClimbs](https://github.com/Kooozel/MapyClimbs) | live detection on a Mapy.com route |
| `~/sport` | climb detection across ride history |
| [krpaly](https://github.com/Kooozel/krpaly) | offline derivation of the Czech climb database |

## Versioning

Detection output is the contract, not just the type signatures. **Any change
that moves the output of the fixture suite is a breaking bump**, even when the
API is untouched — a retuned detector silently rewriting training history is the
exact failure this repo exists to prevent.

While the version is `0.x` that bump is the **minor** (`0.1.0` → `0.2.0`), which
is what npm's `^0.1.0` treats as incompatible; after `1.0.0`, ordinary semver.
That rule is mechanical, not a convention: `test/fixtures/output.sha256` is a
digest of `detectClimbs` + `score()` output for every fixture, and CI fails a
pull request whose digests move without the version moving with them.

## Install

Distribution is a git tag, not a registry:

```sh
npm i github:Kooozel/climb-engine#v0.1.0
```

`v0.1.0` is **not tagged yet** — cutting it and migrating the three consumers is
[#4](https://github.com/Kooozel/climb-engine/issues/4). Until then, install from
a path or a branch.

The package builds on install (`prepare`), so a consumer needs no build step of
its own. It is ESM-only and ships no `main`: a CJS `require` is not supported.

### Vendoring a single file

A consumer that wants one file rather than a dependency — `~/sport` and krpaly
both do, because a vendored build is what pins their stored climb rows to a
known detector — takes it from the release assets instead:

| Asset | What it is |
| --- | --- |
| `climb-engine.mjs` | the whole library, one dependency-free ESM file |
| `climb-cli.mjs` | the executable, with its `#!/usr/bin/env node` banner |
| `VERSION` | `source_commit`, `commit_date`, `built_with` — generated, not typed |

```sh
BASE=https://github.com/Kooozel/climb-engine/releases/download/v0.1.0
curl -L "$BASE/climb-engine.mjs" -o vendor/climb-engine/climb-engine.mjs
curl -L "$BASE/VERSION"          -o vendor/climb-engine/VERSION
echo "vendored_on:   $(date -I)" >> vendor/climb-engine/VERSION
```

`vendored_on` is the one field the release cannot know: it is a fact about the
copy, not about the build.

## Usage

```js
import { detectClimbs, score, ASO } from "climb-engine";
import { parseGpx } from "climb-engine/gpx";

const track = parseGpx(gpxContent);
const result = detectClimbs(track.tuples);

// Every candidate the pipeline measured, geometry only.
console.log(result.climbs.length, result.totalDistance, result.totalElevationGain);

// Whether a climb *counts* is the consumer's question, asked separately.
for (const climb of score(result, ASO)) {
  if (climb.category !== null) {
    console.log(climb.category, climb.difficulty.toFixed(1), climb.distance);
  }
}
```

Tune the pipeline without forking it — any subset of `DEFAULT_CLIMB_CONFIG` is
shallow-merged over the defaults at the call site:

```js
detectClimbs(track.tuples, { config: { CLIMB_START_GRADE_PCT: 4 } });
```

## Entry points

| Import | Gives you |
| --- | --- |
| `climb-engine` | `detectClimbs`, `emptyDetectionResult`, `score` + `ASO` / `GARMIN` / `HIKING`, `maxGradientOverWindow`, `DEFAULT_CLIMB_CONFIG`, and the domain types |
| `climb-engine/gpx` | `parseGpx` — the GPX reader, no `DOMParser`, no Node API |
| `climb-engine/ride` | `analyzeRide` — ride GPX to enriched climb JSON, the CLI's output contract |
| `climb-engine/geo` | `haversineDistance` |

The root imports nothing environmental: no DOM, no `node:`, no third-party
package. That is enforced, not asserted — see `CLAUDE.md`.

### `climb-cli`

The package also ships a bin. It takes a **Garmin Connect ride GPX** and prints
enriched climb JSON on stdout; diagnostics go to stderr.

```sh
npx climb-cli ride.gpx --pretty --model garmin
```

## Development

```sh
npm ci
npm run typecheck   # tsc --noEmit && tsc -p tsconfig.engine.json
npm run lint
npm test
npm run build       # clean → tsc → esbuild bundles; the closure is asserted here
node scripts/check-no-node-imports.mjs
node scripts/check-fixture-hash.mjs   # detection output has not moved
npm run fixtures:hash                 # …and this is how to record it when it has
```

Every change reaches `main` through a pull request, squash-merged, with a
[Conventional Commits](https://www.conventionalcommits.org/) title — and a
change that moves the fixture suite's detection output is a breaking one even
when the API is untouched. See [CONTRIBUTING.md](CONTRIBUTING.md).
