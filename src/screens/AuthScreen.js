import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, TextInput,
  InputAccessoryView, Keyboard, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppInput, Btn } from '../components';
import { C, US_STATES, STATE_TZ } from '../constants';
import { supabase } from '../lib/supabase';

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

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10Znlla2R4dGtkaWFxYmdhb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjA2NDAsImV4cCI6MjA4OTU5NjY0MH0.02uXvFMvloJ64E7qH1YgU-zB9E4EsfQGO0dV9GZE8PY';
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

export default function AuthScreen({ onLogin, onShowMission, navigation }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('login');

  const [fn,    setFn]    = useState('');
  const [ln,    setLn]    = useState('');
  const [phone, setPhone] = useState('');

  const [state,       setState]       = useState('');
  const [showStates,  setShowStates]  = useState(false);
  const [showMission, setShowMission] = useState(false);
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(false);

  const [otpPending, setOtpPending] = useState(false);
  const [otpCode,    setOtpCode]    = useState(['', '', '', '', '', '']);
  const inputs = useRef([]);

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

        // Otherwise jump straight to the code screen (Twilio bypassed).
        setOtpPending(true);
      } catch (e) {
        console.warn('Remembered phone auto-flow failed:', e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timezone = state ? STATE_TZ[state] : null;
  const selectedStateName = US_STATES.find(([c]) => c === state)?.[1] || '';

  const handlePhoneChange = (raw) => {
    setPhone(prettyFormatPhone(raw));
    setErrors(e => ({ ...e, phone: '' }));
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
    if (mode === 'signup') {
      if (!fn.trim()) e.fn = 'Required';
      if (!ln.trim()) e.ln = 'Required';
      if (!state)     e.state = 'Select a state';
    }
    if (!toTenDigits(phone)) e.phone = 'Enter a 10-digit US phone number';
    return e;
  };

  const finishLogin = (loginData) => {
    if (showMission && onShowMission) {
      onShowMission(loginData);
    } else {
      onLogin(loginData);
    }
  };

  const handlePhoneSend = async () => {
    const e = validate();
    if (Object.keys(e).length) return setErrors(e);
    setLoading(true);
    const formatted = formatPhoneForAuth(phone);

    // Bypass accounts (Apple demo + fake-number test account) — skip Twilio
    // "send OTP" and jump straight to the OTP entry screen. The verify step
    // has its own bypass that accepts DEMO_OTP without contacting Twilio.
    if (BYPASS_PHONES.includes(formatted)) {
      setOtpPending(true);
      setLoading(false);
      return;
    }

    const autoLoggedIn = await checkExistingPhoneUser(formatted);
    if (autoLoggedIn) {
      setLoading(false);
      return;
    }

    // Real SMS via Twilio. sendOtpFor posts to send_phone_otp and flips to the
    // OTP entry screen on success (or alerts on failure).
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
        const meta          = BYPASS_META[formatted] || { firstName: fn, lastName: ln, state };
        let authResult = await supabase.auth.signInWithPassword({ email: proxyEmail, password: proxyPassword });
        if (authResult.error) {
          authResult = await supabase.auth.signUp({
            email: proxyEmail, password: proxyPassword,
            options: { data: { phone: formatted, ...meta } },
          });
        }
        const authUser = authResult?.data?.user;
        finishLogin({
          email:        proxyEmail,
          phone:        formatted,
          firstName:    authUser?.user_metadata?.firstName || meta.firstName || '',
          lastName:     authUser?.user_metadata?.lastName  || meta.lastName  || '',
          isFirstLogin: mode === 'signup',
        });
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
            options: { data: { phone: formatted, firstName: fn, lastName: ln, state } },
          });
        }
        const authUser = authResult?.data?.user;
        finishLogin({
          email:        proxyEmail,
          phone:        formatted,
          firstName:    authUser?.user_metadata?.firstName || fn,
          lastName:     authUser?.user_metadata?.lastName  || ln,
          isFirstLogin: mode === 'signup',
        });
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

  // Forget remembered phone and return to the entry form. Used by
  // "Use a different number" on the OTP screen.
  const handleUseDifferentNumber = async () => {
    try { await AsyncStorage.removeItem(REMEMBERED_PHONE_KEY); } catch {}
    setOtpPending(false);
    setOtpCode(['','','','','','']);
    setPhone('');
  };

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
          <TouchableOpacity onPress={handleUseDifferentNumber} style={{ marginTop: 16 }}>
            <Text style={{ color: C.muted, fontSize: 13 }}>Use a different number</Text>
          </TouchableOpacity>
        </ScrollView>
        <KeyboardDoneBar />
      </KeyboardAvoidingView>
    );
  }

  const isSignup = mode === 'signup';

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

        <View style={s.toggle}>
          {['login', 'signup'].map(m => (
            <TouchableOpacity key={m} onPress={() => { setMode(m); setErrors({}); }}
              style={[s.toggleBtn, mode === m && s.toggleActive]}>
              <Text style={[s.toggleText, mode === m && s.toggleTextActive]}>
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isSignup && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppInput label="First Name" value={fn} onChangeText={setFn} placeholder="Jane" error={errors.fn} />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput label="Last Name" value={ln} onChangeText={setLn} placeholder="Doe" error={errors.ln} />
            </View>
          </View>
        )}

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
          Enter a 10-digit US phone number. Format is flexible.
        </Text>

        {isSignup && (
          <>
            <Text style={s.inputLabel}>State *</Text>
            <TouchableOpacity
              onPress={() => setShowStates(true)}
              style={[s.pickerBtn, errors.state && { borderColor: C.error }]}
            >
              <Text style={{ color: state ? C.text : C.muted, fontSize: 15, flex: 1 }}>
                {state ? `${state} — ${selectedStateName}` : 'Select your state'}
              </Text>
              <Text style={{ color: C.sub }}>▾</Text>
            </TouchableOpacity>
            {errors.state ? <Text style={s.errorText}>⚠ {errors.state}</Text> : null}
            {timezone && (
              <View style={s.tzPill}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>🕐</Text>
                <View>
                  <Text style={s.tzLabel}>TIMEZONE (AUTO)</Text>
                  <Text style={s.tzValue}>{timezone}</Text>
                </View>
              </View>
            )}
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
          label="Verify"
          onPress={handlePhoneSend}
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

      <Modal visible={showStates} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select State</Text>
            <TouchableOpacity onPress={() => setShowStates(false)}>
              <Text style={{ color: C.primary, fontSize: 16, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={US_STATES}
            keyExtractor={([code]) => code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: [code, name] }) => (
              <TouchableOpacity
                onPress={() => { setState(code); setShowStates(false); }}
                style={[s.stateRow, state === code && { backgroundColor: C.primary + '22' }]}
              >
                <Text style={[s.stateCode, state === code && { color: C.primary }]}>{code}</Text>
                <Text style={[s.stateName, state === code && { color: C.primary, fontWeight: '700' }]}>{name}</Text>
                {state === code && <Text style={{ color: C.primary }}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

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