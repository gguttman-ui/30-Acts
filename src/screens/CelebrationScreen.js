import React, { useRef, useEffect } from 'react';
import {
  View, Text, Animated, Easing, Dimensions, TouchableOpacity, StyleSheet, Vibration,
} from 'react-native';
import { C } from '../constants';
// NOTE: expo-av / expo-asset are loaded lazily inside the effect (not imported
// at the top) so that older installed builds — which were compiled before the
// audio library existed — can still run this screen's JavaScript without any
// risk of a load-time failure. On a build that includes expo-av, the chime
// plays; on one that doesn't, we simply skip the sound. No crash either way.

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

// The 30-day celebration: floating balloons + "30 DAYS COMPLETE", shown right
// after the 30th act and before the recognition choice. Tap anywhere (or wait a
// few seconds) to continue to the recognition screen. Lifted from the balloon
// burst that used to live only inside DailyActScreen so every 30-day path
// celebrates the same way.
export default function CelebrationScreen({ navigation }) {
  const advanced = useRef(false);

  const balloons = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      id:       i,
      startX:   Math.random() * (SCREEN_W - 50),
      driftX:   (Math.random() - 0.5) * 80,
      y:        new Animated.Value(SCREEN_H - Math.random() * (SCREEN_H + 200)),
      sway:     new Animated.Value(0),
      emoji:    ['🎈', '🎉', '✨', '🎊', '🎈', '🎈'][i % 6],
      duration: 3500 + Math.random() * 2000,
      size:     30 + Math.random() * 28,
    }))
  ).current;

  const goNext = () => {
    if (advanced.current) return;
    advanced.current = true;
    navigation.replace('Recognition');
  };

  useEffect(() => {
    const rise = balloons.map(b =>
      Animated.loop(Animated.sequence([
        Animated.timing(b.y, { toValue: -250, duration: b.duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(b.y, { toValue: SCREEN_H + 100, duration: 0, useNativeDriver: true }),
      ]))
    );
    const sway = balloons.map(b =>
      Animated.loop(Animated.sequence([
        Animated.timing(b.sway, { toValue: 1,  duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(b.sway, { toValue: -1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]))
    );
    Animated.parallel([...rise, ...sway]).start();

    // Guaranteed tactile celebration (core module, present in every build).
    try { Vibration.vibrate([0, 120, 90, 120, 90, 220]); } catch (e) {}

    // Celebratory chime — best-effort. Lazily require the audio modules so a
    // build that lacks them just skips this quietly instead of failing to load.
    let sound;
    (async () => {
      try {
        const { Audio } = require('expo-av');
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
        const loaded = await Audio.Sound.createAsync(
          { uri: src },
          { shouldPlay: true, volume: 1.0 },
        );
        sound = loaded.sound;
        try { await sound.playAsync(); } catch (e) {}
      } catch (e) { /* audio is a nice-to-have; ignore on builds without it */ }
    })();

    // Auto-advance after a few seconds in case the user doesn't tap.
    const t = setTimeout(goNext, 7000);
    return () => {
      clearTimeout(t);
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, []);

  return (
    <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={goNext}>
      {balloons.map(b => {
        const swayX = b.sway.interpolate({ inputRange: [-1, 1], outputRange: [-15, 15] });
        return (
          <Animated.Text
            key={b.id}
            style={[
              s.balloon,
              { left: b.startX + b.driftX, fontSize: b.size, transform: [{ translateY: b.y }, { translateX: swayX }] },
            ]}
          >
            {b.emoji}
          </Animated.Text>
        );
      })}

      <View style={s.msg}>
        <Text style={s.trophy}>🏆</Text>
        <Text style={s.title}>🕊️ 30 DAYS COMPLETE 🕊️</Text>
        <Text style={s.sub}>You are a Certified Kind Person</Text>
        <Text style={s.tap}>tap to continue →</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  balloon: { position: 'absolute', top: 0 },
  msg: { alignItems: 'center', paddingHorizontal: 32 },
  trophy: { fontSize: 72, marginBottom: 12 },
  title: {
    color: C.text, fontSize: 24, fontWeight: '900',
    textAlign: 'center', marginBottom: 10, letterSpacing: 0.5,
  },
  sub: {
    color: C.accent, fontSize: 18, fontWeight: '700',
    textAlign: 'center', marginBottom: 26,
  },
  tap: { color: C.sub, fontSize: 14 },
});
