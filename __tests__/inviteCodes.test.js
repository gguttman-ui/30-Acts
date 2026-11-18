// UX review fix 4 (18 Nov 2026): no phone number in any invite link, QR code
// or shared text. Links carry ?inv=<code>; old ref=<phone> links still work.
const fs = require('fs');
const path = require('path');

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    setItem: jest.fn(async (k, v) => { store[k] = v; }),
    getItem: jest.fn(async (k) => store[k] ?? null),
    removeItem: jest.fn(async (k) => { delete store[k]; }),
  };
});
jest.mock('react-native-branch', () => { throw new Error('no native'); }, { virtual: true });

const mockRpc = jest.fn();
const mockProfileUpdates = [];
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (...a) => mockRpc(...a),
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u-1' } } } })),
      getUser: jest.fn(async () => ({ data: { user: { id: 'u-new' } } })),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { referred_by: null } }) }) }),
      update: (v) => { mockProfileUpdates.push(v); return { eq: async () => ({}) }; },
      upsert: async (v) => { mockProfileUpdates.push(v); return {}; },
    }),
  },
}));

const branch = require('../src/lib/branch');
const PHONE = '+19175550123';

beforeEach(() => {
  mockRpc.mockReset();
  mockProfileUpdates.length = 0;
  branch.resetInviteCodeCache();
  global.fetch = jest.fn(async (url, opts) => ({ ok: true, json: async () => ({ url: 'https://airpa.app.link/abc', sent: JSON.parse(opts.body) }) }));
});

test('website fallback has the code, never the phone', () => {
  expect(branch.websiteInviteUrl('7KQ2MXRP')).toBe('https://30ActsofKindness.org?inv=7KQ2MXRP');
  expect(branch.websiteInviteUrl(null, 'GRP1')).toBe('https://30ActsofKindness.org?group=GRP1');
});

test('Branch link data carries inv, not the phone', async () => {
  mockRpc.mockResolvedValue({ data: '7KQ2MXRP', error: null });
  const url = await branch.generateInviteLink({ phone: PHONE, group: 'GRP1' });
  expect(url).toBe('https://airpa.app.link/abc');
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.data.inv).toBe('7KQ2MXRP');
  expect(body.data.ref).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain('9175550123');
});

test('if the code lookup fails, still no phone anywhere', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
  const url = await branch.generateInviteLink({ phone: PHONE });
  expect(url).not.toContain('9175550123');
});

test('signed out: plain site link', async () => {
  expect(await branch.generateInviteLink({})).toBe('https://30ActsofKindness.org');
});

test('new links: the database credits the inviter from the code', async () => {
  await AsyncStorageSet({ inv: 'ABCDEFGH', ref: null, group: null });
  mockRpc.mockResolvedValue({ data: true, error: null });
  await branch.applyPendingReferral('+15550000000');
  expect(mockRpc).toHaveBeenCalledWith('apply_invite_code', { p_code: 'ABCDEFGH' });
  expect(mockProfileUpdates).toHaveLength(0);
});

test('old links with a phone still credit the inviter', async () => {
  await AsyncStorageSet({ inv: null, ref: PHONE, group: null });
  await branch.applyPendingReferral('+15550000000');
  expect(mockProfileUpdates).toContainEqual({ referred_by: PHONE });
});

async function AsyncStorageSet(v) {
  const AS = require('@react-native-async-storage/async-storage');
  await branch.clearPendingReferral();
  await AS.setItem('pending_referral', JSON.stringify(v));
}

test('no screen builds a link with a phone number', () => {
  const root = path.join(__dirname, '..', 'src');
  const bad = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.js$/.test(e.name)) return;
    const s = fs.readFileSync(p, 'utf8');
    if (/\?ref=\$\{/.test(s) || /ref:\s*String\(phone\)/.test(s)) bad.push(path.relative(root, p));
  });
  walk(root);
  expect(bad).toEqual([]);
});

test('database functions exist and the table is locked', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261118_invite_codes.sql'), 'utf8');
  expect(sql).toMatch(/enable row level security/);
  expect(sql).not.toMatch(/create policy/i);
  expect(sql).toMatch(/function public\.my_invite_code\(\)/);
  expect(sql).toMatch(/function public\.apply_invite_code\(p_code text\)/);
  expect(sql).toMatch(/revoke all on function public\.apply_invite_code\(text\) from public, anon/);
});
