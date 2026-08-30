// ─────────────────────────────────────────────────────────────────────────────
// ShareButtons.js — the ONE share UI used everywhere in the app.
//
// Presentational only. Every screen keeps its own share handlers and passes them
// in, so the look is identical everywhere without disturbing share logic.
//
//   Spread the kindness — invite someone to join!
//
//     (TT)   (IG)   (X)   (FB)
//   [ 💬 Text ] [ 📧 Email ] [ ↗️ More ]
//
// EACH PLATFORM USES A DIFFERENT ROUTE, BECAUSE EACH ONE ALLOWS SOMETHING
// DIFFERENT. Verified on device, not assumed:
//
//   TikTok    — card saved to Photos, TikTok opened. Their composer takes it as
//               the cover. TikTok is NOT reliably offered in the system share
//               sheet, so the direct route is the one that works.
//   Instagram — Stories deep link with the image, falling back to the share
//               sheet. Instagram has no text API at all, so the picture arrives
//               and the caption is pasted. That is the ceiling, not a bug.
//   X         — the system share sheet. X's URL scheme carries text only and
//               never media, so a direct link cannot attach the card. The share
//               extension can, and does.
//   Facebook  — the Facebook SDK's ShareDialog, which opens the composer with
//               the picture already attached. Facebook's share EXTENSION does
//               not reliably accept the image from the system sheet, so the SDK
//               is the route that works.
//
// The caption goes on the clipboard for TikTok, Instagram and Facebook: none of
// them accept prefilled text from another app (Facebook refuses it by policy,
// the other two have no text API), so pasting is the only way it reaches a
// composer.
//
// Do NOT "simplify" these into one path. Each one is here because the others
// were tried on a real device and failed.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { C } from '../constants';

const { width: SCREEN_W } = Dimensions.get('window');
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);

export const SHARE_PROMPT = 'Spread the kindness — invite someone to join!';

// Order is deliberate: TikTok, Instagram, X, Facebook.
export const buildSocialButtons = ({ onTikTok, onInstagram, onX, onFacebook }) => [
  { name: 'TikTok',    faIcon: 'tiktok',    onPress: onTikTok,    brand: '#25F4EE' },
  { name: 'Instagram', faIcon: 'instagram', onPress: onInstagram, brand: '#E4405F' },
  { name: 'X',         faIcon: 'x-twitter', onPress: onX,         brand: '#FFFFFF' },
  { name: 'Facebook',  faIcon: 'facebook',  onPress: onFacebook,  brand: '#1877F2' },
];

export default function ShareButtons({
  social,
  onText,
  onEmail,
  onMore,
  disabled = false,
  prompt = SHARE_PROMPT,
  style,
}) {
  return (
    <View style={[s.wrap, style]}>
      {prompt ? <Text style={s.sharePrompt}>{prompt}</Text> : null}

      <Text style={s.socialHeading}>Share Social Media</Text>

      <View style={s.socialRow}>
        {(social || []).map((b) => (
          <View key={b.name} style={s.socialCol}>
            <TouchableOpacity
              accessibilityLabel={`Share to ${b.name}`}
              style={[s.socialBtn, { borderColor: b.brand + '66' }]}
              onPress={b.onPress}
              disabled={disabled}
              activeOpacity={0.7}
            >
              {b.img
                ? <Image source={b.img} style={s.socialImg} resizeMode="contain" />
                : <FontAwesome6 name={b.faIcon} size={28} color={b.brand} />}
            </TouchableOpacity>
            <Text style={s.socialName}>{b.name}</Text>
          </View>
        ))}
      </View>

      <View style={s.shareRow}>
        <TouchableOpacity
          style={s.shareBtn}
          onPress={onText}
          disabled={disabled}
          accessibilityLabel="Share by text message"
          activeOpacity={0.7}
        >
          <Text style={s.shareBtnIcon}>💬</Text>
          <Text style={s.shareBtnLabel}>Text</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.shareBtn}
          onPress={onEmail}
          disabled={disabled}
          accessibilityLabel="Share by email"
          activeOpacity={0.7}
        >
          <Text style={s.shareBtnIcon}>📧</Text>
          <Text style={s.shareBtnLabel}>Email</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.shareBtn}
          onPress={onMore}
          disabled={disabled}
          accessibilityLabel="More share options"
          activeOpacity={0.7}
        >
          <Text style={s.shareBtnIcon}>↗️</Text>
          <Text style={s.shareBtnLabel}>More</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%' },

  sharePrompt: {
    color: C.sub, fontSize: sf(13), textAlign: 'center', marginBottom: 14,
  },

  socialHeading: {
    color: C.text, fontSize: sf(13), fontWeight: '800',
    textAlign: 'center', marginBottom: 12,
  },

  socialRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 18,
  },
  socialCol: { alignItems: 'center' },
  socialBtn: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center',
  },
  socialImg:  { width: 28, height: 28 },
  socialName: {
    color: C.muted, fontSize: sf(10.5), fontWeight: '700', marginTop: 6,
  },

  shareRow: {
    flexDirection: 'row', gap: 12, marginBottom: 16, width: '100%',
  },
  shareBtn: {
    flex: 1, backgroundColor: C.card2, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 14, alignItems: 'center',
  },
  shareBtnIcon:  { fontSize: sf(24) },
  shareBtnLabel: { color: C.text, fontSize: sf(12), fontWeight: '700', marginTop: 4 },
});
