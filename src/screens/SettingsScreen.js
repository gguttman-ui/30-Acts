import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch, Platform, Animated,
  InputAccessoryView, Keyboard, Share, Modal,
} from 'react-native';
import { AppInput, Btn, Card, ScreenHeader, TypedConfirmModal } from '../components';
// Font-scaling-locked Text so large iOS Text Size can't overflow/clip layout
// (notably the SMS consent disclosure, which must stay fully visible).
import { Text } from '../components/scaledText';
import { C, STATE_IANA_TZ, SMS_CONSENT_VERSION, SMS_CONSENT_TEXT } from '../constants';
import { lookupZip } from '../lib/zip';
import { reminderZoneForSave } from '../lib/reminderTimezone';
import { isContentBlocked, BLOCKED_MESSAGE } from '../lib/moderation';
import { generateInviteLink } from '../lib/branch';
import { loadRuns, lapCount, actsInLap, lifetimeCompletionCount } from '../lib/runs';
import { reportProblem } from '../lib/reportProblem';
import { actingPhone } from '../lib/actingAs';
import { useActingMember } from '../components/ProfileSwitcher';
import QRCode from 'react-native-qrcode-svg';
import * as Updates from 'expo-updates';
import { nameProblem, cleanName } from '../lib/nameRules';
import { faceIdLockOn } from '../lib/faceIdDefault';

// iOS-only: nativeID for the keyboard Done bar.
const KB_DONE_ID = 'settingsKbDone';

// How long a confirmation flash stays on screen.
const FLASH_MS = 5000;

// Held at MODULE scope, not in component state. Saving calls
// supabase.auth.updateUser, and anything that re-mounts this screen off the
// back of that would reset component state -- wiping the very message the save
// just produced, which is exactly what "still no flash screens" looks like.
// Surviving here means a fresh mount picks the message back up mid-flash.
let flashHolder = { msg: '', until: 0 };

// SMS_CONSENT_VERSION / SMS_CONSENT_TEXT now live in ../constants so the Me
// screen and the signup flow record the exact same consent language + version.
const AGE_BRACKETS = [
  { label: '18–24',              value: '18-24' },
  { label: '25–34',              value: '25-34' },
  { label: '35–44',              value: '35-44' },
  { label: '45–54',              value: '45-54' },
  { label: '55–64',              value: '55-64' },
  { label: '65–74',              value: '65-74' },
  { label: '75+',                value: '75+' },
  { label: 'Prefer not to say',  value: 'prefer_not_to_say' },
];
// Strip @phone.30acts.app suffix to get just the phone number used as key
// in sponsor_admins table.
const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

// Done-toolbar above iOS number keyboards. Renders nothing on Android.
function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KB_DONE_ID}>
      <View style={s.kbBar}>
        <TouchableOpacity onPress={() => Keyboard.dismiss()}>
          <Text style={s.kbDone}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

