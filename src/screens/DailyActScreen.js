import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, Modal, FlatList, TextInput,
  Linking, Share, Animated, Dimensions, Easing,
  InputAccessoryView, Keyboard, Image, Vibration,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video, ResizeMode, Audio } from 'expo-av';
import { decode as base64Decode } from 'base64-arraybuffer';
import { FontAwesome6 } from '@expo/vector-icons';
import ShareButtons from '../components/ShareButtons';
import { captureRef } from 'react-native-view-shot';
import Constants from 'expo-constants';
import StoryCard from '../components/StoryCard';
import { generateInviteLink } from '../lib/branch';
import { AppInput, Badge, Btn, Card, ScreenHeader } from '../components';
import { C, ACT_CATEGORIES, RECIPIENTS, todayStr, getActIcon, localDateInTZ, formatTimeLabel, formatCostLabel } from '../constants';
import { supabase } from '../lib/supabase';
import { getActiveSponsorIds, getActiveSponsors } from '../lib/streak';
import { isContentBlocked, BLOCKED_MESSAGE } from '../lib/moderation';

// Supabase REST/Edge-function calls below use these directly. EAS builds do
// NOT receive the gitignored .env, so fall back to the public project URL +
// anon key (same values as src/lib/supabase.js) so moderation and Day-30
// notifications keep working in TestFlight / App Store builds.
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
// Publishable key, matching lib/supabase.js. The old legacy anon JWT that
// used to sit here is DISABLED -- any build without EXPO_PUBLIC_SUPABASE_ANON_KEY
// set (e.g. the preview profile) silently failed every call below.
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7Yy5NBm4XmpO1syrdjT62A_4stDanF9';

const STORY_MIN = 10;
const STORY_MAX = 200;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Font scaling by device width. Base = iPhone 12–15 (390pt). Clamped so small
// phones (SE/mini) shrink slightly and large phones (Pro Max) grow slightly.
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);

const APP_URL = 'https://30ActsofKindness.org';
const FB_APP_ID = '1033236095805810';
const APP_HASHTAG = '#30ActsOfKindness';

// ── Day 30 fulfillment ────────────────────────────────────────────────────
const PICKUP_ADDRESS = '1757 E. Nine Mile Rd. Pensacola, Fl 32514';
const SHIPPING_FEE   = '$4.95';

const KB_DONE_ID = 'dailyActKbDone';

// Returns a timestamp string anchored to the user's local clock.
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

const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function formatCompletedAt(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString(undefined, {
      weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
    });
    const timeStr = d.toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit',
    });
    return `${dateStr} at ${timeStr}`;
  } catch {
    return iso.split('T')[0];
  }
}

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

