import { buildPages } from '../src/lib/dashboardPages';

// Backlog 83 (20 Oct 2026, Bridget): "If I forgot yesterday and put in today, I
// should be able to put in yesterday." The board must always offer an empty
// yesterday, whether or not today is already logged.

function run(dates) {
  const rows = dates.map((d, i) => ({ id: `${d}-${i}`, local_date: d, act_title: 'act' }));
  return { rows, startDate: dates[0], endDate: dates[dates.length - 1], length: dates.length };
}

const current = (pages) => pages.find((p) => p.type === 'current');
const kinds   = (page) => page.cells.filter((c) => c.type !== 'future').map((c) => c.type);

describe('buildPages - yesterday can always be back-filled', () => {
  test('today logged, yesterday empty: board offers yesterday before today', () => {
    // 17-18 Oct logged, 19 Oct empty, 20 Oct (today) logged first.
    const runs = [run(['2026-10-17', '2026-10-18']), run(['2026-10-20'])];
    const pages = buildPages(runs, { today: '2026-10-20', hasLoggableDay: false, yesterdayOpen: true });
    expect(kinds(current(pages))).toEqual(['yesterday', 'act']);
  });

  test('nothing logged for 2 days: streak stays on the board, then yesterday and today', () => {
    const runs = [run(['2026-10-16', '2026-10-17', '2026-10-18'])];
    const pages = buildPages(runs, { today: '2026-10-20', hasLoggableDay: true, yesterdayOpen: true });
    expect(kinds(current(pages))).toEqual(['act', 'act', 'act', 'yesterday', 'next']);
  });

  test('last act 3+ days ago: a fresh board offers yesterday and today', () => {
    const runs = [run(['2026-10-10', '2026-10-11'])];
    const pages = buildPages(runs, { today: '2026-10-20', hasLoggableDay: true, yesterdayOpen: true });
    expect(kinds(current(pages))).toEqual(['yesterday', 'next']);
  });

  test('yesterday already logged: no yesterday tile', () => {
    const runs = [run(['2026-10-18', '2026-10-19'])];
    const pages = buildPages(runs, { today: '2026-10-20', hasLoggableDay: true, yesterdayOpen: false });
    expect(kinds(current(pages))).toEqual(['act', 'act', 'next']);
  });

  test('without the option the board behaves exactly as before', () => {
    const runs = [run(['2026-10-17', '2026-10-18']), run(['2026-10-20'])];
    const pages = buildPages(runs, { today: '2026-10-20', hasLoggableDay: false });
    expect(kinds(current(pages))).toEqual(['act']);
  });

  test('after a completed 30-day streak that ended 2 days ago, yesterday is offered', () => {
    const dates = [];
    for (let d = 1; d <= 30; d++) dates.push(`2026-09-${String(d).padStart(2, '0')}`);
    const pages = buildPages([run(dates)], { today: '2026-10-02', hasLoggableDay: true, yesterdayOpen: true });
    expect(kinds(current(pages))).toEqual(['yesterday', 'next']);
  });
});
