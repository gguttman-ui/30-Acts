// The bracelet shipping address prefill.
//
// THE BUG: David reported "my address does not pull through" on 2026-09-02.
// It never could. The form read the NAME from the profile and city/state/ZIP
// from signup metadata; the street was prefilled from nowhere, and a shipping
// address the person had already entered was never read back. A second order
// meant retyping all of it.
//
// It also leaned on user_metadata.city/.zip, which are only written during the
// reminder step at signup — anyone who skipped that step had nothing to pull.
const fs   = require('fs');
const path = require('path');

const FORM = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'BraceletFormScreen.js'), 'utf8'
);

describe('the address prefill reads the last order', () => {
  test('it queries recognition_orders at all — this is the whole fix', () => {
    expect(FORM).toContain("from('recognition_orders')");
  });

  test('it asks for every shipping field, including the street', () => {
    for (const field of [
      'ship_name', 'ship_street1', 'ship_street2',
      'ship_city', 'ship_state', 'ship_zip',
    ]) {
      expect(FORM).toContain(field);
    }
  });

  test('it takes the most recent order, not an arbitrary one', () => {
    expect(FORM).toMatch(/order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/);
    expect(FORM).toContain('.limit(1)');
  });

  test('it skips orders that never captured an address', () => {
    // An order row exists as soon as someone picks a recognition option, well
    // before they type an address. Prefilling from one of those would blank
    // the form.
    expect(FORM).toMatch(/\.not\(\s*'ship_street1'\s*,\s*'is'\s*,\s*null\s*\)/);
  });

  test('every field is actually set, street included', () => {
    for (const setter of [
      'setName(', 'setStreet1(', 'setStreet2(',
      'setCity(', 'setState(', 'setZip(',
    ]) {
      expect(FORM).toContain(setter);
    }
  });

  test('profile and signup metadata still fill the gaps', () => {
    // A first-time orderer has no previous order; they must not get an empty
    // form when we already know their name and town.
    expect(FORM).toContain('first_name');
    expect(FORM).toContain('meta.city');
    expect(FORM).toContain('meta.zip');
  });

  test('a failed prefill is not silent', () => {
    // It used to swallow the error entirely, which is why nobody noticed.
    expect(FORM).toContain('Address prefill failed');
  });
});
