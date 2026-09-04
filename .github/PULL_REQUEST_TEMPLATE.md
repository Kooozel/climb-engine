<!--
The title is the commit message on main: <type>(<scope>)!: <subject>, lower-case,
no full stop, no (#123), under 72 chars. Types and scopes: CONTRIBUTING.md.
This description becomes the commit body verbatim — write it for whoever reads
it a year from now.
-->

## What and why

## Detection contract

<!-- Does the output of test/gpx-integration.test.js move? If yes, the title
carries `!` and this section says which fixtures moved and by how much, and
why that is correct. If no, say so — it is the one thing every reviewer checks. -->

- [ ] Fixture output unchanged
- [ ] Fixture output moved — breaking, `!` in the title, movement explained above

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | |
| `npm run lint` | |
| `npm test` | |
| `npm run build` + `node scripts/check-no-node-imports.mjs` | |

<!-- If a file joined the engine closure, say that it was added to BOTH
tsconfig.engine.json and ENGINE_CLOSURE in scripts/build-cli.mjs. -->

## Follow-ups

Closes #
