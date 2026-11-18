// Item 112 (18 Nov 2026): Branch will not create links on our plan (HTTP API
// 403; the in-app SDK refused on staging too), so invite links never wait on
// Branch - they are the website link with the invite code, made instantly.
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => {}), getItem: jest.fn(async () => null), removeItem: jest.fn(async () => {}),
}));
const mockCreate = jest.fn();
jest.mock('react-native-branch', () => ({
  __esModule: true,
  default: { createBranchUniversalObject: (...a) => mockCreate(...a), subscribe: jest.fn(() => () => {}) },
}), { virtual: true });
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: '7QL52GJ7', error: null })),
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u-1' } } } })) },
  },
}));
const branch = require('../src/lib/branch');

test('invite link is made without Branch and carries only the code', async () => {
  global.fetch = jest.fn();
  const url = await branch.generateInviteLink({ phone: '+19175550123' });
  expect(url).toBe('https://30ActsofKindness.org?inv=7QL52GJ7');
  expect(mockCreate).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});
