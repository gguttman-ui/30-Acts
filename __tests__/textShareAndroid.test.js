// Item 92: on Android the Text button opens the texting app directly
// (Moto G75, 26 Oct 2026: Messages was buried in Android's share menu).
const fs = require('fs');
const path = require('path');

const SRC = fs
  .readFileSync(path.join(__dirname, '..', 'src', 'screens', 'DailyActScreen.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const handler = SRC.slice(SRC.indexOf('const handleShareText'), SRC.indexOf('const handleShareEmail'));

describe('Text button on Android', () => {
  test('goes straight to the texting app with the picture and caption', () => {
    expect(handler).toMatch(/Platform\.OS === 'android'/);
    expect(handler).toMatch(/social: RNShare\.Social\.SMS/);
    expect(handler).toMatch(/url: uri/);
    expect(handler).toMatch(/message: inviteCaption\(\)/);
  });

  test('falls back to the share menu if the texting app cannot be opened', () => {
    const direct = handler.indexOf('RNShare.shareSingle');
    const menu = handler.indexOf('RNShare.open');
    expect(direct).toBeGreaterThan(-1);
    expect(menu).toBeGreaterThan(direct);
    expect(handler).toMatch(/if \(direct\) return;/);
  });

  test('iPhone is unchanged: share sheet only', () => {
    expect(handler.match(/RNShare\.open\(/g) || []).toHaveLength(1);
  });
});
