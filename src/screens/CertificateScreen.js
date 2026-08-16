import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, Image,
  TouchableOpacity, Platform, Linking, Share,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import { Btn, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';
import { generateInviteLink } from '../lib/branch';

const APP_STORE_URL = 'https://apps.apple.com/app/id6762151038';

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

  // Same share flow as sharing an Act: a Text / Email / More row that sends a
  // message with the person's personal invite link (identical mechanics to
  // MyStoryScreen). An extra "Share as image" button keeps the visual cert.
  const buildShareMessage = () => {
    const who = name && name !== 'A Kind Person' ? `${name} ` : '';
    const linkPart = inviteUrl ? `\n\nMy invite link (grows my kindness tree 🌳):\n${inviteUrl}` : '';
    return `🕊️ ${who}just completed all 30 Acts of Kindness™ and earned a Certificate of Kindness!\n\n#30ActsOfKindness\n\nWant to join me? Here's how:\n1. Download the free 30 Acts of Kindness app:\n${APP_STORE_URL}\n2. Sign up with your phone number\n3. Do one kind act a day${linkPart}`;
  };

  const handleShareText = () => {
    const msg = encodeURIComponent(buildShareMessage());
    const url = Platform.OS === 'ios' ? `sms:&body=${msg}` : `sms:?body=${msg}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Messages.'));
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent('My 30 Acts of Kindness™ Certificate');
    const body    = encodeURIComponent(buildShareMessage());
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`).catch(() => Alert.alert('Error', 'Could not open Mail.'));
  };

  const handleShareOther = async () => {
    try { await Share.share({ message: buildShareMessage() }); }
    catch (e) { /* user cancelled */ }
  };

  const certRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const handleShareImage = async () => {
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

            {/* App logo medallion */}
            <View style={s.medal}>
              <Image source={require('../../assets/logo.png')} style={s.medalLogo} resizeMode="contain" />
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
              <Text style={s.sealText} numberOfLines={1}>CERTIFIED</Text>
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

        <View style={s.shareRow}>
          <TouchableOpacity style={s.shareBtn} onPress={handleShareText}>
            <Text style={s.shareBtnIcon}>💬</Text>
            <Text style={s.shareBtnLabel}>Text</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.shareBtn} onPress={handleShareEmail}>
            <Text style={s.shareBtnIcon}>📧</Text>
            <Text style={s.shareBtnLabel}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.shareBtn} onPress={handleShareOther}>
            <Text style={s.shareBtnIcon}>↗️</Text>
            <Text style={s.shareBtnLabel}>More</Text>
          </TouchableOpacity>
        </View>
        <Btn
          label={sharing ? 'Preparing…' : '🖼️ Share as image'}
          onPress={handleShareImage}
          loading={sharing}
          variant="secondary"
          style={{ marginTop: 12 }}
        />
        <Text style={s.note}>
          Share your certificate. Anyone who scans your QR and signs up is added to your tree.
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
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#d9c47e',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    overflow: 'hidden',
  },
  medalLogo: { width: 92, height: 92, borderRadius: 46 },

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
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: '#efdc93', borderWidth: 2, borderColor: '#c9a53a',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  sealStar: { color: '#8a6d1f', fontSize: 24, lineHeight: 26 },
  sealText: { color: '#8a6d1f', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  qrWrap: {
    backgroundColor: '#ffffff', padding: 12, borderRadius: 12,
    minHeight: 162, minWidth: 162, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e6e0cc',
  },
  shareRow: { flexDirection: 'row', gap: 12, marginTop: 16, width: '100%' },
  shareBtn: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e6e0cc',
    paddingVertical: 14, alignItems: 'center',
  },
  shareBtnIcon:  { fontSize: 24 },
  shareBtnLabel: { color: '#14210f', fontSize: 12, fontWeight: '700', marginTop: 4 },
  qrMissing: { color: '#7a5a2a', fontSize: 12, textAlign: 'center', paddingHorizontal: 10 },
  qrLabel:   { color: '#5a6b5f', fontSize: 12, textAlign: 'center', marginTop: 10, paddingHorizontal: 8, lineHeight: 17 },
  note:      { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 16, lineHeight: 19 },
});
