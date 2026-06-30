import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing, TouchableOpacity, Image } from 'react-native';
import { C } from '../constants';

export default function SplashScreen({ onDone }) {
  const progress = useRef(new Animated.Value(0)).current;
  const spin1    = useRef(new Animated.Value(0)).current;
  const spin2    = useRef(new Animated.Value(0)).current;
  const float    = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);
  const doneRef  = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    onDone();
  };

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin1, { toValue: 1, duration: 10000, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(spin2, { toValue: -1, duration: 7000, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.timing(progress, { toValue: 1, duration: 2500, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    timerRef.current = setTimeout(() => finish(), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const rotate1  = spin1.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotate2  = spin2.interpolate({ inputRange: [-1, 0], outputRange: ['-360deg', '0deg'] });
  const floatY   = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <TouchableOpacity activeOpacity={1} onPress={finish} style={s.container}>
      <View style={s.ringWrap}>
        <Animated.View style={[s.ring, s.ring1, { transform: [{ rotate: rotate1 }] }]} />
        <Animated.View style={[s.ring, s.ring2, { transform: [{ rotate: rotate2 }] }]} />
        <Animated.View style={[s.ring, s.ring3, { transform: [{ rotate: rotate1 }] }]} />
        {/* Heart logo image with the same float animation the dove emoji had */}
        <Animated.View style={[s.logoFloat, { transform: [{ translateY: floatY }] }]}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
        </Animated.View>
      </View>
      <Text style={s.title}>30 Acts of Kindness™</Text>
      <Text style={s.subtitle}>Transform the world, one Act at a time</Text>
      <View style={s.barBg}>
        <Animated.View style={[s.barFill, { width: barWidth }]} />
      </View>
      <Text style={s.tapHint}>Tap to continue</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  ring: { position: 'absolute', borderRadius: 999 },
  ring1: { width: 200, height: 200, borderWidth: 1, borderColor: C.primary + '30' },
  ring2: { width: 170, height: 170, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary + '40' },
  ring3: { width: 140, height: 140, borderWidth: 1, borderColor: C.primary + '55' },
  logoFloat: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  title: { fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: 13, color: C.sub, fontStyle: 'italic', letterSpacing: 0.4, marginBottom: 52 },
  barBg: { width: 140, height: 3, backgroundColor: C.surface, borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.primary, borderRadius: 99 },
  tapHint: { color: C.muted, fontSize: 12, marginTop: 20, letterSpacing: 0.5 },
});