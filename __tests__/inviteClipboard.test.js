// Item 112 (18 Nov 2026): invite code carried from the website to sign-up via
// the clipboard, or typed by the person.
import { cleanInviteCode, inviteCodeFromClipboard, INVITE_MARKER } from '../src/lib/inviteClipboard';
const fs = require('fs');
const path = require('path');

test('clean codes', () => {
  expect(cleanInviteCode(' 7ql5 2gj7 ')).toBe('7QL52GJ7');
  expect(cleanInviteCode('7QL52GJ')).toBeNull();      // too short
  expect(cleanInviteCode('7QL52GJ1')).toBeNull();     // 1 is not used
  expect(cleanInviteCode('')).toBeNull();
});

test('finds the website marker', () => {
  expect(inviteCodeFromClipboard(`${INVITE_MARKER}7QL52GJ7`)).toBe('7QL52GJ7');
});

test('finds a pasted invite link', () => {
  expect(inviteCodeFromClipboard('Get started: https://30ActsofKindness.org?inv=7QL52GJ7')).toBe('7QL52GJ7');
});

test('ignores unrelated clipboard text', () => {
  expect(inviteCodeFromClipboard('call me at 917 555 0123')).toBeNull();
  expect(inviteCodeFromClipboard(null)).toBeNull();
});

test('sign-up shows the optional code box and reads the clipboard only for new people', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.js'), 'utf8');
  expect(src).toMatch(/Invited by a friend\? Their code \(optional\)/);
  expect(src).toMatch(/if \(!signupFields \|\| clipboardChecked\.current\) return;/);
  expect(src).toMatch(/setPendingInviteCode\(typedCode\)/);
  // the code is stashed BEFORE the referral is applied
  expect(src.indexOf('setPendingInviteCode(typedCode)')).toBeLessThan(src.indexOf('applyPendingReferral(formatted)'));
});
