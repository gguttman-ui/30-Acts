// Backlog 94, children's profiles Stage 1 (1 Nov 2026).
//
// The member key is the only link between a child and their acts, and the
// database refuses any key that does not start with the parent's own phone
// plus "-". These tests pin the key format, the name rule, the age ranges
// (which must match the family_members CHECK constraint), and the wiring
// Settings > Family.
const fs   = require('fs');
const path = require('path');
import {
  AGE_RANGES, MAX_CHILDREN, FAMILY_CONSENT_TEXT, FAMILY_CONSENT_VERSION,
  childNameProblem, nextMemberKey, isMemberKey,
  CODE_EXEMPT_PHONES, DEMO_CODE, isCodeExempt, cleanCode, codeWasSent, codeApproved,
} from '../src/lib/family';

const P = '+19177218269';

describe('nextMemberKey', () => {
  test('first child gets -01', () => {
    expect(nextMemberKey(P, [])).toBe('+19177218269-01');
  });

  test('uses one more than the highest suffix, not the first gap', () => {
    expect(nextMemberKey(P, [`${P}-01`, `${P}-03`])).toBe(`${P}-04`);
  });

  test('ignores keys that belong to another parent', () => {
    expect(nextMemberKey(P, ['+15550100142-05'])).toBe(`${P}-01`);
  });

  test('always starts with the parent phone plus "-" (what the database requires)', () => {
    const k = nextMemberKey(P, [`${P}-02`]);
    expect(k.startsWith(`${P}-`)).toBe(true);
  });

  test('refuses once the family is full', () => {
    const keys = Array.from({ length: MAX_CHILDREN }, (_, i) => `${P}-${String(i + 1).padStart(2, '0')}`);
    expect(nextMemberKey(P, keys)).toBeNull();
  });

  test('refuses with no parent phone', () => {
    expect(nextMemberKey(null, [])).toBeNull();
    expect(nextMemberKey('', [])).toBeNull();
  });
});

describe('isMemberKey', () => {
  test('a child key is recognised, an adult phone is not', () => {
    expect(isMemberKey(`${P}-01`)).toBe(true);
    expect(isMemberKey(P)).toBe(false);
    expect(isMemberKey(null)).toBe(false);
  });
});

describe('childNameProblem', () => {
  test('a normal first name is fine', () => {
    expect(childNameProblem('Mia')).toBe('');
    expect(childNameProblem('  José ')).toBe('');
  });

  test('blank, digits or punctuation alone are refused', () => {
    expect(childNameProblem('')).not.toBe('');
    expect(childNameProblem('   ')).not.toBe('');
    expect(childNameProblem('123')).not.toBe('');
    expect(childNameProblem('.')).not.toBe('');
  });

  test('over 30 characters is refused (database limit)', () => {
    expect(childNameProblem('A'.repeat(31))).not.toBe('');
    expect(childNameProblem('A'.repeat(30))).toBe('');
  });
});

