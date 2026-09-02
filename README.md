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
that moves the output of the fixture suite is a major version bump**, even when
the API is untouched — a retuned detector silently rewriting training history
is the exact failure this repo exists to prevent.

## Status

Empty. Nothing extracted yet.
