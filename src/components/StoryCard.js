// ──────────────────────────────────────────────────────────────────────────────
// StoryCard.js — renders a text-only act ("story" proof) as a branded card that
// can be captured to an image with react-native-view-shot, so it can be shared to
// image-only platforms (Instagram, TikTok) and attached on X / Facebook.
//
// IMPORTANT (iOS capture): the card must stay INSIDE the window for the capture
// to work. react-native-view-shot on iOS snapshots via
// `drawViewHierarchy(afterScreenUpdates: true)`, which returns a BLANK / failed
// image for a view whose frame is entirely off-screen (the old `left: -99999`
// trick). That blank capture is why story shares produced no image — Instagram
// said "needs a photo" and Facebook opened empty.
//
// Instead we host the card in a 1px, overflow-hidden box anchored at the
// top-left of the window: the user sees nothing (1px footprint), but the card is
// rendered and composited, so the capture succeeds. The clip does NOT affect the
// capture, because captureRef renders the inner canvas's own layer tree. (We do
// NOT use opacity:0 on the host — that can make iOS skip rendering the subtree
// and return a blank capture.)
//
//   const uri = await captureRef(storyCardRef, { format: 'jpg', quality: 0.92 });
// ──────────────────────────────────────────────────────────────────────────────
import React, { forwardRef } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Text } from './scaledText'; // font-scaling locked, matches app-wide work
import { C } from '../constants';

// Fixed canvas size → predictable, high-res square export (~1080px after PR scaling).
export const STORY_CARD_SIZE = 1080;

const StoryCard = forwardRef(function StoryCard({ title, story, dayNumber, inviteUrl }, ref) {
  const quote = (story || '').trim();
  return (
    <View style={styles.captureHost} pointerEvents="none">
      <View ref={ref} collapsable={false} style={styles.canvas}>
        <View style={styles.frame}>
          <View style={styles.inner}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>DAY {dayNumber} OF 30</Text>
            </View>

            <View style={styles.quoteCard}>
              <Text style={styles.quote} numberOfLines={11}>{quote}</Text>
            </View>

            <View style={styles.footer}>
              <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.brand}>30 Acts of Kindness™</Text>
                <Text style={styles.hashtag}>#30ActsOfKindness</Text>
              </View>
              {inviteUrl ? (
                <View style={styles.qrWrap}>
                  <View style={styles.qrBox}>
                    <QRCode value={inviteUrl} size={150} backgroundColor="#ffffff" color="#111111" />
                  </View>
                  <Text style={styles.scanLabel}>Scan to join</Text>
                </View>
              ) : null}
            </View>
            {inviteUrl ? (
              <Text style={styles.howTo}>
                Scan the QR code above to get the free app and join the movement to make the world a kinder place 🌳
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // Invisible host that stays INSIDE the window so iOS will composite (and thus
  // capture) the card. 1px + overflow hidden + opacity 0 → nothing visible, but
  // the card is still rendered and laid out at full size for the snapshot.
  captureHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
    // Deliberately NOT opacity:0 — opacity 0 lets iOS skip rendering the subtree,
    // which makes captureRef (afterScreenUpdates:true) return a BLANK image. The
    // 1px overflow-hidden box already keeps it invisible.
  },
  canvas: {
    // No off-screen translation — the 1px host above keeps it invisible while it
    // stays in-window. Full square size so the export is high-res.
    width: STORY_CARD_SIZE,
    height: STORY_CARD_SIZE,
    backgroundColor: C.bg,
    padding: 28,            // outer mat around the frame
  },
  frame: {
    flex: 1,
    borderRadius: 52,
    borderWidth: 10,
    borderColor: C.gold,    // bright outer frame so it reads as a framed picture
    padding: 10,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: C.primary,
    backgroundColor: C.card,
    paddingVertical: 56,
    paddingHorizontal: 56,
    justifyContent: 'space-between',
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: C.surface,
    borderColor: C.primary,
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  pillText: { color: C.accent, fontSize: 30, fontWeight: '800', letterSpacing: 2 },
  act: { color: C.text, fontSize: 64, fontWeight: '800', lineHeight: 74, marginTop: 28 },
  quoteCard: {
    flexShrink: 1,
    backgroundColor: C.card2,
    borderRadius: 32,
    borderLeftWidth: 8,
    borderLeftColor: C.gold,
    paddingVertical: 36,
    paddingHorizontal: 40,
    marginTop: 24,
  },
  quoteMark: { color: C.gold, fontSize: 90, lineHeight: 70, height: 56, fontWeight: '800' },
  quote: { color: C.sub, fontSize: 44, lineHeight: 60, fontStyle: 'italic' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 28 },
  qrWrap: { alignItems: 'center', marginLeft: 8 },
  qrBox: { backgroundColor: '#ffffff', padding: 14, borderRadius: 18 },
  scanLabel: { color: C.text, fontSize: 26, fontWeight: '700', marginTop: 10 },
  howTo: { color: C.accent, fontSize: 28, fontWeight: '700', textAlign: 'center', marginTop: 24, lineHeight: 38 },
  logo: { width: 64, height: 64, marginRight: 4 },
  brand: { color: C.text, fontSize: 38, fontWeight: '800' },
  hashtag: { color: C.primary, fontSize: 32, fontWeight: '700', marginTop: 4 },
});

export default StoryCard;