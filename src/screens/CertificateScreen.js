import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, Image,
  TouchableOpacity, Platform, Linking, Share,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Btn, ScreenHeader } from '../components';
import ShareButtons, { buildSocialButtons } from '../components/ShareButtons';
import { C } from '../constants';
import { supabase } from '../lib/supabase';
import { generateInviteLink } from '../lib/branch';
import { buildInviteMessage , buildSocialMessage } from '../lib/shareMessage';

const APP_STORE_URL = 'https://apps.apple.com/app/id6762151038';
const APP_URL = 'https://30ActsofKindness.org';
const FB_APP_ID = '1033236095805810';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

// Opens an app's URL scheme, falling back to the web URL if the app link fails.
const openOrFallback = async (appUrl, webUrl, appName) => {
  let opened = false;
  try {
    let supported = false;
    try { supported = await Linking.canOpenURL(appUrl); } catch { supported = false; }
    if (supported) {
      try { await Linking.openURL(appUrl); opened = true; } catch (e) {
        console.warn(`${appName} app link failed, falling back to web:`, e && e.message);
      }
    }
  } catch (err) {
    console.warn(`Share to ${appName} (app) failed:`, err);
  }
  if (opened) return;
  if (webUrl) {
    try { await Linking.openURL(webUrl); return; } catch (e) {
      console.warn(`Share to ${appName} (web) failed:`, e && e.message);
    }
  }
  Alert.alert('Share failed', `Couldn't open ${appName}. Your post is copied — open ${appName} and paste it.`);
};

