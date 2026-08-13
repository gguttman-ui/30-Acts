import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, TextInput,
  InputAccessoryView, Keyboard, Image, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppInput, Btn } from '../components';
import { C, STATE_IANA_TZ, SMS_CONSENT_VERSION, SMS_CONSENT_TEXT } from '../constants';
import { lookupZip } from '../lib/zip';
import { supabase } from '../lib/supabase';
import { applyPendingReferral } from '../lib/branch';

// Apple demo account bypass — documented in App Store Connect's
// "App Review Information" field. Reviewers enter this phone + OTP
// and we sign them in without contacting Twilio.
const DEMO_PHONE_RAW = '+15550100100';
const DEMO_OTP       = '123456';

// Extra fake-number test account for profile-field testing. Reserved fictional
// number (555-0100–0199 block), same bypass path as the Apple demo: no Twilio,
// accepts DEMO_OTP, auto-creates the proxy account on first login.
const TEST_PHONE_RAW = '+15550100142';

// Numbers that skip Twilio entirely and accept DEMO_OTP.
const BYPASS_PHONES = [DEMO_PHONE_RAW, TEST_PHONE_RAW];

// Default profile metadata seeded when each bypass account is first created.
// Test account starts blank so you can exercise each field by hand.
const BYPASS_META = {
  [DEMO_PHONE_RAW]: { firstName: 'Demo', lastName: 'Reviewer', state: 'CA' },
  [TEST_PHONE_RAW]: { firstName: '',     lastName: '',         state: ''   },
};

const KB_DONE_ID = 'authKbDone';

// AsyncStorage key for the phone we remember between sessions.
// Set in App.js handleLogin/handleHardLogout. Read on AuthScreen mount.
const REMEMBERED_PHONE_KEY = 'remembered_phone';

const phoneProxyEmail    = (formatted) => formatted + '@phone.30acts.app';
const phoneProxyPassword = (formatted) => 'Ph0ne_' + formatted.replace(/\D/g, '') + '_30Acts!';

function prettyFormatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  const ten = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  const d = ten.slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function toTenDigits(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

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

// Small hour:minute AM/PM stepper, matching the Me screen's reminder picker.
// Defined at module scope so the inputs never remount mid-edit.
function RemTimePicker({ hour, minute, period, setHour, setMinute, setPeriod }) {
  return (
    <View style={s.remTimeRow}>
      <View style={s.remCol}>
        <TouchableOpacity style={s.remArrow} onPress={() => setHour(h => h === 12 ? 1 : h + 1)}><Text style={s.remArrowTxt}>▲</Text></TouchableOpacity>
        <Text style={s.remValue} allowFontScaling={false} numberOfLines={1}>{String(hour).padStart(2, '0')}</Text>
        <TouchableOpacity style={s.remArrow} onPress={() => setHour(h => h === 1 ? 12 : h - 1)}><Text style={s.remArrowTxt}>▼</Text></TouchableOpacity>
      </View>
      <Text style={s.remColon} allowFontScaling={false}>:</Text>
      <View style={s.remCol}>
        <TouchableOpacity style={s.remArrow} onPress={() => setMinute(m => (m + 5) % 60)}><Text style={s.remArrowTxt}>▲</Text></TouchableOpacity>
        <Text style={s.remValue} allowFontScaling={false} numberOfLines={1}>{String(minute).padStart(2, '0')}</Text>
        <TouchableOpacity style={s.remArrow} onPress={() => setMinute(m => (m - 5 + 60) % 60)}><Text style={s.remArrowTxt}>▼</Text></TouchableOpacity>
      </View>
      <View style={s.remPeriodWrap}>
        {['AM', 'PM'].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.remPeriodBtn, period === p && s.remPeriodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.remPeriodTxt, period === p && s.remPeriodTxtActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AuthScreen({ onLogin, onShowMission, navigation }) {
  const insets = useSafeAreaInsets();
  // Default new arrivals to Sign Up. Returning users on the same device are
  // auto-routed to their code by the remembered-phone flow below, so this only
  // affects people without a remembered number (i.e. new sign-ups).
  // Single phone-first entry. Start with the phone field only; once a number is
  // entered we silently check the backend — existing users are logged straight
  // in, new users get the sign-up fields (name + ZIP) revealed below. No tabs.
  const [mode, setMode] = useState('login');
  const [signupFields, setSignupFields] = useState(false);

  const [fn,    setFn]    = useState('');
  const [ln,    setLn]    = useState('');
  const [phone, setPhone] = useState('');

  // ZIP-based location (replaces the old State picker). We derive city/state and
  // the timezone from the ZIP — the timezone is what reminders depend on.
  const [zip,        setZip]        = useState('');
  const [zipCity,    setZipCity]    = useState('');
  const [zipState,   setZipState]   = useState('');
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError,   setZipError]   = useState('');
  const [showMission, setShowMission] = useState(false);
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(false);

  // Reminder opt-in step, shown at the very end of signup (after verification).
  const [reminderStep,    setReminderStep]    = useState(false);
  const [pendingFinish,   setPendingFinish]   = useState(null);
  const [remEnabled,      setRemEnabled]      = useState(false);
  const [remHour,         setRemHour]         = useState(9);
  const [remMinute,       setRemMinute]       = useState(0);
  const [remPeriod,       setRemPeriod]       = useState('AM');
  const [rem2Enabled,     setRem2Enabled]     = useState(false);
  const [rem2Hour,        setRem2Hour]        = useState(6);
  const [rem2Minute,      setRem2Minute]      = useState(0);
  const [rem2Period,      setRem2Period]      = useState('PM');
  const [remSaving,       setRemSaving]       = useState(false);

  const [otpPending, setOtpPending] = useState(false);
  const [otpCode,    setOtpCode]    = useState(['', '', '', '', '', '']);
  // After ~1 minute on the code screen without success, actively surface the
  // "call me" option for people whose text is delayed or filtered.
  const [voiceNudge, setVoiceNudge] = useState(false);
  const inputs = useRef([]);

  // Start/reset the 60s "offer a call" timer whenever the code screen appears.
  useEffect(() => {
    if (!otpPending) { setVoiceNudge(false); return; }
    setVoiceNudge(false);
    const t = setTimeout(() => setVoiceNudge(true), 60000);
    return () => clearTimeout(t);
  }, [otpPending]);

  // Track whether we already attempted the auto-send-OTP for the
  // remembered phone, so that going "← Use a different number" or
  // "← Back" from the OTP screen lands on a clean entry form
  // without re-triggering the auto-send.
  const [autoOtpAttempted, setAutoOtpAttempted] = useState(false);

  useEffect(() => {
    if (otpPending) {
      // Pre-fill the demo code ONLY for bypass numbers (Apple reviewer + test
      // account), which accept DEMO_OTP with no real SMS. Real numbers must
      // enter the code Twilio actually texted them.
      const formatted = formatPhoneForAuth(phone);
      if (BYPASS_PHONES.includes(formatted)) {
        setOtpCode(DEMO_OTP.split(''));
      }
    }
  }, [otpPending]);

  // ── Auto-prefill + auto-send OTP for remembered users ─────────────
  // On mount, if we have a remembered phone in AsyncStorage AND we
  // haven't tried it yet this session, pre-fill the phone field and
  // automatically send the OTP. The user lands directly on the OTP
  // input screen with the SMS already on its way.
  //
  // If the user explicitly chose "Use a different number" we cleared
  // the remembered phone in App.js handleHardLogout, so this won't
  // re-trigger.
  useEffect(() => {
    (async () => {
      if (autoOtpAttempted) return;
      try {
        const remembered = await AsyncStorage.getItem(REMEMBERED_PHONE_KEY);
        if (!remembered) return;

        // remembered is stored as +1XXXXXXXXXX. Format for display.
        const ten = remembered.startsWith('+1') ? remembered.slice(2) : remembered.replace(/\D/g, '');
        const display = prettyFormatPhone(ten);
        if (!toTenDigits(display)) return;

        setPhone(display);
        setAutoOtpAttempted(true);

        // Try silent re-login first (existing behaviour). If that
        // works the user is back in without ever seeing OTP.
        const autoLoggedIn = await checkExistingPhoneUser(remembered);
        if (autoLoggedIn) return;

        // Silent login didn't work. For bypass numbers (Apple reviewer / test)
        // just show the code screen — DEMO_OTP is accepted with no real SMS. For a
        // real number we must actually SEND a code first, otherwise the OTP screen
        // would claim a code was sent with nothing on the way.
        const formatted = formatPhoneForAuth(display);
        if (BYPASS_PHONES.includes(formatted)) {
          setOtpPending(true);
        } else {
          await sendOtpFor(formatted);
        }
      } catch (e) {
        console.warn('Remembered phone auto-flow failed:', e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timezone = zipState ? STATE_IANA_TZ[zipState] : null;

  // Look up city/state from the ZIP once it's 5 digits (debounced).
  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) { setZipCity(''); setZipState(''); setZipError(''); return; }
    let cancelled = false;
    setZipLoading(true); setZipError('');
    const t = setTimeout(async () => {
      const result = await lookupZip(zip);
      if (cancelled) return;
      if (result && result.state) {
        setZipState(result.state);
        setZipCity(result.city || '');
        setZipError('');
      } else {
        setZipState(''); setZipCity('');
        setZipError('ZIP not found — check the number');
      }
      setZipLoading(false);
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [zip]);

  const handlePhoneChange = (raw) => {
    setPhone(prettyFormatPhone(raw));
    setErrors(e => ({ ...e, phone: '' }));
    // If they edit the number after we revealed the sign-up fields, collapse
    // back to the phone-only step so the next "Continue" re-checks the backend.
    if (signupFields) { setSignupFields(false); setMode('login'); }
  };

  const formatPhoneForAuth = (display) => {
    const ten = toTenDigits(display);
    return ten ? `+1${ten}` : null;
  };

  const checkExistingPhoneUser = async (formattedPhone) => {
    try {
      const proxyEmail = phoneProxyEmail(formattedPhone);
      const proxyPassword = phoneProxyPassword(formattedPhone);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: proxyEmail,
        password: proxyPassword,
      });

      if (!error && data?.user) {
        const authUser = data.user;
        finishLogin({
          email: proxyEmail,
          phone: formattedPhone,
          firstName: authUser?.user_metadata?.firstName || '',
          lastName: authUser?.user_metadata?.lastName || '',
          isFirstLogin: false,
        });
        return true;
      }

      return false;
    } catch (err) {
      console.log('Auto-login check failed:', err.message);
      return false;
    }
  };

  // Shared helper used by both the manual Verify button and the
  // auto-send-on-mount effect. Sends an OTP and flips to the OTP UI.
  const sendOtpFor = async (formatted) => {
    try {
      // Use the Supabase client (not a raw fetch) so the publishable key is
      // sent correctly. Raw fetch with the key on the Authorization: Bearer
      // header is rejected by the gateway for non-JWT publishable keys.
      const { data, error } = await supabase.rpc('send_phone_otp', {
        phone_number: formatted,
      });
      if (error) {
        console.warn('send_phone_otp error:', error.message);
        Alert.alert('Error', 'Could not send verification code. Please try again.');
        return false;
      }
      if (data?.status === 200 || data?.status === 201) {
        setOtpPending(true);
        return true;
      }
      Alert.alert('Error', 'Could not send verification code. Please try again.');
      return false;
    } catch (err) {
      Alert.alert('Error', err.message);
      return false;
    }
  };

  const handleDigitChange = (text, index) => {
    if (text.length === 6 && index === 0) {
      const digits = text.replace(/[^0-9]/g, '').slice(0, 6).split('');
      const newCode = [...Array(6)].map((_, i) => digits[i] || '');
      setOtpCode(newCode);
      const lastIndex = digits.length - 1;
      if (lastIndex < 5) {
        inputs.current[lastIndex + 1]?.focus();
      } else {
        inputs.current[5]?.blur();
      }
      return;
    }

    const newCode = [...otpCode];
    newCode[index] = text.replace(/[^0-9]/g, '').slice(-1);
    setOtpCode(newCode);
    if (text && index < 5) {
      inputs.current[index + 1]?.focus();
       } else if (text && index === 5) {
         Keyboard.dismiss();
       }
  };

  const validate = () => {
    const e = {};
    if (signupFields) {
      if (!fn.trim()) e.fn = 'Required';
      if (!ln.trim()) e.ln = 'Required';
      if (!/^\d{5}$/.test(zip)) e.zip = 'Enter your 5-digit ZIP code';
      else if (!zipState)       e.zip = 'Enter a valid US ZIP code';
    }
    if (!toTenDigits(phone)) e.phone = 'Enter a 10-digit US phone number';
    return e;
  };

  const finishLogin = (loginData) => {
    // On a brand-new sign-up, apply any pending Branch referral (tree + group).
    // Fire-and-forget and fully guarded inside — never blocks or breaks login.
    if (loginData?.isFirstLogin) {
      applyPendingReferral(loginData.phone).catch(() => {});
    }
    if (showMission && onShowMission) {
      onShowMission(loginData);
    } else {
      onLogin(loginData);
    }
  };

  // ── Reminder opt-in (end of sign-up) ──────────────────────────────────────
  // Writes the EXACT same user_metadata fields the Me screen writes, so a person
  // who opts in here is treated identically to one who opted in from settings.
  const to24 = (h, p) => (p === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12));

  const finishAfterReminders = () => {
    const data = pendingFinish;
    setReminderStep(false);
    setPendingFinish(null);
    setOtpPending(false);
    if (data) finishLogin(data);
  };

  const inWindow = (h, p) => { const hr = to24(h, p); return hr >= 6 && hr < 22; };

  // "Done" on the reminder step. Saves the SAME user_metadata the Me screen
  // writes (first + optional second reminder + consent), then heads to the
  // dashboard. If the reminder toggle is off, just continues in.
  const finishReminders = async () => {
    if (!remEnabled) { finishAfterReminders(); return; }

    if (!inWindow(remHour, remPeriod) || (rem2Enabled && !inWindow(rem2Hour, rem2Period))) {
      Alert.alert(
        'Pick a daytime reminder',
        'Reminders can only be sent between 6:00 AM and 9:59 PM. Please choose a time in that range.'
      );
      return;
    }

    setRemSaving(true);
    try {
      await supabase.auth.updateUser({
        data: {
          // Re-stamp the ZIP-derived location so reminders always have a
          // timezone, even if the account was created without one.
          ...(timezone ? { timezone } : {}),
          ...(zipState ? { state: zipState } : {}),
          ...(zip      ? { zip } : {}),
          ...(zipCity  ? { city: zipCity } : {}),
          reminder_enabled:  true,
          reminder_hour:     remHour,
          reminder_minute:   remMinute,
          reminder_period:   remPeriod,
          reminder2_enabled: rem2Enabled,
          reminder2_hour:    rem2Enabled ? rem2Hour   : null,
          reminder2_minute:  rem2Enabled ? rem2Minute : null,
          reminder2_period:  rem2Enabled ? rem2Period : null,
          reminder_consent_at:      new Date().toISOString(),
          reminder_consent_version: SMS_CONSENT_VERSION,
        },
      });
    } catch (e) {
      // Non-fatal: still let them into the app; they can enable it from the Me
      // screen if this save happened to fail.
      console.warn('Reminder opt-in save failed:', e?.message);
    } finally {
      setRemSaving(false);
      finishAfterReminders();
    }
  };

  // Step 1 of the single phone-first flow: a number was entered and they tapped
  // Continue. Silently decide returning-user vs new-user.
  const handleContinue = async () => {
    const e = {};
    if (!toTenDigits(phone)) e.phone = 'Enter a 10-digit US phone number';
    if (Object.keys(e).length) return setErrors(e);
    setLoading(true);
    const formatted = formatPhoneForAuth(phone);

    // Apple reviewer demo number: straight to the OTP screen (frictionless
    // review — BYPASS_META supplies the profile). Treated as a sign-up at verify.
    if (formatted === DEMO_PHONE_RAW) {
      setMode('signup');
      setOtpPending(true);
      setLoading(false);
      return;
    }

    // Existing number → silent login. No OTP, no extra fields.
    const autoLoggedIn = await checkExistingPhoneUser(formatted);
    if (autoLoggedIn) { setLoading(false); return; }

    // New number (including the reset test number) → reveal the sign-up fields.
    // The OTP is sent once those are filled, in handleSignupSend.
    setMode('signup');
    setSignupFields(true);
    setLoading(false);
  };

  // Step 2: a new user filled in their name + ZIP. Validate and send the code.
  const handleSignupSend = async () => {
    const e = validate();
    if (Object.keys(e).length) return setErrors(e);
    setLoading(true);
    const formatted = formatPhoneForAuth(phone);

    // Test bypass number: skip Twilio, jump to OTP (DEMO_OTP accepted at verify),
    // but still carry the name/ZIP just entered so the full flow is exercised.
    if (BYPASS_PHONES.includes(formatted)) {
      setOtpPending(true);
      setLoading(false);
      return;
    }

    await sendOtpFor(formatted);
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    const otp = otpCode.join('');
    if (otp.length !== 6) { Alert.alert('Enter the full 6-digit code.'); return; }
    setLoading(true);
    try {
      const formatted = formatPhoneForAuth(phone);

      // Demo shortcut: accept DEMO_OTP only for the bypass numbers (Apple
      // reviewer + test account). Every real number falls through to the live
      // verify_phone_otp Twilio check below.
      if (otp === DEMO_OTP && BYPASS_PHONES.includes(formatted)) {
        const proxyEmail    = phoneProxyEmail(formatted);
        const proxyPassword = phoneProxyPassword(formatted);
        // Merge the bypass name defaults with the ZIP the tester entered, so the
        // test account carries a real timezone (reminders need it).
        const bypass = BYPASS_META[formatted] || {};
        const meta   = {
          firstName: bypass.firstName || fn,
          lastName:  bypass.lastName  || ln,
          state:     zipState || bypass.state || null,
          zip:       zip     || null,
          city:      zipCity || null,
          timezone:  timezone || null,
        };
        let authResult = await supabase.auth.signInWithPassword({ email: proxyEmail, password: proxyPassword });
        if (authResult.error) {
          authResult = await supabase.auth.signUp({
            email: proxyEmail, password: proxyPassword,
            options: { data: { phone: formatted, ...meta } },
          });
        }
        const authUser = authResult?.data?.user;
        const loginData = {
          email:        proxyEmail,
          phone:        formatted,
          firstName:    authUser?.user_metadata?.firstName || meta.firstName || '',
          lastName:     authUser?.user_metadata?.lastName  || meta.lastName  || '',
          isFirstLogin: mode === 'signup',
        };
        // Test/demo sign-ups walk the same end-of-signup reminder step as real
        // ones, so the whole flow can be exercised with the bypass number.
        if (mode === 'signup') {
          setPendingFinish(loginData);
          setReminderStep(true);
          setLoading(false);
          return;
        }
        finishLogin(loginData);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('verify_phone_otp', {
        phone_number: formatted,
        code: otp,
      });
      if (error) {
        console.warn('verify_phone_otp error:', error.message);
        Alert.alert('Error', 'Could not verify the code. Please try again.');
        setLoading(false);
        return;
      }
      const body = typeof data?.body === 'string' ? JSON.parse(data.body) : data?.body;

      if (body?.status === 'approved') {
        const proxyEmail    = phoneProxyEmail(formatted);
        const proxyPassword = phoneProxyPassword(formatted);
        let authResult = await supabase.auth.signInWithPassword({ email: proxyEmail, password: proxyPassword });
        if (authResult.error) {
          authResult = await supabase.auth.signUp({
            email: proxyEmail, password: proxyPassword,
            options: { data: { phone: formatted, firstName: fn, lastName: ln, state: zipState, zip, city: zipCity, timezone } },
          });
        }
        const authUser = authResult?.data?.user;
        const loginData = {
          email:        proxyEmail,
          phone:        formatted,
          firstName:    authUser?.user_metadata?.firstName || fn,
          lastName:     authUser?.user_metadata?.lastName  || ln,
          isFirstLogin: mode === 'signup',
        };
        // At the very end of a real sign-up, offer daily reminders before
        // entering the app. Returning logins go straight in.
        if (mode === 'signup') {
          setPendingFinish(loginData);
          setReminderStep(true);
          return;
        }
        finishLogin(loginData);
      } else {
        Alert.alert('Invalid Code', 'The code you entered is incorrect. Please try again.');
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      const formatted = formatPhoneForAuth(phone);
      const { data, error } = await supabase.rpc('send_phone_otp', {
        phone_number: formatted,
      });
      if (error) {
        console.warn('send_phone_otp (resend) error:', error.message);
        Alert.alert('Error', 'Could not resend code.');
        return;
      }
      if (data?.status === 200 || data?.status === 201) {
        Alert.alert('Sent!', 'New code sent to ' + phone);
      } else {
        Alert.alert('Error', 'Could not resend code.');
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Voice fallback: Twilio calls the phone and reads the code aloud. Useful when
  // an SMS is delayed or filtered by the carrier. Uses the same Verify service;
  // verify_phone_otp checks the code regardless of how it was delivered.
  const handleCallMe = async () => {
    setLoading(true);
    try {
      const formatted = formatPhoneForAuth(phone);
      const { data, error } = await supabase.rpc('send_phone_otp_voice', {
        phone_number: formatted,
      });
      if (error) {
        console.warn('send_phone_otp_voice error:', error.message);
        Alert.alert('Could not call', 'We could not place the call. Please try Resend instead.');
        return;
      }
      if (data?.status === 200 || data?.status === 201) {
        Alert.alert('Calling you now', "Answer the call and we'll read your 6-digit code aloud, then enter it above.");
      } else {
        Alert.alert('Could not call', 'We could not place the call. Please try Resend instead.');
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Forget remembered phone and return to the entry form. Used by
  // "Use a different number" on the OTP screen.
  const handleUseDifferentNumber = async () => {
    try { await AsyncStorage.removeItem(REMEMBERED_PHONE_KEY); } catch {}
    setOtpPending(false);
    setOtpCode(['','','','','','']);
    setPhone('');
  };

  // Final sign-up step: offer daily reminders, mirroring the Me screen — turn it
  // on, confirm the time, optionally add a second, then Done → dashboard.
  if (reminderStep) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.remScroll} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 56, marginBottom: 10, textAlign: 'center' }}>⏰</Text>
          <Text style={s.otpTitle}>Daily reminder</Text>
          <Text style={s.otpSub}>
            A gentle text nudge to help you keep your kindness streak going. You can
            change this anytime in the Me tab.
          </Text>

          <View style={s.remToggleRow}>
            <Text style={s.remToggleLabel}>Daily reminder</Text>
            <Switch
              value={remEnabled}
              onValueChange={setRemEnabled}
              trackColor={{ false: C.border, true: C.primary + '88' }}
              thumbColor={remEnabled ? C.primary : '#f4f3f4'}
            />
          </View>

          {remEnabled && (
            <>
              <Text style={s.remConsent}>{SMS_CONSENT_TEXT}</Text>

              <Text style={s.remSectionLabel}>FIRST REMINDER</Text>
              <RemTimePicker
                hour={remHour} minute={remMinute} period={remPeriod}
                setHour={setRemHour} setMinute={setRemMinute} setPeriod={setRemPeriod}
              />

              <View style={[s.remToggleRow, { marginTop: 6 }]}>
                <Text style={s.remToggleLabel}>Add a second reminder</Text>
                <Switch
                  value={rem2Enabled}
                  onValueChange={setRem2Enabled}
                  trackColor={{ false: C.border, true: C.primary + '88' }}
                  thumbColor={rem2Enabled ? C.primary : '#f4f3f4'}
                />
              </View>

              {rem2Enabled && (
                <>
                  <Text style={s.remSectionLabel}>SECOND REMINDER</Text>
                  <RemTimePicker
                    hour={rem2Hour} minute={rem2Minute} period={rem2Period}
                    setHour={setRem2Hour} setMinute={setRem2Minute} setPeriod={setRem2Period}
                  />
                </>
              )}
            </>
          )}

          <Btn
            label={remSaving ? 'Saving…' : 'Done'}
            onPress={finishReminders}
            loading={remSaving}
            style={{ width: '100%', marginTop: 22 }}
          />
        </ScrollView>
        <KeyboardDoneBar />
      </KeyboardAvoidingView>
    );
  }

  if (otpPending) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={40}
      >
        <ScrollView contentContainerStyle={s.otpWrap} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 64, marginBottom: 16 }}>📱</Text>
          <Text style={s.otpTitle}>Check your texts</Text>
          <Text style={s.otpSub}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ color: C.primary, fontWeight: '700' }}>{phone}</Text>
            {'\n\n'}Enter it below to verify your account.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
            {otpCode.map((digit, i) => (
              <TextInput
                key={i}
                ref={ref => inputs.current[i] = ref}
                value={digit}
                onChangeText={text => handleDigitChange(text, i)}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={i === 0 ? 6 : 1}
                autoFocus={i === 0}
                inputAccessoryViewID={KB_DONE_ID}
                style={[s.otpInput, { borderColor: digit ? C.primary : C.border }]}
              />
            ))}
          </View>
          <Btn label="Verify" onPress={handleVerifyOtp} loading={loading} style={{ width: '100%', marginBottom: 14 }} />
          <TouchableOpacity onPress={handleResend} disabled={loading}>
            <Text style={{ color: C.primary, fontWeight: '600', fontSize: 14 }}>
              Didn't get it? Resend code
            </Text>
          </TouchableOpacity>

          {voiceNudge && (
            <Text style={s.voiceNudgeText}>
              Still no text? Texts can be slow on some carriers — get your code by phone call instead:
            </Text>
          )}
          <TouchableOpacity
            onPress={handleCallMe}
            disabled={loading}
            style={[{ marginTop: 14 }, voiceNudge && s.callMeBtn]}
          >
            <Text style={[
              { color: C.primary, fontWeight: voiceNudge ? '800' : '600', fontSize: 14 },
              voiceNudge && { textAlign: 'center' },
            ]}>
              📞  Call me with the code instead
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleUseDifferentNumber} style={{ marginTop: 16 }}>
            <Text style={{ color: C.muted, fontSize: 13 }}>Use a different number</Text>
          </TouchableOpacity>
        </ScrollView>
        <KeyboardDoneBar />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 48 }]} keyboardShouldPersistTaps="handled">

        <View style={s.headerWrap}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.appTitle}>30 Acts of Kindness™</Text>
          <Text style={s.appSub}>Transform the world, one Act at a time</Text>
        </View>

        <AppInput
          label="Mobile Number"
          value={phone}
          onChangeText={handlePhoneChange}
          placeholder="(555) 555-5555"
          keyboardType="phone-pad"
          maxLength={14}
          error={errors.phone}
          inputAccessoryViewID={KB_DONE_ID}
        />
        <Text style={s.phoneHelper}>
          Enter your mobile number to sign in or sign up — we'll text you a code.
        </Text>

        {signupFields && (
          <>
            <Text style={s.newHint}>Looks like you're new here — a couple details to set up your account.</Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <AppInput label="First Name" value={fn} onChangeText={setFn} placeholder="Jane" error={errors.fn} />
              </View>
              <View style={{ flex: 1 }}>
                <AppInput label="Last Name" value={ln} onChangeText={setLn} placeholder="Doe" error={errors.ln} />
              </View>
            </View>

            <AppInput
              label="ZIP Code"
              value={zip}
              onChangeText={(t) => setZip(t.replace(/[^\d]/g, '').slice(0, 5))}
              placeholder="62704"
              keyboardType="number-pad"
              maxLength={5}
              error={errors.zip}
              inputAccessoryViewID={KB_DONE_ID}
            />
            {zipLoading ? <Text style={s.phoneHelper}>Looking up your ZIP…</Text> : null}
            {(zipCity && zipState) ? (
              <View style={s.tzPill}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>📍</Text>
                <View>
                  <Text style={s.tzLabel}>LOCATION (AUTO)</Text>
                  <Text style={s.tzValue}>
                    {zipCity}, {zipState}{timezone ? `  ·  ${timezone}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        )}

        <TouchableOpacity
          onPress={() => setShowMission(v => !v)}
          style={s.checkRow}
          activeOpacity={0.7}
        >
          <View style={[s.checkbox, showMission && s.checkboxChecked]}>
            {showMission && <Text style={{ color: C.bg, fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
          <Text style={s.checkLabel}>Show our mission before continuing</Text>
        </TouchableOpacity>

        <Btn
          label={signupFields ? 'Create account' : 'Continue'}
          onPress={signupFields ? handleSignupSend : handleContinue}
          loading={loading}
          style={{ marginTop: 8 }}
        />

        <Text style={s.terms}>By continuing you agree to our:</Text>
        <View style={s.legalLinks}>
          {[
            { label: 'Terms of Service',         key: 'terms' },
            { label: 'Privacy Policy',            key: 'privacy' },
            { label: 'Community Guidelines',      key: 'guidelines' },
            { label: 'Content Moderation Policy', key: 'moderation' },
          ].map(({ label, key }) => (
            <TouchableOpacity key={key} onPress={() => navigation.navigate('Legal', { docKey: key })}>
              <Text style={s.legalLink}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      <KeyboardDoneBar />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 24, paddingBottom: 48 },
  headerWrap: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 90, height: 90, borderRadius: 18, marginBottom: 12 },
  appTitle:   { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  appSub:     { color: C.sub, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  toggle: { flexDirection: 'row', backgroundColor: C.card2, borderRadius: 14, padding: 4, marginBottom: 20 },
  toggleBtn:        { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  toggleActive:     { backgroundColor: C.primary },
  toggleText:       { color: C.muted, fontWeight: '700', fontSize: 14 },
  toggleTextActive: { color: C.bg },
  inputLabel: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 7, letterSpacing: 0.5, textTransform: 'uppercase' },
  phoneHelper: { color: C.muted, fontSize: 11, marginTop: -6, marginBottom: 12, fontStyle: 'italic' },
  newHint: { color: C.sub, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 14 },
  pickerBtn: { backgroundColor: C.card2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1.5, borderColor: C.border, flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  errorText: { color: C.error, fontSize: 11, marginTop: 3, marginBottom: 10 },
  tzPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.primary + '44', marginBottom: 16 },
  tzLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  tzValue: { color: C.primary, fontSize: 14, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.primary,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  checkboxChecked: { backgroundColor: C.primary },
  checkLabel: { color: C.sub, fontSize: 14, flex: 1 },
  terms: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 20, marginBottom: 6 },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 },
  legalLink: { color: C.primary, fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  otpWrap:  { flexGrow: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  otpTitle: { color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  otpSub:   { color: C.sub, fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  otpInput: { width: 48, height: 58, borderRadius: 12, backgroundColor: C.card2, borderWidth: 2, color: C.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  voiceNudgeText: { color: C.sub, fontSize: 13, textAlign: 'center', marginTop: 18, lineHeight: 18, paddingHorizontal: 8 },
  callMeBtn: { borderWidth: 1.5, borderColor: C.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignSelf: 'stretch' },
  // Reminder opt-in step (end of sign-up)
  remScroll:    { flexGrow: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 28, paddingTop: 60 },
  remToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: C.border, marginTop: 14 },
  remToggleLabel:{ color: C.text, fontSize: 16, fontWeight: '800' },
  remSectionLabel:{ color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 16, marginBottom: 6, textAlign: 'center' },
  remTimeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 },
  remCol:       { alignItems: 'center' },
  remArrow:     { padding: 6 },
  remArrowTxt:  { color: C.primary, fontSize: 18, fontWeight: '900' },
  remValue:     { color: C.text, fontSize: 34, fontWeight: '900', minWidth: 54, textAlign: 'center', fontVariant: ['tabular-nums'] },
  remColon:     { color: C.text, fontSize: 30, fontWeight: '900', marginHorizontal: 2 },
  remPeriodWrap:{ marginLeft: 10, gap: 6 },
  remPeriodBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  remPeriodBtnActive: { backgroundColor: C.primary + '22', borderColor: C.primary },
  remPeriodTxt: { color: C.sub, fontSize: 14, fontWeight: '800' },
  remPeriodTxtActive: { color: C.primary },
  remConsent:   { color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border + '44' },
  stateCode: { color: C.primary, fontWeight: '700', fontSize: 14, width: 40 },
  stateName: { color: C.text, fontSize: 14, flex: 1 },

  kbBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  kbDone: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
});