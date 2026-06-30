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
 */
export default function GoodbyeScreen({ firstName, onWelcomeBack }) {
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