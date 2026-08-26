import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Btn, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

// Shipping-address form for the bracelet. Saves into recognition_orders
// (bracelet_requested = true, plus certificate_requested when the user picked
// "Both"). Payment for the $6.95 comes in the next phase; this phase captures
// the address and records the request.
//
// NOTE: the input fields are inlined (not a sub-component defined in render) —
// defining a component inside the render function remounts each TextInput on
// every keystroke, which drops focus after one character.
export default function BraceletFormScreen({ navigation, route }) {
  const withCertificate = !!route?.params?.withCertificate;

  const [name, setName]       = useState('');
  const [street1, setStreet1] = useState('');
  const [street2, setStreet2] = useState('');
  const [city, setCity]       = useState('');
  const [state, setState]     = useState('');
  const [zip, setZip]         = useState('');
  const [saving, setSaving]   = useState(false);

  // Prefill everything we already know (name, city, state, ZIP) so the user
  // doesn't re-enter data collected at signup. ZIP/city/state live in the
  // account metadata; name lives on the profile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const meta = user.user_metadata || {};
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, state')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
        if (full) setName(full);
        // Prefer the profile's state, fall back to signup metadata.
        const st = profile?.state || meta.state;
        if (st) setState(st);
        if (meta.city) setCity(meta.city);
        if (meta.zip)  setZip(String(meta.zip));
      } catch (e) {
        // Non-fatal: user can type everything in.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const canSave =
    name.trim() && street1.trim() && city.trim() && state.trim() && zip.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const phone = extractPhone(user?.email);
      if (!user?.id || !phone) {
        Alert.alert('Error', 'Could not identify your account. Please log out and back in.');
        return;
      }

      const payload = {
        user_phone:  phone,
        user_id:     user.id,
        bracelet_requested: true,
        ship_name:    name.trim(),
        ship_street1: street1.trim(),
        ship_street2: street2.trim() || null,
        ship_city:    city.trim(),
        ship_state:   state.trim(),
        ship_zip:     zip.trim(),
        ship_country: 'US',
      };
      if (withCertificate) {
        payload.certificate_requested = true;
        payload.certificate_delivery  = 'in_app';
      }

      const { error } = await supabase
        .from('recognition_orders')
        .upsert(payload, { onConflict: 'user_phone' });

      if (error) {
        Alert.alert('Could not save', error.message);
        return;
      }

      // Address saved — on to the $6.95 shipping payment.
      navigation.navigate('BraceletPayment', { withCertificate });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Where should we send it?" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.intro}>
            Your kindness bracelet ships for just $6.95. Enter your mailing address below.
          </Text>

          <Text style={s.label}>Full name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName}
            placeholder="Jane Doe" placeholderTextColor={C.muted} autoCapitalize="words" />

          <Text style={s.label}>Street address</Text>
          <TextInput style={s.input} value={street1} onChangeText={setStreet1}
            placeholder="123 Main St" placeholderTextColor={C.muted} />

          <Text style={s.label}>Apt / Suite (optional)</Text>
          <TextInput style={s.input} value={street2} onChangeText={setStreet2}
            placeholder="Apt 4B" placeholderTextColor={C.muted} />

          <Text style={s.label}>City</Text>
          <TextInput style={s.input} value={city} onChangeText={setCity}
            placeholder="Springfield" placeholderTextColor={C.muted} autoCapitalize="words" />

          <Text style={s.label}>State</Text>
          <TextInput style={s.input} value={state} onChangeText={setState}
            placeholder="IL" placeholderTextColor={C.muted} autoCapitalize="characters" maxLength={20} />

          <Text style={s.label}>ZIP / Postal code</Text>
          <TextInput style={s.input} value={zip} onChangeText={setZip}
            placeholder="62704" placeholderTextColor={C.muted}
            keyboardType="numbers-and-punctuation" maxLength={12} />

          <Btn
            label={saving ? 'Saving…' : 'Save address'}
            onPress={handleSave}
            loading={saving}
            disabled={!canSave || saving}
            style={{ marginTop: 12 }}
          />

          <Text style={s.privacy}>
            We use your address only to mail your bracelet, and delete it once it ships.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  intro: { color: C.sub, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  label: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: C.card2 || C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 16,
    marginBottom: 10,
  },
  privacy: {
    color: C.muted, fontSize: 12.5, textAlign: 'center',
    marginTop: 16, lineHeight: 18,
  },
});
