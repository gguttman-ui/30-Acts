// ──────────────────────────────────────────────────────────────────────────────
// ShareButtons.js — the ONE share UI used everywhere in the app.
//
// This component is presentational only. Every screen keeps its own share
// handlers (they differ per screen: an act, a day in History, the certificate)
// and passes them in. That keeps the look identical everywhere without
// disturbing share logic that has already been proven on TestFlight.
//
// The layout is the "Act Completed!" row from MyStoryScreen, which is the
// app-wide standard:
//
//     prompt text
//     ( IG )  ( FB )  ( TT )  ( X )      <- circular brand-coloured icons
//     [ Text ] [ Email ] [ More ]        <- labelled buttons
//
// Do NOT re-implement this markup in a screen. Import it.
// ──────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { C } from '../constants';

const { width: SCREEN_W } = Dimensions.get('window');
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);

export const SHARE_PROMPT = 'Spread the kindness — invite someone to join!';

// The four platforms, in the app's standard order, with their brand colours.
// Pass the screen's own handlers; get back the array ShareButtons expects.
export const buildSocialButtons = ({ onInstagram, onFacebook, onTikTok, onX }) => [
  { name: 'Instagram', faIcon: 'instagram', onPress: onInstagram, brand: '#E4405F' },
  { name: 'Facebook',  faIcon: 'facebook',  onPress: onFacebook,  brand: '#1877F2' },
  { name: 'TikTok',    faIcon: 'tiktok',    onPress: onTikTok,    brand: '#25F4EE' },
  { name: 'X',         faIcon: 'x-twitter', onPress: onX,         brand: '#FFFFFF' },
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

      <View style={s.socialRow}>
        {(social || []).map((b) => (
          <TouchableOpacity
            key={b.name}
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

  socialRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 18,
  },
  socialBtn: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center',
  },
  socialImg: { width: 28, height: 28 },

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
