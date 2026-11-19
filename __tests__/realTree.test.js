// David's UX fix 9 (19 Nov 2026): make the tree real.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
const L = require('../src/lib/treeLayout');
const { LABELS } = require('../src/lib/myNumbers');

describe('leaf positions', () => {
  test('one leaf per act, filling preset spots in order, inside the crown', () => {
    const p = L.ownLeafPositions(10);
    expect(p).toHaveLength(10);
    expect(L.ownLeafPositions(11).slice(0, 10)).toEqual(p);   // fill in order: earlier leaves never move
    for (const q of L.ownLeafPositions(L.MAX_OWN_LEAVES)) {
      expect(Math.hypot(q.x - L.CROWN.cx, q.y - L.CROWN.cy)).toBeLessThanOrEqual(L.CROWN.r + 0.001);
    }
    expect(L.ownLeafPositions(500)).toHaveLength(L.MAX_OWN_LEAVES);
  });
  test('branches go left and right, each with its own leaves', () => {
    expect(L.branchShape(0).side).toBe(-1);
    expect(L.branchShape(1).side).toBe(1);
    expect(L.branchLeafPositions(0, 5)).toHaveLength(5);
    expect(L.branchLeafPositions(0, 99)).toHaveLength(L.MAX_BRANCH_LEAVES);
    const all = L.ownLeafPositions(1).concat(L.branchLeafPositions(0, 1));
    all.forEach((q) => { expect(q.x).toBeGreaterThan(0); expect(q.x).toBeLessThan(L.VIEW_W); });
  });
  test('more people than branches: the rest are counted', () => {
    expect(L.visibleBranches([5, 4, 3, 2, 1, 1, 1, 1, 1, 0])).toEqual({ shown: [5, 4, 3, 2, 1, 1, 1, 1], hidden: 2 });
    expect(L.visibleBranches(null)).toEqual({ shown: [], hidden: 0 });
  });
});

describe('Tree screen', () => {
  const TREE = read('src', 'screens', 'TreeScreen.js');
  const DRAW = read('src', 'components', 'KindnessTree.js');
  const SQL  = read('supabase', 'migrations', '20261119_tree_branches.sql');
  test('dark green leaves for you, light green for friends, newest gold', () => {
    expect(DRAW).toMatch(/fill=\{i === newest \? GOLD : OWN\}/);
    expect(DRAW).toMatch(/fill=\{FRIEND\} onPress=\{onFriendLeaf\}/);
  });
  test('tapping your leaf shows its story and date; a friend\'s stays private', () => {
    expect(TREE).toMatch(/actDateLabel\(picked\.own\)/);
    expect(TREE).toMatch(/picked\.own\.notes \|\| picked\.own\.act_title/);
    expect(TREE).toContain('An act of kindness by someone you inspired.');
  });
  test("David's three numbers", () => {
    expect(LABELS.invitedPeople).toBe('People you inspired');
    expect(LABELS.treeActs).toBe('Acts on your tree');
  });
  test('Invite someone shares the invite link, never a phone number', () => {
    expect(TREE).toMatch(/<Btn label="Invite someone" onPress=\{invite\}/);
    expect(TREE).toMatch(/generateInviteLink\(\{ phone/);
    expect(TREE).not.toMatch(/message: `[^`]*phone/);
  });
  test('server sends counts only (no names, phones or stories)', () => {
    expect(SQL).toMatch(/json_agg\(acts order by acts desc\)/);
    expect(SQL).not.toMatch(/json_agg\([^)]*(phone|notes|name)/);
    expect(TREE).toMatch(/supabase\.rpc\('get_tree_branches'\)/);
  });
});

// Gary 19 Nov 2026: tap "People you inspired" for a list with act counts.
describe('People you inspired list', () => {
  const TREE = read('src', 'screens', 'TreeScreen.js');
  const SQL  = read('supabase', 'migrations', '20261119_tree_people.sql');
  test('tapping the number opens the list', () => {
    expect(TREE).toMatch(/<TouchableOpacity style=\{s\.stat\} onPress=\{openPeople\}/);
    expect(TREE).toMatch(/supabase\.rpc\('get_tree_people'\)/);
    expect(TREE).toMatch(/\{p\.name\}/);
    expect(TREE).toMatch(/\{p\.acts\} \{p\.acts === 1 \? 'act' : 'acts'\}/);
  });
  test('server sends first name + last initial and a count - no phone, email or story', () => {
    expect(SQL).toMatch(/left\(trim\(p\.last_name\), 1\) \|\| '\.'/);
    expect(SQL).toMatch(/json_build_object\('name', name, 'acts', acts\)/);
    const out = SQL.slice(SQL.indexOf('json_agg'));
    expect(out).not.toMatch(/phone|email|notes/);
    expect(SQL).toContain("'A former member'");
  });
});
