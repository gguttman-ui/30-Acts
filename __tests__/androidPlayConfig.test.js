// 71i (11 Nov 2026): Google Play config checks.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const { addQueries, PACKAGES } = require('../plugins/withAndroidQueries');

const RESTRICTED = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
];

describe('Android permissions (Play photo/video policy)', () => {
  test('no restricted media-read permissions are requested', () => {
    for (const p of RESTRICTED) expect(app.android.permissions).not.toContain(p);
  });
  test('restricted permissions are blocked so plugins cannot add them back', () => {
    for (const p of RESTRICTED) expect(app.android.blockedPermissions).toContain(p);
  });
  test('microphone kept for voice stories', () => {
    expect(app.android.permissions).toContain('android.permission.RECORD_AUDIO');
  });
  test('media-library plugin asks for no granular read permissions', () => {
    const ml = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-media-library');
    expect(ml[1].granularPermissions).toEqual([]);
  });
  test('every save-to-photos call is save-only', () => {
    for (const f of ['DailyActScreen', 'MyStoryScreen', 'HistoryScreen', 'CertificateScreen']) {
      const src = fs.readFileSync(path.join(root, 'src/screens', f + '.js'), 'utf8');
      expect(src).toContain('MediaLibrary.requestPermissionsAsync(true)');
      expect(src).not.toMatch(/MediaLibrary\.requestPermissionsAsync\(\s*\)/);
    }
  });
});

describe('Android package visibility (item 92)', () => {
  test('plugin is registered', () => {
    expect(app.plugins).toContain('./plugins/withAndroidQueries');
  });
  test('adds texting intent and social apps, without duplicates on re-run', () => {
    const m = { manifest: {} };
    addQueries(addQueries(m));
    const q = m.manifest.queries[0];
    const pk = q.package.map((p) => p.$['android:name']);
    for (const name of PACKAGES) expect(pk.filter((x) => x === name)).toHaveLength(1);
    const sms = q.intent.filter((i) => i.data[0].$['android:scheme'] === 'smsto');
    expect(sms).toHaveLength(1);
    expect(sms[0].action[0].$['android:name']).toBe('android.intent.action.SENDTO');
  });
});

describe('EAS Android build and submit', () => {
  test('production builds an app bundle', () => {
    expect(eas.build.production.android.buildType).toBe('app-bundle');
  });
  test('staging builds an installable APK for the Moto', () => {
    expect(eas.build.preview.android.buildType).toBe('apk');
    expect(eas.build.preview.env.APP_VARIANT).toBe('staging');
  });
  test('submit goes to Internal testing as a draft', () => {
    expect(eas.submit.production.android).toMatchObject({ track: 'internal', releaseStatus: 'draft' });
  });
  test('Play key file is gitignored', () => {
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gi).toMatch(/play-service-account\*\.json/);
  });
});
