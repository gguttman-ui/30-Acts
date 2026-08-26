import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Linking, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, ScreenHeader } from '../components';
import { C, DONATIONS } from '../constants';
import { supabase } from '../lib/supabase';

const SHIP_AMOUNT = '$6.95';

// $6.95 bracelet-shipping payment. PayPal / Venmo / Zelle are handle-based, so
// there's no automatic confirmation: the user sends the money and taps
// "I've sent it," which records the method and leaves the order payment_status
// = 'pending' for an admin to verify before shipping.
export default function BraceletPaymentScreen({ navigation, route }) {
  const withCertificate = !!route?.params?.withCertificate;
  const [selected, setSelected] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [saving, setSaving]     = useState(false);

  const handlePay = async (d) => {
    setSelected(d.id);
    if (d.action === 'copy') {
      try {
        await Clipboard.setStringAsync(d.value);
        setCopiedId(d.id);
        setTimeout(() => setCopiedId(null), 2500);
      } catch (e) {
        Alert.alert(d.label, `Send ${SHIP_AMOUNT} to:\n\n${d.value}`);
      }
      return;
    }
    try {
      await Linking.openURL(d.url);
    } catch (e) {
      Alert.alert(d.label, `We couldn't open ${d.label}. Send ${SHIP_AMOUNT} to:\n\n${d.value}`);
    }
  };

  const handleSent = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // Records the method; payment_status stays 'pending' until verified.
        await supabase
          .from('recognition_orders')
          .update({ payment_method: selected || null })
          .eq('user_id', user.id);
      }
    } catch (e) {
      // Non-fatal: the order already exists; we just couldn't tag the method.
    } finally {
      setSaving(false);
    }
    Alert.alert(
      'Thank you! 🎉',
      "We've noted your payment. Once we confirm it, your bracelet ships out.",
      [{
        text: 'OK',
        onPress: () => {
          if (withCertificate) navigation.replace('Certificate');
          else navigation.navigate('Main', { screen: 'Home' });
        },
      }]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Ship your bracelet" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.amount}>{SHIP_AMOUNT}</Text>
        <Text style={s.amountSub}>shipping &amp; handling</Text>
        <Text style={s.intro}>
          Send exactly {SHIP_AMOUNT} with one of the options below, and put your name in the
          note so we can match your payment. Then tap “I’ve sent it.”
        </Text>

        {DONATIONS.map((d) => {
          const isCopied = copiedId === d.id;
          const isSel = selected === d.id;
          return (
            <Card
              key={d.id}
              style={[s.mb, { borderColor: d.color + '55' }, isSel && { borderColor: d.color, borderWidth: 2 }]}
            >
              <View style={s.row}>
                <View style={[s.icon, { backgroundColor: d.color + '22' }]}>
                  <Text style={{ fontSize: 22 }}>{d.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{d.label}</Text>
                  <Text style={s.value}>{d.value}</Text>
                </View>
              </View>
              <Btn
                label={isCopied ? 'Copied! ✓' : (d.action === 'copy' ? 'Copy Zelle address' : `Open ${d.label}`)}
                onPress={() => handlePay(d)}
                style={{ backgroundColor: isCopied ? '#1E8E54' : d.color, borderWidth: 0 }}
              />
            </Card>
          );
        })}

        <Btn
          label={saving ? 'Saving…' : "✓ I've sent the $6.95"}
          onPress={handleSent}
          loading={saving}
          style={{ marginTop: 8 }}
        />
        <Text style={s.note}>
          Your bracelet ships once we confirm the payment. Questions? info@30actsofkindness.org
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  amount: { color: C.text, fontSize: 44, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  amountSub: { color: C.sub, fontSize: 14, textAlign: 'center', marginBottom: 14 },
  intro: { color: C.sub, fontSize: 14.5, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  mb: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  label: { color: C.text, fontWeight: '800', fontSize: 17 },
  value: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  note: { color: C.muted, fontSize: 12.5, textAlign: 'center', marginTop: 14, lineHeight: 18 },
});
