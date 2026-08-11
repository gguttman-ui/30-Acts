import React from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet, Alert, Linking, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { extractPhone } from '../lib/streak';

// Where "Report a Problem" sends support email.
const SUPPORT_EMAIL = 'info@30actsofkindness.org';

// Real native build number, read straight from the installed binary. No manual
// bumping needed — it always matches the TestFlight build you installed.
const APP_BUILD = Application.nativeBuildVersion ?? '—';

export default function HelpScreen({ user }) {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

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
  version:   { color: C.sub, fontSize: 12, opacity: 0.7, textAlign: 'center', marginTop: 8 },
});
