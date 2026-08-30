import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Linking, Platform, Alert, Share, Image, Modal,
  ActivityIndicator, Dimensions, ScrollView,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { FontAwesome6 } from '@expo/vector-icons';
import ShareButtons, { buildSocialButtons } from '../components/ShareButtons';
import Constants from 'expo-constants';
import { captureRef } from 'react-native-view-shot';
import StoryCard from '../components/StoryCard';
import { generateInviteLink } from '../lib/branch';
import { buildInviteMessage , buildSocialMessage } from '../lib/shareMessage';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Badge, ScreenHeader, Card } from '../components';
import {
  C,
  todayStr,
  getActIcon,
  getActByTitle,
  formatTimeLabel,
  formatCostLabel,
} from '../constants';
import { supabase } from '../lib/supabase';

const APP_URL = 'https://30ActsofKindness.org';
const FB_APP_ID = '1033236095805810';
const APP_HASHTAG = '#30ActsOfKindness';

const { width: SCREEN_W } = Dimensions.get('window');

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

const saveToCameraRoll = async (uri) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need photo library access to share to Instagram or TikTok.');
      return null;
    }
    let localUri = uri;
    if (uri.startsWith('http')) {
      const filename = `${FileSystem.cacheDirectory}share-${Date.now()}.jpg`;
      const download = await FileSystem.downloadAsync(uri, filename);
      localUri = download.uri;
    }
    const asset = await MediaLibrary.createAssetAsync(localUri);
    return asset.uri;
  } catch (err) {
    console.warn('saveToCameraRoll error:', err && err.message ? err.message : err);
    return null;
  }
};

// True in Expo Go, where native modules (the Facebook SDK) aren't linked — we
// must not touch them there or the screen errors. False in dev / TestFlight /
// App Store builds, where the SDK is available.
const FB_IS_EXPO_GO =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

// Hand the framed card to Facebook's native ShareDialog so it opens the FB
// composer with the image already attached. Real builds only. Returns true if
// the dialog handled it, false to fall back to the share sheet.
const tryFacebookShareDialog = async (localUri) => {
  if (!localUri || FB_IS_EXPO_GO) return false;
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
    await ShareDialog.show(content); // resolves whether posted or cancelled
    return true;
  } catch (e) {
    console.warn('FB ShareDialog unavailable, falling back:', e && e.message);
    return false;
  }
};