// Saves an image to the photo library so it can be picked in Facebook/TikTok.
const saveToCameraRoll = async (uri) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need photo library access to share to Facebook or TikTok.');
      return null;
    }
    let localUri = uri;
    if (uri.startsWith('http')) {
      const filename = `${FileSystem.cacheDirectory}cert-${Date.now()}.png`;
      const dl = await FileSystem.downloadAsync(uri, filename);
      localUri = dl.uri;
    }
    const asset = await MediaLibrary.createAssetAsync(localUri);
    return asset.uri;
  } catch (err) {
    console.warn('saveToCameraRoll error:', err);
    return null;
  }
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

  // Every method sends the certificate picture and nothing else. The
  // certificate itself carries the QR code and the line explaining it.
  const shareCertImage = async (subject, withInvite = false) => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await certImageUri();
      if (!uri) { Alert.alert('Could not prepare the certificate', 'Please try again.'); return; }

      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await RNShare.open({
          url: uri,
          ...(subject ? { subject } : {}),
          ...(withInvite ? { message: buildInviteMessage({ inviteUrl }) } : {}),
          failOnCancel: false,
        });
        return;
      }

      let Sharing = null;
      try { Sharing = require('expo-sharing'); } catch {}
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your certificate' });
        return;
      }
      await Share.share({ url: uri });
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Certificate share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  // One share route for every social app: the system sheet. See the note in
  // src/components/ShareButtons.js. Cancelling is not an error.
  const handleShareAll = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await certImageUri();
      if (!uri) { Alert.alert('Could not prepare the certificate', 'Please try again.'); return; }

      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}

      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await RNShare.open({
          url: uri,
          message: buildSocialMessage({ inviteUrl }),
          failOnCancel: false,
        });
        return;
      }

      let Sharing = null;
      try { Sharing = require('expo-sharing'); } catch {}
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your certificate' });
      }
    } catch (e) {
      const msg = (e && e.message) || '';
      if (!/did not share|cancel|dismiss/i.test(msg)) console.warn('Share failed:', msg);
    } finally { setSharing(false); }
  };

  const handleShareText  = () => shareCertImage(undefined, true);
  const handleShareEmail = () => shareCertImage('My 30 Acts of Kindness Certificate', true);
  const handleShareOther = () => shareCertImage();

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

  // ── Social sharing (same behavior as sharing an Act) ──────────────────────
  // Renders the certificate to a PNG and shares it: Instagram opens directly;
  // X opens its composer with the image on the clipboard to paste; Facebook and
  // TikTok save the certificate to Photos so you add it in their post composer.
  const certImageUri = async () => {
    try {
      await captureRef(certRef, { format: 'png', quality: 1 }); // warm-up pass
      const uri = await captureRef(certRef, { format: 'png', quality: 1 });
      if (!uri) return null;
      if (uri.startsWith('file://') || uri.startsWith('ph://')) return uri;
      return `file://${uri}`;
    } catch (e) {
      console.warn('Certificate capture failed:', e && e.message);
      return null;
    }
  };

  const shareSingleTo = async (socialKey, extra) => {
    let RNShare = null;
    try { RNShare = require('react-native-share').default; } catch {}
    if (!RNShare || isExpoGo) return false;
    const social = RNShare?.Social?.[socialKey];
    if (!social) return false;
    try { await RNShare.shareSingle({ social, ...extra }); return true; }
    catch (e) { if (e?.message !== 'User did not share') console.warn(`shareSingle(${socialKey}) failed:`, e && e.message); return false; }
  };

  const shareToInstagram = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await certImageUri();
      // The caption for the post. Instagram, TikTok and Facebook accept no
      // prefilled text from another app, so the clipboard is the only route -
      // the person pastes it into the composer. X gets it via its intent.
      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}
      if (!uri) { Alert.alert('Could not prepare the image', 'Please try again.'); return; }
      const ok = await shareSingleTo('INSTAGRAM_STORIES', { appId: FB_APP_ID, backgroundImage: uri });
      if (!ok) {
        let Sharing = null;
        try { Sharing = require('expo-sharing'); } catch {}
        if (Sharing && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your certificate' });
        else await Share.share({ url: uri });
      }
    } catch (e) { if (e?.message !== 'User did not share') console.warn('Instagram share failed:', e && e.message); }
    finally { setSharing(false); }
  };

  // X, via the iOS share sheet. twitter://post carries text only - X's URL
  // scheme has never accepted media from another app, and react-native-share's
  // TWITTER target rides that same scheme. The share sheet hands the file to X's
  // share extension, which does attach it. One extra tap, but it works.
  const shareToX = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await certImageUri();
      if (!uri) { Alert.alert('Could not prepare the certificate', 'Please try again.'); return; }

      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await RNShare.open({
          url: uri,
          message: buildSocialMessage({ inviteUrl }),
          failOnCancel: false,
        });
        return;
      }

      let Sharing = null;
      try { Sharing = require('expo-sharing'); } catch {}
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your certificate' });
      }
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('X share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  // Facebook's own ShareDialog opens the composer with the picture already
  // attached. Real builds only - the SDK is not linked in Expo Go, where this
  // returns false and the save-to-Photos fallback runs instead.
  const tryFacebookShareDialog = async (localUri) => {
    if (!localUri || isExpoGo) return false;
    let fbsdk = null;
    try { fbsdk = require('react-native-fbsdk-next'); } catch { return false; }
    const ShareDialog = fbsdk?.ShareDialog;
    if (!ShareDialog) return false;
    try {
      const content = {
        contentType: 'photo',
        photos: [{ imageUrl: localUri, userGenerated: true }],
      };
      if (!(await ShareDialog.canShow(content))) return false;
      await ShareDialog.show(content);
      return true;
    } catch (e) {
      console.warn('FB ShareDialog unavailable, falling back:', e && e.message);
      return false;
    }
  };

  const shareToFacebook = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await certImageUri();
      // The caption for the post. Instagram, TikTok and Facebook accept no
      // prefilled text from another app, so the clipboard is the only route -
      // the person pastes it into the composer. X gets it via its intent.
      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}
      if (uri && (await tryFacebookShareDialog(uri))) return;
      let saved = null;
      if (uri) saved = await saveToCameraRoll(uri);
      Alert.alert(
        'Share to Facebook',
        saved
          ? 'Your certificate is saved to your Photos and the caption is copied.\n\nFacebook will open — tap the photo icon (📷) next to "What\'s on your mind?", pick the newest photo, then paste the caption.'
          : 'Facebook will open — start a post.',
        [
          { text: 'Open Facebook', onPress: () => openOrFallback(`fb://share?link=${encodeURIComponent(APP_URL)}`, `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`, 'Facebook') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (e) { if (e?.message !== 'User did not share') console.warn('Facebook share failed:', e && e.message); }
    finally { setSharing(false); }
  };

  // TikTok, via the iOS share sheet - same route as X. Their extension takes the
  // file; the caption cannot be written into "Add a catchy title" by any
  // third-party app, so it also goes on the clipboard to paste.
  const shareToTikTok = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await certImageUri();
      if (!uri) { Alert.alert('Could not prepare the certificate', 'Please try again.'); return; }

      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}

      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await RNShare.open({
          url: uri,
          message: buildSocialMessage({ inviteUrl }),
          failOnCancel: false,
        });
        return;
      }

      let Sharing = null;
      try { Sharing = require('expo-sharing'); } catch {}
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your certificate' });
      }
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('TikTok share failed:', e && e.message);
    } finally { setSharing(false); }
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

        <ShareButtons
          social={buildSocialButtons({
            onTikTok:    shareToTikTok,
            onInstagram: shareToInstagram,
            onX:         shareToX,
            onFacebook:  shareToFacebook,
          })}
          onText={handleShareText}
          onEmail={handleShareEmail}
          onMore={handleShareAll}
          disabled={sharing}
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
