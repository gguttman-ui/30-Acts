import React, { useState, useEffect, useRef } from 'react';
import { View, AppState, Text, TextInput } from 'react-native';

// Freeze font scaling app-wide so tiles render identically on every device,
// regardless of the iOS Text Size / Display Zoom setting.
if (!Text.defaultProps) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
if (!TextInput.defaultProps) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SplashScreen from './src/screens/SplashScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import LockScreen from './src/screens/LockScreen';
import GoodbyeScreen from './src/screens/GoodbyeScreen';
import AppNavigator from './src/navigation';
import { C, buildFreshDays, STATE_TZ, STATE_IANA_TZ } from './src/constants';
import { supabase } from './src/lib/supabase';
import { deletionBreaksStreak, loadGridReadOnly } from './src/lib/streak';
import { initBranch } from './src/lib/branch';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://7c3a17bbdcfd82afaaf7c7736cbe56d6@o4511314891177984.ingest.us.sentry.io/4511314893537280',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Strip @phone.30acts.app suffix to get just the phone number (e.g. +19177218269).
// Returns null if the email isn't a phone-proxy email.
const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

export default Sentry.wrap(function App() {
  const [splashDone,      setSplashDone]      = useState(false);
  const [showOnboard,     setShowOnboard]     = useState(null);
  const [user,            setUser]            = useState(null);
  const [days,            setDays]            = useState(null);
  const [daysReloading,   setDaysReloading]   = useState(true);   // true until first load completes
  const [sessionChecked,  setSessionChecked]  = useState(false);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [goodbye,         setGoodbye]         = useState(false);
  const navRef = useRef(null);
useEffect(() => {
    // One-time cleanup: clear any stale cached days from before the
    // server-only grid load. Safe to remove after a few releases.
    AsyncStorage.removeItem('days').catch(() => {});

    Promise.all([
      AsyncStorage.getItem('user'),
      AsyncStorage.getItem('hasSeenOnboarding'),
    ]).then(([userVal, onboardVal]) => {
      if (userVal) setUser(JSON.parse(userVal));
      setShowOnboard(onboardVal !== 'true');
    });
  }, []);

  // Start listening for Branch deep links (deferred referral attribution).
  // No-ops in Expo Go / web where the native module is absent. The captured
  // referral tag is applied at sign-up (see src/lib/branch.js).
  useEffect(() => {
    const teardown = initBranch();
    return teardown;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const authUser = session.user;
          // Existing session found — refresh the grid from the server.
          // handleLogin reloads days, which overrides any stale value
          // we just loaded from AsyncStorage cache. This is what makes
          // server-side data changes (new completions, restart marker
          // updates, etc.) visible without a full logout/login.
          await handleLogin({
            email:     authUser.email,
            firstName: authUser.user_metadata?.firstName || '',
            lastName:  authUser.user_metadata?.lastName  || '',
            phone:     authUser.user_metadata?.phone     || null,
          });
        } else {
          // No session — clear the cached user AND days so the app routes to
          // the login screen instead of rendering the main tabs in a broken,
          // session-less state ("No Active Challenge" with a cached OWNER's
          // tabs). This happens when a server-side change (e.g. the proxy
          // password reset) invalidates the refresh token: the session is gone
          // but the cached `user` object lingers in AsyncStorage. Routing is
          // gated on `user`, so without this the tabs would still show.
          // The remembered phone is kept, so AuthScreen re-prefills for a
          // one-tap re-login.
          setUser(null);
          AsyncStorage.removeItem('user').catch(() => {});
          setDays(null);
          setDaysReloading(false);
        }
      } catch (e) {
        console.warn('Session check failed:', e.message);
      } finally {
        setSessionChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) AsyncStorage.setItem('user', JSON.stringify(user));
    else AsyncStorage.removeItem('user');
  }, [user]);

  // Refresh data whenever the app returns to the foreground. Catches cases
  // like emailing an export, switching apps, ending a phone call, etc. —
  // anything that leaves the JS state untouched but where stale cached `days`
  // could end up on screen if Supabase changed underneath us in the meantime.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && user?.email) {
        reloadDays(user.email);
      }
    });
    return () => sub.remove();
      }, [user?.email]);
  // Reload the grid from Supabase using the streak-collapse logic.
  // Exposed to children as onReloadDays so test-seed and delete can refresh.
