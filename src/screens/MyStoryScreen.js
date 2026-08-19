import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Platform, KeyboardAvoidingView, ActivityIndicator,
  Linking, Share, Dimensions, InputAccessoryView, Keyboard,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { FontAwesome6 } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Speech-to-text (native module — not available in Expo Go). Loaded defensively
// so the screen still works in Expo Go, where the mic just focuses the box.
let ExpoSpeechRecognitionModule = null;
let useSpeechRecognitionEvent = null;
try {
  const sr = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = sr.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = sr.useSpeechRecognitionEvent;
} catch {
  // Not installed / Expo Go — mic falls back to focusing the text box.
}
const SPEECH_AVAILABLE = !!ExpoSpeechRecognitionModule && !!useSpeechRecognitionEvent;
// Stable hook reference so we can always call it unconditionally (Rules of Hooks).
const useSpeechEvent = useSpeechRecognitionEvent || (() => {});
import { ScreenHeader } from '../components';
import StoryCard from '../components/StoryCard';
import { C, todayStr, localDateInTZ } from '../constants';
import { supabase } from '../lib/supabase';
import { getActiveSponsorIds } from '../lib/streak';
import { generateInviteLink } from '../lib/branch';
import { notifyDay30 } from '../lib/day30';
import { loadRuns } from '../lib/runs';

const STORY_MIN = 10;
// Hard cap matched to the StoryCard image. With the title line removed, the
// quote box gets the full card height (capped at 11 lines at 44px), so ~300
// chars fits cleanly without clipping.
const STORY_MAX = 300;
const { width: SCREEN_W } = Dimensions.get('window');
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);

const APP_URL = 'https://30ActsofKindness.org';
const APP_HASHTAG = '#30ActsOfKindness';
const FB_APP_ID = '1033236095805810';

const KB_DONE_ID = 'myStoryKbDone';

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

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

// Local ISO timestamp with timezone offset (mirrors DailyActScreen.localISOString).
function localISOString(date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const y  = date.getFullYear();
  const M  = pad(date.getMonth() + 1);
  const d  = pad(date.getDate());
  const h  = pad(date.getHours());
  const m  = pad(date.getMinutes());
  const s  = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const tzH  = pad(Math.floor(Math.abs(tz) / 60));
  const tzM  = pad(Math.abs(tz) % 60);
  return `${y}-${M}-${d}T${h}:${m}:${s}.${ms}${sign}${tzH}:${tzM}`;
}

// ── Share helpers (story-only port from DailyActScreen) ─────────────────────

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
    console.warn('saveToCameraRoll error:', err);
    return null;
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

// True when running inside Expo Go, where native modules like the Facebook
// SDK aren't linked — we must not touch them or the app red-screens.
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

/**
 * MyStoryScreen — the single create + share flow (story-only app).
 *
 * Modes (decided by whether the day is already completed):
 *   CREATE — mic + story box (+ optional act shown read-only). Saves a
 *            story completion to the target day, then flips to SHARE mode.
 *   SHARE  — shows the branded StoryCard + social buttons (Instagram, TikTok,
 *            Facebook, X) and Text/Email/More. Ported from DailyActScreen's
 *            story path; photo/video removed entirely.
 *
 * Entry:
 *   A) Post-login popup "Yes"      → CREATE, no act, target = today's open day
 *   B) Empty-day tap → act picker  → CREATE, act shown, target = tapped day
 *   C) Tap a COMPLETED day         → SHARE (loads the saved story)
 */