const openDirections = async (address) => {
  const encoded = encodeURIComponent(address);
  const appUrl =
    Platform.OS === 'ios'
      ? `comgooglemaps://?daddr=${encoded}&directionsmode=driving`
      : `google.navigation:q=${encoded}`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  try {
    const ok = await Linking.canOpenURL(appUrl);
    if (ok) {
      await Linking.openURL(appUrl);
    } else if (Platform.OS === 'ios') {
      const appleUrl = `http://maps.apple.com/?daddr=${encoded}`;
      const appleOk = await Linking.canOpenURL(appleUrl);
      if (appleOk) await Linking.openURL(appleUrl);
      else await Linking.openURL(webUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch (e) {
    console.warn('Directions failed:', e.message);
    await Linking.openURL(webUrl).catch(() => {});
  }
};

function BalloonBurst({ visible, onDismiss }) {
  const balloons = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      id:        i,
      startX:    Math.random() * (SCREEN_W - 50),
      driftX:    (Math.random() - 0.5) * 80,
      y:         new Animated.Value(SCREEN_H - Math.random() * (SCREEN_H + 200)),
      sway:      new Animated.Value(0),
      emoji:     ['🎈', '🎉', '✨', '🎊', '🎈', '🎈'][i % 6],
      duration:  3500 + Math.random() * 2000,
      size:      30 + Math.random() * 28,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    balloons.forEach(b => {
      b.y.setValue(SCREEN_H - Math.random() * (SCREEN_H + 200));
      b.sway.setValue(0);
    });

    const riseAnimations = balloons.map(b =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b.y, { toValue: -250, duration: b.duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(b.y, { toValue: SCREEN_H + 100, duration: 0, useNativeDriver: true }),
        ])
      )
    );
    const swayAnimations = balloons.map(b =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b.sway, { toValue: 1,  duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(b.sway, { toValue: -1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      )
    );
    Animated.parallel([...riseAnimations, ...swayAnimations]).start();

    // Celebratory buzz (core module, always present).
    try { Vibration.vibrate([0, 120, 90, 120, 90, 220]); } catch (e) {}

    // Celebratory chime — best-effort; plays through the iPhone silent switch.
    let sound;
    (async () => {
      try {
        const { Asset } = require('expo-asset');
        if (!Audio || typeof Audio.setAudioModeAsync !== 'function') return;
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
        });
        const asset = Asset.fromModule(require('../../assets/celebration.mp3'));
        await asset.downloadAsync();
        const src = asset.localUri || asset.uri;
        const loaded = await Audio.Sound.createAsync({ uri: src }, { shouldPlay: true, volume: 1.0 });
        sound = loaded.sound;
        try { await sound.playAsync(); } catch (e) {}
      } catch (e) { /* audio is a nice-to-have; ignore */ }
    })();

    return () => { if (sound) sound.unloadAsync().catch(() => {}); };
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <TouchableOpacity style={s.balloonOverlay} activeOpacity={1} onPress={onDismiss}>
        {balloons.map(b => {
          const swayX = b.sway.interpolate({ inputRange: [-1, 1], outputRange: [-15, 15] });
          return (
            <Animated.Text
              key={b.id}
              style={[
                s.balloon,
                {
                  left: b.startX + b.driftX,
                  fontSize: b.size,
                  transform: [
                    { translateY: b.y },
                    { translateX: swayX },
                  ],
                },
              ]}
            >
              {b.emoji}
            </Animated.Text>
          );
        })}
        <View style={s.balloonMsg}>
          <Text style={s.balloonTitle}>🕊️ 30 DAYS COMPLETE 🕊️</Text>
          <Text style={s.balloonSub}>You are a Certified Kind Person</Text>
          <Text style={s.balloonTap}>tap anywhere to continue</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const DAY_30_MESSAGE =
  "Congratulations, you have completed the 30 Days and are now a certifiably Kind Person. " +
  "Tap Continue to choose your recognition — a kindness bracelet, a shareable certificate " +
  "with your own invite QR code, or both.";

// Reject if a promise doesn't settle within `ms`. Keeps a stalled network call
// (e.g. a media upload on a flaky connection) from leaving the completion
// screen stuck on its loading state forever -- a hung await never reaches the
// finally that clears `submitting`, which reads to the user as a frozen screen.
function withTimeout(promise, ms, label = 'Timed out') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readFileAsArrayBuffer(uri) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  return base64Decode(base64);
}

function Dropdown({ value, options, onChange, placeholder, title = 'Select' }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;
  return (
    <>
      <TouchableOpacity style={s.recipDropdown} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[s.recipDropdownText, !value && { color: C.muted }]}>{selectedLabel}</Text>
        <Text style={s.recipDropdownArrow}>▼</Text>
      </TouchableOpacity>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.dropdownModalHeader}>
            <Text style={s.dropdownModalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Text style={s.dropdownModalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {options.map(opt => {
              const isActive = opt.value === value;
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[s.dropdownModalRow, isActive && { backgroundColor: C.primary + '22' }]}
                  onPress={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Text
                    style={[
                      s.dropdownModalRowText,
                      isActive && { color: C.primary, fontWeight: '700' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isActive && <Text style={{ color: C.primary }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export default function DailyActScreen({ route, navigation, onComplete, onDelete, actCategories }) {
  const { day, preselectedAct } = route.params;
  const categories = actCategories || ACT_CATEGORIES;

  const today        = todayStr();
  const yesterday    = yesterdayStr();
  const inEditWindow = day?.scheduledDate === today || day?.scheduledDate === yesterday;

  const initialTitle = preselectedAct?.title || day?.title || `Day ${day?.dayNumber} act`;

  const [title,      setTitle]      = useState(initialTitle);
  const [proofType,  setProofType]  = useState(day?.proofType ?? null);
  const [story,      setStory]      = useState('');
  const [mediaUri,   setMediaUri]   = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeChallenges, setActiveChallenges] = useState([]); 
  const [actualHours,   setActualHours]   = useState('');
  const [actualMinutes, setActualMinutes] = useState('');
  const [actualCostDollars, setActualCostDollars] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [done,       setDone]       = useState(day?.status === 'COMPLETED' && !inEditWindow);
  const [showPicker, setShowPicker] = useState(false);
  const [search,     setSearch]     = useState('');
  const [selectedCategory,   setSelectedCategory]   = useState(null);
  const [completedTitle,     setCompletedTitle]     = useState(day?.title ?? '');
  const [completedStory,     setCompletedStory]     = useState('');
  const [completedProofType, setCompletedProofType] = useState(day?.proofType ?? null);
  const [completedMediaUri,  setCompletedMediaUri]  = useState(null);
  const [completedAt,        setCompletedAt]        = useState('');
  const [fromList, setFromList] = useState(!!preselectedAct);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [showFullImage, setShowFullImage] = useState(false);
  const [showFullVideo, setShowFullVideo] = useState(false);

  const [showCompletionSheet, setShowCompletionSheet] = useState(false);

  const [showDay30Message, setShowDay30Message] = useState(false);
  const [showBalloons,     setShowBalloons]     = useState(false);
  const [hasAddress,       setHasAddress]       = useState(false);

  const [day30Choice, setDay30Choice] = useState(null);

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
  const proofPulse = useRef(new Animated.Value(0)).current;
  const shouldHighlightProof = !!preselectedAct && !proofType && !done;

  useEffect(() => {
    if (!shouldHighlightProof) {
      proofPulse.setValue(0);
      return;
    }


    proofPulse.setValue(0);
    Animated.sequence([
      Animated.loop(
        Animated.sequence([
          Animated.timing(proofPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(proofPulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
        { iterations: 3 }
      ),
      Animated.timing(proofPulse, { toValue: 0.7, duration: 400, useNativeDriver: false }),
    ]).start();
  }, [shouldHighlightProof]);

  // Load the user's active challenge memberships so we can show a
  // "Counts toward: [names]" indicator above the Mark Complete button.
  // Failure is silent — the indicator just won't render.
  useEffect(() => {
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser?.id) return;
        const chs = await getActiveSponsors(authUser.id);
        setActiveChallenges(chs);
      } catch (e) {
        console.warn('Load active challenges failed:', e.message);
      }
    })();
  }, []);

  const proofBorderColor = proofPulse.interpolate({
    inputRange:  [0, 1],
    outputRange: [C.border, C.primary],
  });
  const proofBgTint = proofPulse.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(46, 204, 113, 0)', 'rgba(46, 204, 113, 0.18)'],
  });

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const street1 = user?.user_metadata?.street1;
        setHasAddress(!!street1 && street1.trim().length > 0);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (day?.status !== 'COMPLETED') return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const phone = extractPhone(user?.email);
        if (!phone) return;

        let completion = null;
        if (day.completionId) {
          // Displayed dayNumber is renumbered after a restart and no longer
          // matches the stored day_number; use the stable row id from the grid.
          const { data } = await supabase
            .from('completions')
            .select('id, notes, completed_at')
            .eq('id', day.completionId)
            .maybeSingle();
          completion = data;
        } else {
          const { data } = await supabase
            .from('completions')
            .select('id, notes, completed_at')
            .eq('user_phone', phone)
            .eq('day_number', day.dayNumber)
            .maybeSingle();
          completion = data;
        }

        if (completion?.notes) {
          setStory(completion.notes);
          setCompletedStory(completion.notes);
        }
        if (completion?.completed_at) setCompletedAt(completion.completed_at);

        if (completion?.id) {
          const { data: mediaRows } = await supabase
            .from('act_media')
            .select('file_path, media_type')
            .eq('completion_id', completion.id)
            .limit(1);
          const mediaRow = mediaRows?.[0];
          if (mediaRow?.file_path) {
            const { data: urlData } = supabase.storage
              .from('act-media')
              .getPublicUrl(mediaRow.file_path);
            if (urlData?.publicUrl) {
              setCompletedMediaUri(urlData.publicUrl);
              setCompletedProofType(mediaRow.media_type);
            }
          } else if (completion?.notes) {
            // No media on file but there's written text → it's a story proof.
            // Without this, reopened text acts never mount the share card.
            setCompletedProofType('story');
          }
        }
      } catch (e) {
        console.warn('Fetch completion error:', e.message);
      }
    })();
  }, [day?.dayNumber, day?.status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (completedProofType !== 'video' || !completedMediaUri) {
        setVideoThumbUri(null);
        return;
      }
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(completedMediaUri, {
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
  }, [completedMediaUri, completedProofType]);

  const charCount  = story.trim().length;
  const mediaValid = (proofType === 'photo' || proofType === 'video') ? !!mediaUri : true;
  const storyValid = proofType === 'story' ? charCount >= STORY_MIN : true;
  const hoursDigitsOk   = /^\d*$/.test(actualHours.trim());
  const minutesDigitsOk = /^\d*$/.test(actualMinutes.trim());
  const hoursNum   = actualHours.trim()   === '' ? 0 : parseInt(actualHours,   10);
  const minutesNum = actualMinutes.trim() === '' ? 0 : parseInt(actualMinutes, 10);
  const totalMinutes = hoursNum * 60 + minutesNum;
  // Require at least one of hours/minutes to be filled, and minutes < 60
  const timeFilled = actualHours.trim() !== '' || actualMinutes.trim() !== '';
  const timeValid  = hoursDigitsOk && minutesDigitsOk && timeFilled && minutesNum < 60 && totalMinutes >= 0;
  const costValid = /^\d+(\.\d{1,2})?$/.test(actualCostDollars.trim());
  const recipientValid = !!recipient;  
  const canComplete = title.trim().length > 0 && !!proofType && mediaValid && storyValid && timeValid && costValid;

  const allActsFlat = categories.flatMap(c => c.acts);
  const searchResults = search.trim()
    ? allActsFlat.filter(a => a.title.toLowerCase().includes(search.toLowerCase()))
    : [];

  const openPicker = () => { setSearch(''); setSelectedCategory(null); setShowPicker(true); };
  const closePicker = () => { setShowPicker(false); setSelectedCategory(null); setSearch(''); };

  const selectAct = (act) => {
    const t = typeof act === 'string' ? act : act.title;
    setTitle(t);
    setFromList(true);
    closePicker();
  };

  const handleTitleChange = (t) => {
    setTitle(t);
    setFromList(false);
  };

  const buildShareMessage = (t, pt, s) => {
    const storyPart = pt === 'story' && s.trim() ? `\n\nHere's what I did:\n"${s.trim()}"` : '';
    return `🕊️ I just completed Day ${day.dayNumber} of the 30 Acts of Kindness™!\n\nMy act today: "${t}"${storyPart}\n\n${APP_HASHTAG}\nJoin me at ${APP_URL}`;
  };

  // Picture only, through the share sheet - Messages attaches the card.
  const handleShareText = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      if (!uri) { Alert.alert('Could not prepare the picture', 'Please try again.'); return; }
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

  const getShareMessage = () =>
    buildShareMessage(completedTitle, completedProofType, completedStory);

  // Resolves what image/video to attach when sharing.
  //  - photo / video → the captured media
  //  - story (text)  → render the off-screen StoryCard to a JPEG so it can be
  //                    shared to image-only platforms (Instagram/TikTok) and
  //                    attached on X / Facebook.
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

  // Returns a LOCAL file uri suitable for the native iOS share sheet.
  // Story proofs come back local already; photo/video live on Supabase (http),
  // so download them to cache first.
  const localShareUri = async () => {
    const media = await resolveShareMedia();
    if (!media) return null;
    if (media.startsWith('http')) {
      try {
        const target = `${FileSystem.cacheDirectory}share-${Date.now()}.jpg`;
        const dl = await FileSystem.downloadAsync(media, target);
        return dl.uri;
      } catch (e) { console.warn('Download for share failed:', e); return null; }
    }
    // captureRef can return a bare path; iOS share needs a file:// scheme.
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

  const shareToX = () => shareToApp('X', 'twitter://post', 'https://twitter.com/intent/tweet');

  // True when running inside Expo Go, where native modules like the Facebook
  // SDK aren't linked — we must not touch them or the app red-screens.
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient';

  // Preferred path: hand the framed photo to Facebook's native ShareDialog so it
  // opens the FB composer with the image already attached. Real builds only.
  // Returns true if the dialog handled it, false to fall back to the share sheet.
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
      await ShareDialog.show(content); // resolves whether posted or cancelled
      return true;
    } catch (e) {
      console.warn('FB ShareDialog unavailable, falling back:', e);
      return false;
    }
  };

  // Fallback: iOS share sheet with the image, or the link composer if no image.
  const shareFacebookViaSheet = async (uri) => {
    if (uri) {
      await Share.share({ url: uri });
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

  // Facebook can't be opened straight into a photo composer from another app
  // (its deep link lands on a link-share sheet, not "Add media"), and its
  // composer won't paste an image. So — like TikTok — we SAVE the act picture to
  // Photos + copy the caption, and the user makes the post in their own Facebook.
  const shareToFacebook = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      let saved = null;
      if (uri) saved = await saveToCameraRoll(uri);
      Alert.alert(
        'Share to Facebook',
        saved
          ? 'Your act picture is saved to your Photos.\n\nFacebook will open — tap the photo icon (📷) next to "What\'s on your mind?", pick the newest photo (your act).'
          : 'Facebook will open — start a post.',
        [
          { text: 'Open Facebook', onPress: () => openOrFallback(`fb://share?link=${encodeURIComponent(APP_URL)}`, `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`, 'Facebook') },
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
      if (!uri) {
        Alert.alert(
          'Couldn\'t prepare an image',
          'Add a photo or a written story for this act, then try sharing again.'
        );
        return;
      }
      // Caption can't ride along to Instagram, so copy it for pasting.
      // Hand the image straight to Instagram via the iOS share sheet — the raw
      // instagram://camera deep link just opens an empty composer with no image.
      await Share.share({ url: uri });
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Instagram share failed:', e && e.message);
    } finally { setSharing(false); }
  };

  // TikTok builds posts from your Photos/gallery. Save the act picture to Photos +
  // copy the caption, then open the NATIVE TikTok app via its app scheme
  // (Linking.openURL, not canOpenURL — so it opens the installed, logged-in app
  // rather than the guest website where posting fails). Web is the last resort.
  const shareToTikTok = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await localShareUri();
      let saved = null;
      if (uri) saved = await saveToCameraRoll(uri);
      Alert.alert(
        'Share to TikTok',
        saved
          ? 'Your act picture is saved to your Photos.\n\nTikTok will open — tap ➕ → Upload, pick the saved photo.'
          : 'TikTok will open — tap ➕ to create a post.',
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

  const pickMedia = async (useCamera) => {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access in Settings.'); return; }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access in Settings.'); return; }
      }
      const options = {
        mediaTypes: proofType === 'video' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
        quality: 0.8, allowsEditing: true,
      };
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets?.length > 0) setMediaUri(result.assets[0].uri);
    } catch (err) { Alert.alert('Error', 'Could not open camera or photos.'); console.error(err); }
  };

  const handleDeleteAct = async () => {
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

  const sendDay30Notifications = async (authUser) => {
    const isPhone = authUser?.email?.includes('@phone.30acts.app');
    const msg =
      "Congratulations, you have gone the extra mile and are a truly certified Kind Person. " +
      "We will send you your Certified Kind Person wristband.";
    try {
      if (isPhone) {
        const phoneNumber = authUser.email.replace('@phone.30acts.app', '');
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_sms_notification`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone_number: phoneNumber, message: msg }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_email_notification`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ to_email: authUser?.email, message: msg, act_title: '30 Acts Completed!' }),
        });
      }
    } catch (e) { console.warn('Congrats message error:', e.message); }
  };

  const sendDay30ContactEmailCopy = async (authUser) => {
    const contactEmail = authUser?.user_metadata?.contact_email;
    if (!contactEmail) return;
    const msg =
      "Congratulations, you have gone the extra mile and are a truly certified Kind Person. " +
      "We will send you your Certified Kind Person wristband.";
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_email_notification`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to_email: contactEmail, message: msg, act_title: '30 Acts Completed!' }),
      });
    } catch (e) { console.warn('Contact email copy error:', e.message); }
  };

  const goToAddressForm = () => {
    try {
      navigation.navigate('Main', {
        screen: 'Me',
        params: { scrollTo: 'address' },
      });
    } catch (e) {
      navigation.navigate('Settings', { scrollTo: 'address' });
    }
  };

  const recordFulfillmentChoice = async (choice) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const phone = extractPhone(user?.email);
      if (!phone) return;
      await supabase
        .from('completions')
        .update({ fulfillment_choice: choice })
        .eq('user_phone', phone)
        .eq('day_number', 30);
    } catch (e) {
      console.warn('Record fulfillment choice failed:', e.message);
    }
  };

  const handleChooseShip = async () => {
    setDay30Choice('ship');
    await recordFulfillmentChoice('ship');
    setShowDay30Message(false);
    setShowBalloons(true);
  };

  const handleChoosePickup = () => {
    setDay30Choice('pickup');
    recordFulfillmentChoice('pickup');
  };

  const handlePickupDone = () => {
    setShowDay30Message(false);
    setShowBalloons(true);
  };

  const handleComplete = async () => {
    if (!canComplete) return;
    setSubmitting(true);

    try {
      const textToCheck = [title, proofType === 'story' ? story : ''].filter(Boolean).join(' ');
      if (textToCheck.trim()) {
        const blocked = await withTimeout(isContentBlocked(textToCheck), 15000, 'moderation check timed out')
          .catch((e) => { console.warn('moderation check skipped:', e.message); return false; });
        if (blocked) {
          Alert.alert(
            'Content Not Allowed',
            'Your submission contains content that is not appropriate based on our Terms of Service and will not be submitted. Please review your title and story.'
          );
          setSubmitting(false);
          return;
        }
      }

      let mediaPath = null;
      if (mediaUri) {
        try {
          const arrayBuffer = await readFileAsArrayBuffer(mediaUri);
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('File is empty after read');
          }
          const ext = proofType === 'video' ? 'mp4' : 'jpg';
          const contentType = proofType === 'video' ? 'video/mp4' : 'image/jpeg';
          const fileName = `${Date.now()}.${ext}`;
          const { data: uploadData, error: uploadError } = await withTimeout(
            supabase.storage
              .from('act-media')
              .upload(fileName, arrayBuffer, {
                contentType,
                upsert: false,
              }),
            45000,
            'Upload timed out',
          );
          if (uploadError) throw uploadError;
          mediaPath = uploadData.path;
          console.log('Media upload OK:', mediaPath, 'bytes:', arrayBuffer.byteLength);
        } catch (uploadErr) {
          console.error('Full upload error:', uploadErr);
          Alert.alert(
            'Upload failed',
            `Could not upload your ${proofType}. Your act will still save, but the media will be missing. (${uploadErr.message || 'unknown error'})`
          );
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      const phone = extractPhone(user?.email);
      if (!phone) {
        Alert.alert('Error', 'Could not identify your phone number. Please log out and back in.');
        setSubmitting(false);
        return;
      }

const today = todayStr();
      const isToday = day.scheduledDate === today;
      let newCompletedAt;
      if (isToday) {
        newCompletedAt = localISOString();
      } else {
        const [y, m, d] = day.scheduledDate.split('-').map(Number);
        const anchor = new Date(y, m - 1, d, 12, 0, 0, 0);
        newCompletedAt = anchor.toISOString();
      }

      // Compute the user's local calendar date in their HOME timezone.
      // This locks the date in at write-time so travel afterward never
      // shifts which calendar day an act belongs to. Falls back to the
      // grid's scheduledDate (already local) if profile timezone is missing.
      let localDateValue = day.scheduledDate;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('iana_timezone')
          .eq('id', user.id)
          .maybeSingle();
        const tz = profile?.iana_timezone || null;
        if (isToday && tz) {
          // For today, compute "now in home TZ" so morning Japan = previous CT day.
          localDateValue = localDateInTZ(tz, new Date());
        }
        // For yesterday backfill, day.scheduledDate is already correct.
      } catch (e) {
        console.warn('iana_timezone lookup failed, using scheduledDate:', e.message);
      }
// (Removed the day_number "staleness" guardrail that used to live here: its
      // only job was to protect the day_number-based delete below, which is now
      // gone. We replace today's row by local_date/id instead, which is
      // inherently safe — it can never touch a different streak's row that
      // happens to reuse the same day_number.)

      // One act per calendar day: if the user already logged a DIFFERENT act
      // today (same local_date, different day_number), block it with a friendly
      // message. The database also enforces this via a unique index on
      // (user_phone, local_date); this check just avoids a raw error.
      const { data: existingToday } = await supabase
        .from('completions')
        .select('day_number')
        .eq('user_phone', phone)
        .eq('local_date', localDateValue)
        .maybeSingle();

      if (existingToday && existingToday.day_number !== day.dayNumber) {
        Alert.alert(
          'Already logged today',
          "You've already logged an act of kindness today. Come back tomorrow for your next one!",
          [{ text: 'OK' }]
        );
        setSubmitting(false);
        return;
      }

      // Replace ONLY the row we're editing — today's entry. Never delete by
      // day_number (it's reused across streaks, so that could wipe an unrelated
      // older act with the same number — the history-loss bug). Prefer the
      // stable row id when we have it; otherwise target today's local_date,
      // which the (user_phone, local_date) unique index guarantees is one row.
      let replaceQ = supabase
        .from('completions')
        .delete()
        .eq('user_phone', phone);
      if (day.completionId) {
        replaceQ = replaceQ.eq('id', day.completionId);
      } else {
        replaceQ = replaceQ.eq('local_date', localDateValue);
      }
      await replaceQ;

      const isSponsorAct = preselectedAct?.categoryId === 'sponsor';

      const { data: completionData, error: completionError } = await supabase
        .from('completions')
        .insert({
          user_phone: phone,
          day_number: day.dayNumber,
          act_title: title,
          proof_type: proofType,
          notes: proofType === 'story' ? story : null,
          completed_at: newCompletedAt,
          local_date: localDateValue,
          from_list: fromList,
          has_media: !!mediaPath,
          is_sponsor_act: isSponsorAct,
          recipient: recipient,
          time_minutes: totalMinutes,
          cost_cents: Math.round(parseFloat(actualCostDollars) * 100),
        })
        .select()
        .single();

      if (completionError) {
        // 23505 = unique-index violation on (user_phone, local_date): a second
        // act on the same calendar day. Show a friendly message, not a crash.
        if (completionError.code === '23505') {
          Alert.alert(
            'Already logged today',
            "You've already logged an act of kindness today. Come back tomorrow for your next one!",
            [{ text: 'OK' }]
          );
          setSubmitting(false);
          return;
        }
        throw completionError;
      }

// Tag this completion against every challenge the user is currently
      // a participant in (forward-only — past completions are never
      // retroactively tagged when joining a challenge). Failure here is
      // non-fatal: the act still saves, but the user's challenge
      // attribution will be missing. Logged and visible in Sentry.
      try {
        const sponsorIds = await getActiveSponsorIds(user?.id);
        if (sponsorIds.length > 0 && completionData?.id) {
          const joinRows = sponsorIds.map(cid => ({
            completion_id: completionData.id,
            sponsor_id:  cid,
          }));
          const { error: linkError } = await supabase
            .from('completion_sponsors')
            .insert(joinRows);
          if (linkError) {
            console.warn('completion_challenges link error:', linkError.message);
          }
        }
      } catch (e) {
        console.warn('Challenge attribution failed:', e.message);
      }

      if (mediaPath && completionData) {
        const { error: mediaError } = await supabase
          .from('act_media')
          .insert({
            completion_id: completionData.id,
            media_type: proofType,
            file_path: mediaPath,
          });
        if (mediaError) console.warn('Media record error:', mediaError);

        const { data: urlData } = supabase.storage
          .from('act-media')
          .getPublicUrl(mediaPath);
        if (urlData?.publicUrl) setCompletedMediaUri(urlData.publicUrl);
      } else {
        setCompletedMediaUri(null);
      }

      const completedDay = {
        ...day,
        title,
        proofType,
        status: 'COMPLETED',
        isSponsorAct,
      };
      onComplete(completedDay);
      setCompletedTitle(title);
      setCompletedStory(story);
      setCompletedProofType(proofType);
      setCompletedAt(newCompletedAt);
      setDone(!inEditWindow);

      if (day.dayNumber !== 30) {
        setShowCompletionSheet(true);
      }

      if (day.dayNumber === 30) {
        setDay30Choice(null);
        setShowDay30Message(true);
        sendDay30Notifications(user);
        sendDay30ContactEmailCopy(user);
      }

    } catch (e) {
      console.error('Complete error:', e);
      Alert.alert('Error', 'Could not save completion. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isCompletedButEditable = day?.status === 'COMPLETED' && inEditWindow && !done;

  const showShareSection =
    done || day?.status === 'COMPLETED' || isCompletedButEditable;

  const showCompletedMedia =
    showShareSection &&
    !!completedMediaUri &&
    (completedProofType === 'photo' || completedProofType === 'video');

  const socialButtons = [
    { name: 'Instagram', faIcon: 'instagram', onPress: shareToInstagram, brand: '#E4405F' },
    { name: 'Facebook',  faIcon: 'facebook',  onPress: shareToFacebook,  brand: '#1877F2' },
    { name: 'TikTok',    faIcon: 'tiktok',    onPress: shareToTikTok,    brand: '#25F4EE' },
    { name: 'X',         faIcon: 'x-twitter', onPress: shareToX,         brand: '#FFFFFF' },
  ];

    const handleSheetNotNow = () => {
    setShowCompletionSheet(false);
    // Day 30 "ship" path still needs the address form — after sharing, not before.
    if (day?.dayNumber === 30 && day30Choice === 'ship' && !hasAddress) {
      goToAddressForm();
      return;
    }
    try {
      navigation.navigate('Main', { screen: 'Home' });
    } catch (e) {
      try { navigation.navigate('Home'); }
      catch (_) { navigation.goBack(); }
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScreenHeader title={`Day ${day?.dayNumber}`} onBack={() => navigation.goBack()}
        right={<Badge status={done || day?.status === 'COMPLETED' ? 'COMPLETED' : day?.status} />} />

      <StoryCard
        ref={storyCardRef}
        title={completedTitle}
        story={completedStory}
        dayNumber={day?.dayNumber}
        inviteUrl={inviteUrl}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={true}
      >

        {done && (
          <View style={s.lockedBanner}>
            <Text style={{ color: C.success, fontWeight: '700', fontSize: sf(13) }}>✅ This day is completed and locked</Text>
          </View>
        )}

        {day?.status === 'COMPLETED' && completedAt ? (
          <View style={s.dateBadge}>
            <Text style={s.dateBadgeLabel}>COMPLETED</Text>
            <Text style={s.dateBadgeValue}>{formatCompletedAt(completedAt)}</Text>
          </View>
        ) : null}

        {preselectedAct && !done && (
          <View style={s.preselBanner}>
            <Image source={preselectedAct.categoryEmoji} style={s.preselIcon} resizeMode="contain" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.preselLabel}>YOUR PICK</Text>
              <Text style={s.preselTitle} numberOfLines={3} ellipsizeMode="tail">
                {preselectedAct.title}
              </Text>
              <Text style={s.preselMeta}>
                {preselectedAct.categoryLabel || '—'}
              </Text>
              {preselectedAct.recipient ? (
                <Text style={s.preselMeta}>
                  For: {preselectedAct.recipient}
                </Text>
              ) : null}
              <Text style={s.preselMeta}>
                Time: {preselectedAct.timeMinutes != null ? formatTimeLabel(preselectedAct.timeMinutes) : '—'}
              </Text>
              <Text style={s.preselMeta}>
                Cost: {preselectedAct.costDollars != null ? formatCostLabel(preselectedAct.costDollars) : '—'}
              </Text>
            </View>
          </View>
        )}

        <Animated.View
          style={[
            s.proofCardWrap,
            shouldHighlightProof && {
              borderColor:     proofBorderColor,
              backgroundColor: proofBgTint,
              borderWidth:     2,
              shadowColor:     C.primary,
              shadowOpacity:   0.45,
              shadowRadius:    12,
              shadowOffset:    { width: 0, height: 0 },
              elevation:       6,
            },
          ]}
        >
          <Card style={s.mb}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={[s.cardTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>Document your Kindness</Text>
              {shouldHighlightProof && (
                <View style={s.nextStepPill}>
                  <Text style={s.nextStepText} numberOfLines={1}>👇 NEXT STEP</Text>
                </View>
              )}
            </View>
            <Text style={s.cardSub}>Document your act with a photo, video, or story</Text>
            <View style={s.proofTabs}>
              {[['photo','📷'],['video','🎥'],['story','✍️']].map(([pt, icon]) => (
                <TouchableOpacity key={pt} disabled={done} onPress={() => { setProofType(pt); setMediaUri(null); }}
                  style={[s.proofTab, proofType === pt && s.proofTabActive]}>
                  <Text style={{ fontSize: sf(22) }}>{icon}</Text>
                  <Text style={[s.proofTabLabel, proofType === pt && { color: C.primary }]}>
                    {pt.charAt(0).toUpperCase() + pt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {(proofType === 'photo' || proofType === 'video') && !done && (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Btn label="📸 Camera" onPress={() => pickMedia(true)} variant="secondary" style={{ paddingVertical: 10 }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn label="🖼️ Library" onPress={() => pickMedia(false)} variant="secondary" style={{ paddingVertical: 10 }} />
                  </View>
                </View>
                {mediaUri ? (
                  <View style={s.mediaPreview}>
                    {proofType === 'photo' ? (
                      <Image
                        source={{ uri: mediaUri }}
                        style={s.mediaPreviewImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={s.mediaPreviewCenter}>
                        <Text style={{ fontSize: sf(32) }}>🎬</Text>
                        <Text style={{ color: C.sub, fontSize: sf(13), marginTop: 6 }}>video attached ✓</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => setMediaUri(null)} style={s.mediaRemove}>
                      <Text style={{ color: C.text, fontSize: sf(13) }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.mediaPlaceholder}>
                    <Text style={{ color: C.muted, fontSize: sf(13) }}>Tap Camera or Library above</Text>
                  </View>
                )}
              </>
            )}

            {proofType === 'story' && (
              <>
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <Text style={{ color: C.muted, fontSize: sf(12), flex: 1 }} numberOfLines={2}>
                    Share your story (minimum {STORY_MIN} characters)
                  </Text>
                  <Text style={{ color: C.muted, fontSize: sf(12), fontWeight: '700' }}>
                    {charCount}/{STORY_MAX}
                  </Text>
                </View>
                <AppInput value={story} onChangeText={setStory}
                  placeholder="Describe what you did, how it felt, and how the person reacted..."
                  multiline editable={!done}
                  maxLength={STORY_MAX}
                  inputAccessoryViewID={KB_DONE_ID} />
              </>
            )}
          </Card>
        </Animated.View>

        {!done && (
          <Card style={s.mb}>
            <Text style={s.cardTitle}>Actual Time & Cost</Text>
            <Text style={s.cardSub}>How much time and money this act actually took.</Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <AppInput
                  label="Hours"
                  value={actualHours}
                  onChangeText={t => setActualHours(t.replace(/\D/g, ''))}
                  placeholder="0"
                  keyboardType="number-pad"
                  inputAccessoryViewID={KB_DONE_ID}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppInput
                  label="Minutes"
                  value={actualMinutes}
                  onChangeText={t => setActualMinutes(t.replace(/\D/g, ''))}
                  placeholder="0"
                  keyboardType="number-pad"
                  inputAccessoryViewID={KB_DONE_ID}
                />
              </View>
             <View style={{ flex: 1 }}>
                <AppInput
                  label="Cost"
                  value={actualCostDollars ? `$${actualCostDollars}` : ''}
                  onChangeText={t => {
                    // Strip leading $, then allow only digits and at most one dot, max 2 decimals
                    const stripped = t.replace(/^\$/, '');
                    const cleaned = stripped.replace(/[^0-9.]/g, '');
                    const parts = cleaned.split('.');
                    const normalized = parts.length > 2
                      ? parts[0] + '.' + parts.slice(1).join('').slice(0, 2)
                      : (parts[1] !== undefined ? parts[0] + '.' + parts[1].slice(0, 2) : parts[0]);
                    setActualCostDollars(normalized);
                  }}
                  placeholder="$0.00"
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={KB_DONE_ID}
                />
              </View>
            </View>

            <Text style={s.recipLabel}>Recipient</Text>
            <Dropdown
                value={recipient}
                options={(RECIPIENTS || []).map(r => ({ label: r, value: r }))}
                onChange={setRecipient}
                placeholder="Select recipient…"
                title="Recipient"
         />
          </Card>
        )}

        {__DEV__ && (
          <TouchableOpacity
            style={s.devTestBtn}
            onPress={() => {
              setDay30Choice(null);
              setShowDay30Message(true);
            }}
          >
            <Text style={s.devTestBtnText}>🧪 DEV: Test Day 30 modal</Text>
          </TouchableOpacity>
        )}

        {!done && (
          <>
{activeChallenges.length > 0 && (
  <TouchableOpacity
    style={s.challengeBadge}
    activeOpacity={0.7}
    onPress={() => {
      if (activeChallenges.length === 1) {
        navigation.navigate('SponsorDetail', { challengeId: activeChallenges[0].id });
      } else {
        Alert.alert(
          'Which challenge?',
          "You're in multiple groups. Pick one to view.",
          [
            ...activeChallenges.map(ch => ({
              text: ch.name,
              onPress: () => navigation.navigate('SponsorDetail', { challengeId: ch.id }),
            })),
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    }}
  >
    <Text style={s.challengeBadgeLabel}>COUNTS TOWARD · TAP TO VIEW</Text>
    <Text style={s.challengeBadgeText}>
      {activeChallenges.map(c => c.name).join(' · ')}
    </Text>
  </TouchableOpacity>
)}
            <Btn
              label={day?.status === 'COMPLETED' ? 'Update Act' : 'Mark Complete'}
              onPress={handleComplete}
              loading={submitting}
              disabled={!canComplete}
            />

            {isCompletedButEditable && (
              <Btn
                label="🗑️ Delete this act"
                onPress={() => setConfirmDelete(true)}
                variant="danger"
                style={{ marginTop: 10 }}
                loading={deleting}
              />
            )}

           {!canComplete && (
              <Text style={s.hint}>
                {!proofType ? '• Select how to document your act' :
                 proofType === 'story' && charCount < STORY_MIN ? `• Write at least ${STORY_MIN} characters (${charCount} so far)` :
                 (proofType === 'photo' || proofType === 'video') && !mediaUri ? `• Add a ${proofType}` :
                 !timeValid ? '• Enter actual time (hours and/or minutes; minutes must be 0–59)' :
                 !costValid ? '• Enter actual cost (e.g. $4.95 or 0)' :
                 !recipientValid ? '• Select a recipient' : ''}
              </Text>
            )}
          </>
        )}

        {showShareSection && (
          <View style={s.successCard}>
            <Text style={{ fontSize: sf(36), textAlign: 'center' }}>🎉</Text>
            <Text style={s.successTitle}>Act Completed!</Text>
            <Text style={s.successSub}>You're making the world a kinder place.</Text>

            {showCompletedMedia && completedProofType === 'photo' && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setShowFullImage(true)}
                style={{ width: '100%', marginTop: 14 }}
              >
                <Image
                  source={{ uri: completedMediaUri }}
                  style={s.completedMediaImage}
                  resizeMode="cover"
                />
                <View style={s.mediaTapHint}>
                  <Text style={s.mediaTapHintText}>Tap to view full size</Text>
                </View>
              </TouchableOpacity>
            )}
            {showCompletedMedia && completedProofType === 'video' && (
              <TouchableOpacity
                style={[s.completedVideoThumbWrap, { marginTop: 14 }]}
                activeOpacity={0.85}
                onPress={() => setShowFullVideo(true)}
              >
                {videoThumbUri ? (
                  <Image
                    source={{ uri: videoThumbUri }}
                    style={s.completedVideoThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[s.completedVideoThumb, s.completedVideoThumbFallback]} />
                )}
                <View style={s.playOverlay}>
                  <View style={s.playButton}>
                    <Text style={s.playButtonIcon}>▶</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            <ShareButtons
              social={socialButtons}
              onText={handleShareText}
              onEmail={handleShareEmail}
              onMore={handleShareOther}
              disabled={sharing}
            />

            {day?.dayNumber === 30 && (
              <TouchableOpacity style={s.addressBtn} onPress={goToAddressForm}>
                <Text style={s.addressBtnText}>
                  📬 {hasAddress ? 'Update Mailing Address' : 'Add Mailing Address'} →
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={s.skipShare}>
              <Text style={s.skipShareText}>Skip → Go to Settings</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showCompletionSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompletionSheet(false)}
      >
        <View style={s.sheetBg}>
          <View style={s.sheetCard}>
            <View style={s.sheetHandle} />
            <ScrollView
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={{ fontSize: sf(36), textAlign: 'center' }}>🎉</Text>
              <Text style={s.successTitle}>Act Completed!</Text>
              <Text style={s.successSub}>You're making the world a kinder place.</Text>

              <ShareButtons
                social={socialButtons}
                onText={handleShareText}
                onEmail={handleShareEmail}
                onMore={handleShareOther}
                disabled={sharing}
              />

              <TouchableOpacity
                style={s.notNowBtn}
                onPress={handleSheetNotNow}
                activeOpacity={0.7}
              >
                <Text style={s.notNowText}>Not now</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showFullVideo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFullVideo(false)}
      >
        <View style={s.fullImageBg}>
          {completedMediaUri && (
            <Video
              source={{ uri: completedMediaUri }}
              style={{ width: SCREEN_W, height: '70%' }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          )}
          <TouchableOpacity
            onPress={() => setShowFullVideo(false)}
            style={s.fullImageClose}
          >
            <Text style={s.fullImageCloseText}>Close ✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={showFullImage} transparent animationType="fade" onRequestClose={() => setShowFullImage(false)}>
        <TouchableOpacity
          style={s.fullImageBg}
          activeOpacity={1}
          onPress={() => setShowFullImage(false)}
        >
          {completedMediaUri && (
            <Image
              source={{ uri: completedMediaUri }}
              style={s.fullImage}
              resizeMode="contain"
            />
          )}
          <View style={s.fullImageClose}>
            <Text style={s.fullImageCloseText}>Tap to close ✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showDay30Message} transparent animationType="fade">
        <View style={s.day30Bg}>
          <ScrollView
            contentContainerStyle={s.day30ScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.day30Card}>
              <Text style={{ fontSize: sf(40), textAlign: 'center', marginBottom: 8 }}>🏆</Text>
              <Text
                style={s.day30Title}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                30‑Day Congratulations
              </Text>
              <Text style={s.day30Body}>{DAY_30_MESSAGE}</Text>
              <ShareButtons
                prompt="You did it — share your 30-day achievement and inspire others to join!"
                social={socialButtons}
                onText={handleShareText}
                onEmail={handleShareEmail}
                onMore={handleShareOther}
                disabled={sharing}
              />

              <TouchableOpacity
                style={s.directionsBtn}
                onPress={() => { setShowDay30Message(false); navigation.navigate('Recognition'); }}
                activeOpacity={0.85}
              >
                <Text style={s.directionsBtnText}>Continue →</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

<BalloonBurst
        visible={showBalloons}
       onDismiss={() => {
          setShowBalloons(false);
          // Defer the sheet a tick — iOS can't present a new Modal while
          // another (the balloons) is still dismissing, or it silently no-ops.
          setTimeout(() => setShowCompletionSheet(true), 400);
        }}
      />

      <Modal visible={confirmDelete} transparent animationType="fade">
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={{ fontSize: sf(44), textAlign: 'center', marginBottom: 12 }}>🗑️</Text>
            <Text style={s.modalTitle}>Delete this act?</Text>
            <Text style={s.modalBody}>
              This will remove Day {day.dayNumber} from your challenge. If this
              breaks your streak, your progress will collapse to your most
              recent unbroken streak.
            </Text>
            <Btn label="Yes, delete" onPress={handleDeleteAct}
              style={{ backgroundColor: C.error, borderWidth: 0, marginBottom: 10 }} />
            <Btn label="Keep it" onPress={() => setConfirmDelete(false)} variant="secondary" />
          </View>
        </View>
      </Modal>

      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            {selectedCategory ? (
              <TouchableOpacity onPress={() => setSelectedCategory(null)} style={s.backBtn}>
                <Text style={{ color: C.primary, fontSize: sf(15), fontWeight: '700' }}>← Back</Text>
              </TouchableOpacity>
            ) : (
              <Text style={s.modalTitle}>Choose a Category</Text>
            )}
            <TouchableOpacity onPress={closePicker}>
              <Text style={{ color: C.primary, fontSize: sf(16), fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            <TextInput
              value={search}
              onChangeText={t => { setSearch(t); setSelectedCategory(null); }}
              placeholder="Search all acts..."
              placeholderTextColor={C.muted}
              style={s.searchInput}
            />
          </View>

          {search.trim() ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={{ color: C.muted, textAlign: 'center', marginTop: 32 }}>No acts found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => selectAct(item)} style={s.actRow}>
                  <Text style={s.actText}>{item.title}</Text>
                  <Text style={{ color: C.primary }}>→</Text>
                </TouchableOpacity>
              )}
            />
          ) : selectedCategory ? (
            <FlatList
              data={selectedCategory.acts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Text style={s.categoryHeader}>{selectedCategory.emoji}  {selectedCategory.label}</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => selectAct(item)} style={s.actRow}>
                  <Text style={s.actText}>{item.title}</Text>
                  <Text style={{ color: C.primary }}>→</Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <FlatList
              data={categories}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => setSelectedCategory(item)} style={s.categoryRow}>
                  <Image source={item.emoji} style={s.categoryIcon} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.categoryLabel}>{item.label}</Text>
                    <Text style={s.categoryCount}>{item.acts.length} acts</Text>
                  </View>
                  <Text style={{ color: C.primary, fontSize: sf(18) }}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <KeyboardDoneBar />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 120 },
  mb: { marginBottom: 14 },
  lockedBanner: {
    backgroundColor: C.success + '18', borderWidth: 1.5, borderColor: C.success + '55',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  dateBadge: {
    backgroundColor: C.success + '18',
    borderWidth: 1, borderColor: C.success + '44',
    borderRadius: 10, padding: 10, marginBottom: 14,
  },
  dateBadgeLabel: { color: C.success, fontSize: sf(10), fontWeight: '800', letterSpacing: 0.8, marginBottom: 3 },
  dateBadgeValue: { color: C.text, fontSize: sf(14), fontWeight: '600' },
challengeBadge: {
    backgroundColor: C.primary + '14',
    borderWidth: 1,
    borderColor: C.primary + '55',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  challengeBadgeLabel: {
    color: C.primary,
    fontSize: sf(9),
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  challengeBadgeText: {
    color: C.text,
    fontSize: sf(13),
    fontWeight: '600',
  },
  preselBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primary + '15',
    borderWidth: 1, borderColor: C.primary + '44',
    borderRadius: 10, padding: 10, marginBottom: 14,
  },
  preselLabel: { color: C.primary, fontSize: sf(10), fontWeight: '800', letterSpacing: 0.8 },
  preselTitle: { color: C.text, fontSize: sf(12), fontWeight: '700', marginTop: 2, lineHeight: 16 },
  preselMeta:  { color: C.sub,  fontSize: sf(11), marginTop: 2 },

  proofCardWrap: {
    borderRadius: 20,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  nextStepPill: {
    backgroundColor: C.primary,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nextStepText: {
    color: C.bg,
    fontSize: sf(9),
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  cardTitle: { color: C.text, fontSize: sf(15), fontWeight: '700', marginBottom: 4 },
  cardSub:   { color: C.muted, fontSize: sf(12), marginBottom: 12 },
  charCount: { fontSize: sf(11), color: C.muted },
  pickBtn: {
    backgroundColor: C.primary + '22', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.primary + '44',
  },
  pickBtnText: { color: C.primary, fontSize: sf(11), fontWeight: '700' },
  proofTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  proofTab: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card2,
  },
  proofTabActive: { borderColor: C.primary, backgroundColor: C.primary + '22' },
  proofTabLabel: { color: C.muted, fontSize: sf(11), fontWeight: '700' },

  mediaPreview: {
    backgroundColor: C.surface, borderRadius: 12, height: 200,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaPreviewImage: {
    width: '100%',
    height: '100%',
  },
  mediaPreviewCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPlaceholder: {
    backgroundColor: C.surface, borderRadius: 12, height: 80,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: C.border, borderStyle: 'dashed',
  },
  mediaRemove: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: '#00000088', borderRadius: 14, width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  hint: { color: C.muted, fontSize: sf(12), textAlign: 'center', marginTop: 10 },
  successCard: {
    backgroundColor: C.success + '22', borderWidth: 1, borderColor: C.success + '44',
    borderRadius: 14, padding: 20, alignItems: 'center', marginTop: 8,
  },
  successTitle: { color: C.success, fontWeight: '800', fontSize: sf(18), marginTop: 8, textAlign: 'center' },
  successSub:   { color: C.sub, fontSize: sf(13), marginTop: 4, marginBottom: 4, textAlign: 'center' },

  completedMediaImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: C.surface,
  },

  completedVideoThumbWrap: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  completedVideoThumb: {
    width: '100%',
    height: '100%',
  },
  completedVideoThumbFallback: {
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
    fontSize: sf(26),
    marginLeft: 4,
  },

  mediaTapHint: {
    position: 'absolute',
    bottom: 8, right: 8,
    backgroundColor: '#000000AA',
    borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  mediaTapHintText: { color: '#fff', fontSize: sf(10), fontWeight: '700' },

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
  fullImageCloseText: { color: '#fff', fontSize: sf(13), fontWeight: '700' },

  shareDivider: {
    borderTopWidth: 1, borderTopColor: C.border,
    marginTop: 16, paddingTop: 16, width: '100%', alignItems: 'center',
  },
  sharePrompt: { color: C.sub, fontSize: sf(13), textAlign: 'center', marginBottom: 14 },

  socialRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12, width: '100%',
  },
  socialBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center',
  },

  shareRow: { flexDirection: 'row', gap: 12, marginBottom: 16, width: '100%' },
  shareBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, paddingVertical: 12, alignItems: 'center', gap: 4,
  },
  shareBtnIcon:  { fontSize: sf(24) },
  shareBtnLabel: { color: C.text, fontSize: sf(12), fontWeight: '700' },
  skipShare: { marginTop: 4 },
  skipShareText: { color: C.muted, fontSize: sf(12) },

  addressBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  addressBtnText: {
    color: C.bg,
    fontSize: sf(14),
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { color: C.text, fontSize: sf(19), fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  modalBody: { color: C.sub, fontSize: sf(14), lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  modalBg: { flex: 1, backgroundColor: '#000000BB', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: {
    backgroundColor: C.card, borderRadius: 22, padding: 28,
    borderWidth: 1.5, borderColor: C.error + '55', width: '100%',
  },
  backBtn: { paddingRight: 8 },
  searchInput: {
    backgroundColor: C.card2, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 9, color: C.text, fontSize: sf(13),
    borderWidth: 1, borderColor: C.border,
  },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  categoryEmoji: { fontSize: sf(28) },
  categoryIcon:  { width: 36, height: 36 },
  preselIcon:    { width: 32, height: 32 },
  categoryLabel: { color: C.text, fontSize: sf(15), fontWeight: '700' },
  categoryCount: { color: C.muted, fontSize: sf(12), marginTop: 2 },
  categoryHeader: { color: C.primary, fontSize: sf(15), fontWeight: '800', padding: 16, paddingBottom: 8 },
  actRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border + '44',
  },
  actText: { color: C.text, fontSize: sf(14), flex: 1, marginRight: 8 },

  day30Bg: {
    flex: 1, backgroundColor: '#000000DD',
  },
  day30ScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  day30Card: {
    backgroundColor: C.card, borderRadius: 22, padding: 20,
    borderWidth: 2, borderColor: C.primary, width: '100%',
  },
  day30Title: {
    color: C.primary, fontSize: sf(18), fontWeight: '900',
    textAlign: 'center', letterSpacing: 0.5, marginBottom: 10,
  },
  day30Body: { color: C.text, fontSize: sf(14), lineHeight: 20, textAlign: 'center', marginBottom: 14 },

  day30BtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  day30Btn: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.border,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  day30BtnActive: {
    borderColor: C.primary,
    backgroundColor: C.primary + '18',
  },
  day30BtnIcon: { fontSize: sf(28), marginBottom: 4 },
  day30BtnTitle: {
    color: C.text,
    fontSize: sf(15),
    fontWeight: '800',
    marginBottom: 2,
  },
  day30BtnSub: {
    color: C.sub,
    fontSize: sf(12),
    fontWeight: '600',
  },

  pickupBox: {
    marginTop: 18,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  pickupLabel: {
    color: C.muted,
    fontSize: sf(10),
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  pickupName: {
    color: C.text,
    fontSize: sf(16),
    fontWeight: '800',
    marginBottom: 4,
  },
  pickupAddress: {
    color: C.sub,
    fontSize: sf(14),
    lineHeight: 20,
    marginBottom: 14,
  },
  directionsBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  directionsBtnText: {
    color: C.bg,
    fontSize: sf(14),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pickupDoneBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  pickupDoneText: {
    color: C.muted,
    fontSize: sf(14),
    fontWeight: '600',
  },

  balloonOverlay: {
    flex: 1, backgroundColor: '#00000099',
    justifyContent: 'flex-end', alignItems: 'center',
  },
  balloon: { position: 'absolute' },
  balloonMsg: { marginBottom: 120, alignItems: 'center' },
  balloonTitle: {
    color: C.primary, fontSize: sf(22), fontWeight: '900',
    letterSpacing: 2, textAlign: 'center',
    textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  balloonSub: {
    color: '#fff', fontSize: sf(17), fontWeight: '700',
    marginTop: 10, textAlign: 'center',
    textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  balloonTap: {
    color: '#ffffffAA', fontSize: sf(12), marginTop: 24, textAlign: 'center',
  },

  recipLabel: {
    color: C.text, fontSize: sf(13), fontWeight: '700',
    marginTop: 14, marginBottom: 6,
  },
  recipDropdown: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card2,
  },
  recipDropdownText: { color: C.text, fontSize: sf(15) },
  recipDropdownArrow: { color: C.sub, fontSize: sf(12) },
  dropdownModalHeader: {
  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
},
dropdownModalTitle: { color: C.text, fontSize: sf(18), fontWeight: '800' },
dropdownModalDone:  { color: C.primary, fontSize: sf(16), fontWeight: '700' },
dropdownModalRow: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  paddingHorizontal: 16, paddingVertical: 14,
  borderBottomWidth: 1, borderBottomColor: C.border + '44',
},
dropdownModalRowText: { color: C.text, fontSize: sf(15), flex: 1 },

  kbBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  kbDone: { color: '#0a84ff', fontSize: sf(16), fontWeight: '700' },

  sheetBg: {
    flex: 1,
    backgroundColor: '#000000AA',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  notNowBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  notNowText: {
    color: C.muted,
    fontSize: sf(15),
    fontWeight: '600',
  },

  devTestBtn: {
    backgroundColor: '#FFA50022',
    borderWidth: 1.5,
    borderColor: '#FFA500',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  devTestBtnText: {
    color: '#FFA500',
    fontSize: sf(12),
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
