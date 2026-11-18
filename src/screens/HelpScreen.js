import React, { useRef, useState } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet, Alert, Linking, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { createTapCounter } from '../lib/tapCounter';
import { DB_ENVIRONMENT, PROJECT_REF } from '../lib/supabase';
import { versionLabel, buildDetails, NATIVE_BUILD } from '../lib/buildInfo';
import { Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { extractPhone } from '../lib/streak';

// Where "Report a Problem" sends support email.
const SUPPORT_EMAIL = 'info@30actsofkindness.org';

// Build number shown in Help and in problem reports: src/lib/buildInfo.js.
const APP_BUILD = NATIVE_BUILD[Platform.OS] || '?';

export default function HelpScreen({ user, navigation }) {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const isStaging = Updates.channel === 'preview';
  const [showDetails, setShowDetails] = useState(false);
  const tapRef = useRef(createTapCounter({ count: 5, windowMs: 3000 }));
  const details = buildDetails({
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    updateId: Updates.updateId,
    db: DB_ENVIRONMENT === 'other' ? PROJECT_REF : DB_ENVIRONMENT,
  });
  // Five quick taps on the version line: show the developer details and send
  // the Sentry test message (item 43; was on the Me page until 17 Nov 2026).
  const handleVersionTap = () => {
    if (!tapRef.current(Date.now())) return;
    setShowDetails(true);
    const eventId = Sentry.captureMessage(`Sentry test from Help (item 43) - ${details}`);
    Alert.alert('Sentry test sent', `Event ${eventId ? eventId.slice(0, 8) : '(no id)'}. It should appear in Sentry Issues within a minute or two.`);
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
          <Text style={s.cardTitle}>How it works</Text>
          <Text style={s.cardSub}>
            A quick tour of picking an act, filling your 30 days and growing your tree.
          </Text>
          <Btn
            label="Show me how"
            onPress={() => navigation?.navigate('Tour')}
            style={{ alignSelf: 'stretch' }}
          />
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

        {Updates.channel === 'preview' ? (
          <Card style={s.card}>
            <Text style={s.cardTitle}>🧪 Staging test</Text>
            <Text style={s.cardSub}>
              Make this phone act like a new install next time the app opens: the welcome
              tour, then sign-in. Your account and acts are not touched. Only shows in the
              staging app.
            </Text>
            <Btn
              label="Replay first-time start"
              variant="secondary"
              onPress={() => Alert.alert(
                'Replay first-time start?',
                'After this: Me > Log Out, then close the app fully and reopen it.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Replay',
                    onPress: async () => {
                      try { await AsyncStorage.multiRemove(['hasSeenOnboarding', 'remembered_phone']); } catch {}
                      Alert.alert('Done', 'Now go to Me > Log Out, then close the app fully and reopen it.');
                    },
                  },
                ],
              )}
              style={{ alignSelf: 'stretch' }}
            />
          </Card>
        ) : null}

        <Text style={s.version} onPress={handleVersionTap}>{versionLabel(appVersion, Platform.OS)}</Text>
        {isStaging || showDetails ? (
          <Text selectable style={s.version}>{details}</Text>
        ) : null}
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
