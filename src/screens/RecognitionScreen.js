import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

// Login is phone-based: the synthetic email <+E.164>@phone.30acts.app carries
// the phone. Same helper other screens use.
// Backlog 94: while a child profile is selected on Home, the order belongs to
// the child's member key (one row per phone OR child key), so it never
// changes the parent's own order.
import { actingPhone } from '../lib/actingAs';
import { useActingMember } from '../components/ProfileSwitcher';
const extractPhone = (email) => actingPhone(email);

// After the Day-30 celebration, the user chooses how they want their
// recognition as a Certified Kind Person: a mailed bracelet, a shareable
// certificate (with their personal invite QR), or both. Each choice is stored
// in the recognition_orders table (one row per person, upserted on phone).
export default function RecognitionScreen({ navigation }) {
  const [saving, setSaving] = useState(false);
  // Backlog 94: wording for a child's Day 30 - no sharing for children, and
  // the bracelet is mailed to the parent.
  const child = useActingMember();
  const kid = child?.first_name;

  const goBracelet = (withCertificate) => {
    navigation.navigate('BraceletForm', { withCertificate });
  };

  const chooseCertificateOnly = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const phone = extractPhone(user?.email);
      if (!user?.id || !phone) {
        Alert.alert('Error', 'Could not identify your account. Please log out and back in.');
        return;
      }
      const { error } = await supabase
        .from('recognition_orders')
        .upsert(
          {
            user_phone: phone,
            user_id: user.id,
            certificate_requested: true,
            certificate_delivery: 'in_app',
          },
          { onConflict: 'user_phone' }
        );
      if (error) {
        Alert.alert('Could not save', error.message);
        return;
      }
      navigation.navigate('Certificate');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Your Recognition" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.emoji}>🏆</Text>
        <Text style={s.title}>{kid ? `${kid} is a Certified Kind Person!` : "You're a Certified Kind Person!"}</Text>
        <Text style={s.sub}>
          {kid ? `Choose how ${kid} would like to receive their recognition.` : "Choose how you'd like to receive your recognition."}
        </Text>

        <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => goBracelet(false)} disabled={saving}>
          <Text style={s.cardEmoji}>📿</Text>
          <Text style={s.cardTitle}>{kid ? `A bracelet for ${kid}` : 'Send me a bracelet'}</Text>
          <Text style={s.cardBody}>
            {kid
              ? `A kindness bracelet for ${kid}, mailed to you. Just covers $6.95 shipping & handling.`
              : 'A kindness bracelet mailed to you. Just covers $6.95 shipping & handling.'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={chooseCertificateOnly} disabled={saving}>
          <Text style={s.cardEmoji}>📜</Text>
          <Text style={s.cardTitle}>{kid ? `A certificate for ${kid}` : 'Send me a certificate'}</Text>
          <Text style={s.cardBody}>
            {kid
              ? `A printable "Certified Kind Person" certificate in ${kid}'s name, with a QR code - anyone who scans it and joins is added to your tree. Free.`
              : 'A shareable "Certified Kind Person" certificate with your own QR code — anyone who scans it and joins is added to your tree. Free.'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => goBracelet(true)} disabled={saving}>
          <Text style={s.cardEmoji}>✨</Text>
          <Text style={s.cardTitle}>Both</Text>
          <Text style={s.cardBody}>The bracelet and the certificate.</Text>
        </TouchableOpacity>

        {saving && <ActivityIndicator style={{ marginTop: 18 }} color={C.primary} />}

        <Text style={s.footnote}>
          {kid
            ? `${kid} earned this by completing 30 back-to-back days of kindness. 💚`
            : 'You earned this by completing 30 back-to-back days of kindness. 💚'}
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  emoji: { fontSize: 56, textAlign: 'center', marginTop: 8, marginBottom: 8 },
  title: {
    color: C.text, fontSize: 24, fontWeight: '900',
    textAlign: 'center', letterSpacing: -0.5, marginBottom: 8,
  },
  sub: {
    color: C.sub, fontSize: 15, textAlign: 'center',
    lineHeight: 22, marginBottom: 22,
  },
  card: {
    backgroundColor: C.card2 || C.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.primary + '33',
    padding: 18,
    marginBottom: 14,
  },
  cardEmoji: { fontSize: 34, marginBottom: 8 },
  cardTitle: { color: C.text, fontSize: 19, fontWeight: '800', marginBottom: 6 },
  cardBody: { color: C.sub, fontSize: 14, lineHeight: 21 },
  footnote: {
    color: C.muted, fontSize: 13, textAlign: 'center',
    marginTop: 14, lineHeight: 20,
  },
});
