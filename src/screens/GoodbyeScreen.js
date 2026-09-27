import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Btn } from '../components';
import { C } from '../constants';

/**
 * Shown after a user taps "Log Out" from inside the app.
 *
 * Acts as a "soft exit" — the user is no longer in the app proper,
 * but the only thing on screen is a friendly farewell + a single
 * "Welcome Back" button that returns them to the app via the
 * fastest available path:
 *   - biometric unlock if Face ID / Touch ID is enabled
 *   - the auto-OTP AuthScreen flow otherwise
 *
 * Props:
 *  - firstName?: string   — optional name to personalize the message
 *  - onWelcomeBack(): void — called when user taps "Welcome Back"
 *  - deleted?: boolean — the account was just deleted (item 17c, 27 Sep 2026).
 *    Shows a permanent farewell instead of "See you next time", and the
 *    button ("Done") calls onWelcomeBack, which App wires to a hard logout.
 */
export default function GoodbyeScreen({ firstName, onWelcomeBack, deleted }) {
  if (deleted) {
    return (
      <View style={s.wrap}>
        <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>Your account has been deleted</Text>
        <Text style={s.sub}>
          Your name, phone number and personal details are gone. Your acts of kindness stay in the count with no name attached, so the people who invited you keep their totals.
        </Text>
        <Text style={[s.sub, { marginTop: 12 }]}>
          Thank you for every kind act. You're welcome back any time.
        </Text>

        <Btn
          label="Done"
          onPress={onWelcomeBack}
          style={{ width: '80%', marginTop: 32 }}
        />

        <Text style={s.tagline}>30 Acts of Kindness™</Text>
      </View>
    );
  }

  const greeting = firstName
    ? `See you next time, ${firstName}!`
    : 'See you next time!';

  return (
    <View style={s.wrap}>
      <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
      <Text style={s.title}>{greeting}</Text>
      <Text style={s.sub}>
        You've logged out. Tap below whenever you're ready to come back.
      </Text>

      <Btn
        label="Welcome Back"
        onPress={onWelcomeBack}
        style={{ width: '80%', marginTop: 32 }}
      />

      <Text style={s.tagline}>30 Acts of Kindness™</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: 32,
  },
  logo: { width: 120, height: 120, borderRadius: 24, marginBottom: 24 },
  title: {
    fontSize: 24, fontWeight: '900', color: C.text,
    marginBottom: 12, textAlign: 'center',
  },
  sub: {
    fontSize: 15, color: C.sub,
    textAlign: 'center', lineHeight: 22,
    marginBottom: 8, paddingHorizontal: 16,
  },
  tagline: {
    color: C.muted, fontSize: 12, marginTop: 40, letterSpacing: 0.5,
  },
});