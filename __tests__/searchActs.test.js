import { filterActs, actDateLabel } from '../src/lib/searchActs';
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const rows = [
  { id: 1, act_title: 'Carried boxes up for my neighbor Patti', local_date: '2026-11-03' },
  { id: 2, act_title: 'Sent a thank-you note to my teacher', local_date: '2026-10-20' },
  { id: 3, act_title: '', local_date: '2026-10-19' },
  { id: 4, act_title: 'Thank you call to NEIGHBOR Bob', completed_at: '2026-10-01T15:00:00Z' },
];

describe('Search my acts', () => {
  test('empty search lists every act that has text', () => {
    expect(filterActs(rows, '').map((r) => r.id)).toEqual([1, 2, 4]);
  });
  test('case-insensitive', () => {
    expect(filterActs(rows, 'neighbor').map((r) => r.id)).toEqual([1, 4]);
  });
  test('every word must match, any order', () => {
    expect(filterActs(rows, 'thank note').map((r) => r.id)).toEqual([2]);
    expect(filterActs(rows, 'bob thank').map((r) => r.id)).toEqual([4]);
  });
  test('no match gives an empty list', () => {
    expect(filterActs(rows, 'zebra')).toEqual([]);
  });
  test('finds names written in the story (notes), not only the title', () => {
    const withStories = [
      { id: 5, act_title: 'Brought soup to a sick friend', notes: 'Patti had the flu so I made her chicken soup' },
      { id: 6, act_title: 'Helped a coworker', notes: 'Stayed late to help Michał finish his report' },
      { id: 7, act_title: '', notes: 'Drove Patti to the doctor' },
      { id: 8, act_title: 'Held the door', notes: null },
    ];
    expect(filterActs(withStories, 'patti').map((r) => r.id)).toEqual([5, 7]);
    expect(filterActs(withStories, 'Michal').map((r) => r.id)).toEqual([6]);
    expect(filterActs(withStories, 'michał report').map((r) => r.id)).toEqual([6]);
    expect(filterActs(withStories, '').map((r) => r.id)).toEqual([5, 6, 7, 8]);
  });
  test('curly and straight apostrophes match', () => {
    const r = [{ id: 9, act_title: 'Fixed my neighbor’s fence' }];
    expect(filterActs(r, "neighbor's").map((x) => x.id)).toEqual([9]);
  });
  test('screen loads and shows the story', () => {
    const src = read('src/screens/SearchActsScreen.js');
    expect(src).toMatch(/select\('id, act_title, notes,/);
    expect(src).toMatch(/item\.notes/);
  });
  test('date label from local_date, else completed_at', () => {
    expect(actDateLabel(rows[0])).toBe('Nov 3, 2026');
    expect(actDateLabel(rows[3])).toMatch(/Oct 1, 2026|Sep 30, 2026/);
  });
  test('searches all acts (no restart-marker cut-off) for the selected person', () => {
    const src = read('src/screens/SearchActsScreen.js');
    expect(src).toMatch(/actingPhone\(user\?\.email\)/);
    expect(src).not.toMatch(/gte\('completed_at'/);
  });
  test('reachable from Home and from Me', () => {
    expect(read('src/screens/HomeScreen.js')).toMatch(/navigate\('SearchActs'\)/);
    expect(read('src/screens/SettingsScreen.js')).toMatch(/Search my acts/);
    expect(read('src/navigation/index.js')).toMatch(/name="SearchActs"/);
  });
});
