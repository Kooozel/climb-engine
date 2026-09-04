# Contributing

Three consumers install this package from a git tag, and the thing they install
is a *detector* — a change to it does not break a build, it silently rewrites
someone's training history. The workflow below exists for that reason and for
no other.

## Branching

`main` is the only long-lived branch. MapyClimbs carries a `develop` because it
has a store-release train to stage; here a release is a tag on `main`, so a
second integration branch would only be a place for `main` to drift from.

Work happens on a short-lived branch off `main`, named for the change and, when
there is one, the issue it closes:

```
<type>/<issue>-<slug>      chore/1-transfer-engine
<type>/<slug>              fix/short-profile-max-gradient
```

Rebase onto `main` rather than merging it in — history on `main` is linear and
a merge commit cannot land.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), the same shape
MapyClimbs uses, so `git log` reads alike across both repos:

```
<type>(<scope>)!: <subject>

<body — why, not what>

Closes #12
```

**Types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, `revert`.

**Scopes** (optional, and a closed set): `engine`, `config`, `types`,
`gradient`, `scoring`, `gpx`, `geo`, `cli`, `ride`, `test`, `build`, `ci`,
`deps`, `release`. A genuinely new area of the repo earns a scope by being
added to `SCOPES` in `scripts/check-pr-title.mjs` — one line of review, rather
than a typo nobody notices.

Subject: lower-case, no full stop, no trailing `(#12)` — GitHub appends the
pull request number itself — and the whole line under 72 characters.

Commits on your own branch are yours; they get squashed. The line that has to
be right is the **pull request title**, because that is the one that lands on
`main`.

## Pull requests

Every change reaches `main` through a pull request. The ruleset on `main`
requires one, requires both checks green (`check`, `pr-title`), requires review
threads resolved, forbids force-pushes, deletion and non-linear history, and
allows only the squash merge. A repository admin can bypass it; that is an
escape hatch for an emergency, not a normal Tuesday.

Squashing takes the subject from the **PR title** and the body from the **PR
description**, so both end up in `git log` verbatim. Write the description as
the thing you would want to read a year later when a climb comes out one metre
shorter than it used to: what moved, what was verified, and how.

Run the whole gate before pushing — CI runs exactly this:

```sh
npm run typecheck
npm run lint
npm test
npm run build
node scripts/check-no-node-imports.mjs
BASE_REF=main node scripts/check-fixture-hash.mjs
npm pack --dry-run
```

`BASE_REF` is what CI sets, and without it the fixture check only asks whether
the committed digests are fresh — not whether you were allowed to move them.

## Breaking changes

**Detection output is the contract, not just the type signatures.** If a change
moves the output of the fixture suite, it is breaking even when every signature
is untouched — mark it `!` in the title and explain the movement in the body:

```
refactor(engine)!: merge candidates before trimming, not after
```

While the version is `0.x`, a breaking change bumps the **minor** (`0.1.0` →
`0.2.0`), which is what npm's `^0.1.0` treats as incompatible; anything else
bumps the patch. After `1.0.0`, ordinary semver.

That rule is enforced, not trusted. `test/fixtures/output.sha256` holds a SHA-256
per fixture over `detectClimbs` + `score()` output, and
`scripts/check-fixture-hash.mjs` asks two questions on every pull request:

1. **Is the committed file fresh?** If your change moved the output, the digests
   no longer match and CI names the fixtures. Run `npm run fixtures:hash` and
   commit the result.
2. **Were you allowed to move it?** Where the committed digests differ from
   `main`'s, `package.json` must have moved in the breaking position. Layer 1
   alone passes the moment you regenerate the file, so this is the half that
   actually holds the line.

So a pull request that retunes the detector carries three things: the source
change, a regenerated `output.sha256`, and a bumped minor. `expected.js` cannot
do this job — its assertions carry tolerances to absorb GPS float noise, so a
climb moving 100 m passes it green.

The digest rounds to nine significant digits, which absorbs the last-bit drift a
reordered floating-point sum causes. A pure refactor that changes no real number
does not trip it; if yours does, it moved something.

Two rules from `CLAUDE.md` bear repeating here because they are what review
looks for:

- A file joining the engine must be added to **both** lists —
  `tsconfig.engine.json` and `ENGINE_CLOSURE` in `scripts/build-cli.mjs`.
- Neither list catches a **type-only** import of a foreign type. That one is on
  the reviewer.

## Releases

A release is an annotated tag `vX.Y.Z` on `main` plus the matching
`package.json` version — that tag is the whole distribution channel
(`npm i github:Kooozel/climb-engine#v0.1.0`).

Pushing the tag is the only manual step. In a pull request:

```sh
npm version <patch|minor> --no-git-tag-version   # minor if the output moved
npm run fixtures:hash                            # only if it did
```

Then, once that is merged and CI on `main` is green:

```sh
git checkout main && git pull
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

`release.yml` takes it from there: it refuses the tag if it disagrees with
`package.json`, runs the whole gate again, and creates the Release with
`climb-engine.mjs`, `climb-cli.mjs` and a generated `VERSION` attached. Those
three assets are the point of distributing by tag — `~/sport` and krpaly vendor
one file, not a clone.

The version guard runs *before* anything is built, because a tag cannot be moved
once a consumer has installed it.
