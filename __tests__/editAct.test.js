// Item 34 (28 Oct 2026): edit the text of today's or yesterday's act only.
import { canEditAct, dayBefore } from '../src/lib/editWindow';
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('edit window: today and yesterday only', () => {
  test('today and yesterday can be edited', () => {
    expect(canEditAct('2026-10-28', '2026-10-28')).toBe(true);
    expect(canEditAct('2026-10-27', '2026-10-28')).toBe(true);
  });

  test('two days ago or older cannot', () => {
    expect(canEditAct('2026-10-26', '2026-10-28')).toBe(false);
    expect(canEditAct('2026-09-30', '2026-10-28')).toBe(false);
  });

  test('a future date cannot (phone clock moved back)', () => {
    expect(canEditAct('2026-10-29', '2026-10-28')).toBe(false);
  });

  test('month, year and clock-change boundaries', () => {
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    expect(canEditAct('2026-10-31', '2026-11-01')).toBe(true);
  });

  test('missing or malformed dates cannot be edited', () => {
    expect(canEditAct(null, '2026-10-28')).toBe(false);
    expect(canEditAct('2026-10-28', null)).toBe(false);
    expect(dayBefore('28/10/2026')).toBeNull();
  });
});

describe('My Story screen wiring', () => {
  const SRC = read('src/screens/MyStoryScreen.js');

  test('Edit shows only inside the window', () => {
    expect(SRC).toMatch(/const canEdit = !!completedId && canEditAct\(actDate, todayStr\(\)\);/);
    expect(SRC).toMatch(/\{canEdit \? \(\s*<TouchableOpacity onPress=\{startEdit\}/);
  });

  test('saving an edit UPDATES the same row by id, never delete + insert', () => {
    const body = SRC.slice(SRC.indexOf('const handleSaveEdit'), SRC.indexOf('const handleSave = async'));
    expect(body).toMatch(/\.update\(\{ notes: story\.trim\(\) \}\)/);
    expect(body).toMatch(/\.eq\('id', editingId\)/);
    expect(body).toMatch(/\.eq\('user_phone', phone\)/);
    expect(body).not.toMatch(/\.delete\(\)/);
    expect(body).not.toMatch(/\.insert\(/);
  });

  test('an edit goes through the same content check', () => {
    const body = SRC.slice(SRC.indexOf('const handleSaveEdit'), SRC.indexOf('const handleSave = async'));
    expect(body).toMatch(/isContentBlocked\(textToCheck\)/);
  });

  test('Save routes to the edit path while editing', () => {
    const save = SRC.slice(SRC.indexOf('const handleSave = async'));
    expect(save.indexOf('if (editingId)')).toBeGreaterThan(-1);
    expect(save.indexOf('if (editingId)')).toBeLessThan(save.indexOf(".from('completions')"));
  });
});

describe('database rule', () => {
  const SQL = read('supabase/migrations/20261028_guard_old_act_edits.sql');

  test('blocks text edits on acts older than yesterday for signed-in users only', () => {
    expect(SQL).toMatch(/auth\.role\(\), ''\) = 'authenticated'/);
    expect(SQL).toMatch(/new\.notes is distinct from old\.notes/);
    expect(SQL).toMatch(/old\.local_date::date < \(\(now\(\) at time zone 'Etc\/GMT\+12'\)::date - 1\)/);
    expect(SQL).toMatch(/before update on public\.completions/);
  });
});
