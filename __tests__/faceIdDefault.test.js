// David's UX review fix 1 (18 Nov 2026): open straight to Today.
let mockStore = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k) => (k in mockStore ? mockStore[k] : null)),
  setItem: jest.fn(async (k, v) => { mockStore[k] = v; }),
  removeItem: jest.fn(async (k) => { delete mockStore[k]; }),
}));
const { faceIdLockOn, FACEID_KEY, FACEID_RESET_KEY } = require('../src/lib/faceIdDefault');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

beforeEach(() => { mockStore = {}; });

test('existing users who had the lock on get it switched off once', async () => {
  mockStore[FACEID_KEY] = 'true';
  expect(await faceIdLockOn()).toBe(false);
  expect(mockStore[FACEID_KEY]).toBeUndefined();
  expect(mockStore[FACEID_RESET_KEY]).toBe('1');
});

test('after the reset, turning it on in Me is respected', async () => {
  mockStore[FACEID_RESET_KEY] = '1';
  mockStore[FACEID_KEY] = 'true';
  expect(await faceIdLockOn()).toBe(true);
});

test('new users: off', async () => {
  expect(await faceIdLockOn()).toBe(false);
});

test('App and Me use the same rule; unlock does not wait for loading', () => {
  const app = read('App.js');
  expect(app).not.toMatch(/getItem\('biometric_enabled'\)/);
  expect((app.match(/await faceIdLockOn\(\)/g) || []).length).toBe(2);
  expect(app).not.toMatch(/await reloadDays\(user\.email\);\s*setBiometricLocked\(false\)/);
  expect(read('src/screens/SettingsScreen.js')).toMatch(/setBiometricEnabled\(await faceIdLockOn\(\)\)/);
});

test('lock screen shows its buttons only when Face ID fails', () => {
  const lock = read('src/screens/LockScreen.js');
  expect(lock).toMatch(/if \(status !== 'failed'\) \{/);
});

test('no launch pop-up on Home', () => {
  expect(read('src/screens/HomeScreen.js')).not.toMatch(/documentPrompt/);
});
