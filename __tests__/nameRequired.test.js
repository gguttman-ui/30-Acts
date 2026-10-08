// 8 Oct 2026: Ghenno's account turned up with no first or last name. Sign-up
// already required both, but the Me screen saved whatever was in its name
// boxes - including nothing - and it saves on every reminder change too.
// Rule (Gary): every member has a first name and at least a last initial.

const fs   = require('fs');
const path = require('path');
const { cleanName, hasLetter, nameErrors, nameProblem } = require('../src/lib/nameRules');

describe('name rules', () => {
  test('a first name and a last initial pass', () => {
    expect(nameErrors('Ghenno', 'S')).toEqual({});
    expect(nameErrors('Ghenno', 'S.')).toEqual({});
    expect(nameErrors('Ghenno', 'Senbetta')).toEqual({});
    expect(nameProblem('Ghenno', 'S')).toBe('');
  });

  test('blank, spaces or null are refused', () => {
    for (const bad of ['', '   ', null, undefined]) {
      expect(nameErrors(bad, 'S').first).toBeTruthy();
      expect(nameErrors('Ann', bad).last).toBeTruthy();
    }
    expect(nameProblem('', '')).toMatch(/first name and at least your last initial/);
  });

  test('digits or punctuation alone do not count as a name', () => {
    for (const bad of ['1', '.', '-', '!!', '1 2']) {
      expect(hasLetter(bad)).toBe(false);
    }
  });

  test('accented and non-Latin letters count', () => {
    for (const ok of ['José', 'Zoë', 'Łukasz', '李', 'Ñ']) {
      expect(hasLetter(ok)).toBe(true);
    }
  });

  test('cleanName trims and collapses spaces', () => {
    expect(cleanName('  Mary   Ann  ')).toBe('Mary Ann');
    expect(cleanName(null)).toBe('');
  });
});

// The screens import native modules, so read their source like the other
// screen tests do.
function code(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', file), 'utf8');
  return src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
}

describe('both screens use the shared rule', () => {
  test('sign-up validates with nameErrors and saves cleaned names', () => {
    const c = code('AuthScreen.js');
    expect(c).toMatch(/from '\.\.\/lib\/nameRules'/);
    const v = c.slice(c.indexOf('const validate'), c.indexOf('const finishLogin'));
    expect(v).toMatch(/nameErrors\(fn, ln\)/);
    const s = c.slice(c.indexOf('const handleSignupSend'), c.indexOf('const handleVerifyOtp'));
    expect(s).toMatch(/cleanName\(fn\)/);
    expect(s).toMatch(/cleanName\(ln\)/);
    expect(s).not.toMatch(/firstName: fn/);
  });

  test('the Me screen refuses to save a missing name', () => {
    const c = code('SettingsScreen.js');
    expect(c).toMatch(/from '\.\.\/lib\/nameRules'/);
    const save = c.slice(c.indexOf('const handleSave'));
    const check = save.indexOf('nameProblem(firstName, lastName)');
    const write = save.indexOf('supabase.auth.updateUser');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(write);
    expect(save.slice(check, write)).toMatch(/return false/);
    // Names are written cleaned, never as a raw box value or a null.
    expect(save).toMatch(/firstName: cleanFirst/);
    expect(save).toMatch(/first_name:\s+cleanFirst/);
    expect(save).not.toMatch(/first_name:\s+firstName\s+\|\| null/);
  });
});
