// The Create Group screen must have a way out.
//
// THE BUG: the stack sets `headerShown: false` for every screen, and
// CreateSponsorScreen renders no header of its own (unlike its siblings
// MySponsorsScreen and JoinSponsorScreen, which both render a ScreenHeader
// with an onBack). So Settings > "Sponsor a New Group" opened a screen with no
// back arrow and no cancel — a user who tapped it by accident was stuck.
//
// Reported by Ghenno, verified by Gary on 2026-09-20.
//
// The fix is at the navigator, not in the screen: CreateSponsorScreen has two
// views (the form, and the post-create QR screen) and the stack header covers
// both. It is the same shape SponsorDetail already uses.
//
// Note the screen's body is light (#fff) while the rest of the app is dark, so
// the shared ScreenHeader cannot be dropped in as-is — its title colour is
// C.text (#e8f5e9), which is invisible on white. That is why this uses the
// native header. The odd palette is cosmetic and left alone.
const fs   = require('fs');
const path = require('path');

const NAV = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'navigation', 'index.js'),
  'utf8'
);

const block = NAV.match(/<Stack\.Screen\s+name="CreateSponsor"[\s\S]*?\/>/);

describe('CreateSponsor is not a dead end', () => {
  test('the screen is still registered', () => {
    expect(block).not.toBeNull();
    expect(block[0]).toContain('component={CreateSponsorScreen}');
  });

  test('it is no longer the bare registration that caused the bug', () => {
    expect(NAV).not.toContain(
      '<Stack.Screen name="CreateSponsor" component={CreateSponsorScreen} />'
    );
  });

  test('it shows a header', () => {
    // Without this the stack-wide `headerShown: false` applies and there is
    // nothing on screen to go back with.
    expect(block[0]).toContain('headerShown: true');
  });

  test('the header has a back control that pops the stack', () => {
    expect(block[0]).toContain('headerLeft');
    expect(block[0]).toMatch(/onPress=\{\(\) => navigation\.goBack\(\)\}/);
  });
});

describe('every screen reachable from Settings can be backed out of', () => {
  // CreateSponsor was the only one missing an exit. These three are reached
  // from the same Settings card, so they are checked together — if a future
  // screen joins them it should be added here.
  test('MySponsors and JoinSponsor render their own ScreenHeader with onBack', () => {
    const read = (f) =>
      fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', f), 'utf8');
    for (const f of ['MySponsorsScreen.js', 'JoinSponsorScreen.js']) {
      const src = read(f);
      expect(src).toContain('ScreenHeader');
      expect(src).toMatch(/onBack=\{\(\) => navigation\.goBack\(\)\}/);
    }
  });
});
