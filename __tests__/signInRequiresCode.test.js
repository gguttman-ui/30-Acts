// Backlog item 59, 23 Sep 2026.
//
// Every account signs in with a password made from its phone number
// (phoneProxyPassword). Until today the app used it to log a returning number
// straight in with NO text code, so knowing someone's number was enough to
// become them. The server now refuses a password sign-in without a fresh code
// check (require_otp_for_password_login hook), and the app asks for the code
// FIRST for everyone. These guard the app side. AuthScreen imports native
// modules, so this reads the source like the other screen tests.

const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.js'), 'utf8');
const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function body(head) {
  const i = code.indexOf(head);
  expect(i).toBeGreaterThan(-1);
  const next = code.indexOf('\n  const ', i + head.length);
  return code.slice(i, next === -1 ? undefined : next);
}

describe('no sign-in without a text code (item 59)', () => {
  test('the silent-login helper is gone', () => {
    expect(code).not.toMatch(/checkExistingPhoneUser/);
  });

  test('Continue sends a code and never signs in by itself', () => {
    const b = body('const handleContinue');
    expect(b).toMatch(/sendOtpFor\(formatted\)/);
    expect(b).not.toMatch(/signInWithPassword|tryExistingSignIn/);
  });

  test('the only password sign-in lives in tryExistingSignIn', () => {
    expect((code.match(/signInWithPassword\(/g) || []).length).toBe(1);
    expect(body('const tryExistingSignIn')).toMatch(/signInWithPassword\(/);
  });

  test('a real number signs in only after verify_phone_otp approves', () => {
    const b = body('const handleVerifyOtp');
    const approved = b.indexOf("body?.status === 'approved'");
    expect(approved).toBeGreaterThan(-1);
    expect(b.indexOf('verify_phone_otp')).toBeLessThan(approved);
    expect(b.indexOf('tryExistingSignIn(formatted)', approved)).toBeGreaterThan(approved);
  });

  test('a new number is asked for name and ZIP only after its code is verified', () => {
    const b = body('const handleVerifyOtp');
    expect(b).toMatch(/setCodeVerified\(true\)/);
    const create = body('const handleSignupSend');
    expect(create).toMatch(/if \(!codeVerified\)/);
    expect(create).toMatch(/supabase\.auth\.signUp\(/);
  });

  test('editing the number throws away an earlier verification', () => {
    expect(body('const handlePhoneChange')).toMatch(/setCodeVerified\(false\)/);
  });
});
