/**
 * test/max-gradient.test.js
 *
 * Unit tests for the one max-gradient scan (`src/max-gradient.ts`) and the
 * figure built on it inside this package: `computeMaxSustainedGradient`
 * (climb-engine.ts, 200 m window over dense smoothed segments).
 *
 * The scan has a second caller that does not live here. `maxPitchGradient`
 * (MapyClimbs' gradient-zones.ts) reads the simplified chart profile at a 25 m
 * floor to produce the card's "Max grade", and the cross-check that the two
 * figures never contradict each other stays in that repo, where the invariant
 * is actually enforced — the stat must not undercut the steepest colour band
 * drawn above it. What travels here is the kernel both of them call, so it is
 * exercised directly at both configured windows below rather than only through
 * `computeMaxSustainedGradient`.
 *
 * The short-profile cases are the regression guard for issue #69, and the
 * two-windows case for #44: the two figures were once separate implementations
 * and drifted until the card and the CLI disagreed about the same climb.
 *
 * Run: npm test
 */

import { describe, it, expect } from 'vitest';
import { maxGradientOverWindow } from '../src/max-gradient.ts';
import { _computeMaxSustainedGradient as computeMaxSustainedGradient } from '../src/climb-engine.ts';

/** The window each caller is configured with. */
const SUSTAINED_WINDOW_M = 200; // MAX_SUSTAINED_GRADIENT_WINDOW_M
const CHART_PITCH_MIN_SPAN_M = 25; // gradient-zones.ts, in the extension

/** Build a minimal GradientPoint. `ProfilePoint` satisfies the same shape. */
function pt(distance, elevation) {
  return { distance, elevation };
}

/**
 * Build a dense Segment[] of `count` steps of `stepM` metres each, taking the
 * gradient (%) of step i from `gradeAt`. Mirrors what calculateGradients emits:
 * gradient is exactly Δelevation / Δdistance for that step.
 */
function segments(count, stepM, gradeAt) {
  const segs = [];
  let distance = 0;
  let elevation = 100;
  for (let i = 0; i < count; i++) {
    const gradient = gradeAt(i);
    const rise = (gradient / 100) * stepM;
    segs.push({
      startDistance: distance,
      endDistance: distance + stepM,
      distance: stepM,
      elevation: rise,
      gradient,
      startElevation: elevation,
      endElevation: elevation + rise,
      startLat: null,
      startLon: null,
      endLat: null,
      endLon: null,
    });
    distance += stepM;
    elevation += rise;
  }
  return segs;
}

/** The dense segments as the scan sees them: cumulative distance and elevation. */
function profileOf(segs) {
  return [
    pt(segs[0].startDistance, segs[0].startElevation),
    ...segs.map((s) => pt(s.endDistance, s.endElevation)),
  ];
}

describe('maxGradientOverWindow', () => {
  it('returns 0 for a profile with fewer than two points', () => {
    expect(maxGradientOverWindow([], 200)).toBe(0);
    expect(maxGradientOverWindow([pt(0, 100)], 200)).toBe(0);
  });

  it('returns the whole-span gradient for a single long span', () => {
    // 500 m, 25 m gain → 5%.
    expect(maxGradientOverWindow([pt(0, 100), pt(500, 125)], 200)).toBeCloseTo(5);
  });

  it('selects the steepest window from a multi-point profile', () => {
    // 0–300 m at 3%, 300–600 m at 10%, 600–900 m at 2%.
    const profile = [pt(0, 100), pt(300, 109), pt(600, 139), pt(900, 145)];
    expect(maxGradientOverWindow(profile, 200)).toBeCloseTo(10);
  });

  it('spans multiple points when no single span reaches the window', () => {
    // Spans of 100 m at 4% then 8%; a 150 m window must straddle both.
    const profile = [pt(0, 100), pt(100, 104), pt(200, 112)];
    // (112 - 100) / 200 = 6%.
    expect(maxGradientOverWindow(profile, 150)).toBeCloseTo(6);
  });

  it('reports a real gradient for a profile shorter than the window', () => {
    // Issue #69. Only 100 m of profile against a 200 m window; reporting 0 here
    // called a real climb flat, in the CLI's max_grade column and in the hiking
    // score's G_max term.
    expect(maxGradientOverWindow([pt(0, 100), pt(100, 110)], 200)).toBeCloseTo(10);
  });

  it('reads a short profile whole, not at its steepest part', () => {
    // 100 m against a 200 m window, steepest 50 m at 20%. The fallback is the
    // widest span the profile has — the steepest sub-span would answer with a
    // narrower window than the caller asked for.
    const profile = [pt(0, 100), pt(50, 110), pt(100, 112)];
    expect(maxGradientOverWindow(profile, 200)).toBeCloseTo(12);
  });

  it('floors a net-descending profile at 0, long or short', () => {
    expect(maxGradientOverWindow([pt(0, 100), pt(100, 90)], 200)).toBe(0);
    expect(maxGradientOverWindow([pt(0, 100), pt(500, 50)], 200)).toBe(0);
  });

  it('reports different numbers at the two configured windows', () => {
    // One scan, two configurations (#44). A 50 m pitch at 15% inside 1 km of 5%:
    // the chart-resolution read sees the pitch, the 200 m sustained read
    // deliberately averages it away. Same points, same function, both windows.
    const profile = profileOf(segments(40, 25, (i) => (i === 20 || i === 21 ? 15 : 5)));
    expect(maxGradientOverWindow(profile, CHART_PITCH_MIN_SPAN_M)).toBeCloseTo(15, 5);
    // (0.15·50 + 0.05·150) / 200 = 7.5%
    expect(maxGradientOverWindow(profile, SUSTAINED_WINDOW_M)).toBeCloseTo(7.5, 5);
  });
});

describe('computeMaxSustainedGradient', () => {
  it('returns a decimal fraction, not a percentage', () => {
    const segs = segments(40, 25, () => 6); // 1 km at a steady 6%
    expect(computeMaxSustainedGradient(segs)).toBeCloseTo(0.06, 5);
  });

  it('returns 0 for no segments', () => {
    expect(computeMaxSustainedGradient([])).toBe(0);
  });

  it('reports a real gradient for a climb shorter than the window', () => {
    // Issue #69, exactly as filed: 150 m at 8% is an ASO-qualifying climb
    // (distKm × grade² = 9.6 ≥ 8) and used to report 0 — a `0.0` in the CLI's
    // max_grade column and a zeroed G_max term in the hiking score.
    const segs = segments(6, 25, () => 8);
    expect(computeMaxSustainedGradient(segs)).toBeCloseTo(0.08, 5);
  });

  it('averages a short pitch away over its 200 m window', () => {
    // 1 km at 4%, except one 25 m step at 20%.
    const segs = segments(40, 25, (i) => (i === 20 ? 20 : 4));
    // The best 200 m window holds the pitch plus 175 m of 4%:
    // (0.2·25 + 0.04·175) / 200 = 6%
    expect(computeMaxSustainedGradient(segs)).toBeCloseTo(0.06, 5);
  });

  it('is the window scan over the same points, in fractions', () => {
    // The engine's figure is exactly maxGradientOverWindow at 200 m, / 100 —
    // so the two call sites can only ever differ in their window.
    const segs = segments(80, 25, (i) => 3 + (i % 7) + (i === 33 ? 12 : 0));
    const scan = maxGradientOverWindow(profileOf(segs), SUSTAINED_WINDOW_M);
    expect(computeMaxSustainedGradient(segs, SUSTAINED_WINDOW_M) * 100).toBeCloseTo(scan, 10);
  });
});
