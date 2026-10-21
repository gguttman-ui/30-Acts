import { streakDayNumbers } from '../src/lib/dayNumbers';
import { buildPages } from '../src/lib/dashboardPages';

// Gary, 21 Oct 2026: acts count where the person physically is - the date on
// their phone. These are his travel examples, run through the real logic.

function days(start, n) {
  const out = [];
  const [y, m, d] = start.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}
const run = (dates) => ({
  rows: dates.map((d) => ({ id: d, local_date: d })),
  startDate: dates[0], endDate: dates[dates.length - 1], length: dates.length,
});

describe('travel', () => {
  test('Chicago to Paris: 15-day streak, next act in Paris is day 16', () => {
    // Day 15 logged 5:00 PM Central on 21 Oct (phone date 21 Oct). Flies 9:30 PM
    // Central, lands Paris 10:30 AM on 22 Oct. At 4:30 PM in Paris the phone
    // shows 22 Oct, so the act is saved as 22 Oct.
    const streak = days('2026-10-07', 15);            // 7-21 Oct
    expect(streak[14]).toBe('2026-10-21');

    // The Paris board: 21 Oct is "yesterday" on the phone, so the streak is
    // still live and today's "+" continues it (no yesterday tile needed).
    const pages = buildPages([run(streak)], { today: '2026-10-22', hasLoggableDay: true, yesterdayOpen: false });
    const cur = pages.find((p) => p.type === 'current');
    expect(cur.cells.filter((c) => c.type === 'act')).toHaveLength(15);
    expect(cur.cells.some((c) => c.type === 'next')).toBe(true);

    // After saving 22 Oct, it is day 16.
    expect(streakDayNumbers([...streak, '2026-10-22']).get('2026-10-22')).toBe(16);
  });

  test('flying west over the date line skips a phone date - yesterday can still be added', () => {
    // Day 15 on 21 Oct in Los Angeles, lands Tokyo on 23 Oct: the phone never
    // showed 22 Oct. The board offers 22 Oct as YESTERDAY, so the streak survives.
    const streak = days('2026-10-07', 15);            // ends 21 Oct
    const pages = buildPages([run(streak)], { today: '2026-10-23', hasLoggableDay: true, yesterdayOpen: true });
    const cur = pages.find((p) => p.type === 'current');
    const kinds = cur.cells.filter((c) => c.type !== 'future').map((c) => c.type);
    expect(kinds.slice(-2)).toEqual(['yesterday', 'next']);

    const numbers = streakDayNumbers([...streak, '2026-10-22', '2026-10-23']);
    expect(numbers.get('2026-10-23')).toBe(17);
  });
});
