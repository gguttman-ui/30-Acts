// Admin "Metrics" card (renamed from Growth, 27 Sep 2026) and its
// "Using reminders" tile. The tile reads the `reminders` key that
// admin_growth_stats() returns; an older database without that key shows a
// dash rather than breaking.
const fs = require('fs');
const path = require('path');

const ADMIN = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'AdminScreen.js'), 'utf8');

describe('Admin Metrics card', () => {
  test('the card is titled Metrics, not Growth', () => {
    expect(ADMIN).toContain('📈 Metrics');
    expect(ADMIN).not.toContain('📈 Growth');
  });

  test('has a Using reminders tile fed by growth.reminders', () => {
    expect(ADMIN).toMatch(/label="Using reminders"\s+value=\{growth\?\.reminders\s+\?\?\s+'—'\}/);
  });

  test('keeps the four existing tiles', () => {
    for (const key of ['downloads', 'signins', 'did_one_act', 'streak_30']) {
      expect(ADMIN).toContain(`growth?.${key}`);
    }
  });
});
