// David's UX fix 10 (19 Nov 2026): one visual system matching 30acts.org.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const { C } = require('../src/constants');

// WCAG contrast ratio.
const lum = (hex) => {
  const v = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('colours', () => {
  test("the website's palette", () => {
    expect(C).toMatchObject({
      bg: '#FBFAF5', text: '#15231B', sub: '#4E6458', primary: '#17734A',
      onPrimary: '#FFFFFF', primaryDark: '#114E33', card2: '#E3F1E8', gold: '#EABA4B', error: '#B3261E',
    });
  });
  test('text contrast at least 4.5:1', () => {
    for (const fg of [C.text, C.sub, C.muted, C.primaryText, C.error]) {
      expect(ratio(fg, C.bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fg, C.card)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(C.onPrimary, C.primary)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#15231B', '#E3F1E8')).toBeGreaterThanOrEqual(4.5); // calendar numbers
    expect(ratio('#FFFFFF', '#114E33')).toBeGreaterThanOrEqual(4.5); // done tiles
  });
  test('an off switch is still visible', () => {
    expect(ratio(C.switchOff, C.card)).toBeGreaterThanOrEqual(3);
  });
});

describe('frame', () => {
  const NAV = read('src', 'navigation', 'index.js');
  test('tabs: Today, Journey, Tree, Me - in that order, with line icons', () => {
    const order = ['name="Home"', 'name="Journey"', 'name="Tree"', 'name="Me"'].map((t) => NAV.indexOf(`<Tab.Screen ${t}`));
    order.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(NAV).toMatch(/<Ionicons name=\{focused \? name : `\$\{name\}-outline`\}/);
    expect(NAV).not.toMatch(/emoji="/);
  });
  test('fonts: Bricolage Grotesque headings, Hanken Grotesk body', () => {
    const fonts = read('src', 'lib', 'fonts.js');
    expect(fonts).toContain("heading:   f('BricolageGrotesque_800ExtraBold')");
    expect(fonts).toContain("body:      f('HankenGrotesk_400Regular')");
    expect(read('App.js')).toMatch(/useFonts\(FONT_ASSETS\)/);
    expect(read('src', 'components', 'index.js')).toMatch(/fontSize: 19, color: C\.text, \.\.\.FONT\.heading/);
  });
  test('status bar text is dark on the light background', () => {
    expect(read('App.js')).not.toContain('<StatusBar style="light" />');
  });
  test('body text at least 16 on buttons and inputs', () => {
    const comp = read('src', 'components', 'index.js');
    expect(comp).toMatch(/btnText: \{ fontSize: 16/);
    expect(comp).toMatch(/paddingVertical: 13, fontSize: 16/);
  });
});
