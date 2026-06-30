import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7Yy5NBm4XmpO1syrdjT62A_4stDanF9';

const storage = Platform.OS === 'web' ? {
  getItem:    (key)        => Promise.resolve(window.localStorage.getItem(key)),
  setItem:    (key, value) => Promise.resolve(window.localStorage.setItem(key, value)),
  removeItem: (key)        => Promise.resolve(window.localStorage.removeItem(key)),
} : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// -- Stale-session guard -------------------------------------------------------
// A server-side change that invalidates refresh tokens (e.g. the blanket
// password reset on the proxy accounts) leaves the persisted session holding a
// refresh token the server no longer recognizes. On the next launch
// autoRefreshToken throws "Invalid Refresh Token: Refresh Token Not Found",
// which can strand a tester in a session-less state on every start.
//
// This runs once at startup: if there's a cached session, we proactively try to
// refresh it. If that fails, the token is dead — clear it locally (no network
// call, since the token can't be revoked server-side anyway) so the app falls
// back to a clean login instead of looping on the error. Fully fire-and-forget;
// it never blocks or throws into startup.
//
// Also covers the live case: if a refresh fails any time later, supabase-js
// emits SIGNED_OUT — we make sure local storage is cleared on that event too.
(() => {
  let cleared = false;
  const clearDeadSession = async (reason) => {
    if (cleared) return;
    cleared = true;
    try {
      console.warn('[auth] clearing stale session:', reason);
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[auth] signOut(local) failed (ignored):', e?.message);
    }
  };

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') cleared = true; // already clean
  });

  supabase.auth.getSession()
    .then(({ data }) => {
      if (!data?.session) return;            // nothing cached ? nothing to validate
      return supabase.auth.refreshSession().then(({ error }) => {
        if (error) return clearDeadSession(error.message);
      });
    })
    .catch((e) => clearDeadSession(e?.message || 'getSession threw'));
})();