export default function MyStoryScreen({ navigation, route, user, days, onComplete, onDelete }) {
  const insets = useSafeAreaInsets();
  const storyRef = useRef(null);
  const storyCardRef = useRef(null);

  const preselectedAct = route?.params?.preselectedAct || null;

  // Target day: explicit day from picker/calendar, else today's open cell.
  const targetDay = useMemo(() => {
    if (route?.params?.day) return route.params.day;
    const today = todayStr();
    return days?.find(d => d.scheduledDate === today) || null;
  }, [days, route?.params?.day]);

  // Are we opening an already-completed day? Then start in SHARE mode.
  const initiallyCompleted = route?.params?.day?.status === 'COMPLETED';

  // Pre-fill the story box: if returning from the picker, the draftStory the
  // user already typed wins; otherwise seed with the picked act's title so the
  // act text is already "in" the story and Save is active immediately.
  const initialStory =
    route?.params?.draftStory
    || (preselectedAct?.title ? `${preselectedAct.title}. ` : '')
    || '';
  const [story,   setStory]   = useState(initialStory);
  const [listening, setListening] = useState(false);
  // Text present when dictation started, so streaming results append cleanly.
  const dictationBaseRef = useRef('');
  const [saving,  setSaving]  = useState(false);
  const [sharing, setSharing] = useState(false);

  // SHARE-mode state. Populated either right after a save, or by loading an
  // existing completion when entering on a completed day.
  const [shareMode,      setShareMode]      = useState(initiallyCompleted);
  const [completedTitle, setCompletedTitle] = useState(preselectedAct?.title || route?.params?.day?.title || 'My Story');
  const [completedStory, setCompletedStory] = useState('');
  const [dayNumber,      setDayNumber]      = useState(route?.params?.day?.dayNumber ?? targetDay?.dayNumber ?? null);

  const charCount  = story.trim().length;
  const storyValid = charCount >= STORY_MIN;

  // When entering on a completed day, load the saved story for the share card.
  React.useEffect(() => {
    if (!initiallyCompleted) return;
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const phone = extractPhone(authUser?.email);
        if (!phone) return;
        const dayObj = route?.params?.day;
        let completion = null;
        if (dayObj?.completionId) {
          const { data } = await supabase
            .from('completions')
            .select('act_title, notes, day_number')
            .eq('id', dayObj.completionId)
            .maybeSingle();
          completion = data;
        } else {
          // Fallback when the grid entry has no completionId. Key on the
          // calendar date, NOT day_number -- day_number is renumbered on every
          // restart, so it can resolve to a completely different act.
          const { data } = await supabase
            .from('completions')
            .select('act_title, notes, day_number')
            .eq('user_phone', phone)
            .eq('local_date', dayObj?.scheduledDate)
            .maybeSingle();
          completion = data;
        }
        if (completion?.notes)     setCompletedStory(completion.notes);
        if (completion?.act_title) setCompletedTitle(completion.act_title);
        if (completion?.day_number != null) setDayNumber(completion.day_number);
      } catch (e) {
        console.warn('Load completion for share failed:', e.message);
      }
    })();
  }, [initiallyCompleted]);

  // ── Speech-to-text ────────────────────────────────────────────────────────
  // Append the live transcript to whatever was in the box when we started,
  // clamped to the character cap.
  useSpeechEvent('result', (event) => {
    const transcript = event?.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    const base = dictationBaseRef.current;
    const joined = base ? `${base.trimEnd()} ${transcript}` : transcript;
    setStory(joined.slice(0, STORY_MAX));
  });
  useSpeechEvent('end', () => setListening(false));
  useSpeechEvent('error', (event) => {
    console.warn('Speech recognition error:', event?.error, event?.message);
    setListening(false);
  });

  const startListening = async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone access needed',
          'To dictate your story, allow Microphone (and Speech Recognition) for 30 Acts. You can turn them on in Settings.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
          ]
        );
        return;
      }
      dictationBaseRef.current = story;
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
      });
    } catch (e) {
      console.warn('startListening failed:', e.message);
      setListening(false);
    }
  };

  const stopListening = () => {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setListening(false);
  };

  const handleMicPress = () => {
    if (!SPEECH_AVAILABLE) {
      // Expo Go / module missing → just focus the box (text-only fallback).
      storyRef.current?.focus();
      return;
    }
    if (listening) stopListening();
    else startListening();
  };

  // Stop listening if the user leaves the screen mid-dictation.
  React.useEffect(() => {
    return () => {
      if (SPEECH_AVAILABLE) {
        try { ExpoSpeechRecognitionModule.stop(); } catch {}
      }
    };
  }, []);

  // If the user taps "Browse acts" while this screen is already open, ChooseAct
  // navigates back here with a new preselectedAct. useState only seeds on first
  // mount, so watch for the picked act and fill the story with its title
  // (unless the user has already written something of their own).
  React.useEffect(() => {
    const act = route?.params?.preselectedAct;
    if (!act?.title) return;
    setCompletedTitle(act.title);
    setStory((prev) => (prev && prev.trim().length >= 3 ? prev : `${act.title}. `));
  }, [route?.params?.preselectedAct]);

  // ── Share message + media ────────────────────────────────────────────────

  const invitePhone = extractPhone(user?.email) || user?.phone || null;
  // Branch invite link (airpa.app.link) — bounces to the App Store and
  // attributes the joiner to this user's tree after install, no website hop.
  // Website fallback until the Branch short link resolves.
  const [inviteUrl, setInviteUrl] = useState(
    invitePhone ? `${APP_URL}?ref=${encodeURIComponent(invitePhone)}` : APP_URL
  );
  React.useEffect(() => {
    if (!invitePhone) return;
    let alive = true;
    generateInviteLink({ phone: invitePhone }).then((url) => {
      if (alive && url) setInviteUrl(url);
    });
    return () => { alive = false; };
  }, [invitePhone]);

  const buildShareMessage = () => {
    const s = completedStory.trim();
    const storyPart = s ? `\n\nHere's what I did:\n"${s}"` : '';
    return `🕊️ I just completed Day ${dayNumber} of the 30 Acts of Kindness™!\n\nMy act today: "${completedTitle}"${storyPart}\n\n${APP_HASHTAG}\n\nWant to join me? Here's how:\n1. Scan the QR code, or tap the link below\n2. Download the free 30 Acts of Kindness app\n3. Sign up with your phone number\n4. Do one kind act a day — you'll be added to my kindness tree 🌳\n\n${inviteUrl}`;
  };

  const handleShareText = () => {
    const msg = encodeURIComponent(buildShareMessage());
    const url = Platform.OS === 'ios' ? `sms:&body=${msg}` : `sms:?body=${msg}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Messages.'));
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(completedTitle || `Day ${dayNumber} of 30 Acts of Kindness™`);
    const body    = encodeURIComponent(buildShareMessage());
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`).catch(() => Alert.alert('Error', 'Could not open Mail.'));
  };

  const handleShareOther = async () => {
    try { await Share.share({ message: buildShareMessage() }); }
    catch (e) { console.warn('Share error:', e.message); }
  };

  // Render the off-screen StoryCard to a JPEG for image-only platforms.
  const resolveShareMedia = async () => {
    if (completedStory.trim() && storyCardRef.current) {
      try {
        // Two passes: first capture can race the off-screen layout on cold renders.
        await captureRef(storyCardRef, { format: 'jpg', quality: 0.92 });
        return await captureRef(storyCardRef, { format: 'jpg', quality: 0.92 });
      } catch (err) {
        console.warn('Story card capture failed:', err);
        return null;
      }
    }
    return null;
  };

  const localShareUri = async () => {
    const media = await resolveShareMedia();
    if (!media) return null;
    if (media.startsWith('file://') || media.startsWith('ph://')) return media;
    return `file://${media}`;
  };

  // Open a specific app directly with the picture via react-native-share's
  // shareSingle — the SAME mechanism that makes Instagram open cleanly. Returns
  // false in Expo Go, if the library/target is missing, or on cancel, so the
  // caller can fall back.
  const shareSingleTo = async (socialKey, extra) => {
    let RNShare = null;
    try { RNShare = require('react-native-share').default; } catch {}
    if (!RNShare || isExpoGo) return false;
    const social = RNShare?.Social?.[socialKey];
    if (!social) return false;
    try {
      await RNShare.shareSingle({ social, ...extra });
      return true;
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn(`shareSingle(${socialKey}) failed:`, e && e.message);
      return false;
    }
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
        try { await Clipboard.setStringAsync(buildShareMessage()); } catch {}
      }
      await openOrFallback(appUrl, webUrl, name);
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn(`${name} share failed:`, e && e.message);
    } finally { setSharing(false); }
  };

  const shareToX = () => shareToApp('X', 'twitter://post', 'https://twitter.com/intent/tweet');

  const shareImage = async (uri) => {
    let Sharing = null;
    try { Sharing = require('expo-sharing'); } catch {}
    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, {
        UTI: 'public.jpeg',
        mimeType: 'image/jpeg',
        dialogTitle: 'Share your kindness',
      });
      return;
    }
    await Share.share({ url: uri });
  };

  const shareToInstagramStory = async (uri) => {
    let RNShare = null;
    try { RNShare = require('react-native-share').default; } catch {}
    if (!RNShare || isExpoGo) return false;
    try {
      await RNShare.shareSingle({
        social: RNShare.Social.INSTAGRAM_STORIES,
        appId: FB_APP_ID,
        backgroundImage: uri,
      });
      return true;
    } catch (e) {
      console.warn('IG Story share failed, falling back:', e && e.message);
      return false;
    }
  };

  const shareToInstagram = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      if (!uri) {
        Alert.alert('Could not prepare an image', 'Write a story for this act, then try sharing again.');
        return;
      }
      try { await Clipboard.setStringAsync(buildShareMessage()); } catch {}
      const usedStory = await shareToInstagramStory(uri);
      if (!usedStory) await shareImage(uri);
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Instagram share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  const shareToTikTok = () => shareToApp('TikTok', 'tiktok://', 'https://www.tiktok.com/');

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
      console.warn('FB ShareDialog unavailable, falling back:', e);
      return false;
    }
  };

  const shareFacebookViaSheet = async (uri) => {
    if (uri) {
      await Share.share(
        Platform.OS === 'ios' ? { url: uri } : { url: uri, message: buildShareMessage() }
      );
    } else {
      Alert.alert(
        'Caption copied',
        "Facebook doesn't accept pre-filled text from other apps. Your caption is on the clipboard — paste it after Facebook opens.",
        [{
          text: 'Open Facebook',
          onPress: () => openOrFallback(
            `fb://share?link=${encodeURIComponent(APP_URL)}`,
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`,
            'Facebook'
          ),
        }, { text: 'Cancel', style: 'cancel' }]
      );
    }
  };

  const shareToFacebook = () => shareToApp('Facebook', 'fb://', 'https://www.facebook.com/');

  const socialButtons = [
    { name: 'Instagram', faIcon: 'instagram', onPress: shareToInstagram, brand: '#E4405F' },
    { name: 'Facebook',  faIcon: 'facebook',  onPress: shareToFacebook,  brand: '#1877F2' },
    { name: 'TikTok',    faIcon: 'tiktok',    onPress: shareToTikTok,    brand: '#25F4EE' },
    { name: 'X',         faIcon: 'x-twitter', onPress: shareToX,         brand: '#FFFFFF' },
  ];

  // ── Save (CREATE → SHARE) ─────────────────────────────────────────────────

  const handleSave = async () => {
    if (saving) return;

    if (!storyValid) {
      Alert.alert(
        'Add a little more',
        `Please write at least ${STORY_MIN} characters about your act (${charCount} so far).`,
        [{ text: 'OK' }]
      );
      return;
    }
    if (!targetDay) {
      Alert.alert(
        'No open day',
        "Couldn't find today's slot in your challenge. Pull down to refresh your calendar and try again.",
        [{ text: 'OK' }]
      );
      return;
    }
    const phone = extractPhone(user?.email);
    if (!phone) {
      Alert.alert('Not signed in', 'Please log in again and retry.', [{ text: 'OK' }]);
      return;
    }

    setSaving(true);
    try {
      const today   = todayStr();
      const isToday = targetDay.scheduledDate === today;

      let newCompletedAt;
      if (isToday) {
        newCompletedAt = localISOString();
      } else {
        const [y, m, d] = targetDay.scheduledDate.split('-').map(Number);
        const anchor = new Date(y, m - 1, d, 12, 0, 0, 0);
        newCompletedAt = anchor.toISOString();
      }

      let localDateValue = targetDay.scheduledDate;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('profiles')
          .select('iana_timezone')
          .eq('id', authUser?.id)
          .maybeSingle();
        const tz = profile?.iana_timezone || null;
        if (isToday && tz) localDateValue = localDateInTZ(tz, new Date());
      } catch (e) {
        console.warn('iana_timezone lookup failed, using scheduledDate:', e.message);
      }

      // Key the upsert on the CALENDAR DATE, not day_number.
      //
      // day_number is derived from the grid window and is renumbered on every
      // restart, so it is not a stable identity for a completion. The old
      // guard matched on it and then deleted by it, which had two failure
      // modes:
      //   - after Restart Challenge the anchor resets and numbering starts at
      //     1 again, but the user's pre-restart rows are still in the table
      //     (restart only sets last_restart_at, it does not delete). The first
      //     act after a restart would collide with the old day_number 1 row,
      //     trip the "Something looks off" alert, and block the user.
      //   - it could delete a row belonging to an entirely different date.
      //
      // local_date IS stable: one act per calendar day, forever. Replacing
      // today's row is exactly the intended behaviour; nothing else is touched.
      await supabase
        .from('completions')
        .delete()
        .eq('user_phone', phone)
        .eq('local_date', localDateValue);
      const actTitle     = preselectedAct?.title || 'My Story';
      const isSponsorAct = preselectedAct?.categoryId === 'sponsor';

      const { data: completionData, error: completionError } = await supabase
        .from('completions')
        .insert({
          user_phone:    phone,
          day_number:    targetDay.dayNumber,
          act_title:     actTitle,
          proof_type:    'story',
          notes:         story.trim(),
          completed_at:  newCompletedAt,
          local_date:    localDateValue,
          from_list:     !!preselectedAct,
          has_media:     false,
          is_sponsor_act: isSponsorAct,
          recipient:     null,
          time_minutes:  preselectedAct?.timeMinutes ?? 0,
          cost_cents:    0,
        })
        .select()
        .single();

      if (completionError) throw completionError;

      try {
        // The `user` PROP has no `id` (it's {email, firstName, lastName, phone,
        // role}), so getActiveSponsorIds(user?.id) always got undefined and
        // no act ever tagged to a challenge from this flow. Read the auth id
        // from the live session instead.
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const sponsorIds = await getActiveSponsorIds(authUser?.id);
        if (sponsorIds.length > 0 && completionData?.id) {
          const joinRows = sponsorIds.map(cid => ({
            completion_id: completionData.id,
            sponsor_id:  cid,
          }));
          const { error: linkError } = await supabase
            .from('completion_sponsors')
            .insert(joinRows);
          if (linkError) console.warn('completion_challenges link error:', linkError.message);
        }
      } catch (e) {
        console.warn('Challenge attribution failed:', e.message);
      }

      // Refresh the grid.
      onComplete?.({
        ...targetDay,
        title:        actTitle,
        proofType:    'story',
        status:       'COMPLETED',
        isSponsorAct,
        completionId: completionData?.id ?? targetDay.completionId,
      });

      // Back-filling a missed past day (e.g. yesterday): go straight to the
      // dashboard so today's "+" tile is right there to log next — skip the
      // share/celebration card, which is for a fresh act logged for today.
      if (targetDay?.scheduledDate && targetDay.scheduledDate !== todayStr()) {
        // Dismiss the keyboard BEFORE navigating. Navigating away with the
        // keyboard still up (from typing the story) locks the screen on iOS.
        Keyboard.dismiss();
        setSaving(false);
        requestAnimationFrame(() => navigation.navigate('Main', { screen: 'Home' }));
        return;
      }

      // First completed 30-act run -> recognition flow. Uses the actual run
      // length (not the tile dayNumber, which the folded "+" can pass as 1) so
      // it fires reliably. length === 30 = just certified; later laps (60, 90)
      // have length 60/90 and fall through to the normal share card below.
      let justCertified = false;
      try {
        const runsNow = await loadRuns(phone);
        const curRun = runsNow[runsNow.length - 1];
        justCertified = !!(curRun && curRun.length === 30);
      } catch (e) { console.warn('Day-30 run check failed:', e.message); }

      if (justCertified) {
        Keyboard.dismiss();
        setSaving(false);
        notifyDay30().catch(() => {});
        requestAnimationFrame(() => navigation.navigate('Celebration'));
        return;
      }

      // Logging today -> flip to SHARE mode in place (celebrate + share).

      setCompletedTitle(actTitle);
      setCompletedStory(story.trim());
      setDayNumber(targetDay.dayNumber);
      setShareMode(true);
    } catch (e) {
      console.warn('Save story failed:', e.message);
      const friendly = /network request failed/i.test(e?.message || '')
        ? "You appear to be offline. Your act wasn't saved — reconnect and try again."
        : (e?.message || 'Something went wrong. Please try again.');
      Alert.alert('Could not save', friendly, [{ text: 'OK' }]);
    } finally {
      setSaving(false);
    }
  };

  const goToCalendar = () => navigation.navigate('Main', { screen: 'Home' });

  const handleDelete = () => {
    Alert.alert(
      'Delete this act?',
      'This removes the act from this day. You can add a new one afterward.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Pass the day OBJECT (has completionId / scheduledDate) so the
            // delete targets exactly this date — never day_number.
            if (!targetDay || !targetDay.scheduledDate) { goToCalendar(); return; }
            try {
              await onDelete?.(targetDay);
            } catch (e) {
              console.warn('Delete failed:', e.message);
            }
            goToCalendar();
          },
        },
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Document Your Act" onBack={goToCalendar} />

      {/* Off-screen branded card for image capture (1px host, kept in-window). */}
      {shareMode && completedStory.trim() ? (
        <StoryCard
          ref={storyCardRef}
          title={completedTitle}
          story={completedStory}
          dayNumber={dayNumber}
          inviteUrl={inviteUrl}
        />
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}
        enabled={false}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
        >
          {!shareMode ? (
            <>
              <View style={s.micRow}>
                <TouchableOpacity
                  style={[s.micBtn, listening && s.micBtnActive]}
                  onPress={handleMicPress}
                  activeOpacity={0.7}
                  accessibilityLabel={listening ? 'Stop dictation' : 'Start voice dictation'}
                >
                  <Text style={s.micGlyph}>{listening ? '⏹️' : '🎤'}</Text>
                </TouchableOpacity>
                <Text style={s.micHint}>
                  {!SPEECH_AVAILABLE
                    ? 'Tap to type your story'
                    : listening
                      ? 'Listening… tap to stop'
                      : 'Tap the mic to speak, or type your story'}
                </Text>
              </View>

              <TouchableOpacity
                style={s.suggestBtn}
                onPress={() => navigation.navigate('ChooseAct', {
                  day: targetDay,
                  returnTo: 'MyStory',
                  draftStory: story,
                })}
              >
                <Text style={s.suggestBtnText}>💡 Need an idea? Browse acts from our list</Text>
              </TouchableOpacity>

              <View style={s.labelRow}>
                <Text style={s.label}>My Story</Text>
                <Text style={[
                  s.counter,
                  charCount >= STORY_MAX && s.counterMax,
                  charCount >= STORY_MAX - 30 && charCount < STORY_MAX && s.counterWarn,
                ]}>
                  {charCount < STORY_MIN
                    ? `${STORY_MIN - charCount} more to start · ${charCount}/${STORY_MAX}`
                    : charCount >= STORY_MAX
                      ? `Limit reached · ${charCount}/${STORY_MAX}`
                      : `${charCount}/${STORY_MAX}`}
                </Text>
              </View>
              <TextInput
                ref={storyRef}
                style={s.storyBox}
                value={story}
                onChangeText={setStory}
                placeholder="What act of kindness did you do today? Tell the story…"
                placeholderTextColor={C.muted}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
                maxLength={STORY_MAX}
                inputAccessoryViewID={Platform.OS === 'ios' ? KB_DONE_ID : undefined}
              />

              <TouchableOpacity
                style={[s.saveBtn, (!storyValid || saving) && s.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!storyValid || saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>Save My Act</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.successCard}>
              <Text style={{ fontSize: sf(36), textAlign: 'center' }}>🎉</Text>
              <Text style={s.successTitle}>Act Completed!</Text>
              <Text style={s.successSub}>You're making the world a kinder place.</Text>

              {completedTitle ? (
                <Text style={s.completedActTitle} numberOfLines={3}>{completedTitle}</Text>
              ) : null}
              {completedStory.trim() ? (
                <View style={s.completedStoryBox}>
                  <Text style={s.completedStoryText}>{completedStory.trim()}</Text>
                </View>
              ) : null}

              <View style={s.shareDivider}>
                <Text style={s.sharePrompt}>Spread the kindness — invite someone to join!</Text>
              </View>

              <View style={s.socialRow}>
                {socialButtons.map((b) => (
                  <TouchableOpacity
                    key={b.name}
                    accessibilityLabel={`Share to ${b.name}`}
                    style={[s.socialBtn, { borderColor: b.brand + '66' }]}
                    onPress={b.onPress}
                    disabled={sharing}
                    activeOpacity={0.7}
                  >
                    <FontAwesome6 name={b.faIcon} size={28} color={b.brand} />
                  </TouchableOpacity>
                ))}
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

              <TouchableOpacity onPress={goToCalendar} style={s.skipShare}>
                <Text style={s.skipShareText}>Done</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
                <Text style={s.deleteBtnText}>🗑️  Delete this act</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <KeyboardDoneBar />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  actBanner: {
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    padding: 14, marginBottom: 20,
  },
  actBannerLabel: { color: C.sub, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  actBannerTitle: { color: C.text, fontSize: 16, fontWeight: '700' },

  micRow: { alignItems: 'center', marginBottom: 16 },
  micBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  micGlyph: { fontSize: 32 },
  micBtnActive: { borderColor: C.error, backgroundColor: C.error + '22' },
  micHint: { color: C.muted, fontSize: 12, marginTop: 8 },

  label: { color: C.sub, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  suggestBtn: { borderWidth: 1.5, borderColor: C.primary + '66', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginBottom: 16 },
  suggestBtnText: { color: C.primary, fontSize: 15, fontWeight: '700' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },  storyBox: {
    minHeight: 160,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    color: C.text, fontSize: 16, padding: 14,
  },
  counter: { color: C.muted, fontSize: 12, marginBottom: 6 },
  counterWarn: { color: C.gold },
  counterMax: { color: C.error, fontWeight: '700' },

  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: C.muted, opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Share mode
  successCard: {
    backgroundColor: C.card,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 20, alignItems: 'center',
  },
  successTitle: { color: C.text, fontSize: sf(22), fontWeight: '800', marginTop: 8 },
  successSub:   { color: C.sub, fontSize: sf(14), textAlign: 'center', marginTop: 4 },
  shareDivider: { marginTop: 20, width: '100%' },
  sharePrompt:  { color: C.sub, fontSize: sf(13), textAlign: 'center', marginBottom: 14 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 18 },
  socialBtn: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center',
  },
  shareRow: { flexDirection: 'row', gap: 12, marginBottom: 16, width: '100%' },
  shareBtn: {
    flex: 1, backgroundColor: C.card2, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 14, alignItems: 'center',
  },
  shareBtnIcon:  { fontSize: sf(24) },
  shareBtnLabel: { color: C.text, fontSize: sf(12), fontWeight: '700', marginTop: 4 },
  skipShare: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  skipShareText: { color: C.primary, fontSize: sf(18), fontWeight: '800' },

  completedActTitle: {
    color: C.text, fontSize: sf(17), fontWeight: '800',
    textAlign: 'center', marginTop: 16,
  },
  completedStoryBox: {
    backgroundColor: C.card2,
    borderRadius: 12, borderLeftWidth: 4, borderLeftColor: C.gold,
    padding: 14, marginTop: 12, width: '100%',
  },
  completedStoryText: { color: C.sub, fontSize: sf(15), lineHeight: sf(22), fontStyle: 'italic' },

  deleteBtn: {
    marginTop: 14, marginBottom: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  deleteBtnText: { color: C.error, fontSize: sf(14), fontWeight: '700' },

  kbBar: {
    backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingVertical: 8, paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  kbDone: { color: C.primary, fontSize: 16, fontWeight: '700' },
});