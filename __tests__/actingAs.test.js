// Backlog 94, children's profiles Stage 1: the Home profile switcher (1 Nov 2026).
//
// While a child is selected, every act screen must read, save, edit and delete
// acts under the child's member key - never the parent's phone - and switching
// back to the parent must restore the parent's phone everywhere. These tests
// pin the switch itself and the places that must go through it.
const fs   = require('fs');
const path = require('path');
import {
  actingPhone, getActingMember, setActingMember, isActingAsChild,
  subscribeActing, _resetActingForTests,
} from '../src/lib/actingAs';

const PARENT = '+19177218269@phone.30acts.app';
const KID    = { member_key: '+19177218269-01', first_name: 'Mia' };

beforeEach(() => _resetActingForTests());

describe('actingPhone', () => {
  test('parent selected: the parent phone', () => {
    expect(actingPhone(PARENT)).toBe('+19177218269');
  });

  test('child selected: the child key', () => {
    setActingMember(KID);
    expect(actingPhone(PARENT)).toBe('+19177218269-01');
  });

  test('switching back to the parent restores the parent phone', () => {
    setActingMember(KID);
    setActingMember(null);
    expect(actingPhone(PARENT)).toBe('+19177218269');
    expect(isActingAsChild()).toBe(false);
  });

  test("never another parent's child (stale choice after a different sign-in)", () => {
    setActingMember({ member_key: '+15550100142-01', first_name: 'Other' });
    expect(actingPhone(PARENT)).toBe('+19177218269');
  });

  test('a non-phone email still gives null, like the old extractPhone', () => {
    expect(actingPhone('someone@example.com')).toBeNull();
    expect(actingPhone(null)).toBeNull();
  });
});

describe('setActingMember / subscribeActing', () => {
  test('listeners hear each real change once', () => {
    const heard = [];
    subscribeActing((m) => heard.push(m && m.member_key));
    setActingMember(KID);
    setActingMember(KID);          // same child again: no event
    setActingMember(null);
    expect(heard).toEqual(['+19177218269-01', null]);
  });

  test('unsubscribe stops events', () => {
    const heard = [];
    const off = subscribeActing((m) => heard.push(m));
    off();
    setActingMember(KID);
    expect(heard).toEqual([]);
    expect(getActingMember()).toEqual(KID);
  });
});

describe('wiring', () => {
  const root = path.join(__dirname, '..');
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

  test('every act screen gets "whose phone" from actingAs', () => {
    for (const f of ['HomeScreen', 'MyStoryScreen', 'DailyActScreen', 'CreateNewActScreen', 'ChooseActScreen', 'HistoryScreen']) {
      const src = read('src', 'screens', `${f}.js`);
      expect(src).toContain('const extractPhone = (email) => actingPhone(email);');
      // the old copy that always returned the parent phone is gone
      expect(src).not.toContain("return email.replace('@phone.30acts.app', '');");
    }
  });

  test('the board, delete and Start over use the selected person', () => {
    const streak = read('src', 'lib', 'streak.js');
    expect(streak).toContain('const phone = actingPhone(email);');
    expect(streak).toContain('await getRestartMarker(phone)');
    const app = read('App.js');
    expect(app).toContain('const phone = actingPhone(user.email);');
    expect(app).toContain('subscribeActing(');
    expect(app.match(/setActingMember\(null\)/g).length).toBeGreaterThanOrEqual(2); // both logouts
  });

  test('no sharing, no groups and no Day-30 text for a child', () => {
    expect(read('src', 'components', 'ShareButtons.js')).toContain('if (isActingAsChild()) return null;');
    const streak = read('src', 'lib', 'streak.js');
    expect(streak.match(/if \(isActingAsChild\(\)\) return \[\];/g).length).toBe(2);
    expect(read('src', 'screens', 'MyStoryScreen.js')).toContain('if (!isActingAsChild()) notifyDay30()');
    const daily = read('src', 'screens', 'DailyActScreen.js');
    expect(daily.match(/if \(isActingAsChild\(\)\) return;/g).length).toBe(2);
  });

  test('Home shows the switcher and hides owner test tools for a child', () => {
    const home = read('src', 'screens', 'HomeScreen.js');
    expect(home).toContain('<ProfileSwitcher parentName={user?.firstName} />');
    expect(home).toContain("user?.role === 'OWNER' && !acting");
  });

  test("a child's Day 30: certificate in the child's name, bracelet as a separate order", () => {
    const cert = read('src', 'screens', 'CertificateScreen.js');
    expect(cert).toContain('const extractPhone = (email) => actingPhone(email);');
    expect(cert).toContain('if (child) fullName = child.first_name;');
    // order rows are one per user_phone, so a child's order must use the child key
    const form = read('src', 'screens', 'BraceletFormScreen.js');
    expect(form).toContain('const extractPhone = (email) => actingPhone(email);');
    expect(form).toContain("upsert(payload, { onConflict: 'user_phone' })");
    const pay = read('src', 'screens', 'BraceletPaymentScreen.js');
    expect(pay).toContain(".eq('user_phone', phone)");
  });

  test('restart markers: child on family_members, adult on profiles', () => {
    const m = read('src', 'lib', 'restartMarker.js');
    expect(m).toContain("from('family_members')");
    expect(m).toContain("from('profiles')");
    expect(m).toContain('isMemberKey(phoneOrKey)');
  });
});
