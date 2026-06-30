import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Alert } from 'react-native';
import { Btn, Card, ScreenHeader } from '../components';
import { C, DONATIONS } from '../constants';

export default function DonationScreen({ navigation }) {
  const openDonation = (d) => {
    const urls = {
      paypal: 'https://paypal.me/30ActsofKindness',
      venmo:  'venmo://paycharge?txn=pay&recipients=30ActsofKindness',
      zelle:  'mailto:Donate@30ActsofKindness.org',
    };
    Linking.openURL(urls[d.id]).catch(() =>
      Alert.alert(d.label, `Please send to: ${d.value}`)
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Support Our Mission" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll}>

        <View style={s.hero}>
          <Text style={s.heroEmoji}>💚</Text>
          <Text style={s.heroTitle}>Make a Difference</Text>
          <Text style={s.heroSub}>
            Your donation helps us spread kindness worldwide and keep this app free for everyone.
          </Text>
        </View>

        {DONATIONS.map(d => (
          <Card key={d.id} style={[s.mb, { borderColor: d.color + '55' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 }}>
              <View style={[s.donationIcon, { backgroundColor: d.color + '22' }]}>
                <Text style={{ fontSize: 24 }}>{d.icon}</Text>
              </View>
              <View>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 18 }}>{d.label}</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{d.value}</Text>
              </View>
            </View>
            <Btn
              label={`Donate via ${d.label}`}
              onPress={() => openDonation(d)}
              style={{ backgroundColor: d.color, borderWidth: 0 }}
            />
          </Card>
        ))}

        <Text style={s.footer}>
          Every act of generosity helps us build a kinder world. Thank you. 🕊️
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  mb: { marginBottom: 14 },
  hero: { alignItems: 'center', paddingVertical: 24, marginBottom: 8 },
  heroEmoji: { fontSize: 64, marginBottom: 12 },
  heroTitle: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 10 },
  heroSub: { color: C.sub, fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  donationIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  footer: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});