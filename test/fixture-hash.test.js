/**
 * test/fixture-hash.test.js
 *
 * The pure helpers behind scripts/check-fixture-hash.mjs.
 *
 * The other scripts/ files are untested, and this one is tested because it is
 * the only check in the repo that fails *open*: a wrong isBreakingBump waves
 * through exactly the change — a retuned detector on an unchanged version —
 * that the whole repository exists to stop. The digest itself is covered by the
 * committed test/fixtures/output.sha256 and by CI recomputing it.
 *
 * Importing the module runs nothing: its main() is behind an argv guard, and
 * the dist/ import is lazy, so this suite loads it before any build has run.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

import {
  FORMAT,
  normalise,
  formatHashFile,
  parseHashFile,
  parseVersion,
  isBreakingBump,
  nextBreakingVersion,
} from '../scripts/check-fixture-hash.mjs';

describe('isBreakingBump', () => {
  // The correction #3 carries over from #1: #1 called a fixture-moving change a
  // major bump and also said start at 0.1.0, and those disagree. Under 0.x the
  // minor is what ^ refuses.
  it('treats the minor as the breaking position while the version is 0.x', () => {
    expect(isBreakingBump('0.1.0', '0.1.1')).toBe(false);
    expect(isBreakingBump('0.1.0', '0.1.9')).toBe(false);
    expect(isBreakingBump('0.1.0', '0.2.0')).toBe(true);
  });

  it('accepts a graduation to 1.0.0 as breaking against a 0.x base', () => {
    expect(isBreakingBump('0.1.0', '1.0.0')).toBe(true);
  });

  it('treats the major as the breaking position from 1.0.0 on', () => {
    expect(isBreakingBump('1.2.3', '1.2.4')).toBe(false);
    expect(isBreakingBump('1.2.3', '1.3.0')).toBe(false);
    expect(isBreakingBump('1.2.3', '2.0.0')).toBe(true);
  });

  it('does not read a version going backwards as a bump', () => {
    expect(isBreakingBump('0.2.0', '0.1.0')).toBe(false);
    expect(isBreakingBump('2.0.0', '1.0.0')).toBe(false);
  });

  it('names the lowest version that would satisfy it', () => {
    expect(nextBreakingVersion('0.1.0')).toBe('0.2.0');
    expect(nextBreakingVersion('0.9.4')).toBe('0.10.0');
    expect(nextBreakingVersion('1.2.3')).toBe('2.0.0');
    for (const base of ['0.1.0', '0.9.4', '1.2.3']) {
      expect(isBreakingBump(base, nextBreakingVersion(base))).toBe(true);
    }
  });

  it('rejects a string that is not a version rather than guessing', () => {
    expect(() => parseVersion('v0.1.0')).toThrow(/not a semver/);
    expect(() => parseVersion('')).toThrow(/not a semver/);
  });
});

describe('normalise', () => {
  it('keeps nine significant digits', () => {
    expect(normalise(333.45670123456)).toBe(333.456701);
    expect(normalise(49.5261234567)).toBe(49.5261235);
  });

  it('absorbs the last-bit drift a reordered floating-point sum causes', () => {
    // The case the precision exists for: the same three addends, grouped two
    // ways, differ in the last bits and in nothing anyone can see.
    const leftToRight = 0.1 + 0.2 + 0.3;
    const regrouped = 0.1 + (0.2 + 0.3);
    expect(leftToRight).not.toBe(regrouped);
    expect(normalise(leftToRight)).toBe(normalise(regrouped));
  });

  it('still catches a difference a human could see', () => {
    // A summit coordinate moving by a millimetre, ~1e-8 degrees.
    expect(normalise(49.52612345)).not.toBe(normalise(49.52613345));
    // A climb one metre shorter than it used to be.
    expect(normalise(2461.3)).not.toBe(normalise(2460.3));
  });

  it('walks arrays and objects, and leaves null and strings alone', () => {
    expect(
      normalise({
        distance: 2461.30000000001,
        endCoords: null,
        category: '4',
        segments: [{ gradient: 5.2612345678901 }],
      })
    ).toEqual({
      distance: 2461.3,
      endCoords: null,
      category: '4',
      segments: [{ gradient: 5.26123457 }],
    });
  });

  it('preserves key order, because the digest is taken over the serialisation', () => {
    expect(Object.keys(normalise({ b: 1, a: 2 }))).toEqual(['b', 'a']);
  });

  it('keeps a non-finite number distinguishable, where JSON would not', () => {
    // Both would serialise to null untouched, hiding one becoming the other.
    expect(normalise(NaN)).toBe('NaN');
    expect(normalise(Infinity)).toBe('Infinity');
    expect(normalise(-Infinity)).toBe('-Infinity');
  });
});

describe('the hash file', () => {
  const digests = new Map([
    ['b7.gpx', 'a'.repeat(64)],
    ['travny.gpx', 'b'.repeat(64)],
  ]);

  it('round-trips what --write emits', () => {
    const parsed = parseHashFile(formatHashFile(digests));
    expect(parsed.format).toBe(FORMAT);
    expect([...parsed.digests]).toEqual([...digests]);
  });

  it('ignores comments and blank lines', () => {
    const parsed = parseHashFile(`# a comment\n\nformat: 1\n${'c'.repeat(64)}  lh.gpx\n`);
    expect(parsed.format).toBe(1);
    expect(parsed.digests.get('lh.gpx')).toBe('c'.repeat(64));
  });

  it('reports no format at all rather than assuming the current one', () => {
    // An older file with no format line is incomparable, not implicitly format 1.
    expect(parseHashFile(`${'d'.repeat(64)}  lh.gpx\n`).format).toBeNull();
  });

  it('refuses a line it cannot read rather than silently dropping it', () => {
    expect(() => parseHashFile('not-a-digest  lh.gpx\n')).toThrow(/cannot read line/);
  });

  it('matches the file that is actually committed', () => {
    // Guards the shape, not the digests: CI recomputes those.
    const parsed = parseHashFile(
      readFileSync(new URL('./fixtures/output.sha256', import.meta.url), 'utf8')
    );
    expect(parsed.format).toBe(FORMAT);
    expect(parsed.digests.size).toBeGreaterThan(0);
    for (const digest of parsed.digests.values()) expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
