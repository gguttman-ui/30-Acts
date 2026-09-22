import { buildPages } from '../src/lib/dashboardPages';

// Helpers -------------------------------------------------------------------

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// A run of `n` consecutive days starting at `start`.
function consecutiveRun(start, n) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `${start}-${i}`,
    local_date: addDays(start, i),
    act_title: `act ${i + 1}`,
  }));
  return { rows, startDate: rows[0].local_date, endDate: rows[n - 1].local_date, length: n };
}

const actNos = (page) => page.cells.filter((c) => c.type === 'act').map((c) => c.actNo);

// Tests ---------------------------------------------------------------------

describe('buildPages - a streak counts up until it breaks', () => {
  // Reversed 22 Sep 2026. Day 30 does NOT close a streak. Day 31 continues it
  // and is numbered 31; the board rolls onto a second page. Only a missed day
  // ends a streak, and the next one then starts at day 1.

  test('a 38-day run is one streak numbered 1-30 then 31-38', () => {
    const runs = [consecutiveRun('2026-07-27', 38)];
    const pages = buildPages(runs, { today: '2026-09-16', hasLoggableDay: false });

    expect(pages).toHaveLength(2);

    expect(pages[0].type).toBe('streak');
    expect(pages[0].label).toContain('Completed');
    expect(actNos(pages[0])).toEqual([...Array(30)].map((_, i) => i + 1));

    // The 8 remaining days keep counting: 31..38, on the streak's own second
    // page. They are NOT demoted to a short streak renumbered from 1.
    expect(pages[1].type).toBe('streak');
    expect(actNos(pages[1])).toEqual([31, 32, 33, 34, 35, 36, 37, 38]);
  });

  test('the second page of a long streak is labelled LAP 2', () => {
    const runs = [consecutiveRun('2026-07-27', 38)];
    const pages = buildPages(runs, { today: '2026-09-16', hasLoggableDay: false });
    expect(pages[1].label).toContain('LAP 2');
  });

  test('a 65-day run pages as 1-30, 31-60, 61-65', () => {
    const runs = [consecutiveRun('2026-01-01', 65)];
    const pages = buildPages(runs, { today: '2026-06-01', hasLoggableDay: false });

    const streaks = pages.filter((p) => p.type === 'streak');
    expect(streaks).toHaveLength(3);
    expect(pages.filter((p) => p.type === 'consolidated')).toHaveLength(0);

    expect(actNos(streaks[0])).toEqual([...Array(30)].map((_, i) => i + 1));
    expect(actNos(streaks[1])).toEqual([...Array(30)].map((_, i) => i + 31));
    expect(actNos(streaks[2])).toEqual([61, 62, 63, 64, 65]);

    expect(streaks[1].label).toContain('LAP 2');
    expect(streaks[2].label).toContain('LAP 3');
  });

  test('a break still starts the next streak at day 1', () => {
    // 35 days, two clear days missed, then 3 more. The 35 count on past 30;
    // the 3 after the break do not.
    const long  = consecutiveRun('2026-01-01', 35);           // ends 2026-02-04
    const after = consecutiveRun('2026-02-08', 3);            // 3 days missed
    const pages = buildPages([long, after], { today: '2026-06-01', hasLoggableDay: false });

    const streaks = pages.filter((p) => p.type === 'streak');
    expect(actNos(streaks[0])).toEqual([...Array(30)].map((_, i) => i + 1));
    expect(actNos(streaks[1])).toEqual([31, 32, 33, 34, 35]);

    const shared = pages.filter((p) => p.type === 'consolidated');
    expect(shared).toHaveLength(1);
    expect(actNos(shared[0])).toEqual([1, 2, 3]);
  });

  test('a live streak past day 30 keeps counting on the current board', () => {
    const runs = [consecutiveRun('2026-08-01', 33)];          // ends 2026-09-02
    const pages = buildPages(runs, { today: '2026-09-02', hasLoggableDay: false });

    const current = pages.find((p) => p.type === 'current');
    expect(current).toBeDefined();
    expect(actNos(current)).toEqual([31, 32, 33]);

    // The empty slots ahead carry on from 34, not from 4.
    const future = current.cells.filter((c) => c.type === 'future');
    expect(future[0].dayNo).toBe(34);
  });

  test('an exactly-30-day run is a single completed page', () => {
    const runs = [consecutiveRun('2026-07-27', 30)];
    const pages = buildPages(runs, { today: '2026-09-16', hasLoggableDay: false });
    expect(pages).toHaveLength(1);
    expect(pages[0].type).toBe('streak');
    expect(actNos(pages[0])).toEqual([...Array(30)].map((_, i) => i + 1));
  });

  test('short streaks share one page with a separator between them', () => {
    const runs = [
      consecutiveRun('2026-09-10', 1),
      consecutiveRun('2026-09-12', 1),
      consecutiveRun('2026-09-14', 1),
    ];
    const pages = buildPages(runs, { today: '2026-09-30', hasLoggableDay: false });

    expect(pages).toHaveLength(1);
    expect(pages[0].type).toBe('consolidated');
    expect(actNos(pages[0])).toEqual([1, 1, 1]);
    expect(pages[0].cells.filter((c) => c.type === 'sep')).toHaveLength(2);
  });
});

describe('buildPages - unearned tiles carry no date', () => {
  // Projecting a calendar date onto a day that has not happened is a lie: miss
  // one day and every remaining label is wrong.

  test('future slots on the live board have a null date', () => {
    const runs = [consecutiveRun('2026-09-14', 3)]; // ends 2026-09-16 = today
    const pages = buildPages(runs, { today: '2026-09-16', hasLoggableDay: true });

    const current = pages.find((p) => p.type === 'current');
    expect(current).toBeDefined();

    const future = current.cells.filter((c) => c.type === 'future');
    expect(future.length).toBeGreaterThan(0);
    for (const cell of future) {
      expect(cell.date).toBeNull();
    }
  });

  test('future slots still carry their day number', () => {
    const runs = [consecutiveRun('2026-09-14', 3)];
    const pages = buildPages(runs, { today: '2026-09-16', hasLoggableDay: true });
    const current = pages.find((p) => p.type === 'current');
    const future = current.cells.filter((c) => c.type === 'future');
    for (const cell of future) {
      expect(typeof cell.dayNo).toBe('number');
    }
  });
});
