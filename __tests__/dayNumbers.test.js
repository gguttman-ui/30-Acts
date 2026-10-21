import { streakDayNumbers, dayNumberFixes, daysBetween } from '../src/lib/dayNumbers';

// Backlog 83 (20 Oct 2026): a day number is the position in the current
// streak -- consecutive days, restarting at 1 after any missed day.

describe('streakDayNumbers', () => {
  test('consecutive days count up from 1', () => {
    const m = streakDayNumbers(['2026-10-18', '2026-10-19', '2026-10-20']);
    expect([...m.values()]).toEqual([1, 2, 3]);
  });

  test('a missed day restarts the count at 1', () => {
    // Bridget: 9 Oct, 10 Oct missed, then 11-20 Oct -> today is day 10.
    const dates = ['2026-10-09'];
    for (let d = 11; d <= 20; d++) dates.push(`2026-10-${d}`);
    const m = streakDayNumbers(dates);
    expect(m.get('2026-10-11')).toBe(1);
    expect(m.get('2026-10-20')).toBe(10);
  });

  test('order and duplicates do not matter', () => {
    const m = streakDayNumbers(['2026-10-20', '2026-10-19', '2026-10-19', '2026-10-18']);
    expect(m.get('2026-10-20')).toBe(3);
    expect(m.size).toBe(3);
  });

  test('month and year boundaries are consecutive', () => {
    const m = streakDayNumbers(['2026-10-31', '2026-11-01', '2026-12-31', '2027-01-01']);
    expect(m.get('2026-11-01')).toBe(2);
    expect(m.get('2027-01-01')).toBe(2);
  });

  test('daysBetween ignores daylight-saving changes', () => {
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1); // US DST ends 1 Nov
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
  });
});

describe('dayNumberFixes', () => {
  test('logging today before yesterday, then back-filling yesterday, renumbers today', () => {
    // The exact sequence Bridget hit: 18 Oct logged as day 5, today (20 Oct)
    // logged while 19 Oct was empty -> stored as 1. Then 19 Oct is back-filled.
    const rows = [
      { id: 'a', local_date: '2026-10-18', day_number: 5 },
      { id: 'b', local_date: '2026-10-19', day_number: 6 },
      { id: 'c', local_date: '2026-10-20', day_number: 1 },
      { id: 'x', local_date: '2026-10-14', day_number: 1 },
      { id: 'y', local_date: '2026-10-15', day_number: 2 },
      { id: 'z', local_date: '2026-10-16', day_number: 3 },
      { id: 'w', local_date: '2026-10-17', day_number: 4 },
    ];
    expect(dayNumberFixes(rows)).toEqual([{ id: 'c', day_number: 7 }]);
  });

  test('nothing to fix when every number is already right', () => {
    const rows = [
      { id: 1, local_date: '2026-10-01', day_number: 1 },
      { id: 2, local_date: '2026-10-02', day_number: 2 },
      { id: 3, local_date: '2026-10-04', day_number: 1 },
    ];
    expect(dayNumberFixes(rows)).toEqual([]);
  });

  test('rows without a date or id are skipped, not crashed on', () => {
    expect(dayNumberFixes([null, { id: 1 }, { local_date: '2026-10-01', day_number: 9 }])).toEqual([]);
  });
});