export default function SettingsScreen({ user, challenge, onStartChallenge, onRestart, navigation, navigate, route }) {
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName,  setLastName]  = useState(user?.lastName  || '');
  const [contactEmail, setContactEmail] = useState('');
  const [ageBracket, setAgeBracket] = useState(null);
  const [showAgeBrackets, setShowAgeBrackets] = useState(false);
  const [street1, setStreet1] = useState('');
  const [street2, setStreet2] = useState('');

  const [zip,        setZip]        = useState('');
  const [zipState,   setZipState]   = useState('');
  const [zipCity,    setZipCity]    = useState('');
  const [timezone,   setTimezone]   = useState(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError,   setZipError]   = useState('');

  const [saved, setSaved] = useState(false);
  const [hasRecognition, setHasRecognition] = useState(false);

  // Show the "My Recognition" entry once the user has been through the 30-day
  // recognition flow (they have a recognition_orders row). This is the way back
  // in to add a bracelet after choosing a certificate, or vice versa.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser?.id) return;
        const { data } = await supabase
          .from('recognition_orders')
          .select('id')
          .eq('user_id', authUser.id)
          .maybeSingle();
        if (!cancelled && data) setHasRecognition(true);
      } catch (e) { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount]     = useState(false);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
  try {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      Alert.alert('Could not delete account', error.message);
      setDeletingAccount(false);
      return;
    }
    // Sign out so the now-deleted session doesn't linger
    await supabase.auth.signOut();
    setShowDeleteConfirm(false);
    setDeletingAccount(false);
    navigate('deleted');
  } catch (e) {
    Alert.alert('Error', e.message);
    setDeletingAccount(false);
  }
};

  const [biometricEnabled,   setBiometricEnabled]   = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel,     setBiometricLabel]     = useState('Biometrics');

  // Daily reminder state — saved to user_metadata; the send-reminders backend
  // reads it and texts the user via Twilio at the chosen time(s).
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour,    setReminderHour]    = useState(9);
  const [reminderMinute,  setReminderMinute]  = useState(0);
  const [reminderPeriod,  setReminderPeriod]  = useState('AM');
  // The SECOND reminder was removed 2026-09-21 (item 28) — one text a day. Its
  // state, controls and time effect are gone; handleSave still writes the
  // reminder2_* fields as null so an account that had one set gets it cleared
  // on the next save, and send-reminders no longer reads them at all.
  //
  // Slot 1 has its OWN flag. It used to share `reminderEnabled` with the master
  // switch, so switching reminders on switched slot 1 on at the same instant --
  // the user never got to choose. Master = "texts allowed at all"; this = "the
  // reminder is scheduled". Off by default.
  const [reminder1Enabled, setReminder1Enabled] = useState(false);
  // Brief confirmation shown inside the reminder card — most importantly when a
  // reminder is switched OFF, which otherwise changed nothing visible except a
  // chip and left people unsure whether the texts had actually stopped.
  const [reminderFlash, setReminderFlash] = useState(
    () => (Date.now() < flashHolder.until ? flashHolder.msg : '')
  );
  const [flashSeq, setFlashSeq] = useState(0);
  const metaLoaded = useRef(false);
  const time1Tmr   = useRef(null);
  const fmtTime = (h, m, p) => `${h}:${String(m).padStart(2, '0')} ${p}`;
  const flashReminder = (msg) => {
    flashHolder = { msg, until: Date.now() + FLASH_MS };
    setReminderFlash(msg);
    // Bumped so re-flashing the SAME text still restarts the timer -- setting
    // state to an identical value wouldn't re-run the effect on its own.
    setFlashSeq((n) => n + 1);
  };

  useEffect(() => {
    if (!reminderFlash) return undefined;
    const t = setTimeout(() => {
      flashHolder = { msg: '', until: 0 };
      setReminderFlash('');
    }, Math.max(0, flashHolder.until - Date.now()));
    return () => clearTimeout(t);
  }, [reminderFlash, flashSeq]);
  // ISO timestamp of the first time the user opted in to SMS reminders. Kept as
  // proof of express consent for toll-free / A2P compliance; never overwritten
  // once set (only cleared server-side on a STOP opt-out).
  const [reminderConsentAt, setReminderConsentAt] = useState(null);

  useEffect(() => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName  || '');
    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata || {};
      if (meta.zip)           setZip(meta.zip);
      if (meta.state)         setZipState(meta.state);
      if (meta.city)          setZipCity(meta.city);
      if (meta.timezone)      setTimezone(meta.timezone);
      if (meta.contact_email) setContactEmail(meta.contact_email);
      if (meta.street1)       setStreet1(meta.street1);
      if (meta.street2)       setStreet2(meta.street2);
      if (meta.age_bracket) setAgeBracket(meta.age_bracket);
      // A first-time visitor has no reminder_enabled in their metadata, and
      // must land on OFF — never opted in by default. Anything that isn't an
      // explicit true reads as off.
      setReminderEnabled(meta.reminder_enabled === true);
      if (typeof meta.reminder_hour    === 'number')  setReminderHour(meta.reminder_hour);
      if (typeof meta.reminder_minute  === 'number')  setReminderMinute(meta.reminder_minute);
      if (meta.reminder_period === 'AM' || meta.reminder_period === 'PM') {
        setReminderPeriod(meta.reminder_period);
      }
      // reminder2_* is deliberately not hydrated — the second reminder is gone.
      // Slot 1 is opt-in. The fallback covers accounts saved before slot 1
      // had its own flag: a stored hour means they had scheduled it, so keep it
      // on rather than silently cancelling their reminder.
      setReminder1Enabled(
        meta.reminder_enabled === true && (
          meta.reminder1_enabled === true ||
          (meta.reminder1_enabled === undefined && typeof meta.reminder_hour === 'number')
        )
      );
      if (meta.reminder_consent_at) setReminderConsentAt(meta.reminder_consent_at);
      // Saved values are in place — from here a time change is the USER moving
      // the arrows, not hydration, so the auto-save effects may run.
      metaLoaded.current = true;
    });
  }, [user?.firstName, user?.lastName]);

  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) {
      setZipError('');
      return;
    }
    let cancelled = false;
    (async () => {
      setZipLoading(true);
      setZipError('');
      const result = await lookupZip(zip);
      if (cancelled) return;
      if (result) {
        setZipState(result.state);
        setZipCity(result.city);
        setTimezone(result.timezone);
      } else {
        setZipError('ZIP not found');
      }
      setZipLoading(false);
    })();
    return () => { cancelled = true; };
  }, [zip]);

  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
        const available   = hasHardware && isEnrolled;
        setBiometricAvailable(available);

        if (available) {
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricLabel(Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock');
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricLabel(Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint');
          } else {
            setBiometricLabel('Device Passcode');
          }
        }

        // Fix 1: same rule as App.js - off unless the person turned it on.
        setBiometricEnabled(await faceIdLockOn());
      } catch (e) {
        console.warn('Biometric check failed:', e.message);
      }
    })();
  }, []);

  const toggleBiometric = async (next) => {
    if (next) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: `Confirm ${biometricLabel} to enable app lock`,
          fallbackLabel: 'Cancel',
          cancelLabel:   'Cancel',
        });
        if (!result.success) {
          Alert.alert('Not enabled', `${biometricLabel} was not confirmed.`);
          return;
        }
      } catch (e) {
        Alert.alert('Error', e.message);
        return;
      }
      await AsyncStorage.setItem('biometric_enabled', 'true');
      setBiometricEnabled(true);
    } else {
      await AsyncStorage.removeItem('biometric_enabled');
      setBiometricEnabled(false);
    }
  };

  // "My 30 Acts" progress must match the Dashboard headline exactly: the CURRENT
  // STREAK's acts (any missed day restarts it) — NOT every act inside the 30-day
  // back-fill window. We derive it from the SAME runs model the Dashboard uses
  // (loadRuns), so the two screens can never disagree. Until the runs load (or if
  // the query fails) we fall back to the window-completed count so a number always
  // shows.
  const windowCompleted = challenge?.filter(d => d.status === 'COMPLETED').length ?? 0;
  const [streakActs, setStreakActs] = useState(null);
  // Backlog 94: this card (count + Start over) follows the person selected on
  // Home, so a child's Start over is never shown under the parent's count.
  const acting = useActingMember();
  useEffect(() => {
    let cancelled = false;
    setStreakActs(null);
    const phone = actingPhone(user?.email);
    if (!phone) return;
    (async () => {
      try {
        const runs = await loadRuns(phone);
        if (cancelled || !runs.length) return;
        const currentRun = runs[runs.length - 1];
        const lap = lapCount(currentRun) - 1;
        setStreakActs(actsInLap(currentRun, lap));
      } catch (_) { /* keep the fallback count */ }
    })();
    return () => { cancelled = true; };
  }, [user?.email, challenge, acting]);
  const completedCount = streakActs != null ? streakActs : windowCompleted;

  // Restart must call onRestart (App.handleRestart), which writes the
  // last_restart_at marker on the profile that loadGridReadOnly filters by.
  // It used to call onStartChallenge, which is only `await reloadDays()` — so
  // the confirm dialog appeared, nothing was written, and the old streak came
  // straight back. Ghenno reported it; verified in staging 2026-09-20.
  const handleRestart = () => {
    // Backlog 70: clearer wording, and it can be undone from Home for 24 hours.
    Alert.alert(
      'Start over at Day 1?',
      'Your current streak ends and you begin again at Day 1. Your past acts are kept. You can undo this from the Home screen for 24 hours.',
      [
        { text: 'Keep everything', style: 'cancel' },
        { text: 'Yes, start over', style: 'destructive', onPress: onRestart },
      ]
    );
  };

  // `overrides` lets a caller save an enabled-flag it has only just set. React
  // state updates are async, so `toggleReminder` flipping reminder1Enabled and
  // immediately calling handleSave() would otherwise persist the OLD value and
  // the reminder would keep firing after being switched off. Returns true on a
  // successful save so callers know whether to announce it.
  const handleSave = async (overrides = {}) => {
    const rEnabled  = overrides.reminderEnabled  !== undefined ? overrides.reminderEnabled  : reminderEnabled;
    const r1Enabled = overrides.reminder1Enabled !== undefined ? overrides.reminder1Enabled : reminder1Enabled;

    if (contactEmail.trim() && !contactEmail.includes('@')) {
      Alert.alert('Invalid email', 'Enter a valid email or leave it blank.');
      return false;
    }

    // Every member keeps a first name and at least a last initial (8 Oct 2026:
    // a save here could blank a real name, since this runs on every reminder
    // change too). Refuse the save instead of writing an empty name.
    const nameMsg = nameProblem(firstName, lastName);
    if (nameMsg) {
      Alert.alert('Name required', nameMsg);
      return false;
    }
    const cleanFirst = cleanName(firstName);
    const cleanLast  = cleanName(lastName);

    // first_name / last_name are rendered as "First L." on challenge
    // leaderboards, so other participants see them. Moderate before saving
    // (Apple Guideline 1.2).
    const nameToCheck = [cleanFirst, cleanLast].join(' ');
    if (nameToCheck.trim() && await isContentBlocked(nameToCheck)) {
      Alert.alert('Name Not Allowed', BLOCKED_MESSAGE);
      return false;
    }
    if (zip && !/^\d{5}$/.test(zip)) {
      Alert.alert('Invalid ZIP', 'Enter a 5-digit ZIP or leave it blank.');
      return false;
    }

    // Timezone the reminders (and streak) rely on. Prefer the ZIP-derived value;
    // fall back to deriving it from the state, so a user who set a state but no
    // ZIP still gets a valid IANA zone. (A missing zone silently blocks reminders.)
    const effectiveTz = timezone || (zipState ? (STATE_IANA_TZ[zipState] || null) : null);
    // Reminders go by where the phone IS, not the home ZIP (item 86). The
    // profile below keeps the home zone.
    const reminderTz = reminderZoneForSave(effectiveTz);

    if (rEnabled) {
      if (!reminderTz) {
        Alert.alert(
          'Add your ZIP code',
          'To send reminders we need your ZIP code so we know your time zone. Add it above, then Save.'
        );
        return false;
      }
      // The backend only sends between 6:00 AM and 10:00 PM local time, so a time
      // outside that window would be silently dropped — catch it here.
      const to24 = (h, p) => (p === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12));
      const inWindow = (h, p) => { const hr = to24(h, p); return hr >= 6 && hr < 22; };
      const bad1 = r1Enabled && !inWindow(reminderHour, reminderPeriod);
      if (bad1) {
        Alert.alert(
          'Pick a daytime reminder',
          'Reminders can only be sent between 6:00 AM and 9:59 PM. Please choose a time in that range.'
        );
        return false;
      }
    }

    // Stamp (and then preserve) the express-consent timestamp the first time
    // reminders are enabled — our record that the user opted in to recurring SMS.
    const nextConsentAt = rEnabled
      ? (reminderConsentAt || new Date().toISOString())
      : reminderConsentAt;

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          firstName: cleanFirst,
          lastName:  cleanLast,
          zip:      zip      || null,
          state:    zipState || null,
          city:     zipCity  || null,
          timezone: reminderTz,
          contact_email: contactEmail.trim() || null,
          street1:       street1.trim() || null,
          street2:       street2.trim() || null,
          age_bracket: ageBracket || null,
          reminder_enabled: rEnabled,
          reminder1_enabled: r1Enabled,
          // Nulled when slot 1 is off: the sender only fires a slot whose hour
          // is a number, exactly as slot 2 already worked.
          reminder_hour:    r1Enabled ? reminderHour   : null,
          reminder_minute:  r1Enabled ? reminderMinute : null,
          reminder_period:  r1Enabled ? reminderPeriod : null,
          // The second reminder is gone (item 28). These are still written, as
          // nulls, so an account that had one scheduled has it cleared the next
          // time anything saves — otherwise stale reminder2_* values would sit
          // in metadata forever with no UI left to clear them.
          reminder2_enabled: false,
          reminder2_hour:    null,
          reminder2_minute:  null,
          reminder2_period:  null,
          reminder_consent_at:      nextConsentAt || null,
          reminder_consent_version: rEnabled ? SMS_CONSENT_VERSION : null,
        },
      });
      if (error) { Alert.alert('Error', error.message); return false; }

      const authUser = data?.user;
      if (authUser) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id:           authUser.id,
            email:        authUser.email       || user?.email || null,
            first_name:   cleanFirst,
            last_name:    cleanLast,
            phone:        authUser.phone       || user?.phone || null,
            country_code: '+1',
            state:        zipState             || null,
            timezone:     effectiveTz,
            iana_timezone: effectiveTz,
            age_bracket:  ageBracket           || null,
            role:         user?.role           || 'CLIENT',
          }, { onConflict: 'id' });

        if (profileError) console.warn('Profile upsert error:', profileError.message);
      }

      setSaved(true);
      setReminderConsentAt(nextConsentAt || null);
      setTimeout(() => setSaved(false), FLASH_MS);
      return true;
    } catch (e) {
      Alert.alert('Error', 'Could not save profile.');
      return false;
    }
  };

  // Turn one reminder on or off from its status chip: flip the flag, persist it
  // in the same tap (passing the new value through so the async state update
  // can't race the save), announce it, and roll back if the save failed.
  const REMINDER_TARGETS = {
    master: { label: 'Reminders', set: setReminderEnabled,  key: 'reminderEnabled'  },
    first:  { label: 'Reminder',  set: setReminder1Enabled, key: 'reminder1Enabled' },
  };

  // The flash fires BEFORE the save, not after it. Announcing only on success
  // meant any hiccup inside handleSave -- a slow moderation call, a thrown
  // error, a validation bail -- swallowed the confirmation entirely and the tap
  // looked like it did nothing. Feedback is now immediate, and a failed save
  // corrects it afterwards rather than being the thing that gates it.
  const toggleReminder = async (which, next) => {
    const t = REMINDER_TARGETS[which];
    if (!t) return;

    // The master switch carries the reminder with it. OFF clears the reminder
    // (as before). ON now also switches the reminder on at the time shown, in
    // the same tap (25 Oct 2026). It used to leave the reminder OFF until the
    // small chip under the time was tapped too, so people saw the switch ON
    // and 09:00 on screen with nothing scheduled - Ghenno, after the 22 Oct
    // inactivity switch-off. Nobody is opted in without tapping the switch
    // themselves: first visit still lands OFF.
    const overrides = { [t.key]: next };
    if (which === 'master') overrides.reminder1Enabled = next;

    t.set(next);
    if (which === 'master') setReminder1Enabled(next);
    flashReminder(`${t.label} turned ${next ? 'ON' : 'OFF'}`);

    const ok = await handleSave(overrides);
    if (!ok) {
      t.set(!next);
      flashReminder(`Couldn't save — ${t.label} left ${next ? 'OFF' : 'ON'}`);
    }
  };

  // With the Set buttons gone, a time change has to save itself. Debounced so a
  // run of arrow taps is one write, and gated on metaLoaded so hydrating the
  // saved values doesn't immediately write them straight back.
  const saveTimeSoon = (ref, enabled, announce) => {
    if (!metaLoaded.current || !enabled) return undefined;
    clearTimeout(ref.current);
    ref.current = setTimeout(async () => {
      if (await handleSave()) flashReminder(announce());
    }, 1200);
    return () => clearTimeout(ref.current);
  };

  useEffect(
    () => saveTimeSoon(time1Tmr, reminderEnabled && reminder1Enabled, () =>
      `Reminder set for ${fmtTime(reminderHour, reminderMinute, reminderPeriod)}`),
    [reminderHour, reminderMinute, reminderPeriod]
  );

  // Invite-a-friend share. Uses the native iOS share sheet so the user can
  // pick SMS, email, etc. and edit the message before sending.
  // Personal invite: the link carries this user's invite CODE (never the
  // phone - fix 4) so anyone who joins through it lands on their tree.
  const invitePhone = extractPhone(user?.email) || user?.phone || null;
  // Invite link now points at a Branch link (airpa.app.link) that bounces new
  // users to the App Store and attributes them to this user's tree after they
  // install — no website hop. Starts as the website fallback, then upgrades to
  // the Branch short link once generated.
  // Fix 4: never a phone number in a link - plain site link until ready.
  const [inviteLink, setInviteLink] = useState('https://30ActsofKindness.org');
  useEffect(() => {
    if (!invitePhone) return;
    let alive = true;
    generateInviteLink({ phone: invitePhone }).then((url) => {
      if (alive && url) setInviteLink(url);
    });
    return () => { alive = false; };
  }, [invitePhone]);
  const handleInviteShare = async () => {
    const message =
      "I'm doing 30 Acts of Kindness — 30 days, one kind act a day. " +
      "Join me and you'll be added to my kindness tree!\n\n" +
      `Get started: ${inviteLink}`;
    try {
      await Share.share({ message });
    } catch (e) {
      console.warn('Invite share error:', e.message);
    }
  };

  // ── Fix 6 (18 Nov 2026): Me is one short page of grouped rows ──────────
  // Profile opens as its own page; Help and Feedback live here instead of
  // in the tab bar.
  const [page, setPage] = useState('main');          // 'main' | 'profile'
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [openGroups, setOpenGroups] = useState(false);
  const [openLegal, setOpenLegal] = useState(false);

  // "N acts all-time" in the header - same count as the Home dashboard.
  const [lifetime, setLifetime] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const phone = actingPhone(user?.email);
    if (!phone) return undefined;
    lifetimeCompletionCount(phone)
      .then((n) => { if (!cancelled && typeof n === 'number') setLifetime(n); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.email, challenge, acting]);

  // The text-message consent wording shows once, at the moment someone turns
  // texts on; they must tap "Yes, text me" before anything is saved.
  const onReminderSwitch = (next) => {
    if (next) setShowConsent(true);
    else toggleReminder('master', false);
  };
  const acceptConsent = () => {
    setShowConsent(false);
    toggleReminder('master', true);
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You can sign back in any time with your phone number.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => navigate('logout') },
    ]);
  };

  const displayName = acting
    ? acting.first_name
    : [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Me';
  const headerLine = challenge
    ? `Day ${completedCount} of 30 · ${lifetime == null ? '…' : lifetime} acts all-time`
    : 'Not started yet';
  const isAdminUser = user?.role === 'OWNER' || user?.role === 'ADMIN';

  // Age picker, shared by the profile page.
  const ageModal = (
    <Modal visible={showAgeBrackets} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Select Age</Text>
          <TouchableOpacity onPress={() => setShowAgeBrackets(false)}>
            <Text style={{ color: C.primaryText, fontSize: 16, fontWeight: '700' }}>Done</Text>
          </TouchableOpacity>
        </View>
        {AGE_BRACKETS.map(b => (
          <TouchableOpacity
            key={b.value}
            onPress={() => { setAgeBracket(b.value); setShowAgeBrackets(false); }}
            style={[s.ageRow, ageBracket === b.value && { backgroundColor: C.primary + '22' }]}
          >
            <Text style={[s.ageRowText, ageBracket === b.value && { color: C.primaryText, fontWeight: '700' }]}>
              {b.label}
            </Text>
            {ageBracket === b.value && <Text style={{ color: C.primaryText }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
      </Modal>
  );

  // ── Profile page ──────────────────────────────────────────────────────
  if (page === 'profile') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Profile" onBack={() => setPage('main')} />
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Card style={s.mb}>
            <View style={s.emailRow}>
              <Text style={s.emailLabel} numberOfLines={1}>{user?.email?.includes('@phone.30acts.app') ? 'Phone' : 'Email'}</Text>
              <Text style={s.emailVal} numberOfLines={1}>
                {user?.email?.includes('@phone.30acts.app')
                  ? (user?.phone || user?.email?.replace('@phone.30acts.app', ''))
                  : user?.email}
              </Text>
              <Text>🔒</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAgeBrackets(true)} style={s.ageBracketBtn}>
              <Text style={s.ageBracketLabel}>Age</Text>
              <Text style={[s.ageBracketVal, !ageBracket && { color: C.muted }]} numberOfLines={1}>
                {ageBracket ? AGE_BRACKETS.find(b => b.value === ageBracket)?.label : 'Select…'}
              </Text>
              <Text style={{ color: C.sub }}>▾</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <AppInput label="First Name" value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={{ flex: 1 }}>
                <AppInput label="Last Name" value={lastName} onChangeText={setLastName} />
              </View>
            </View>
            <AppInput
              label="Email (optional)"
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={s.helperText}>For account recovery and occasional updates.</Text>

            {/* Fix 6: the mailing address is no longer on the profile. It is
                asked for when someone finishes day 30 and claims the bracelet
                (BraceletFormScreen). The ZIP stays: it sets the home time zone. */}
            <AppInput
              label="ZIP Code (sets your time zone)"
              value={zip}
              onChangeText={t => setZip(t.replace(/\D/g, '').slice(0, 5))}
              placeholder="43215"
              keyboardType="number-pad"
              maxLength={5}
              error={zipError}
              inputAccessoryViewID={KB_DONE_ID}
            />
            {zipLoading && <Text style={s.zipStatus}>🔎 Looking up ZIP…</Text>}
            {zipState && !zipLoading && (
              <View style={s.tzPill}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>🕐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.tzLabel}>LOCATION (AUTO)</Text>
                  <Text style={s.tzValue}>
                    {zipCity}, {zipState}{timezone ? ` — ${timezone}` : ''}
                  </Text>
                </View>
              </View>
            )}

            {saved && (
              <View style={s.savedBanner}>
                <Text style={{ color: C.success, fontWeight: '700', fontSize: 13 }}>✓ Profile saved</Text>
              </View>
            )}
            <Btn label="Save Profile" onPress={() => handleSave()} />
          </Card>
        </ScrollView>
        {ageModal}
        <KeyboardDoneBar />
      </View>
    );
  }

  // ── Main Me page ──────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Me" />
      {/* Pinned under the header, outside the ScrollView, so it shows at
          any scroll position. */}
      {!!reminderFlash && (
        <View style={s.reminderFlash}>
          <Text style={s.reminderFlashText}>{reminderFlash}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll}>

        <View style={s.meHeader}>
          <Text style={s.meName}>{displayName}</Text>
          <Text style={s.meLine}>{headerLine}</Text>
          {!challenge && <Btn label="Start 🚀" onPress={onStartChallenge} style={{ marginTop: 12 }} />}
        </View>

        <Text style={s.groupLabel}>REMINDERS</Text>
        <View style={s.group}>
          <View style={[s.row, s.rowLast]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowTimePicker(v => !v)}>
              <Text style={s.rowText}>Daily text at {fmtTime(reminderHour, reminderMinute, reminderPeriod)}</Text>
              <Text style={s.rowSub}>{showTimePicker ? 'Tap here to close' : 'Tap to change the time'}</Text>
            </TouchableOpacity>
            <Switch
              value={reminderEnabled}
              onValueChange={onReminderSwitch}
              trackColor={{ false: C.border, true: C.primary + '88' }}
              thumbColor={reminderEnabled ? C.primary : '#f4f3f4'}
            />
          </View>
          {showTimePicker && (
            <View style={s.reminderTimeWrap}>
              <Text style={s.reminderTimeLabel}>REMINDER TIME</Text>
              <View style={s.reminderTimeRow}>
                <View style={s.reminderColumn}>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminderHour(h => h === 12 ? 1 : h + 1)}>
                    <Text style={s.reminderArrowText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={s.reminderValue}>{String(reminderHour).padStart(2, '0')}</Text>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminderHour(h => h === 1 ? 12 : h - 1)}>
                    <Text style={s.reminderArrowText}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.reminderColon}>:</Text>
                <View style={s.reminderColumn}>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminderMinute(m => (m + 5) % 60)}>
                    <Text style={s.reminderArrowText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={s.reminderValue}>{String(reminderMinute).padStart(2, '0')}</Text>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminderMinute(m => (m - 5 + 60) % 60)}>
                    <Text style={s.reminderArrowText}>▼</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.reminderPeriodWrap}>
                  <TouchableOpacity
                    style={[s.reminderPeriodBtn, reminderPeriod === 'AM' && s.reminderPeriodBtnActive]}
                    onPress={() => setReminderPeriod('AM')}
                  >
                    <Text style={[s.reminderPeriodText, reminderPeriod === 'AM' && s.reminderPeriodTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.reminderPeriodBtn, reminderPeriod === 'PM' && s.reminderPeriodBtnActive]}
                    onPress={() => setReminderPeriod('PM')}
                  >
                    <Text style={[s.reminderPeriodText, reminderPeriod === 'PM' && s.reminderPeriodTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={s.reminderHint}>
                {reminderEnabled ? 'Time changes save on their own.' : 'Turn the switch on to get the daily text.'}
              </Text>
            </View>
          )}
        </View>

        <Text style={s.groupLabel}>COMMUNITY</Text>
        <View style={s.group}>
          <Row label="Groups" chevron={openGroups ? '⌄' : '›'} onPress={() => setOpenGroups(v => !v)} />
          {openGroups && (
            <>
              <Row sub label="Join a group" onPress={() => navigation.navigate('JoinSponsor')} />
              <Row sub label="My groups" onPress={() => navigation.navigate('MySponsors')} />
              <Row sub label="Sponsor a new group" onPress={() => navigation.navigate('CreateSponsor')} />
            </>
          )}
          <Row label="Family" onPress={() => navigation.navigate('Family')} />
          <Row label="Invite friends" onPress={() => setShowInvite(true)} last={!hasRecognition} />
          {hasRecognition && (
            <Row label="My recognition" onPress={() => navigation.navigate('Recognition')} last />
          )}
        </View>

        <Text style={s.groupLabel}>HELP AND FEEDBACK</Text>
        <View style={s.group}>
          <Row label="How it works" onPress={() => navigation.navigate('Tour')} />
          <Row label="Send feedback" onPress={() => navigation.navigate('Feedback')} />
          <Row label="Report a problem" onPress={() => reportProblem(user)} />
          <Row label="Support the mission" onPress={() => navigation.navigate('Donation')} />
          <Row label="Legal & policies" chevron={openLegal ? '⌄' : '›'} onPress={() => setOpenLegal(v => !v)} />
          {openLegal && (
            <>
              <Row sub label="Terms of Service" onPress={() => navigation.navigate('Legal', { docKey: 'terms' })} />
              <Row sub label="Privacy Policy" onPress={() => navigation.navigate('Legal', { docKey: 'privacy' })} />
              <Row sub label="Community Guidelines" onPress={() => navigation.navigate('Legal', { docKey: 'guidelines' })} />
              <Row sub label="Content Moderation Policy" onPress={() => navigation.navigate('Legal', { docKey: 'moderation' })} />
            </>
          )}
          <Row label="About this app" onPress={() => navigation.navigate('Help')} last />
        </View>

        <Text style={s.groupLabel}>ACCOUNT</Text>
        <View style={s.group}>
          <Row label="Profile" onPress={() => setPage('profile')} />
          {biometricAvailable ? (
            <View style={s.row}>
              <Text style={[s.rowText, { flex: 1 }]}>{biometricLabel} lock</Text>
              <Switch
                value={biometricEnabled}
                onValueChange={toggleBiometric}
                trackColor={{ false: C.border, true: C.primary + '88' }}
                thumbColor={biometricEnabled ? C.primary : '#f4f3f4'}
              />
            </View>
          ) : null}
          <Row label="Log out" onPress={confirmLogout} />
          {challenge ? (
            <Row label="Start over at Day 1" danger onPress={handleRestart} />
          ) : null}
          <Row label="Delete My Account" danger onPress={() => setShowDeleteConfirm(true)} last />
        </View>

        {isAdminUser && (
          <>
            <Text style={s.groupLabel}>ADMIN</Text>
            <View style={s.group}>
              <Row label="Recognition Orders (Admin)" onPress={() => navigation.navigate('RecognitionAdmin')} last />
            </View>
          </>
        )}
      </ScrollView>

      {/* Text-message consent (CTIA/TCPA), shown when texts are turned on. */}
      <Modal visible={showConsent} transparent animationType="fade" onRequestClose={() => setShowConsent(false)}>
        <View style={s.modalDim}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Daily text reminders</Text>
            <Text style={s.smsConsent}>{SMS_CONSENT_TEXT}</Text>
            <View style={s.smsConsentLinks}>
              <TouchableOpacity onPress={() => { setShowConsent(false); navigation.navigate('Legal', { docKey: 'privacy' }); }}>
                <Text style={s.smsConsentLink}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={s.smsConsentDot}>·</Text>
              <TouchableOpacity onPress={() => { setShowConsent(false); navigation.navigate('Legal', { docKey: 'terms' }); }}>
                <Text style={s.smsConsentLink}>Terms of Service</Text>
              </TouchableOpacity>
            </View>
            <Btn label="Yes, text me" onPress={acceptConsent} style={{ marginTop: 16 }} />
            <Btn label="Not now" variant="secondary" onPress={() => setShowConsent(false)} style={{ marginTop: 8 }} />
          </View>
        </View>
      </Modal>

      {/* Invite friends: QR code to scan in person, or share the link. */}
      <Modal visible={showInvite} transparent animationType="fade" onRequestClose={() => setShowInvite(false)}>
        <View style={s.modalDim}>
          <View style={[s.modalBox, { alignItems: 'center' }]}>
            <Text style={s.modalTitle}>🌳 Invite friends</Text>
            <Text style={[s.cardSub, { textAlign: 'center', marginTop: 6 }]}>
              Anyone who scans your code or taps your link is added to your tree.
            </Text>
            <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 12 }}>
              <QRCode value={inviteLink} size={172} backgroundColor="#fff" color="#111" />
            </View>
            <Text selectable style={{ color: C.sub, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
              {inviteLink}
            </Text>
            <Btn label="📲 Share Your Invite" onPress={handleInviteShare} style={{ alignSelf: 'stretch' }} />
            <Btn label="Close" variant="secondary" onPress={() => setShowInvite(false)} style={{ alignSelf: 'stretch', marginTop: 8 }} />
          </View>
        </View>
      </Modal>

      <TypedConfirmModal
        visible={showDeleteConfirm}
        title="Delete your account?"
        body={
          "This permanently removes your profile and sign-in. " +
          "Your acts will be kept anonymously for aggregate stats but cannot be linked back to you. " +
          "This cannot be undone."
        }
        confirmWord="DELETE"
        confirmLabel="Delete forever"
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deletingAccount}
      />
    </View>
  );
}

