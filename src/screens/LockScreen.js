import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Btn } from '../components';
import { C } from '../constants';

/**
 * Shown after auto-login when the user has opted into biometric protection.
 * Prompts for Face ID / Touch ID. After 2 failed attempts, auto-unlocks
 * since the Supabase session is already valid.
 *
 * Props:
 *  - onUnlock(): called when biometric succeeds OR after 2 failures
 *  - onLogout(): called if user chooses to log out instead
 */
export default function LockScreen({ onUnlock, onLogout }) {
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus]     = useState('idle'); // 'idle' | 'prompting' | 'failed' | 'unlocking'
  const [biometricType, setBiometricType] = useState('Face ID');
  const didAutoTrigger = useRef(false);

  // Detect what kind of biometric the device supports
  useEffect(() => {
    (async () => {
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType(Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType(Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint');
        } else {
          setBiometricType('Device Passcode');
        }
      } catch {
        setBiometricType('Face ID');
      }
    })();
  }, []);

  const tryBiometric = async () => {
    if (status === 'prompting') return;
    setStatus('prompting');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock 30 Acts of Kindness™',
        fallbackLabel: 'Use Passcode',
        cancelLabel:   'Cancel',
      });
      if (result.success) {
         setStatus('unlocking');
         await onUnlock();
       return;
       }
      // Failed or cancelled
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setStatus('failed');
    if (nextAttempts >= 2) {
       // Auto-unlock after 2 failures — session is valid anyway
       setStatus('unlocking');
       await onUnlock();
     }
    } catch {
      setStatus('failed');
    }
  };

  // Auto-trigger biometric prompt once on mount
  useEffect(() => {
    if (didAutoTrigger.current) return;
    didAutoTrigger.current = true;
    tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.wrap}>
      {/* Heart logo replaces the dove emoji */}
      <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
      <Text style={s.title}>Welcome back</Text>
      <Text style={s.sub}>
        {status === 'unlocking'
          ? 'Loading your acts…'
          : status === 'failed'
          ? `${biometricType} didn't recognize you. Try again.`
          : `Use ${biometricType} to unlock`}
      </Text>

      {status !== 'unlocking' && (
        <>
          <Btn
            label={status === 'failed' ? `Try ${biometricType} again` : `Unlock with ${biometricType}`}
            onPress={tryBiometric}
            style={{ width: '80%', marginTop: 32 }}
          />

          <Btn
            label="Log out instead"
            onPress={onLogout}
            variant="secondary"
            style={{ width: '80%', marginTop: 12 }}
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: 32,
  },
  logo:  { width: 120, height: 120, borderRadius: 24, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 8 },
  sub:   { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22 },
});