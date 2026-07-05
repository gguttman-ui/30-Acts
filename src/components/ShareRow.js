// ──────────────────────────────────────────────────────────────────────────────
// ShareRow.js — 4 dedicated platform share buttons
// Drop this into src/components/ShareRow.js
// Use in DailyActScreen.js (after act completion) and the Day 30 celebration
// ──────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Linking,
  Platform, ActionSheetIOS, Share,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

// ── Config ────────────────────────────────────────────────────────────────────
const APP_URL = 'https://apps.apple.com/app/id0000000000'; // TODO: replace with real App Store URL once live
const APP_HASHTAG = '#30ActsOfKindness';

// ── Helpers ───────────────────────────────────────────────────────────────────
const buildMessage = (actText, dayNumber) => {
  const prefix = dayNumber === 30
    ? `I just finished 30 Acts of Kindness™! 💛`
    : `Day ${dayNumber} of 30 Acts of Kindness™: ${actText}`;
  return `${prefix}\n\n${APP_HASHTAG}\n${APP_URL}`;
};

// Save a remote or local URI to the device's camera roll so Instagram / TikTok
// can pick it up. Returns the asset's local URI, or null on failure.
const saveToCameraRoll = async (photoUri) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need photo library access to share to Instagram or TikTok.');
      return null;
    }

    let localUri = photoUri;
    // If it's a remote URL, download it first
    if (photoUri.startsWith('http')) {
      const filename = `${FileSystem.cacheDirectory}share-${Date.now()}.jpg`;
      const download = await FileSystem.downloadAsync(photoUri, filename);
      localUri = download.uri;
    }

    const asset = await MediaLibrary.createAssetAsync(localUri);
    return asset.uri;
  } catch (err) {
    console.warn('saveToCameraRoll error:', err);
    return null;
  }
};

// Open a URL, fall back to web if the app isn't installed
const openOrFallback = async (appUrl, webUrl, appName) => {
  try {
    const supported = await Linking.canOpenURL(appUrl);
    if (supported) {
      await Linking.openURL(appUrl);
    } else if (webUrl) {
      await Linking.openURL(webUrl);
    } else {
      Alert.alert(`${appName} not installed`, `Please install ${appName} to share there.`);
    }
  } catch (err) {
    console.warn(`Share to ${appName} failed:`, err);
    Alert.alert('Share failed', `Couldn't open ${appName}. Try again or pick a different option.`);
  }
};

// ── Platform handlers ─────────────────────────────────────────────────────────

// X / Twitter — supports text pre-fill via intent URL
const shareToX = async (message, photoUri) => {
  // Photos can't be attached via deep link — user would have to add manually.
  // If photo is present, save it to camera roll so it's in the picker.
  if (photoUri) {
    await saveToCameraRoll(photoUri);
  }
  const encoded = encodeURIComponent(message);
  const appUrl = `twitter://post?message=${encoded}`;
  const webUrl = `https://twitter.com/intent/tweet?text=${encoded}`;
  await openOrFallback(appUrl, webUrl, 'X');
};

// Facebook — won't accept pre-filled text from third parties (their policy).
// We open the FB app's share composer with just the URL; user can type their own caption.
const shareToFacebook = async (message, photoUri) => {
  if (photoUri) {
    await saveToCameraRoll(photoUri);
  }
  const fbWebShare = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`;
  // FB deep link for sharing a URL (app will ignore pre-filled text — FB policy)
  const fbAppUrl = `fb://share?link=${encodeURIComponent(APP_URL)}`;
  await openOrFallback(fbAppUrl, fbWebShare, 'Facebook');
};

// Instagram — photo/video only. Saves image to camera roll, opens IG.
// User manually picks the image from their library inside IG.
const shareToInstagram = async (message, photoUri) => {
  if (!photoUri) {
    Alert.alert(
      'Instagram needs a photo',
      'Instagram doesn\'t support text-only shares. Go back and add a photo, or pick a different platform.'
    );
    return;
  }
  const savedUri = await saveToCameraRoll(photoUri);
  if (!savedUri) return;

  // Copy caption to clipboard so user can paste in Instagram
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(message);
  } catch { /* clipboard optional */ }

  Alert.alert(
    'Photo saved',
    'Your photo is saved to your camera roll and the caption is copied. Opening Instagram — pick the photo and paste the caption.',
    [{
      text: 'Open Instagram',
      onPress: () => openOrFallback('instagram://camera', 'https://www.instagram.com/', 'Instagram'),
    }, { text: 'Cancel', style: 'cancel' }]
  );
};

