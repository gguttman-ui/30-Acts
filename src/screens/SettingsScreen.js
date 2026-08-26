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
import { isContentBlocked, BLOCKED_MESSAGE } from '../lib/moderation';
import { generateInviteLink } from '../lib/branch';
import { loadRuns, lapCount, actsInLap } from '../lib/runs';
import QRCode from 'react-native-qrcode-svg';

// iOS-only: nativeID for the keyboard Done bar.
const KB_DONE_ID = 'settingsKbDone';

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

export default function SettingsScreen({ user, challenge, onStartChallenge, navigation, navigate, route }) {
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
    navigate('logout');
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
  const [reminder2Hour,   setReminder2Hour]   = useState(6);
  const [reminder2Minute, setReminder2Minute] = useState(0);
  const [reminder2Period, setReminder2Period] = useState('PM');
  // The SECOND reminder is OPT-IN — off by default, so a person only gets a
  // second daily text if they deliberately turn it on. When it's off we save the
  // reminder2_* fields as null on Save, which makes the send-reminders function
  // skip slot 2 entirely (it only fires a slot whose hour is a number).
  const [reminder2Enabled, setReminder2Enabled] = useState(false);
  // Which "Set … reminder" button was last tapped, so only that button shows the
  // ✓ confirmation. Both buttons run the same save (handleSave writes all the
  // reminder fields at once) — this is purely about which one acknowledges it.
  const [reminderSetWhich, setReminderSetWhich] = useState(null);
  // ISO timestamp of the first time the user opted in to SMS reminders. Kept as
  // proof of express consent for toll-free / A2P compliance; never overwritten
  // once set (only cleared server-side on a STOP opt-out).
  const [reminderConsentAt, setReminderConsentAt] = useState(null);

  const scrollRef     = useRef(null);
  const addressY      = useRef(0);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const shouldScrollToAddress = route?.params?.scrollTo === 'address';

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
      if (typeof meta.reminder_enabled === 'boolean') setReminderEnabled(meta.reminder_enabled);
      if (typeof meta.reminder_hour    === 'number')  setReminderHour(meta.reminder_hour);
      if (typeof meta.reminder_minute  === 'number')  setReminderMinute(meta.reminder_minute);
      if (meta.reminder_period === 'AM' || meta.reminder_period === 'PM') {
        setReminderPeriod(meta.reminder_period);
      }
      if (typeof meta.reminder2_hour   === 'number')  setReminder2Hour(meta.reminder2_hour);
      if (typeof meta.reminder2_minute === 'number')  setReminder2Minute(meta.reminder2_minute);
      if (meta.reminder2_period === 'AM' || meta.reminder2_period === 'PM') {
        setReminder2Period(meta.reminder2_period);
      }
      // Second reminder is opt-in: default OFF unless the user explicitly enabled it.
      setReminder2Enabled(meta.reminder2_enabled === true);
      if (meta.reminder_consent_at) setReminderConsentAt(meta.reminder_consent_at);
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

        const stored = await AsyncStorage.getItem('biometric_enabled');
        setBiometricEnabled(stored === 'true');
      } catch (e) {
        console.warn('Biometric check failed:', e.message);
      }
    })();
  }, []);

  useEffect(() => {
    if (!shouldScrollToAddress) return;
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          y: Math.max(0, addressY.current - 40),
          animated: true,
        });
      }
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 400,  useNativeDriver: false }),
        Animated.delay(1200),
        Animated.timing(highlightAnim, { toValue: 0, duration: 600,  useNativeDriver: false }),
      ]).start();
    }, 350);
    return () => clearTimeout(timer);
  }, [shouldScrollToAddress]);

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
  useEffect(() => {
    let cancelled = false;
    const phone = extractPhone(user?.email);
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
  }, [user?.email, challenge]);
  const completedCount = streakActs != null ? streakActs : windowCompleted;

  const handleRestart = () => {
    Alert.alert(
      'Restart?',
      "We'll keep your most recent unbroken streak of completed days and drop the rest. If you have no completed days, you'll start fresh from Day 1.",
      [
        { text: 'Keep everything', style: 'cancel' },
        { text: 'Yes, restart', style: 'destructive', onPress: onStartChallenge },
      ]
    );
  };

  const handleSave = async () => {
    if (contactEmail.trim() && !contactEmail.includes('@')) {
      Alert.alert('Invalid email', 'Enter a valid email or leave it blank.');
      return;
    }

    // first_name / last_name are rendered as "First L." on challenge
    // leaderboards, so other participants see them. Moderate before saving
    // (Apple Guideline 1.2).
    const nameToCheck = [firstName, lastName].filter(Boolean).join(' ');
    if (nameToCheck.trim() && await isContentBlocked(nameToCheck)) {
      Alert.alert('Name Not Allowed', BLOCKED_MESSAGE);
      return;
    }
    if (zip && !/^\d{5}$/.test(zip)) {
      Alert.alert('Invalid ZIP', 'Enter a 5-digit ZIP or leave it blank.');
      return;
    }

    // Timezone the reminders (and streak) rely on. Prefer the ZIP-derived value;
    // fall back to deriving it from the state, so a user who set a state but no
    // ZIP still gets a valid IANA zone. (A missing zone silently blocks reminders.)
    const effectiveTz = timezone || (zipState ? (STATE_IANA_TZ[zipState] || null) : null);

    if (reminderEnabled) {
      if (!effectiveTz) {
        Alert.alert(
          'Add your ZIP code',
          'To send reminders we need your ZIP code so we know your time zone. Add it above, then Save.'
        );
        return;
      }
      // The backend only sends between 6:00 AM and 10:00 PM local time, so a time
      // outside that window would be silently dropped — catch it here.
      const to24 = (h, p) => (p === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12));
      const inWindow = (h, p) => { const hr = to24(h, p); return hr >= 6 && hr < 22; };
      const bad1 = !inWindow(reminderHour, reminderPeriod);
      const bad2 = reminder2Enabled && !inWindow(reminder2Hour, reminder2Period);
      if (bad1 || bad2) {
        Alert.alert(
          'Pick a daytime reminder',
          'Reminders can only be sent between 6:00 AM and 9:59 PM. Please choose a time in that range.'
        );
        return;
      }
    }

    // Stamp (and then preserve) the express-consent timestamp the first time
    // reminders are enabled — our record that the user opted in to recurring SMS.
    const nextConsentAt = reminderEnabled
      ? (reminderConsentAt || new Date().toISOString())
      : reminderConsentAt;

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          firstName,
          lastName,
          zip:      zip      || null,
          state:    zipState || null,
          city:     zipCity  || null,
          timezone: effectiveTz,
          contact_email: contactEmail.trim() || null,
          street1:       street1.trim() || null,
          street2:       street2.trim() || null,
          age_bracket: ageBracket || null,
          reminder_enabled: reminderEnabled,
          reminder_hour:    reminderHour,
          reminder_minute:  reminderMinute,
          reminder_period:  reminderPeriod,
          // Second reminder only persists real times when opted in; otherwise
          // null so the sender skips it (and turning it off future-proofs: an
          // existing 2nd reminder is cleared on the next Save).
          reminder2_enabled: reminder2Enabled,
          reminder2_hour:    reminder2Enabled ? reminder2Hour   : null,
          reminder2_minute:  reminder2Enabled ? reminder2Minute : null,
          reminder2_period:  reminder2Enabled ? reminder2Period : null,
          reminder_consent_at:      nextConsentAt || null,
          reminder_consent_version: reminderEnabled ? SMS_CONSENT_VERSION : null,
        },
      });
      if (error) { Alert.alert('Error', error.message); return; }

      const authUser = data?.user;
      if (authUser) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id:           authUser.id,
            email:        authUser.email       || user?.email || null,
            first_name:   firstName            || null,
            last_name:    lastName             || null,
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
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      Alert.alert('Error', 'Could not save profile.');
    }
  };

  const handleGoToChallenge = () => {
    if (navigation) navigation.navigate('Home');
  };

  // Invite-a-friend share. Uses the native iOS share sheet so the user can
  // pick SMS, email, etc. and edit the message before sending.
  // Personal invite: the referral link carries ?ref=<phone> so anyone who
  // joins through it is attributed to this user (added to their tree).
  const invitePhone = extractPhone(user?.email) || user?.phone || null;
  // Invite link now points at a Branch link (airpa.app.link) that bounces new
  // users to the App Store and attributes them to this user's tree after they
  // install — no website hop. Starts as the website fallback, then upgrades to
  // the Branch short link once generated.
  const [inviteLink, setInviteLink] = useState(
    invitePhone
      ? `https://30ActsofKindness.org?ref=${encodeURIComponent(invitePhone)}`
      : 'https://30ActsofKindness.org'
  );
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

  const highlightBg = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', C.primary + '33'],
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Settings"
        right={user?.role === 'OWNER' && (
          <TouchableOpacity onPress={() => navigate('admin')}>
            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>Admin</Text>
          </TouchableOpacity>
        )}
      />
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll}>

       <Card style={s.mb}>
          <Text style={s.cardTitle}>My 30 Acts</Text>
          <Text style={s.cardSub}>
            {challenge ? `Day ${completedCount}/30 complete` : 'Not started yet'}
          </Text>
          {!challenge ? (
            <Btn label="Start 🚀" onPress={onStartChallenge} />
          ) : (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn label="Go to Today's Act →" onPress={handleGoToChallenge} style={{ flex: 1 }} />
                <Btn label="Log Out" variant="secondary" onPress={() => navigate('logout')} style={{ flex: 1, borderColor: C.error + '66' }} />
              </View>
              <Btn label="Restart" variant="danger" onPress={handleRestart} />
            </View>
          )}
        </Card>

        <Card style={[s.mb, { borderColor: C.primary + '55', borderWidth: 1.5 }]}>
          <Text style={s.cardTitle}>🎯 Sponsor a Group</Text>
          <Text style={s.cardSub}>
            Start a group others can join, then share your QR code to invite them.
          </Text>
          <View style={{ gap: 8 }}>
            <Btn
              label="Sponsor a New Group →"
              onPress={() => navigation.navigate('CreateSponsor')}
            />
            <Btn
              label="My Groups →"
              variant="secondary"
              onPress={() => navigation.navigate('MySponsors')}
            />
          </View>
        </Card>

        <Card style={s.mb}>
          <Text style={s.cardTitle}>Profile</Text>
          <View style={s.emailRow}>
            <Text style={s.emailLabel} numberOfLines={1}>{user?.email?.includes('@phone.30acts.app') ? 'Phone' : 'Email'}</Text>
            <Text style={s.emailVal} numberOfLines={1}>
              {user?.email?.includes('@phone.30acts.app')
                ? (user?.phone || user?.email?.replace('@phone.30acts.app', ''))
                : user?.email}
            </Text>
            <Text>🔒</Text>
          </View>
