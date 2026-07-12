import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, ScreenHeader } from '../components';
import { C, DONATIONS } from '../constants';

export default function DonationScreen({ navigation }) {
  const [copiedId, setCopiedId] = useState(null);

  const handlePress = async (d) => {
    // Zelle has no linkable URL — it lives inside each bank's own app.
    // The only useful action is to copy the address so the donor can paste it there.
    if (d.action === 'copy') {
      try {
        await Clipboard.setStringAsync(d.value);
        setCopiedId(d.id);
        setTimeout(() => setCopiedId(null), 2500);
      } catch (e) {
        Alert.alert(d.label, `Send your gift to:\n\n${d.value}`);
      }
      return;
    }

    // PayPal / Venmo: open externally.
    try {
      const canOpen = await Linking.canOpenURL(d.url);
      if (!canOpen) throw new Error('cannot open');
      await Linking.openURL(d.url);
    } catch (e) {
      Alert.alert(
        d.label,
        `We couldn't open ${d.label}. You can send your gift to:\n\n${d.value}`
      );
    }
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

        {DONATIONS.map((d) => {
          const isCopied = copiedId === d.id;
          return (
            <Card key={d.id} style={[s.mb, { borderColor: d.color + '55' }]}>
              <View style={s.row}>
                <View style={[s.donationIcon, { backgroundColor: d.color + '22' }]}>
                  <Text style={{ fontSize: 24 }}>{d.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{d.label}</Text>
                  <Text style={s.value}>{d.value}</Text>
                </View>
              </View>

              <Btn
                label={isCopied ? 'Copied to clipboard! ✓' : d.cta}
                onPress={() => handlePress(d)}
                style={{
                  backgroundColor: isCopied ? '#1E8E54' : d.color,
                  borderWidth: 0,
                }}
              />

              <Text style={s.hint}>{d.hint}</Text>
            </Card>
          );
        })}

        <Text style={s.taxNote}>
          30ActsofKindness NFP is a registered 501(c)(3) nonprofit in Illinois
          (EIN 41-4058016). Donations are tax-deductible to the extent allowed by law.
        </Text>

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
  heroTitle: {
    color: C.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroSub: {
    color: C.sub,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  donationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: C.text, fontWeight: '800', fontSize: 18 },
  value: { color: C.muted, fontSize: 12, marginTop: 2 },
  hint: {
    color: C.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 17,
  },
  taxNote: {
    color: C.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  footer: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});