import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import { Btn, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';
import { generateInviteLink } from '../lib/branch';

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

// The "Certified Kind Person" certificate: the person's name, the completion
// date, and a QR that is their personal invite link. Anyone who scans it and
// signs up is credited to their kindness tree (existing referral flow).
export default function CertificateScreen({ navigation }) {
  const [name, setName]           = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading]     = useState(true);

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const phone = extractPhone(user?.email);
        let fullName = '';
        if (user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .maybeSingle();
          fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
        }
        if (!cancelled) setName(fullName || 'A Kind Person');
        const url = await generateInviteLink({ phone });
        if (!cancelled) setInviteUrl(url || '');
      } catch (e) {
        // Non-fatal: show the certificate without the QR if the link fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const goHome = () => navigation.navigate('Main', { screen: 'Home' });

  const certRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(certRef, { format: 'png', quality: 1 });
      let Sharing = null;
      try { Sharing = require('expo-sharing'); } catch {}
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your certificate' });
      } else {
        Alert.alert('Take a screenshot', 'Screenshot this certificate to save or share it.');
      }
    } catch (e) {
      Alert.alert('Could not share', 'Please take a screenshot of your certificate instead.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Your Certificate" onBack={goHome} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.cert} ref={certRef} collapsable={false}>
          {/* confetti */}
          <View style={[s.dot, { top: 14,  left: 16,  backgroundColor: '#2ecc71' }]} />
          <View style={[s.dot, { top: 26,  right: 20, backgroundColor: '#e0a152' }]} />
          <View style={[s.dot, { top: 60,  left: 30,  backgroundColor: '#c9b56a' }]} />
          <View style={[s.dot, { bottom: 22, right: 26, backgroundColor: '#2ecc71' }]} />
          <View style={[s.dot, { bottom: 40, left: 22,  backgroundColor: '#e0a152' }]} />

          <View style={s.inner}>
            <Text style={s.confettiRow}>🎉  ✨  🎉</Text>

            {/* 30 / Acts medallion */}
            <View style={s.medal}>
              <Text style={s.medal30}>30</Text>
              <Text style={s.medalActs}>Acts</Text>
            </View>

            <View style={s.titleRow}>
              <Text style={s.spark}>✦</Text>
              <Text style={s.eyebrow}>CERTIFICATE OF KINDNESS</Text>
              <Text style={s.spark}>✦</Text>
            </View>

            <View style={s.ruleRow}>
              <View style={s.rule} /><Text style={s.diamond}>◆</Text><View style={s.rule} />
            </View>

            <Text style={s.certifies}>This certifies that</Text>
            <Text style={s.name}>{name}</Text>
            <Text style={s.body}>is a Certified Kind Person, having completed 30 Acts of Kindness.</Text>
            <Text style={s.date}>{dateStr}</Text>

            <View style={s.seal}>
              <Text style={s.sealStar}>★</Text>
              <Text style={s.sealText}>CERTIFIED</Text>
            </View>

            <View style={s.qrWrap}>
              {loading
                ? <ActivityIndicator color="#2e7d46" />
                : inviteUrl
                  ? <QRCode value={inviteUrl} size={150} backgroundColor="#ffffff" color="#111111" />
                  : <Text style={s.qrMissing}>QR unavailable — try again from the Me screen.</Text>}
            </View>
            <Text style={s.qrLabel}>Scan to join — new members grow your kindness tree 🌳</Text>
          </View>
        </View>

        <Btn
          label={sharing ? 'Preparing…' : '📤 Share certificate'}
          onPress={handleShare}
          loading={sharing}
          style={{ marginTop: 16 }}
        />
        <Text style={s.note}>
          Share or save your certificate. Anyone who scans your QR and signs up is added to your tree.
        </Text>
        <Btn label="Done" onPress={goHome} variant="secondary" style={{ marginTop: 4 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  cert: {
    backgroundColor: '#fdfbf3',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: C.primary,
    padding: 8,
    overflow: 'hidden',
  },
  // gold inner frame
  inner: {
    borderWidth: 1.5,
    borderColor: '#d9c47e',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, opacity: 0.9 },
  confettiRow: { fontSize: 16, letterSpacing: 2, marginBottom: 8 },

  medal: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: '#1b7a44', borderWidth: 3, borderColor: '#d9c47e',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  medal30:   { color: '#ffffff', fontSize: 28, fontWeight: '900', lineHeight: 30 },
  medalActs: { color: '#d9f5e3', fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginTop: -3 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spark:    { color: '#c9a53a', fontSize: 14 },
  eyebrow:  { color: '#2e7d46', fontSize: 12.5, fontWeight: '900', letterSpacing: 2 },

  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  rule:    { width: 44, height: 2, backgroundColor: '#d9c47e', borderRadius: 2 },
  diamond: { color: '#c9a53a', fontSize: 11 },

  certifies: { color: '#5a6b5f', fontSize: 13, marginBottom: 4 },
  name:      { color: '#14210f', fontSize: 27, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  body:      { color: '#3a4a3f', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 10, maxWidth: 250 },
  date:      { color: '#2e7d46', fontSize: 14, fontWeight: '700', marginBottom: 14 },

  seal: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#efdc93', borderWidth: 2, borderColor: '#c9a53a',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  sealStar: { color: '#8a6d1f', fontSize: 20, lineHeight: 22 },
  sealText: { color: '#8a6d1f', fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  qrWrap: {
    backgroundColor: '#ffffff', padding: 12, borderRadius: 12,
    minHeight: 162, minWidth: 162, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e6e0cc',
  },
  qrMissing: { color: '#7a5a2a', fontSize: 12, textAlign: 'center', paddingHorizontal: 10 },
  qrLabel:   { color: '#5a6b5f', fontSize: 12, textAlign: 'center', marginTop: 10, paddingHorizontal: 8, lineHeight: 17 },
  note:      { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 16, lineHeight: 19 },
});