const openOrFallback = async (appUrl, webUrl, appName) => {
  // Try the app's URL scheme first. If it isn't installed, the scheme is
  // blocked, or a bare scheme (e.g. tiktok://) rejects, fall back to the web
  // URL — which always opens in the browser. Only alert if even that fails.
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

// Format a local-calendar "YYYY-MM-DD" scheduledDate for the row label.
// Today shows "Today"; every other completed/past day shows "Jul 5".
// Parsed with an explicit T00:00:00 so it stays in local time (no day shift).
function formatDayLabel(scheduledDate, today) {
  if (!scheduledDate) return '';
  if (scheduledDate === today) return 'Today';
  const d = new Date(scheduledDate + 'T00:00:00');
  if (isNaN(d)) return scheduledDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function HistoryScreen({ route, navigation, days }) {
  if (!days) {
    return (
      <View style={s.empty}>
        <Text style={{ fontSize: 48 }}>📖</Text>
        <Text style={s.emptySub}>No history yet</Text>
      </View>
    );
  }
  const today = todayStr();
  const past = days.filter(d => d.scheduledDate <= today);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="History" />
      <FlatList
        data={past}
        keyExtractor={d => String(d.dayNumber)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item: day }) => {
          const isCompleted = day.status === 'COMPLETED';
          const icon = isCompleted ? getActIcon(day.title) : null;

          return (
            <TouchableOpacity
              onPress={() => navigation.navigate('DayDetail', { day })}
              style={[s.row, { borderColor: isCompleted ? C.primary + '44' : C.border }]}
            >
              <View style={[s.circle, { backgroundColor: isCompleted ? C.primary + '33' : C.surface }]}>
                <Text style={[s.circleNum, isCompleted && { color: C.primary }]}>{day.dayNumber}</Text>
              </View>
              {icon && (
                <Text style={s.categoryIcon}>{icon}</Text>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.muted, fontSize: 11 }}>{formatDayLabel(day.scheduledDate, today)}</Text>
                {day.title ? (
                  <Text style={s.rowTitle} numberOfLines={2}>{day.title}</Text>
                ) : null}
                {day.proofType ? (
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>📎 {day.proofType}</Text>
                ) : null}
              </View>
              <Badge status={day.status} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

export function DayDetailScreen({ route, navigation, onDelete }) {
  const { day, editable } = route.params;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      if (onDelete) await onDelete(day);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Could not delete this act.');
      console.warn('Delete failed:', e.message);
    } finally {
      setDeleting(false);
    }
  };
  const [story, setStory] = useState('');
  const [mediaUri, setMediaUri] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [videoThumbUri, setVideoThumbUri] = useState(null);
  const storyCardRef = useRef(null);

  // Invite link for the QR on the shared card. Every share sends the card, and
  // the card carries the QR plus the line explaining it - see StoryCard.js.
  const [inviteUrl, setInviteUrl] = useState(APP_URL);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const phone = extractPhone(user?.email) || user?.phone || null;
        if (!phone) return;
        if (alive) setInviteUrl(`${APP_URL}?ref=${encodeURIComponent(phone)}`);
        const url = await generateInviteLink({ phone });
        if (alive && url) setInviteUrl(url);
      } catch (e) { console.warn('Invite link failed:', e && e.message); }
    })();
    return () => { alive = false; };
  }, []);

  // Generate thumbnail when a video is loaded
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mediaType !== 'video' || !mediaUri) {
        setVideoThumbUri(null);
        return;
      }
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(mediaUri, {
          time: 1000,
          quality: 0.7,
        });
        if (!cancelled) setVideoThumbUri(uri);
      } catch (e) {
        console.warn('Video thumbnail error:', e.message);
        if (!cancelled) setVideoThumbUri(null);
      }
    })();