describe('age ranges and consent', () => {
  test('age ranges match the family_members CHECK constraint', () => {
    expect(AGE_RANGES).toEqual(['6-9', '10-12', '13-17']);
  });

  test('consent wording says removal permanently erases the acts', () => {
    expect(FAMILY_CONSENT_TEXT).toMatch(/parent or legal guardian/);
    expect(FAMILY_CONSENT_TEXT).toMatch(/permanently erases/);
    expect(FAMILY_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Settings > Family wiring', () => {
  const root = path.join(__dirname, '..');
  const NAV      = fs.readFileSync(path.join(root, 'src', 'navigation', 'index.js'), 'utf8');
  const SETTINGS = fs.readFileSync(path.join(root, 'src', 'screens', 'SettingsScreen.js'), 'utf8');
  const FAMILY   = fs.readFileSync(path.join(root, 'src', 'screens', 'FamilyScreen.js'), 'utf8');

  test('the Family screen is registered and given the user', () => {
    expect(NAV).toMatch(/import FamilyScreen\s+from '..\/screens\/FamilyScreen'/);
    expect(NAV).toMatch(/<Stack\.Screen name="Family">[\s\S]*?<FamilyScreen \{\.\.\.props\} user=\{user\} \/>/);
  });

  test('Settings opens it', () => {
    expect(SETTINGS).toContain("navigation.navigate('Family')");
  });

  test('the screen saves the consent version and uses nextMemberKey', () => {
    expect(FAMILY).toContain('consent_version: FAMILY_CONSENT_VERSION');
    expect(FAMILY).toContain('nextMemberKey(parentPhone');
  });

  test('removal warns that it is permanent', () => {
    expect(FAMILY).toMatch(/permanently erases/);
    expect(FAMILY).toContain("from('family_members').delete()");
  });
});

describe('text-code check before adding a child', () => {
  const root = path.join(__dirname, '..');
  const FAMILY = fs.readFileSync(path.join(root, 'src', 'screens', 'FamilyScreen.js'), 'utf8');
  const AUTH   = fs.readFileSync(path.join(root, 'src', 'screens', 'AuthScreen.js'), 'utf8');

  test('only the two test accounts skip the real text, and they use 123456', () => {
    expect(CODE_EXEMPT_PHONES).toEqual(['+15550100100', '+15550100142']);
    expect(DEMO_CODE).toBe('123456');
    expect(isCodeExempt('+15550100142')).toBe(true);
    expect(isCodeExempt('+19177218269')).toBe(false);
  });

  test('the demo code matches the one sign-in uses', () => {
    expect(AUTH).toContain(`const DEMO_OTP       = '${DEMO_CODE}'`);
  });

  test('cleanCode keeps up to six digits', () => {
    expect(cleanCode(' 12-34 56 7')).toBe('123456');
    expect(cleanCode(null)).toBe('');
  });

  test('codeWasSent reads send_phone_otp', () => {
    expect(codeWasSent({ status: 201 })).toBe(true);
    expect(codeWasSent({ status: 200 })).toBe(true);
    expect(codeWasSent({ status: 400 })).toBe(false);
    expect(codeWasSent(null)).toBe(false);
  });

  test('codeApproved reads verify_phone_otp (body as text or object)', () => {
    expect(codeApproved({ status: 200, body: '{"status":"approved"}' })).toBe(true);
    expect(codeApproved({ status: 200, body: { status: 'approved' } })).toBe(true);
    expect(codeApproved({ status: 200, body: '{"status":"pending"}' })).toBe(false);
    expect(codeApproved({ status: 200, body: 'not json' })).toBe(false);
    expect(codeApproved(null)).toBe(false);
  });

  test('the screen sends a code, checks it, and only then saves the child', () => {
    const send   = FAMILY.indexOf("rpc('send_phone_otp'");
    const verify = FAMILY.indexOf("rpc('verify_phone_otp'");
    const insert = FAMILY.indexOf("from('family_members').insert(");
    expect(send).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(send);
    expect(insert).toBeGreaterThan(verify);
  });

  test('a refusal from the database rule tells the parent to send a new code', () => {
    expect(FAMILY).toContain("error.code === '42501'");
    expect(FAMILY).toMatch(/Send code again/);
  });
});

describe('Privacy Policy and Terms describe family profiles (approved 2 Nov 2026)', () => {
  const root = path.join(__dirname, '..');
  const LEGAL = fs.readFileSync(path.join(root, 'src', 'screens', 'LegalScreen.js'), 'utf8');
  const SITE  = fs.readFileSync(path.join(root, 'website', 'privacy.html'), 'utf8');
  const TERMS = fs.readFileSync(path.join(root, 'website', 'terms.html'), 'utf8');

  test('the old "under 13 not allowed" wording is gone from app and website', () => {
    expect(LEGAL).not.toContain('users under 13 are not allowed to use the Service');
    expect(SITE).not.toContain('users under 13 are not allowed to use the Service');
    expect(LEGAL).not.toContain('Users under 13 are not permitted to use the Service');
    expect(TERMS).not.toContain('Users under 13 are not permitted to use the Service');
  });

  test('app and website both carry the family-profile sections', () => {
    for (const src of [LEGAL, SITE]) {
      expect(src).toMatch(/add children aged 6 to 17 as family profiles/);
      expect(src).toMatch(/we never contact a child/);
      expect(src).toMatch(/Unlike adult acts, a child(&#x27;|\\'|')s acts are not kept in our totals/);
    }
    expect(TERMS).toMatch(/Children take part only through a family profile/);
  });
});
