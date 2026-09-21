// Every build profile must name its own database.
//
// THE BUG: `preview` set EXPO_PUBLIC_SUPABASE_URL/ANON_KEY explicitly, but
// `production` set neither. EXPO_PUBLIC_* values are inlined at bundle-build
// time from the build profile, so a production build got `undefined` for both,
// fell through to supabaseEnv.js's fallback, and pointed at STAGING — with
// nothing on screen saying so. Found 2026-09-20 while chasing the reverse
// question (whether the fallback itself should point at production).
//
// The fallback is a safety net for jest and local dev, not a configuration
// mechanism. It stays pointed at staging, because the harmless direction for
// a misconfigured build is test data in a test database. These assertions
// exist so that no build profile ever depends on it again.
//
// Deliberately NOT asserted: the literal key strings. Keys can be rotated, and
// a test that pins them turns a rotation into a failing suite. What must never
// drift is WHICH PROJECT each profile points at, so that is what is pinned.
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const EAS  = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const ENV  = fs.readFileSync(path.join(root, 'src', 'lib', 'supabaseEnv.js'), 'utf8');

const PROD_REF    = 'mtfyekdxtkdiaqbgaoza';
const STAGING_REF = 'rhalruwxylggkrebyesf';

describe('each build profile names its database explicitly', () => {
  for (const profile of ['preview', 'production']) {
    describe(profile, () => {
      const env = EAS.build[profile]?.env || {};

      test('sets a Supabase URL', () => {
        expect(typeof env.EXPO_PUBLIC_SUPABASE_URL).toBe('string');
        expect(env.EXPO_PUBLIC_SUPABASE_URL).toMatch(/^https:\/\/\w+\.supabase\.co$/);
      });

      test('sets a publishable key', () => {
        expect(typeof env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBe('string');
        expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toMatch(/^sb_publishable_/);
      });
    });
  }

  test('production points at the production project', () => {
    expect(EAS.build.production.env.EXPO_PUBLIC_SUPABASE_URL).toContain(PROD_REF);
  });

  test('preview points at the staging project', () => {
    // The whole point of the preview channel. If this ever reads PROD_REF,
    // every tester's run is writing to real users' data.
    expect(EAS.build.preview.env.EXPO_PUBLIC_SUPABASE_URL).toContain(STAGING_REF);
  });

  test('the two profiles do not share a database', () => {
    expect(EAS.build.preview.env.EXPO_PUBLIC_SUPABASE_URL)
      .not.toBe(EAS.build.production.env.EXPO_PUBLIC_SUPABASE_URL);
    expect(EAS.build.preview.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
      .not.toBe(EAS.build.production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  });

  test('the staging store profile inherits preview, not production', () => {
    // `staging` extends `preview`, so it must not declare its own database.
    expect(EAS.build.staging.extends).toBe('preview');
    expect(EAS.build.staging.env).toBeUndefined();
  });
});

describe('the fallback stays pointed at the harmless database', () => {
  test('supabaseEnv falls back to staging, never production', () => {
    const fallbacks = ENV.match(/const FALLBACK_(URL|KEY) = '[^']*';/g) || [];
    expect(fallbacks).toHaveLength(2);
    for (const line of fallbacks) {
      expect(line).not.toContain(PROD_REF);
    }
    expect(ENV).toContain(STAGING_REF);
  });

  test('it is still the single source of truth', () => {
    // Five files used to carry their own copy, every one falling back to
    // production. That is what let a staging build write to live data.
    expect(ENV).toContain('SUPABASE_URL');
    expect(ENV).toContain('SUPABASE_ANON_KEY');
    expect(ENV).toContain('DB_ENVIRONMENT');
  });
});
