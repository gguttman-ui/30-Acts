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
// "Both"). Payment for the $4.95 comes in the next phase; this phase captures
// the address and records the request.
export default function BraceletFormScreen({ navigation, route }) {
  const withCertificate = !!route?.params?.withCertificate;

  const [name, setName]       = useState('');
  const [street1, setStreet1] = useState('');
  const [street2, setStreet2] = useState('');
  const [city, setCity]       = useState('');
  const [state, setState]     = useState('');
  const [zip, setZip]         = useState('');
  const [saving, setSaving]   = useState(false);

  // Prefill the name from the profile as a convenience.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, state')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled || !profile) return;
        const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
        if (full) setName(full);
        if (profile.state) setState(profile.state);
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
      // When the user chose "Both", also flag the certificate on the same row.
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

      Alert.alert(
        'Address saved ✓',
        withCertificate
          ? "Got it — we have your shipping details and your certificate is noted. Next you'll cover the $4.95 shipping; we'll add that step shortly."
          : "Got it — we have your shipping details. Next you'll cover the $4.95 shipping; we'll add that step shortly.",
        [{ text: 'OK', onPress: () => navigation.navigate('Main', { screen: 'Home' }) }]
      );
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, value, onChangeText, placeholder, ...rest }) => (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        {...rest}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Where should we send it?" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.intro}>
            Your kindness bracelet ships for just $4.95. Enter your mailing address below.
          </Text>

          <Field label="Full name"        value={name}    onChangeText={setName}    placeholder="Jane Doe" autoCapitalize="words" />
          <Field label="Street address"   value={street1} onChangeText={setStreet1} placeholder="123 Main St" />
          <Field label="Apt / Suite (optional)" value={street2} onChangeText={setStreet2} placeholder="Apt 4B" />
          <Field label="City"             value={city}    onChangeText={setCity}    placeholder="Springfield" autoCapitalize="words" />
          <Field label="State"            value={state}   onChangeText={setState}   placeholder="IL" autoCapitalize="characters" maxLength={20} />
          <Field label="ZIP / Postal code" value={zip}    onChangeText={setZip}     placeholder="62704" keyboardType="numbers-and-punctuation" maxLength={12} />

          <Btn
            label={saving ? 'Saving…' : 'Save address'}
            onPress={handleSave}
            loading={saving}
            disabled={!canSave || saving}
            style={{ marginTop: 8 }}
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
  field: { marginBottom: 14 },
  fieldLabel: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: C.card2 || C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 16,
  },
  privacy: {
    color: C.muted, fontSize: 12.5, textAlign: 'center',
    marginTop: 16, lineHeight: 18,
  },
});
