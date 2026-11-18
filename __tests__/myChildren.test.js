// Item 109 (17 Nov 2026): an admin's Home showed another family's children
// because family_members was read without a parent filter (admins may read all rows).
const fs = require('fs');
const path = require('path');

const calls = [];
jest.mock('../src/lib/supabase', () => {
  const chain = {
    select(c) { calls.push(['select', c]); return chain; },
    eq(k, v) { calls.push(['eq', k, v]); return chain; },
    order(k) { calls.push(['order', k]); return Promise.resolve({ data: [{ first_name: 'Kid' }], error: null }); },
  };
  return {
    supabase: {
      auth: { getSession: jest.fn() },
      from(t) { calls.push(['from', t]); return chain; },
    },
  };
});
const { supabase } = require('../src/lib/supabase');
const { loadMyChildren } = require('../src/lib/myChildren');

beforeEach(() => { calls.length = 0; });

test('always filters on the signed-in parent', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'me-123' } } } });
  const r = await loadMyChildren('member_key, first_name');
  expect(calls).toContainEqual(['from', 'family_members']);
  expect(calls).toContainEqual(['eq', 'parent_id', 'me-123']);
  expect(r.data).toHaveLength(1);
});

test('signed out: no children and no query', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  const r = await loadMyChildren('member_key');
  expect(r).toEqual({ data: [], error: null });
  expect(calls).toHaveLength(0);
});

test('no screen lists family_members except through loadMyChildren', () => {
  const root = path.join(__dirname, '..', 'src');
  const offenders = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.js$/.test(e.name) || e.name === 'myChildren.js') return;
    const s = fs.readFileSync(p, 'utf8');
    // A select on family_members must be keyed (member_key / id), never a bare list.
    const re = /from\('family_members'\)\s*\.select\([^)]*\)\s*\.order\(/g;
    if (re.test(s)) offenders.push(path.relative(root, p));
  });
  walk(root);
  expect(offenders).toEqual([]);
});

test('Home pills and My Family use loadMyChildren', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  expect(read('components/ProfileSwitcher.js')).toMatch(/loadMyChildren\(/);
  expect(read('screens/FamilyScreen.js')).toMatch(/loadMyChildren\(/);
});