const reloadDays = async (email) => {
    const targetEmail = email || user?.email;
    if (!targetEmail) { setDaysReloading(false); return; }
    setDaysReloading(true);
    try {
      const grid = await loadGridReadOnly(targetEmail, buildFreshDays);
      if (grid) setDays(grid);
    } finally {
      setDaysReloading(false);
    }
  };
  const checkUserRole = async (email) => {
    const phone = extractPhone(email);
    try {
      // Try phone first (new column on admins/reviewers).
      if (phone) {
        const { data: adminPhone } = await supabase
          .from('admins')
          .select('phone')
          .eq('phone', phone)
          .maybeSingle();
        if (adminPhone) return 'OWNER';

        const { data: reviewerPhone } = await supabase
          .from('reviewers')
          .select('phone')
          .eq('phone', phone)
          .maybeSingle();
        if (reviewerPhone) return 'REVIEWER';
      }

      // Fall back to email (legacy rows that haven't been migrated).
      const { data: adminData } = await supabase
        .from('admins')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (adminData) return 'OWNER';

      const { data: reviewerData } = await supabase
        .from('reviewers')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (reviewerData) return 'REVIEWER';

      return 'CLIENT';
    } catch {
      return 'CLIENT';
    }
  };

  const upsertProfile = async ({ email, firstName, lastName, phone, state, timezone, role }) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

// Derive IANA timezone from state code so streak/grid math can use
      // Postgres `at time zone` and JS `toLocaleDateString` reliably.
      const ianaTimezone = state ? (STATE_IANA_TZ[state] || null) : null;

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id:             authUser.id,
          email:          email      || null,
          first_name:     firstName  || null,
          last_name:      lastName   || null,
          phone:          phone || extractPhone(email) || null,
          country_code:   '+1',
          state:          state      || null,
          timezone:       timezone   || null,
          iana_timezone:  ianaTimezone,
          role:           role       || 'CLIENT',
        }, { onConflict: 'id' });
      if (error) console.warn('Profile upsert error:', error.message);
    } catch (e) {
      console.warn('Profile upsert failed:', e.message);
    }
  };

  const handleLogin = async ({ email, firstName, lastName, phone }) => {
    const role = await checkUserRole(email);

    let finalFirstName = firstName;
    let finalLastName  = lastName;
    let finalState     = null;

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.user_metadata?.firstName) finalFirstName = authUser.user_metadata.firstName;
      if (authUser?.user_metadata?.lastName)  finalLastName  = authUser.user_metadata.lastName;
      if (authUser?.user_metadata?.state)     finalState     = authUser.user_metadata.state;
    } catch {}

    const finalTimezone = finalState ? (STATE_TZ[finalState] || null) : null;
    const u = { email, firstName: finalFirstName, lastName: finalLastName, phone, role };
    setUser(u);

    // Remember phone for fast re-login on next launch. AuthScreen
    // reads this on mount and auto-sends OTP if the silent re-login
    // fails. handleHardLogout clears it.
    try {
      const phoneToRemember = phone || extractPhone(email);
      if (phoneToRemember) {
        await AsyncStorage.setItem('remembered_phone', phoneToRemember);
      }
    } catch {}

    await upsertProfile({ email, firstName: finalFirstName, lastName: finalLastName, phone, state: finalState, timezone: finalTimezone, role });
    await reloadDays(email);

    const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
    if (biometricEnabled === 'true') {
      setBiometricLocked(true);
    }
  };

  // ── LOGOUT FLOW ───────────────────────────────────────────────────
  // "Log Out" from inside the app shows the GoodbyeScreen. The
  // Supabase session is preserved here so re-entry can be fast
  // (biometric or auto-OTP). The user's name persists for the
  // greeting until they tap Welcome Back or hard-logout.
const handleLogout = async () => {
  setGoodbye(true);
};

  // Welcome Back tap on the GoodbyeScreen. Take the fastest path
  // back into the app:
  //   - If biometric enabled → LockScreen (Face ID / Touch ID)
  //   - Otherwise → real signout, AuthScreen auto-OTP picks up the
  //     remembered phone and sends a code immediately.
  const handleWelcomeBack = async () => {
    setGoodbye(false);
    const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
    if (biometricEnabled === 'true') {
      setBiometricLocked(true);
      return;
    }
    handleHardLogout();
  };

  // Real signout. Clears Supabase session AND remembered phone, so
  // AuthScreen comes up as a clean entry form on next launch.
  // Reachable from LockScreen's "Log out instead" button.
  const handleHardLogout = async () => {
    try { await AsyncStorage.removeItem('remembered_phone'); } catch {}
    setUser(null);
    setDays(null);
    setBiometricLocked(false);
    setGoodbye(false);
    supabase.auth.signOut();
  };

  const handleStartChallenge = async () => {
    if (!user?.email) {
      setDays(buildFreshDays());
      return;
    }
    await reloadDays();
  };

