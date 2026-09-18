// -- Which database this build talks to ---------------------------------------
// SINGLE SOURCE OF TRUTH for the Supabase project this bundle points at.
// Nothing else in the app reads these env vars or hardcodes a project URL.
//
// This file is deliberately PURE - no AsyncStorage, no supabase-js, no React
// Native imports - so that pure modules (moderation.js and friends) and their
// unit tests can import it without dragging a native module into jest. Same
// reason dashboardPages.js was split out of DashboardView.js.
//
// Five files used to carry their own copy of these two lines, every one of them
// falling back to PRODUCTION, which is what let a staging build write to live
// data with nothing on screen saying so (16 Sep 2026).
//
// EXPO_PUBLIC_* values are inlined at bundle-build time. A build takes them from
// eas.json; an `eas update` takes them from the EAS server-side environment and
// ONLY when passed `--environment <profile>`. If neither supplies them we fall
// back to STAGING, never production: the worst case is then test data in a test
// database instead of damage to real users' data.
const FALLBACK_URL = 'https://rhalruwxylggkrebyesf.supabase.co';         // staging
const FALLBACK_KEY = 'sb_publishable_whYqt4BClhIuHziqHbl-0A_NtA44idG';   // staging

export const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || FALLBACK_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY;

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_* not set - falling back to STAGING');
}

/** Project ref parsed out of the URL, e.g. "rhalruwxylggkrebyesf". */
export const PROJECT_REF = (SUPABASE_URL.match(/https:\/\/([^.]+)\./) || [])[1] || 'unknown';

/** "production" | "staging" | "other" - read off the URL, never the build channel. */
export const DB_ENVIRONMENT =
  PROJECT_REF === 'mtfyekdxtkdiaqbgaoza'   ? 'production'
  : PROJECT_REF === 'rhalruwxylggkrebyesf' ? 'staging'
  : 'other';

/** Headers for the raw REST calls that bypass supabase-js. */
export const REST_HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
};
