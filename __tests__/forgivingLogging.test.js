// David's UX fix 7 (18 Nov 2026): make logging forgiving.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const { ALL_ACTS } = require('../src/constants');
const { searchActs, searchScore, editDistance } = require('../src/lib/actSearch');
const { ACT_TAGS, actTags, filterByTags } = require('../src/lib/actTags');

const LIST = ALL_ACTS.filter((a) => a.categoryLabel !== 'Company');
const titles = (r) => r.results.map((a) => a.title);

describe('forgiving search', () => {
  test('"bout" finds "Bought a coffee for a stranger" (David\'s example)', () => {
    const r = searchActs(LIST, 'bout');
    expect(titles(r)).toContain('Bought a coffee for a stranger');
    expect(r.closest).toBe(true);
  });
  test('capitals do not matter', () => {
    expect(titles(searchActs(LIST, 'COFFEE'))).toEqual(titles(searchActs(LIST, 'coffee')));
  });
  test('a typo or two', () => {
    expect(titles(searchActs(LIST, 'cofee'))).toContain('Bought a coffee for a stranger');
    expect(titles(searchActs(LIST, 'nieghbor'))).toContain('Left a kind note for a neighbor');
    expect(titles(searchActs(LIST, 'strnger'))).toContain('Bought a coffee for a stranger');
  });
  test('exact matches come first and are not "closest"', () => {
    const r = searchActs(LIST, 'groceries');
    expect(r.closest).toBe(false);
    expect(r.results.every((a) => /groceries/i.test(a.title))).toBe(true);
  });
  test('short words need to be right, so nonsense finds nothing', () => {
    expect(searchActs(LIST, 'dog').results).toHaveLength(0);
    expect(searchActs(LIST, 'xyzzy').results).toHaveLength(0);
  });
  test('empty search shows everything', () => {
    expect(searchActs(LIST, '  ').results).toBe(LIST);
  });
  test('helpers', () => {
    expect(editDistance('kitten', 'sitten')).toBe(1);
    expect(searchScore('Helped a neighbor', 'helped')).toBe(0);
  });
});

describe('category chips', () => {
  test('the eight chips David suggested', () => {
    expect(ACT_TAGS.map((t) => t.label)).toEqual([
      'Quick', 'Costs nothing', 'Strangers', 'Neighbors', 'Family', 'Friends', 'Co-workers', 'Community',
    ]);
  });
  test('171 acts in the list', () => expect(LIST).toHaveLength(171));
  test('Quick = 5 minutes or less, Costs nothing = $0', () => {
    for (const a of LIST) {
      expect(actTags(a).includes('quick')).toBe(a.timeMinutes <= 5);
      expect(actTags(a).includes('free')).toBe(a.costDollars === 0);
    }
  });
  test('people tags come from the title', () => {
    const t = (id) => actTags(LIST.find((a) => a.id === id));
    expect(t('gg-016')).toContain('strangers');   // coffee for a stranger
    expect(t('hh-004')).toContain('neighbors');   // shoveled snow for a neighbor
    expect(t('lp-002')).toContain('family');
    expect(t('kw-018')).toContain('friends');
    expect(t('hh-044')).toContain('coworkers');
    expect(t('hh-031')).toContain('community');   // volunteered at a food bank
    expect(t('gg-013')).not.toContain('family');  // a family in need is not yours
  });
  test('chips combine (every chosen chip must match)', () => {
    const r = filterByTags(LIST, ['neighbors', 'free']);
    expect(r.length).toBeGreaterThan(0);
    r.forEach((a) => { expect(actTags(a)).toEqual(expect.arrayContaining(['neighbors', 'free'])); });
    expect(filterByTags(LIST, [])).toBe(LIST);
  });
});

describe('screens', () => {
  const PICK = read('src', 'screens', 'ChooseActScreen.js');
  const STORY = read('src', 'screens', 'MyStoryScreen.js');
  test('tapping an act returns to the log screen; no Pick an Act / Select Act', () => {
    expect(PICK).toMatch(/onPress=\{\(\) => handleCreate\(item\)\}/);
    expect(PICK).not.toMatch(/Pick an Act|Select Act/);
  });
  test('"Write my own instead" at the bottom of the list', () => {
    expect(PICK).toMatch(/<Btn label="Write my own instead" variant="secondary" onPress=\{writeOwn\} \/>/);
  });
  test('the list uses the forgiving search and the chips', () => {
    expect(PICK).toMatch(/searchActs\(base, search\)/);
    expect(PICK).toMatch(/filterByTags\(/);
    expect(PICK).toMatch(/No exact match\. Closest/);
  });
  test('Save works with any text: no 10-character minimum, no "more to start"', () => {
    expect(STORY).toMatch(/const STORY_MIN = 1;/);
    expect(STORY).not.toMatch(/more to start/);
    expect(STORY).not.toMatch(/at least \$\{STORY_MIN\} characters/);
  });
});