const handleComplete = async (completedDay) => {
  // Optimistically update the cell so the UI feels instant...
  setDays(prev => prev?.map(d =>
    d.dayNumber === completedDay.dayNumber ? { ...d, ...completedDay } : d
  ));
  // ...then reload from Supabase so tier rollovers (Day 30 → 31, 60 → 61, etc.)
  // pick up the new tier window.
  if (user?.email) await reloadDays();
};
  const handleDelete = async (day) => {
    if (!user?.email) return;
    try {
      const phone = extractPhone(user.email);
      // Delete the ONE act by its unique completion id, or failing that its
      // calendar date (unique per user via the one-act-per-day index). NEVER
      // delete by day_number — that number is reused across streaks, so it can
      // wipe several dates at once (deleting today also removed yesterday).
      let q = supabase.from('completions').delete().eq('user_phone', phone);
      if (day && typeof day === 'object' && day.completionId) {
        q = q.eq('id', day.completionId);
      } else if (day && typeof day === 'object' && day.scheduledDate) {
        q = q.eq('local_date', day.scheduledDate);
      } else {
        console.warn('Delete aborted: no completion id or date on the day; refusing to delete by day_number.');
        return;
      }
      const { error } = await q;
      if (error) console.warn('Delete completion error:', error.message);
      await reloadDays();
    } catch (e) {
      console.warn('Delete failed:', e.message);
    }
  };

  // ── RESTART ──────────────────────────────────────────────────────
  // "Restart" means: collapse to my most recent unbroken streak.
  // Restart sets a `last_restart_at` marker on the user's profile,
  // and loadGridReadOnly only considers completions newer than that.
  // No data is deleted — past completions still count toward the
  // lifetime Tree stats. Returns a fresh grid if no qualifying rows.
  //
  // We intentionally don't show a separate "no streak found" message
  // here — the streak helper already handles that gracefully.
  // Restart sets a "fresh start" marker on the user's profile. It does NOT
  // delete any completions — those continue to power the Tree's lifetime
  // stats and the swipe-back calendar history. The active grid hides
  // anything before this marker so the user sees Day 1 again.
  const handleRestart = async () => {
    if (!user?.email) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) {
        console.warn('Restart: could not identify auth user');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ last_restart_at: new Date().toISOString() })
        .eq('id', authUser.id);

      if (error) {
        console.warn('Restart marker write failed:', error.message);
        return;
      }

      // Reload the grid — loadGridReadOnly now respects the new marker.
      await reloadDays();
    } catch (e) {
      console.warn('Restart failed:', e.message);
    }
  };

  if (!splashDone || showOnboard === null || !sessionChecked) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
        </View>
      </SafeAreaProvider>
    );
  }

 const handleOnboardingDone = () => {
    AsyncStorage.setItem('hasSeenOnboarding', 'true').catch(() => {});
    setShowOnboard(false);
  };

  if (showOnboard) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <OnboardingScreen onDone={handleOnboardingDone} />
      </SafeAreaProvider>
    );
  }

  if (biometricLocked) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <LockScreen
onUnlock={async () => {
  // Refresh data from Supabase BEFORE unlocking so the calendar
  // never mounts with stale/empty state. daysReloading shows a
  // loading state inside LockScreen if it takes a beat.
  if (user?.email) await reloadDays(user.email);
  setBiometricLocked(false);
}}
          onLogout={handleHardLogout}
        />
      </SafeAreaProvider>
    );
  }

  if (goodbye) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <GoodbyeScreen
          firstName={user?.firstName}
          onWelcomeBack={handleWelcomeBack}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator
        ref={navRef}
        days={days}
        daysReloading={daysReloading}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRestart={handleRestart}
        onStartChallenge={handleStartChallenge}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onReloadDays={() => reloadDays()}
      />
    </SafeAreaProvider>
  );
});