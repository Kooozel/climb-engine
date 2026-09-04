/**
 * index.ts — the package's root entry point.
 *
 * A barrel written out by hand rather than `export *`, so the public surface is
 * a readable list and the `_` block below is visibly marked as carrying no
 * promise. Everything reachable from here is pure: no DOM, no `node:`, no
 * ambient state — this module is what a browser extension bundles into an MV3
 * service worker, and `tsconfig.engine.json` compiles it with neither a DOM lib
 * nor ambient types so that stays true.
 *
 * The GPX reader (`./gpx`), the ride analyser (`./ride`) and the distance
 * kernel (`./geo`) are subpath exports instead. `./ride` reaches for `node:`
 * nothing, but it is a consumer-shaped façade rather than engine API; `./gpx`
 * and `./geo` are the reader's own entry point, as they were in the extension.
 */

export { detectClimbs, emptyDetectionResult, DEFAULT_CLIMB_CONFIG } from "./climb-engine.js";
export type { ClimbConfig } from "./climb-engine.js";

export { score, ASO, GARMIN, HIKING, SCORING_CONFIGS } from "./scoring.js";
export type { ScoringConfig, ScoringThreshold } from "./scoring.js";

export { maxGradientOverWindow } from "./max-gradient.js";
export type { GradientPoint } from "./max-gradient.js";

export { ClimbCategory } from "./climb-types.js";
export type {
  ScoringModel,
  ElevationTuple,
  GpsPoint,
  Segment,
  Coords,
  MeasuredClimb,
  ScoredClimb,
  DetectionResult,
  ClimbDebugEvent,
  ClimbDebugSink,
  DetectClimbsOptions,
} from "./climb-types.js";

// ─── Test exports ─────────────────────────────────────────────────────────────
// Not public API — the `_` prefix is the marker, as in climb-engine.ts. They are
// re-exported here because MapyClimbs' max-gradient.test.js cross-checks the
// chart's maxPitchGradient against _computeMaxSustainedGradient, and after the
// migration (climb-engine#4) that test reaches for it through this package.
export {
  _resamplePoints,
  _interpolateProfile,
  _smoothElevationProfile,
  _mergeNearbyClimbs,
  _measureClimb,
  _trimAndMeasure,
  _snapAllEndCoords,
  _computeMaxSustainedGradient,
} from "./climb-engine.js";
