// Backlog item 38, closed 23 Sep 2026.
//
// Native crash reports in Sentry are only readable if each production build
// uploads its dSYM. That happens automatically during the EAS build through the
// @sentry/react-native/expo plugin, using SENTRY_AUTH_TOKEN from the EAS
// production environment. Build 98 (11 Sep) is confirmed uploaded; build 96's
// "<unknown>" frames came from before that was in place.
//
// This guards the two repo-side conditions. The token itself lives in EAS and
// cannot be tested here - check it with: npx eas env:list --environment production

const fs   = require('fs');
const path = require('path');

const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));

describe('production builds upload debug symbols to Sentry', () => {
  test('the production profile does not disable the Sentry upload', () => {
    const env = (eas.build.production && eas.build.production.env) || {};
    expect(env.SENTRY_DISABLE_AUTO_UPLOAD).toBeUndefined();
  });

  test('the Sentry Expo plugin names the organization and project', () => {
    const entry = app.expo.plugins.find(
      (p) => Array.isArray(p) && p[0] === '@sentry/react-native/expo');
    expect(entry).toBeDefined();
    expect(entry[1].organization).toBe('30-acts-of-kindness-nfp');
    expect(entry[1].project).toBe('react-native');
  });
});
