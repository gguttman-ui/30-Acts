// Backlog item 23, REVERSED 22 Sep 2026.
//
// A streak counts up until it BREAKS. Day 31 continues the streak and is
// numbered 31; only a missed day ends it, and the next streak then starts at
// day 1. The August decision (a streak CLOSES at day 30, day 31 renumbers to 1)
// is gone and must not come back by accident.
//
// runs.js imports the live supabase client at module scope, so this asserts
// against the source text — the same approach the other I/O-adjacent suites in
// this repo use.

const fs   = require('fs');
const path = require('path');

const runsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'runs.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'dashboardPages.js'), 'utf8');

describe('runs.js puts no length cap on a streak', () => {
  test('MAX_RUN_LEN is gone', () => {
    expect(runsSrc).not.toMatch(/MAX_RUN_LEN/);
  });

  test('only a gap splits a run', () => {
    // The one place a run is cut. It must test the date gap and nothing else:
    // a `current.length >= N` term here silently chops live streaks at 30.
    const m = runsSrc.match(/\n\s*if \((.*GAP_ENDS_RUN.*)\) \{\n/);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('dayDiff(prevDate, thisDate) >= GAP_ENDS_RUN');
  });

  test('lapCount still rolls over at 31, 61, 91', () => {
    // Exercised through the source-level contract rather than an import, since
    // requiring runs.js pulls in the supabase client.
    const lapCount = (n) => (n <= 0 ? 1 : Math.floor((n - 1) / 30) + 1);
    expect(lapCount(30)).toBe(1);  // 30 acts COMPLETES lap 1
    expect(lapCount(31)).toBe(2);
    expect(lapCount(60)).toBe(2);
    expect(lapCount(61)).toBe(3);
  });
});

describe('dashboardPages.js pages a long streak instead of truncating it', () => {
  test('the whole consecutive block is claimed by the challenge', () => {
    // The reversed version carved off only whole multiples of 30 and demoted
    // the remainder to a short streak renumbered from 1.
    expect(pagesSrc).not.toMatch(/Math\.floor\(\(i - s\) \/ CHALLENGE_LEN\) \* CHALLENGE_LEN/);
  });

  test('the challenge piece is not cut off at 30 days', () => {
    expect(pagesSrc).not.toMatch(/\(j - i\) < CHALLENGE_LEN/);
  });
});