<TouchableOpacity
  onPress={() => setShowAgeBrackets(true)}
  style={s.ageBracketBtn}
>
  <Text style={s.ageBracketLabel}>Age</Text>
  <Text style={[s.ageBracketVal, !ageBracket && { color: C.muted }]} numberOfLines={1}>
    {ageBracket
      ? AGE_BRACKETS.find(b => b.value === ageBracket)?.label
      : 'Select…'}
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

          <Animated.View
            onLayout={e => { addressY.current = e.nativeEvent.layout.y; }}
            style={{
              borderRadius: 12,
              marginHorizontal: -4,
              paddingHorizontal: 4,
              backgroundColor: highlightBg,
            }}
          >
            <View style={s.divider} />
            <Text style={s.sectionHeader}>MAILING ADDRESS (OPTIONAL)</Text>
            <Text style={s.helperTextTop}>
              We'll use this to send your Certified Kind Person wristband when you complete 30 days.
            </Text>

            <AppInput
              label="Street Address"
              value={street1}
              onChangeText={setStreet1}
              placeholder="123 Main Street"
              autoCapitalize="words"
            />
            <AppInput
              label="Apt / Suite / Unit"
              value={street2}
              onChangeText={setStreet2}
              placeholder="Apt 4B (optional)"
              autoCapitalize="words"
            />

            <AppInput
              label="ZIP Code"
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
          </Animated.View>

          {saved && (
            <View style={s.savedBanner}>
              <Text style={{ color: C.success, fontWeight: '700', fontSize: 13 }}>✓ Profile saved</Text>
            </View>
          )}
          <Btn label="Save Profile" onPress={handleSave} />
        </Card>

        <Card style={s.mb}>
          <Text style={s.cardTitle}>Security</Text>
          {biometricAvailable ? (
            <View style={s.toggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.toggleTitle}>Unlock with {biometricLabel}</Text>
                <Text style={s.toggleSub}>
                  Require {biometricLabel} each time you open the app
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={toggleBiometric}
                trackColor={{ false: C.border, true: C.primary + '88' }}
                thumbColor={biometricEnabled ? C.primary : '#f4f3f4'}
              />
            </View>
          ) : (
            <Text style={s.cardSub}>
              Biometrics are not available on this device. Enroll Face ID, Touch ID, or Fingerprint in your device settings to enable app lock.
            </Text>
          )}
        </Card>

        <Card style={s.mb}>
          <Text style={s.cardTitle}>Daily Reminder</Text>
          <View style={s.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.toggleTitle}>Text me a daily reminder</Text>
              <Text style={s.toggleSub}>
                We'll text you at the times you set (up to 2 per day) to log your act of kindness.
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={setReminderEnabled}
              trackColor={{ false: C.border, true: C.primary + '88' }}
              thumbColor={reminderEnabled ? C.primary : '#f4f3f4'}
            />
          </View>

          {/* Express-consent disclosure for recurring SMS (CTIA/TCPA). Shown at
              the point of opt-in; the timestamp is captured on Save Profile. */}
          <Text style={s.smsConsent}>{SMS_CONSENT_TEXT}</Text>
          <View style={s.smsConsentLinks}>
            <TouchableOpacity onPress={() => navigation.navigate('Legal', { docKey: 'privacy' })}>
              <Text style={s.smsConsentLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={s.smsConsentDot}>·</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Legal', { docKey: 'terms' })}>
              <Text style={s.smsConsentLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
          {reminderEnabled && reminderConsentAt && (
            <Text style={s.smsConsentStamp}>
              ✓ Opted in on {new Date(reminderConsentAt).toLocaleDateString()}
            </Text>
          )}

{reminderEnabled && (
            <View style={s.reminderTimeWrap}>
              <Text style={s.reminderTimeLabel}>FIRST REMINDER</Text>
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

              {/* Picking a time with the arrows changes nothing until it is
                  saved, and "Save Profile" sits far below this card behind the
                  tree/invite section — testers set a time, walked away, and got
                  no texts. Each reminder now saves from its own button, right
                  under the time it belongs to. Both run the same handleSave, so
                  the ZIP/timezone and daytime-window checks still apply. */}
              <Btn
                label={saved && reminderSetWhich === 'first' ? '✓ First reminder set' : 'Set first reminder'}
                onPress={() => { setReminderSetWhich('first'); handleSave(); }}
                style={{
                  alignSelf: 'stretch',
                  marginTop: 14,
                  backgroundColor: saved && reminderSetWhich === 'first' ? C.success : C.primary,
                  borderWidth: 0,
                }}
              />

              <View style={[s.toggleRow, { marginTop: 18 }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.reminderTimeLabel}>SECOND REMINDER</Text>
                  <Text style={s.toggleSub}>Optional — off unless you turn it on.</Text>
                </View>
                <Switch
                  value={reminder2Enabled}
                  onValueChange={setReminder2Enabled}
                  trackColor={{ false: C.border, true: C.primary + '88' }}
                  thumbColor={reminder2Enabled ? C.primary : '#f4f3f4'}
                />
              </View>

              {reminder2Enabled && (
              <>
              <View style={s.reminderTimeRow}>
                <View style={s.reminderColumn}>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminder2Hour(h => h === 12 ? 1 : h + 1)}>
                    <Text style={s.reminderArrowText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={s.reminderValue}>{String(reminder2Hour).padStart(2, '0')}</Text>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminder2Hour(h => h === 1 ? 12 : h - 1)}>
                    <Text style={s.reminderArrowText}>▼</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.reminderColon}>:</Text>

                <View style={s.reminderColumn}>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminder2Minute(m => (m + 5) % 60)}>
                    <Text style={s.reminderArrowText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={s.reminderValue}>{String(reminder2Minute).padStart(2, '0')}</Text>
                  <TouchableOpacity style={s.reminderArrow} onPress={() => setReminder2Minute(m => (m - 5 + 60) % 60)}>
                    <Text style={s.reminderArrowText}>▼</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.reminderPeriodWrap}>
                  <TouchableOpacity
                    style={[s.reminderPeriodBtn, reminder2Period === 'AM' && s.reminderPeriodBtnActive]}
                    onPress={() => setReminder2Period('AM')}
                  >
                    <Text style={[s.reminderPeriodText, reminder2Period === 'AM' && s.reminderPeriodTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.reminderPeriodBtn, reminder2Period === 'PM' && s.reminderPeriodBtnActive]}
                    onPress={() => setReminder2Period('PM')}
                  >
                    <Text style={[s.reminderPeriodText, reminder2Period === 'PM' && s.reminderPeriodTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Btn
                label={saved && reminderSetWhich === 'second' ? '✓ Second reminder set' : 'Set second reminder'}
                onPress={() => { setReminderSetWhich('second'); handleSave(); }}
                style={{
                  alignSelf: 'stretch',
                  marginTop: 14,
                  backgroundColor: saved && reminderSetWhich === 'second' ? C.success : C.primary,
                  borderWidth: 0,
                }}
              />
              </>
              )}

              <Text style={s.reminderHint}>
                A time isn't saved until you tap its Set button.
              </Text>
            </View>
          )}
        </Card>

        <Card style={[s.mb, { borderColor: C.primary + '55', borderWidth: 1.5, alignItems: 'center' }]}>
          <Text style={s.cardTitle}>🌳 Grow Your Tree</Text>
          <Text style={[s.cardSub, { textAlign: 'center' }]}>
            Invite people to 30 Acts of Kindness. Anyone who scans your QR code
            or taps your link is added to your tree.
          </Text>
          <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, marginVertical: 14 }}>
            <QRCode value={inviteLink} size={172} backgroundColor="#fff" color="#111" />
          </View>
          <Text selectable style={{ color: C.sub, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
            {inviteLink}
          </Text>
          <Btn
            label="📲 Share Your Invite"
            onPress={handleInviteShare}
            style={{ alignSelf: 'stretch' }}
          />
        </Card>

        <Btn
          label="🎟️ Join a Group"
          onPress={() => navigation.navigate('JoinSponsor')}
          variant="secondary"
          style={[s.mb, { borderColor: C.primary + '66' }]}
        />

        <Btn
          label="💚 Support Our Mission"
          onPress={() => navigation.navigate('Donation')}
          variant="secondary"
          style={[s.mb, { borderColor: C.primary + '66' }]}
        />

        {hasRecognition && (
          <Btn
            label="🏆 My Recognition"
            onPress={() => navigation.navigate('Recognition')}
            variant="secondary"
            style={[s.mb, { borderColor: C.primary + '66' }]}
          />
        )}

        {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
          <Btn
            label="🎁 Recognition Orders (Admin)"
            onPress={() => navigation.navigate('RecognitionAdmin')}
            variant="secondary"
            style={[s.mb, { borderColor: C.primary + '66' }]}
          />
        )}

<Card style={s.mb}>
  <Text style={s.cardTitle}>Legal & Policies</Text>
  <TouchableOpacity
    onPress={() => navigation.navigate('Legal', { docKey: 'terms' })}
    style={s.legalRow}
  >
    <Text style={s.legalRowText}>Terms of Service</Text>
    <Text style={s.legalRowChevron}>›</Text>
  </TouchableOpacity>
  <TouchableOpacity
    onPress={() => navigation.navigate('Legal', { docKey: 'privacy' })}
    style={s.legalRow}
  >
    <Text style={s.legalRowText}>Privacy Policy</Text>
    <Text style={s.legalRowChevron}>›</Text>
  </TouchableOpacity>
  <TouchableOpacity
    onPress={() => navigation.navigate('Legal', { docKey: 'guidelines' })}
    style={s.legalRow}
  >
    <Text style={s.legalRowText}>Community Guidelines</Text>
    <Text style={s.legalRowChevron}>›</Text>
  </TouchableOpacity>
  <TouchableOpacity
    onPress={() => navigation.navigate('Legal', { docKey: 'moderation' })}
    style={[s.legalRow, s.legalRowLast]}
  >
    <Text style={s.legalRowText}>Content Moderation Policy</Text>
    <Text style={s.legalRowChevron}>›</Text>
  </TouchableOpacity>
</Card>

<Btn
  label="Delete My Account"
  variant="danger"
  onPress={() => setShowDeleteConfirm(true)}
  style={{ marginBottom: 24 }}
/>
      </ScrollView>
<Modal visible={showAgeBrackets} animationType="slide" presentationStyle="pageSheet">
  <View style={{ flex: 1, backgroundColor: C.bg }}>
    <View style={s.modalHeader}>
      <Text style={s.modalTitle}>Select Age</Text>
      <TouchableOpacity onPress={() => setShowAgeBrackets(false)}>
        <Text style={{ color: C.primary, fontSize: 16, fontWeight: '700' }}>Done</Text>
      </TouchableOpacity>
    </View>
    {AGE_BRACKETS.map(b => (
      <TouchableOpacity
        key={b.value}
        onPress={() => { setAgeBracket(b.value); setShowAgeBrackets(false); }}
        style={[s.ageRow, ageBracket === b.value && { backgroundColor: C.primary + '22' }]}
      >
        <Text style={[s.ageRowText, ageBracket === b.value && { color: C.primary, fontWeight: '700' }]}>
          {b.label}
        </Text>
        {ageBracket === b.value && <Text style={{ color: C.primary }}>✓</Text>}
      </TouchableOpacity>
    ))}
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

      <KeyboardDoneBar />
    </View>
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
  tzValue: { color: C.primary, fontSize: 14, fontWeight: '700' },
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
    color: C.primary, fontSize: 11, fontWeight: '900',
    letterSpacing: 1, marginBottom: 6,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  toggleTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  toggleSub:   { color: C.sub,  fontSize: 12, lineHeight: 16 },

  reminderTimeWrap: {
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border,
  },
  reminderTimeLabel: {
    color: C.primary, fontSize: 11, fontWeight: '900',
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
  reminderArrowText: { color: C.primary, fontSize: 14, fontWeight: '900' },
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
  reminderPeriodTextActive: { color: C.primary },
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
    color: C.primary, fontSize: 11, fontWeight: '700', textDecorationLine: 'underline',
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
});
