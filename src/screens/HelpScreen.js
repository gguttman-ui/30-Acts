import React, { useState } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet, Alert, Linking, Platform, Vibration,
} from 'react-native';
import Constants from 'expo-constants';
import { Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { extractPhone } from '../lib/streak';

// Where "Report a Problem" sends support email.
const SUPPORT_EMAIL = 'info@30actsofkindness.org';

// App build number shown in About. BUMP THIS when you cut a new native / App
// Store build (match the TestFlight build number). It is a manual constant for
// now because reading the real build number off the device requires the
// `expo-application` package, which only takes effect in a native build (not
// over-the-air). When we do the next App Store build we can add that package
// and have this fill in automatically.
const APP_BUILD = '96';

export default function HelpScreen({ user }) {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  // TEMP: a direct "does sound work on this device+build" test, so we don't
  // have to reach the 30-day celebration to check. Shows a live status line.
  const [sfx, setSfx] = useState('');
  const testSound = async () => {
    setSfx('buzzing…');
    try { Vibration.vibrate([0, 150, 100, 250]); } catch (e) {}
    try {
      const { Audio } = require('expo-av');
      const { Asset } = require('expo-asset');
      if (!Audio || typeof Audio.setAudioModeAsync !== 'function') {
        setSfx('audio module MISSING (not in this build)'); return;
      }
      setSfx('setting audio mode…');
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
      setSfx('loading sound…');
      const asset = Asset.fromModule(require('../../assets/celebration.mp3'));
      await asset.downloadAsync();
      const src = asset.localUri || asset.uri;
      const { sound } = await Audio.Sound.createAsync({ uri: src }, { shouldPlay: true, volume: 1.0 });
      try { await sound.playAsync(); } catch (e) {}
      setSfx('PLAYING ✓  (if silent, it is a device setting)');
      setTimeout(() => { sound.unloadAsync().catch(() => {}); }, 6000);
    } catch (e) {
      setSfx('ERROR: ' + (e && e.message ? e.message : String(e)));
    }
  };

  const handleReportProblem = () => {
    const acct = extractPhone(user?.email) || user?.phone || 'unknown';
    const body = [
      '',
      '',
      '——————————',
      "Please describe the problem above this line. The details below help us fix it:",
      '',
      `App version: ${appVersion} (build ${APP_BUILD})`,
      `Device: ${Platform.OS === 'ios' ? 'iOS' : Platform.OS} ${Platform.Version}`,
      `Account: ${acct}`,
    ].join('\n');
    const url =
      `mailto:${SUPPORT_EMAIL}` +
      `?subject=${encodeURIComponent('30 Acts — Problem Report')}` +
      `&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Email not available', `Please email us at ${SUPPORT_EMAIL} and we'll help.`)
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Help" />
      <ScrollView contentContainerStyle={s.scroll}>

        <Card style={[s.card, { alignItems: 'center' }]}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.name}>30 Acts of Kindness</Text>
          <Text style={s.tagline}>Making the world kinder, one act at a time.</Text>
        </Card>

        <Card style={s.card}>
          <Text style={s.cardTitle}>Need help?</Text>
          <Text style={s.cardSub}>
            Found a problem or have a question? Send us a note and we'll get right back to you.
          </Text>
          <Btn
            label="✉️  Report a Problem"
            onPress={handleReportProblem}
            style={{ alignSelf: 'stretch' }}
          />
        </Card>

        <Card style={s.card}>
          <Text style={s.cardTitle}>Sound check</Text>
          <Text style={s.cardSub}>
            Tap to test the celebration chime and vibration on this device.
          </Text>
          <Btn
            label="🔊  Test sound"
            onPress={testSound}
            style={{ alignSelf: 'stretch' }}
          />
          {sfx ? <Text style={s.sfx}>{sfx}</Text> : null}
        </Card>

        <Text selectable style={s.version}>Version {appVersion} (build {APP_BUILD})</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll:    { padding: 16, paddingBottom: 40 },
  card:      { marginBottom: 16 },
  logo:      { width: 88, height: 88, marginBottom: 10 },
  name:      { color: C.text, fontSize: 22, fontWeight: '800' },
  tagline:   { color: C.sub, fontSize: 14, marginTop: 6, textAlign: 'center' },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  cardSub:   { color: C.sub, fontSize: 13, marginBottom: 14, lineHeight: 18 },
  sfx:       { color: '#ffd54a', fontSize: 13, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  version:   { color: C.sub, fontSize: 12, opacity: 0.7, textAlign: 'center', marginTop: 8 },
});
