// ─────────────────────────────────────────────────────────────────────────────
// ShareButtons.js — the ONE share UI used everywhere in the app.
//
// Presentational only. Every screen keeps its own share handlers and passes them
// in, so the look is identical everywhere without disturbing share logic.
//
//   Spread the kindness — invite someone to join!
//
//        [        ↗️  Share        ]
//        [ 💬 Text ]   [ 📧 Email ]
//
// WHY ONE "SHARE" BUTTON INSTEAD OF FOUR BRAND CIRCLES
//
// The row used to have Instagram / Facebook / TikTok / X circles. It looked
// good and mostly did not work, because iOS gives a third-party app no reliable
// way to push a picture AND a caption into those composers:
//
//   Instagram — no text API at all; Stories deep link takes an image only.
//   TikTok    — no text API; cannot write into "Add a catchy title".
//   X         — twitter://post carries text only, never media. react-native-
//               share's TWITTER target rides the same scheme, so it cannot
//               attach a picture either, and it could hang.
//   Facebook  — refuses prefilled text from other apps, by policy.
//
// What DOES work for all of them is the system share sheet: it hands the file
// to whichever app's share extension the person picks. So there is one button
// that opens it. The person chooses Instagram, X, TikTok, WhatsApp, anything —
// including apps we never wrote code for.
//
// Do NOT re-add per-platform buttons without a working direct path to point
// them at. A branded button that opens a generic sheet is a button that lies.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { C } from '../constants';

const { width: SCREEN_W } = Dimensions.get('window');
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);

export const SHARE_PROMPT = 'Spread the kindness — invite someone to join!';

export default function ShareButtons({
  onShare,
  onText,
  onEmail,
  disabled = false,
  prompt = SHARE_PROMPT,
  shareLabel = 'Share',
  style,
}) {
  return (
    <View style={[s.wrap, style]}>
      {prompt ? <Text style={s.sharePrompt}>{prompt}</Text> : null}

      <TouchableOpacity
        style={s.primaryBtn}
        onPress={onShare}
        disabled={disabled}
        accessibilityLabel="Share to Instagram, Facebook, TikTok, X or anywhere else"
        activeOpacity={0.8}
      >
        <Text style={s.primaryIcon}>↗️</Text>
        <Text style={s.primaryLabel}>{shareLabel}</Text>
      </TouchableOpacity>

      <Text style={s.hint}>
        Instagram, Facebook, TikTok, X and more
      </Text>

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
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%' },

  sharePrompt: {
    color: C.sub, fontSize: sf(13), textAlign: 'center', marginBottom: 14,
  },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: C.primary, borderRadius: 14,
    paddingVertical: 16, width: '100%',
  },
  primaryIcon:  { fontSize: sf(20) },
  primaryLabel: { color: '#06210f', fontSize: sf(17), fontWeight: '800' },

  hint: {
    color: C.muted, fontSize: sf(11.5), textAlign: 'center',
    marginTop: 8, marginBottom: 16,
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