// TikTok — video-only realistically, but we'll open it with photo saved.
// TikTok supports photo carousels now, so it's not a complete dead end.
const shareToTikTok = async (message, photoUri) => {
  if (!photoUri) {
    Alert.alert(
      'TikTok needs a photo or video',
      'TikTok doesn\'t support text-only shares. Go back and add a photo, or pick a different platform.'
    );
    return;
  }
  const savedUri = await saveToCameraRoll(photoUri);
  if (!savedUri) return;

  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(message);
  } catch { /* clipboard optional */ }

  Alert.alert(
    'Photo saved',
    'Your photo is saved and caption is copied. Opening TikTok — create a post and paste the caption.',
    [{
      text: 'Open TikTok',
      onPress: () => openOrFallback('snssdk1233://', 'https://www.tiktok.com/', 'TikTok'),
    }, { text: 'Cancel', style: 'cancel' }]
  );
};

// ── Share-content picker ──────────────────────────────────────────────────────
// Called before any platform handler. Lets the user choose what gets shared.
const pickShareContent = (actText, dayNumber, photoUri, onPick) => {
  const hasPhoto = Boolean(photoUri);
  const options = hasPhoto
    ? ['Text only', 'Photo + text', 'Cancel']
    : ['Text only', 'Cancel'];
  const cancelIndex = options.length - 1;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetFromOptions = ActionSheetIOS.showActionSheetFromOptions || ActionSheetIOS.showActionSheetWithOptions;
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: cancelIndex, title: 'What do you want to share?' },
      (idx) => {
        if (idx === cancelIndex) return;
        const message = buildMessage(actText, dayNumber);
        const includePhoto = hasPhoto && idx === 1;
        onPick(message, includePhoto ? photoUri : null);
      }
    );
  } else {
    // Android: use Alert with buttons
    Alert.alert(
      'What do you want to share?',
      null,
      [
        { text: 'Text only', onPress: () => onPick(buildMessage(actText, dayNumber), null) },
        ...(hasPhoto ? [{ text: 'Photo + text', onPress: () => onPick(buildMessage(actText, dayNumber), photoUri) }] : []),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function ShareRow({ actText, dayNumber, photoUri, colors }) {
  const C = colors || defaultColors;
  const [busy, setBusy] = useState(false);

  const handleShare = (platformFn, platformName) => () => {
    if (busy) return;
    pickShareContent(actText, dayNumber, photoUri, async (message, chosenPhoto) => {
      setBusy(true);
      try {
        await platformFn(message, chosenPhoto);
      } finally {
        setBusy(false);
      }
    });
  };

  const buttons = [
    { name: 'X',         icon: '𝕏',  onPress: handleShare(shareToX,        'X') },
    { name: 'Facebook',  icon: 'f',  onPress: handleShare(shareToFacebook, 'Facebook') },
    { name: 'Instagram', icon: '📷', onPress: handleShare(shareToInstagram,'Instagram') },
    { name: 'TikTok',    icon: '🎵', onPress: handleShare(shareToTikTok,   'TikTok') },
  ];

  return (
    <View>
      <Text style={[styles.prompt, { color: C.sub }]}>Share your kindness</Text>
      <View style={styles.row}>
        {buttons.map((b) => (
          <TouchableOpacity
            key={b.name}
            style={[styles.btn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={b.onPress}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Text style={[styles.icon, { color: C.text }]}>{b.icon}</Text>
            <Text style={[styles.label, { color: C.text }]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const defaultColors = {
  surface: '#1a1a2e', border: '#2a2a3e', text: '#eaeaf0', sub: '#9a9aa8',
};

const styles = StyleSheet.create({
  prompt: { fontSize: 13, textAlign: 'center', marginBottom: 14 },
  row:    { flexDirection: 'row', gap: 10, marginBottom: 16 },
  btn: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    paddingVertical: 12, alignItems: 'center', gap: 4,
  },
  icon:  { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '700' },
});