// One tappable row in a Me group.
function Row({ label, onPress, danger, sub, last, chevron = '›' }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.row, sub && s.rowSubItem, last && s.rowLast]}>
      <Text style={[s.rowText, sub && s.rowTextSub, danger && s.rowDanger]}>{label}</Text>
      {!danger && <Text style={s.rowChevron}>{chevron}</Text>}
    </TouchableOpacity>
  );
}


const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  mb: { marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  cardSub:   { color: C.sub,  fontSize: 13, marginBottom: 14, lineHeight: 18 },
  emailRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2,
    borderRadius: 10, padding: 12, marginBottom: 14, gap: 8,
  },
  emailLabel: { color: C.muted, fontSize: 12, fontWeight: '600', width: 56 },
  emailVal:   { color: C.sub, fontSize: 13, flex: 1 },
  zipStatus:  { color: C.muted, fontSize: 12, marginBottom: 10, fontStyle: 'italic' },
  tzPill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.primary + '44', marginBottom: 12,
  },
  tzLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  tzValue: { color: C.primaryText, fontSize: 14, fontWeight: '700' },
  helperText:    { color: C.muted, fontSize: 11, marginTop: -6, marginBottom: 12, fontStyle: 'italic' },
  helperTextTop: { color: C.muted, fontSize: 11, marginBottom: 12, fontStyle: 'italic', lineHeight: 16 },
  savedBanner: {
    backgroundColor: C.success + '22', borderWidth: 1, borderColor: C.success + '44',
    borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center',
  },
  divider: {
    height: 1, backgroundColor: C.border,
    marginTop: 8, marginBottom: 14,
  },
  sectionHeader: {
    color: C.primaryText, fontSize: 11, fontWeight: '900',
    letterSpacing: 1, marginBottom: 6,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  toggleTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  toggleSub:   { color: C.sub,  fontSize: 12, lineHeight: 16 },

  reminderTimeWrapOff: { opacity: 0.55 },
  reminderTimeWrap: {
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border,
  },
  reminderTimeLabel: {
    color: C.primaryText, fontSize: 11, fontWeight: '900',
    letterSpacing: 1, marginBottom: 10,
  },
  reminderTimeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  reminderColumn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  reminderArrow: { paddingVertical: 10, paddingHorizontal: 16, minWidth: 44, alignItems: 'center' },
  reminderArrowText: { color: C.primaryText, fontSize: 14, fontWeight: '900' },
  reminderValue: {
    color: C.text, fontSize: 26, fontWeight: '800',
    fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'center',
  },
  reminderColon: { color: C.text, fontSize: 26, fontWeight: '800' },
  reminderPeriodWrap: { marginLeft: 8, gap: 4 },
  reminderPeriodBtn: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  reminderPeriodBtnActive: {
    backgroundColor: C.primary + '22', borderColor: C.primary,
  },
  reminderPeriodText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  reminderPeriodTextActive: { color: C.primaryText },
  reminderSetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 14,
  },
  statusChip: {
    paddingVertical: 12, paddingHorizontal: 26,
    borderRadius: 999, borderWidth: 2, flexShrink: 0,
  },
  statusChipOn:  { borderColor: C.success, backgroundColor: C.success + '1A' },
  statusChipOff: { borderColor: C.border,  backgroundColor: 'transparent' },
  statusChipText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  statusChipTextOn:  { color: C.success },
  statusChipTextOff: { color: C.muted },

  reminderFlash: {
    backgroundColor: C.primary,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  reminderFlashText: {
    color: C.onPrimary, fontSize: 15, fontWeight: '900', textAlign: 'center',
  },

  buildStamp: {
    color: C.muted, fontSize: 11, textAlign: 'center',
    marginTop: 18, marginBottom: 6, letterSpacing: 0.4,
  },
  buildStampDb: {
    color: C.muted, fontSize: 11, textAlign: 'center',
    marginTop: 0, marginBottom: 6, letterSpacing: 0.4,
  },
  reminderHint: {
    color: C.muted, fontSize: 11, fontStyle: 'italic',
    textAlign: 'center', marginTop: 12,
  },

  smsConsent: {
    color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 12,
  },
  smsConsentLinks: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
  },
  smsConsentLink: {
    color: C.primaryText, fontSize: 11, fontWeight: '700', textDecorationLine: 'underline',
  },
  smsConsentDot: { color: C.muted, fontSize: 11 },
  smsConsentStamp: {
    color: C.success, fontSize: 11, fontWeight: '700', marginTop: 8,
  },

  // iOS-native Done bar
  kbBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
 kbDone: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },

  ageBracketBtn: {
  flexDirection: 'row', alignItems: 'center',
  backgroundColor: C.card2, borderRadius: 10,
  padding: 12, marginBottom: 14, gap: 8,
},
ageBracketLabel: { color: C.muted, fontSize: 12, fontWeight: '600', width: 56 },
ageBracketVal:   { color: C.text, fontSize: 13, flex: 1 },
modalHeader: {
  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
},
modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
ageRow: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  paddingHorizontal: 16, paddingVertical: 14,
  borderBottomWidth: 1, borderBottomColor: C.border + '44',
},
ageRowText: { color: C.text, fontSize: 15 },
legalRow: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  paddingVertical: 12,
  borderBottomWidth: 1, borderBottomColor: C.border + '44',
},
legalRowLast: { borderBottomWidth: 0 },
legalRowText: { color: C.text, fontSize: 14 },
legalRowChevron: { color: C.muted, fontSize: 18, fontWeight: '600' },

  // Fix 6: grouped rows
  meHeader:   { alignItems: 'center', paddingVertical: 12, marginBottom: 6 },
  meName:     { color: C.text, fontSize: 22, fontWeight: '800' },
  meLine:     { color: C.sub, fontSize: 14, marginTop: 4 },
  groupLabel: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 6, marginLeft: 4 },
  group:      { backgroundColor: C.card || C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14 },
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border + '66' },
  rowLast:    { borderBottomWidth: 0 },
  rowSubItem: { paddingLeft: 16 },
  rowText:    { color: C.text, fontSize: 16, fontWeight: '600' },
  rowTextSub: { fontSize: 15, fontWeight: '500', color: C.sub },
  rowSub:     { color: C.muted, fontSize: 12, marginTop: 2 },
  rowDanger:  { color: C.error, fontWeight: '700' },
  rowChevron: { color: C.muted, fontSize: 20, fontWeight: '600' },
  modalDim:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  modalBox:   { backgroundColor: C.bg, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border },
});
