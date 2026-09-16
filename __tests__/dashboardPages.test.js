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

describe('buildPages - a streak ends at day 30', () => {
  // The August 2026 decision: day 30 CLOSES a streak. Day 31 is not a
  // continuation and there is no "lap 2".

  test('a 38-day run becomes a completed 30 plus an 8-day short streak', () => {
    const runs = [consecutiveRun('2026-07-27', 38)];
    const pages = buildPages(runs, { today: '2026-09-16', hasLoggableDay: false });

    expect(pages).toHaveLength(2);

    expect(pages[0].type).toBe('streak');
    expect(pages[0].label).toContain('Completed');
    expect(actNos(pages[0])).toEqual([...Array(30)].map((_, i) => i + 1));

    // The remaining 8 days are an ordinary short streak, renumbered from 1,
    // packed onto the shared page rather than given one of their own.
    expect(pages[1].type).toBe('consolidated');
    expect(actNos(pages[1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('no page is ever labelled LAP', () => {
    const runs = [consecutiveRun('2026-07-27', 38)];
    const pages = buildPages(runs, { today: '2026-09-16', hasLoggableDay: false });
    for (const p of pages) {
      expect(p.label || '').not.toContain('LAP');
    }
  });

  test('a 65-day run becomes two completed streaks and a 5-day remainder', () => {
    const runs = [consecutiveRun('2026-01-01', 65)];
    const pages = buildPages(runs, { today: '2026-06-01', hasLoggableDay: false });

    const completed = pages.filter((p) => p.type === 'streak');
    expect(completed).toHaveLength(2);

    // Both completed boards number 1..30. The second must NOT read 31..60.
    expect(actNos(completed[0])).toEqual([...Array(30)].map((_, i) => i + 1));
    expect(actNos(completed[1])).toEqual([...Array(30)].map((_, i) => i + 1));

    const shared = pages.filter((p) => p.type === 'consolidated');
    expect(shared).toHaveLength(1);
    expect(actNos(shared[0])).toEqual([1, 2, 3, 4, 5]);
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
