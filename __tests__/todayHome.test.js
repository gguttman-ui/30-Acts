// David's UX fix 3 (18 Nov 2026): Home rebuilt around today.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const { IDEA_ACTS, ideaText, dailyIdea } = require('../src/lib/actIdeas');

const DASH = read('src', 'screens', 'DashboardView.js');
const HOME = read('src', 'screens', 'HomeScreen.js');
const NAV  = read('src', 'navigation', 'index.js');
const RUNS = read('src', 'lib', 'runs.js');

describe("today's idea", () => {
  test('every act has a "do it" version', () => {
    expect(IDEA_ACTS).toHaveLength(171);
    for (const a of IDEA_ACTS) {
      const t = ideaText(a);
      if (!/^(Set|Put|Let) /.test(a.title)) expect(t).not.toBe(a.title);
      const first = t.split(' ')[0];
      expect(first).not.toMatch(/ed$/);
      expect(t).not.toMatch(/\b(my|me|myself|I)\b/);
    }
  });
  test("David's example", () => {
    const a = IDEA_ACTS.find((x) => x.title === 'Bought a coffee for a stranger');
    expect(ideaText(a)).toBe('Buy a coffee for a stranger');
  });
  test('same idea all day, different people and days differ', () => {
    const a = dailyIdea('+15551234567', '2026-11-18');
    expect(dailyIdea('+15551234567', '2026-11-18')).toBe(a);
    const others = new Set(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
      .map((d) => dailyIdea('+15551234567', d).id));
    expect(others.size).toBeGreaterThan(1);
  });
  test('"Show me another idea" gives a different act each tap', () => {
    const seen = new Set();
    for (let k = 0; k < 10; k++) seen.add(dailyIdea('x', '2026-11-18', k).id);
    expect(seen.size).toBe(10);
  });
});

describe('Today screen', () => {
  test('tab is called Today', () => {
    expect(NAV).toMatch(/tabBarLabel: 'Today'/);
  });
  test('top line, streak badge, idea card, buttons', () => {
    expect(DASH).toMatch(/\{weekday\} \{'\\u00b7'\} Day \{dayOf\} of 30/);
    expect(DASH).toMatch(/🔥 \{streak\}/);
    expect(DASH).toContain("TODAY'S IDEA");
    expect(DASH).toContain('Show me another idea');
    expect(DASH).toMatch(/<Btn label="Log today's act" onPress=\{\(\) => logIdea\(dayOf\)\}/);
    expect(DASH).toContain('I did something else');
  });
  test('after logging: "Day N done" with the story and Edit', () => {
    expect(DASH).toMatch(/Day \{dayOf\} done ✓/);
    expect(DASH).toMatch(/todayRow\.notes \|\| todayRow\.act_title/);
    expect(DASH).toMatch(/>Edit</);
    expect(RUNS).toMatch(/completed_at, local_date, notes'\)/);
  });
  test('tiles: done dark green, ahead light green and not faded, today outlined', () => {
    expect(DASH).toMatch(/TILE_DONE_BG\s+= '#1f4d2e'/);
    expect(DASH).toMatch(/dayCellEmpty: \{ backgroundColor: TILE_AHEAD_BG/);
    expect(DASH).not.toMatch(/dayCellEmpty: \{ opacity/);
    expect(DASH).toMatch(/dayCellToday: \{ borderColor: C\.primary, borderWidth: 3 \}/);
  });
  test('"your first act" only for someone who never logged one', () => {
    expect(DASH).toMatch(/const neverLogged = lifetimeCount === 0;/);
    expect(DASH).not.toMatch(/Tap the \+ to log your first act/);
  });
  test('removed from Home: search bar, Start over, Settings, gear, Join a Group', () => {
    expect(HOME).not.toContain('Search my acts</Text>');
    expect(HOME).not.toContain('label="↺ Start over at Day 1"');
    expect(HOME).not.toMatch(/label="Settings"/);
    expect(HOME).not.toContain('⚙️');
    expect(HOME).not.toContain('Join a Group');
    expect(HOME).toContain('🔍 See all my acts');
  });
});