return () => { cancelled = true; };
  }, [mediaUri, mediaType]);

  // Look up category / time / cost. Try the standard catalog first; if


  // matching act_text to the day's title.
  const standardAct = getActByTitle(day?.title);
  const actInfo = standardAct;

  useEffect(() => {
    if (day?.status !== 'COMPLETED') return;
    setMediaLoading(true);
    setMediaError(false);
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const phone = extractPhone(user?.email);
        if (!phone) return;

        let completion = null;
        if (day.completionId) {
          // Preferred: the grid carries the real row id. The displayed
          // dayNumber is renumbered after a restart and no longer matches the
          // stored day_number, so a day_number lookup would fetch the wrong row.
          const { data } = await supabase
            .from('completions')
            .select('id, notes')
            .eq('id', day.completionId)
            .maybeSingle();
          completion = data;
        } else {
          const { data } = await supabase
            .from('completions')
            .select('id, notes')
            .eq('user_phone', phone)
            .eq('day_number', day.dayNumber)
            .maybeSingle();
          completion = data;
        }
        if (completion?.notes) setStory(completion.notes);

        if (completion?.id) {
          const { data: mediaRows } = await supabase
            .from('act_media')
            .select('file_path, media_type')
            .eq('completion_id', completion.id)
            .limit(1);
          if (mediaRows?.[0]?.file_path) {
            const { data: urlData } = supabase.storage
              .from('act-media')
              .getPublicUrl(mediaRows[0].file_path);
            if (urlData?.publicUrl) {
              setMediaUri(urlData.publicUrl);
              setMediaType(mediaRows[0].media_type);
            }
          }
        }
      } catch (e) {
        console.warn('Fetch detail error:', e.message);
        setMediaError(true);
      } finally {
        setMediaLoading(false);
      }
    })();
  }, [day?.dayNumber, day?.status]);

  const buildShareMessage = () => {
    const storyPart = story.trim()
      ? `\n\nHere's what I did:\n"${story.trim()}"`
      : '';
    return `🕊️ I completed Day ${day.dayNumber} of the 30 Acts of Kindness™!\n\nMy act: "${day.title}"${storyPart}\n\n${APP_HASHTAG}\nJoin me at ${APP_URL}`;
  };

  // Picture only, through the share sheet - Messages attaches the card.
  const handleShareText = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      if (!uri) { Alert.alert('Could not prepare the picture', 'Please try again.'); return; }
      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await RNShare.open({
          url: uri,
          message: buildInviteMessage({ inviteUrl }),
          failOnCancel: false,
        });
        return;
      }
      await shareImage(uri);
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Text share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  // Picture only. Same sheet as Text, with a subject line for mail apps.
  const handleShareEmail = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      if (!uri) { Alert.alert('Could not prepare the picture', 'Please try again.'); return; }
      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await RNShare.open({
          url: uri,
          message: buildInviteMessage({ inviteUrl }),
          subject: `Day ${day?.dayNumber} of 30 Acts of Kindness`,
          failOnCancel: false,
        });
        return;
      }
      await shareImage(uri);
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Email share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  // More: the picture, nothing else.
  const handleShareOther = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      if (!uri) { Alert.alert('Could not prepare the picture', 'Please try again.'); return; }
      await shareImage(uri);
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Share error:', e && e.message);
    } finally { setSharing(false); }
  };

  // Resolves the image/video to share. Photo/video → the media itself.
  // Story (text) → snapshot the hidden StoryCard to a JPEG so it can go to
  // image-only platforms (Instagram / TikTok) and attach on X / Facebook.
  // The card is the share, always - it carries the day number, branding,
  // hashtag, QR code and the line explaining the QR. Sharing the user's own
  // photo instead would drop the QR, so it does not win here.
  const resolveShareMedia = async () => {
    if (!storyCardRef.current) return null;
    try {
      // Two passes: the first can race the off-screen layout on cold renders.
      await captureRef(storyCardRef, { format: 'jpg', quality: 0.92 });
      return await captureRef(storyCardRef, { format: 'jpg', quality: 0.92 });
    } catch (err) {
      console.warn('Story card capture failed:', err);
      return null;
    }
  };

  // Returns a local file:// uri suitable for the native iOS share sheet.
  // Story capture is already local; remote photo/video (http) is downloaded first.
  const localShareUri = async () => {
    const media = await resolveShareMedia();
    if (!media) return null;
    if (media.startsWith('http')) {
      try {
        const target = `${FileSystem.cacheDirectory}share-${Date.now()}.jpg`;
        const dl = await FileSystem.downloadAsync(media, target);
        return dl.uri;
      } catch (e) { console.warn('Share download failed:', e && e.message); return null; }
    }
    if (media.startsWith('file://') || media.startsWith('ph://')) return media;
    return `file://${media}`;
  };

  // Facebook, X, and TikTok can't be opened with a picture already attached (only
  // Instagram can). So we copy the act PICTURE to the clipboard, open the app the
  // user picked, and they paste the picture into their post. Falls back to copying
  // the text if the image can't be read.
  const shareToApp = async (name, appUrl, webUrl) => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      let copiedImage = false;
      if (uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          await Clipboard.setImageAsync(base64);
          copiedImage = true;
        } catch (e) {
          console.warn('Copy picture to clipboard failed:', e && e.message);
        }
      }
      if (!copiedImage) {
        Alert.alert('Could not prepare the picture', 'Please try again.');
        return;
      }
      // Tell the user what to do, THEN open the app when they tap Open.
      Alert.alert(
        `Share to ${name}`,
        `Your act picture is copied.\n\n${name} will open — start a new post and paste (touch and hold, then tap Paste) to add your picture.`,
        [
          { text: `Open ${name}`, onPress: () => openOrFallback(appUrl, webUrl, name) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn(`${name} share failed:`, e && e.message);
    } finally { setSharing(false); }
  };

  // X: the share sheet, with Apple's own activities stripped out.
  //
  // X will only take the picture AND the caption through its share extension,
  // which only exists inside the sheet - twitter://post carries text and never
  // media. The problem was that AirDrop, Messages, Mail, Copy, Save Image and
  // Assign to Contact pushed X off the visible row, so it had to be hunted for.
  // Excluding those leaves the app extensions, and X lands in view.
  const X_EXCLUDED = [
    'com.apple.UIKit.activity.AirDrop',
    'com.apple.UIKit.activity.Message',
    'com.apple.UIKit.activity.Mail',
    'com.apple.UIKit.activity.CopyToPasteboard',
    'com.apple.UIKit.activity.SaveToCameraRoll',
    'com.apple.UIKit.activity.AssignToContact',
    'com.apple.UIKit.activity.Print',
    'com.apple.UIKit.activity.AddToReadingList',
    'com.apple.UIKit.activity.OpenInIBooks',
    'com.apple.UIKit.activity.MarkupAsPDF',
  ];

  const shareToX = async () => {
    if (sharing) return;
    setSharing(true);

    const capped = (promise, ms) => {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('X share timed out')), ms);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    };

    try {
      const uri = await capped(localShareUri(), 15000).catch(() => null);
      if (!uri) { Alert.alert('Could not prepare the picture', 'Please try again.'); return; }

      // Picture on the clipboard as a backstop, in case the extension is picked
      // that does not take it.
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        await Clipboard.setImageAsync(base64);
      } catch (e) { console.warn('Copy picture to clipboard failed:', e && e.message); }

      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await capped(RNShare.open({
          url: uri,
          message: buildSocialMessage({ inviteUrl }),
          excludedActivityTypes: X_EXCLUDED,
          failOnCancel: false,
        }), 120000);
        return;
      }
      await shareImage(uri);
    } catch (e) {
      const msg = (e && e.message) || '';
      if (!/did not share|cancel|dismiss/i.test(msg)) console.warn('X share failed:', msg);
    } finally {
      setSharing(false);
    }
  };

  // Facebook: save the card to Photos, copy the caption, open Facebook's normal
  // composer. Same shape as TikTok.
  //
  // The SDK's ShareDialog DOES attach the picture automatically and is still
  // below as a fallback - but its photo sheet does not reliably give a caption
  // field, so there was nowhere to paste. Facebook refuses prefilled text from
  // other apps by policy, so a composer you can actually type in is worth more
  // than the picture arriving by itself.
  const shareToFacebook = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}

      // Facebook's own ShareDialog opens the composer with the picture already
      // attached - confirmed working on device. The save-to-Photos flow below is
      // the fallback for Expo Go or a phone without the Facebook app.
      if (uri && (await tryFacebookShareDialog(uri))) {
        return;
      }

      let saved = null;
      if (uri) saved = await saveToCameraRoll(uri);

      Alert.alert(
        'Share to Facebook',
        saved
          ? 'Your act picture is saved to your Photos and the caption is copied.\n\nFacebook will open — tap the photo icon (📷), pick the newest photo, then touch and hold in the text box and tap Paste.'
          : 'Your caption is copied.\n\nFacebook will open — start a post and paste it.',
        [
          { text: 'Open Facebook', onPress: async () => {
            await openOrFallback(
              `fb://share?link=${encodeURIComponent(APP_URL)}`,
              `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`,
              'Facebook',
            );
          } },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Facebook share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  const shareToInstagram = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      // The caption for the post. Instagram, TikTok and Facebook accept no
      // prefilled text from another app, so the clipboard is the only route -
      // the person pastes it into the composer. X gets it via its intent.
      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}
      if (!uri) {
        Alert.alert(
          "Couldn't prepare an image",
          'Add a photo or a written story for this act, then try sharing again.'
        );
        return;
      }
      // Caption can't ride along to Instagram, so copy it for pasting.
      // Hand the image straight to Instagram via the iOS share sheet. This
      // bypasses Instagram's limited-photo-access and its Reel composer — the
      // app receives the image directly and lets you post it to Feed or Story.
      await Share.share({ url: uri });
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Instagram share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  // TikTok: save the card to Photos and open TikTok. Their composer picks it up
  // as the cover. TikTok is NOT reliably offered in the system share sheet, so
  // this direct route is the one that works. The caption cannot be written into
  // "Add a catchy title" by any third-party app, so it goes on the clipboard.
  const shareToTikTok = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}
      let saved = null;
      if (uri) saved = await saveToCameraRoll(uri);
      Alert.alert(
        'Share to TikTok',
        saved
          ? 'Your act picture is saved to your Photos and the caption is copied.\n\nTikTok will open — tap ➕ → Upload, pick the saved photo, then paste the caption.'
          : 'Could not save the picture.\n\nTikTok will open anyway — you can add a photo yourself.',
        [
          { text: 'Open TikTok', onPress: async () => {
            try { await Linking.openURL('tiktok://'); }
            catch { try { await Linking.openURL('https://www.tiktok.com/'); } catch {} }
          } },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('TikTok share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  // One share route for every social app: the system sheet. See the long note in
  // src/components/ShareButtons.js for why per-platform buttons were dropped.
  // Cancelling the sheet is not an error - it must not raise an alert.
  const handleShareAll = async () => {
    if (sharing) return;
    setSharing(true);

    const capped = (promise, ms) => {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('share timed out')), ms);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    };

    try {
      const uri = await capped(localShareUri(), 15000).catch(() => null);
      if (!uri) { Alert.alert('Could not prepare the picture', 'Please try again.'); return; }

      // Caption on the clipboard too: Instagram and TikTok cannot receive text
      // from another app, so pasting is the only way it reaches the composer.
      try { await Clipboard.setStringAsync(buildSocialMessage({ inviteUrl })); } catch {}

      let RNShare = null;
      try { RNShare = require('react-native-share').default; } catch {}
      if (RNShare && !isExpoGo) {
        await capped(RNShare.open({
          url: uri,
          message: buildSocialMessage({ inviteUrl }),
          failOnCancel: false,
        }), 120000);
        return;
      }
      await shareImage(uri);
    } catch (e) {
      const msg = (e && e.message) || '';
      const cancelled = /did not share|cancel|dismiss/i.test(msg);
      if (!cancelled) console.warn('Share failed:', msg);
    } finally {
      setSharing(false);
    }
  };

  const socialButtons = [
    { name: 'Instagram', faIcon: 'instagram', onPress: shareToInstagram, brand: '#E4405F' },
    { name: 'Facebook',  faIcon: 'facebook',  onPress: shareToFacebook,  brand: '#1877F2' },
    { name: 'TikTok',    faIcon: 'tiktok',    onPress: shareToTikTok,    brand: '#000000' },
    { name: 'X',         faIcon: 'x-twitter', onPress: shareToX,         brand: '#000000' },
  ];

  const isCompleted = day?.status === 'COMPLETED';
  const showMediaSection = isCompleted && (day?.proofType === 'photo' || day?.proofType === 'video');

  // Fallback emoji icon (text) if no Image asset is available
  const fallbackIcon = getActIcon(day?.title);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StoryCard
        ref={storyCardRef}
        title={day.title}
        story={story}
        dayNumber={day?.dayNumber}
        inviteUrl={inviteUrl}
      />
<ScreenHeader title={`Day ${day?.dayNumber}`} onBack={() => navigation.goBack()}
        right={<Badge status={day?.status} />} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
      >
        <Card>
          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>{day?.scheduledDate}</Text>
          {day?.title ? (
            <Text style={s.detailTitle}>"{day.title}"</Text>
          ) : null}

          {/* Category / Time / Cost — replaces the old proof-type row */}
          <View style={s.metaBox}>
            <View style={s.metaCategoryRow}>
              {actInfo?.categoryEmoji ? (
                <Image source={actInfo.categoryEmoji} style={s.metaCategoryIcon} resizeMode="contain" />
              ) : fallbackIcon ? (
                <Text style={s.metaCategoryIconText}>{fallbackIcon}</Text>
              ) : null}
              <Text style={s.metaCategory} numberOfLines={1}>
                {actInfo?.categoryLabel || '—'}
              </Text>
            </View>
            <Text style={s.metaLine} numberOfLines={1}>
              <Text style={s.metaLabel}>Time: </Text>
              {actInfo?.timeMinutes != null ? formatTimeLabel(actInfo.timeMinutes) : '—'}
            </Text>
            <Text style={s.metaLine} numberOfLines={1}>
              <Text style={s.metaLabel}>Cost: </Text>
              {actInfo?.costDollars != null ? formatCostLabel(actInfo.costDollars) : '—'}
            </Text>
          </View>

          {showMediaSection && (
            <View style={s.mediaWrap}>
              {mediaLoading ? (
                <View style={s.mediaPlaceholder}>
                  <ActivityIndicator color={C.primary} />
                  <Text style={s.mediaPlaceholderText}>Loading {day.proofType}…</Text>
                </View>
              ) : mediaUri && !mediaError && day.proofType === 'photo' ? (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setShowFullImage(true)}>
                  <Image
                    source={{ uri: mediaUri }}
                    style={s.mediaImage}
                    resizeMode="cover"
                    onError={() => setMediaError(true)}
                  />
                 <View style={s.mediaTapHint}>
                    <Text style={s.mediaTapHintText}>Tap to view full size</Text>
                  </View>
                </TouchableOpacity>
              ) : mediaUri && !mediaError && day.proofType === 'video' ? (
                <TouchableOpacity
                  style={s.videoThumbWrap}
                  activeOpacity={0.85}
                  onPress={() => Linking.openURL(mediaUri).catch(() =>
                    Alert.alert('Error', 'Could not open video.'))}
                >
                  {videoThumbUri ? (
                    <Image
                      source={{ uri: videoThumbUri }}
                      style={s.videoThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[s.videoThumb, s.videoThumbFallback]} />
                  )}
                  <View style={s.playOverlay}>
                    <View style={s.playButton}>
                      <Text style={s.playButtonIcon}>▶</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={s.mediaPlaceholder}>
                  <Text style={{ fontSize: 28 }}>📷</Text>
                  <Text style={s.mediaPlaceholderText}>
                    {mediaError ? 'Could not load media' : 'No media on file for this day'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {story ? (
            <View style={s.storyBox}>
              <Text style={s.storyLabel}>YOUR STORY</Text>
              <Text style={s.storyText}>{story}</Text>
            </View>
          ) : null}
          {(day?.status === 'NOT_SET' || day?.status === 'MISSED') ? (
            <Text style={{ color: C.muted, fontSize: 13, fontStyle: 'italic' }}>
              This day is locked and cannot be modified.
            </Text>
          ) : null}
        </Card>

{editable && isCompleted && (
          <TouchableOpacity
            onPress={() => setConfirmDelete(true)}
            disabled={deleting}
            activeOpacity={0.8}
            style={s.deleteBtn}
          >
            <Text style={s.deleteBtnIcon}>🗑️</Text>
            <Text style={s.deleteBtnLabel}>
              {deleting ? 'Deleting…' : 'Delete this act'}
            </Text>
          </TouchableOpacity>
        )}

        {isCompleted && (
          <Card style={{ marginTop: 12 }}>

            <Text style={s.shareHeader}>Share this Act</Text>
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
</Card>
        )}
      </ScrollView>

<Modal visible={showFullImage} transparent animationType="fade" onRequestClose={() => setShowFullImage(false)}>
        <TouchableOpacity
          style={s.fullImageBg}
          activeOpacity={1}
          onPress={() => setShowFullImage(false)}
        >
          {mediaUri && (
            <Image
              source={{ uri: mediaUri }}
              style={s.fullImage}
              resizeMode="contain"
            />
          )}
          <View style={s.fullImageClose}>
            <Text style={s.fullImageCloseText}>Tap to close ✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={confirmDelete} transparent animationType="fade">
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={{ fontSize: 44, textAlign: 'center', marginBottom: 12 }}>🗑️</Text>
            <Text style={s.modalTitle}>Delete this act?</Text>
            <Text style={s.modalBody}>
              This will remove Day {day.dayNumber} from your 30 Acts. If this
              breaks your streak, your progress will collapse to your most
              recent unbroken streak.
            </Text>
            <TouchableOpacity
              onPress={handleDelete}
              style={[s.modalBtn, { backgroundColor: C.error }]}
            >
              <Text style={s.modalBtnText}>Yes, delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmDelete(false)}
              style={[s.modalBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginTop: 10 }]}
            >
              <Text style={[s.modalBtnText, { color: C.text }]}>Keep it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  emptySub: { color: C.sub, fontSize: 16, marginTop: 12 },
  row: {
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
  },
  circle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  circleNum: { color: C.sub, fontWeight: '800', fontSize: 14 },
  categoryIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  rowTitle: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  detailTitle: { color: C.text, fontSize: 21, fontWeight: '800', marginBottom: 16 },

  // Category / Time / Cost block (replaces the old "proof type" row)
  metaBox: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  metaCategory: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  metaCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  metaCategoryIcon: {
    width: 22,
    height: 22,
    marginRight: 8,
  },
  metaCategoryIconText: {
    fontSize: 20,
    marginRight: 8,
  },
  metaLine: {
    color: C.sub,
    fontSize: 13,
    marginTop: 2,
  },
  metaLabel: {
    color: C.muted,
    fontWeight: '700',
  },

  storyBox: { backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 4 },
  storyLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  storyText: { color: C.text, fontSize: 14, lineHeight: 20 },
  shareHeader: { color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  sharePrompt: { color: C.sub, fontSize: 13, marginBottom: 14, lineHeight: 18 },

  mediaWrap: { marginBottom: 12 },
  mediaImage: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    backgroundColor: C.surface,
  },
  mediaTapHint: {
    position: 'absolute',
    bottom: 8, right: 8,
    backgroundColor: '#000000AA',
    borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  mediaTapHintText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mediaPlaceholder: {
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
  },
  mediaPlaceholderText: { color: C.muted, fontSize: 13 },
videoBox: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 56,
    alignItems: 'center',
    gap: 8,
  },
  videoPlayIcon: { color: '#fff', fontSize: 48 },
  videoLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },

  videoThumbWrap: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoThumb: {
    width: '100%',
    height: '100%',
  },
  videoThumbFallback: {
    backgroundColor: C.surface,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#000000AA',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonIcon: {
    color: '#FFFFFF',
    fontSize: 26,
    marginLeft: 4,
  },

  fullImageBg: {
    flex: 1, backgroundColor: '#000000EE',
    alignItems: 'center', justifyContent: 'center',
  },
  fullImage: { width: SCREEN_W, height: '85%' },
  fullImageClose: {
    position: 'absolute', bottom: 40,
    backgroundColor: '#FFFFFF22',
    borderRadius: 99, paddingHorizontal: 18, paddingVertical: 10,
  },
  fullImageCloseText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Social row: icon-only buttons (labels removed, icon size bumped)
  socialRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  socialBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center',
  },

  shareRow: { flexDirection: 'row', gap: 12 },
  shareBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, paddingVertical: 12, alignItems: 'center', gap: 4,
  },
shareBtnIcon:  { fontSize: 24 },
  shareBtnLabel: { color: C.text, fontSize: 12, fontWeight: '700' },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.error + '15',
    borderWidth: 1.5,
    borderColor: C.error,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  deleteBtnIcon: { fontSize: 18 },
  deleteBtnLabel: { color: C.error, fontWeight: '800', fontSize: 15 },

  modalBg: {
    flex: 1, backgroundColor: '#000000BB',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: C.card, borderRadius: 22, padding: 28,
    borderWidth: 1.5, borderColor: C.error + '55', width: '100%',
  },
  modalTitle: { color: C.text, fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  modalBody: { color: C.sub, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  modalBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
