import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { AppInput, Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

// User-facing "Suggest an Act" form. Opened from the 💡 Suggest tab. Writes a
// lightweight suggestion (just a description) to public.act_suggestions with
// status 'pending'; admins review it on the Suggested Acts screen.
export default function SuggestActScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  const canSave = description.trim().length > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || null;
      const phone = email && email.endsWith('@phone.30acts.app')
        ? email.replace('@phone.30acts.app', '')
        : null;

      const { error } = await supabase.from('act_suggestions').insert({
        user_phone:  phone,
        user_email:  email,
        description: description.trim(),
        status:      'pending',
      });

      if (error) { Alert.alert('Could not submit', error.message); setSaving(false); return; }
      setSubmitted(true);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <View style={s.successWrap}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>💡</Text>
        <Text style={s.successTitle}>Thanks for the idea!</Text>
        <Text style={s.successMsg}>
          Your suggestion has been sent for review. If it's a great fit, we'll
          add it to the shared catalog.
        </Text>
        <Btn
          label="Suggest Another"
          variant="secondary"
          onPress={() => { setDescription(''); setSubmitted(false); }}
          style={{ marginTop: 22, minWidth: 200 }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Suggest an Act" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>💡</Text>
          <Text style={s.heroTitle}>Suggest an Act of Kindness</Text>
          <Text style={s.heroSub}>
            Have an idea for a kind act? Describe it below and we'll review it
            for the shared catalog.
          </Text>
        </View>

        <Card style={{ marginBottom: 14 }}>
          <AppInput
            label="Act Description *"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g., Leave an encouraging note for a coworker"
            autoCapitalize="sentences"
            multiline
          />
        </Card>

        <Btn
          label="Submit Suggestion"
          onPress={handleSubmit}
          loading={saving}
          disabled={!canSave}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll:    { padding: 16, paddingBottom: 40 },
  hero:      { alignItems: 'center', marginBottom: 20 },
  heroTitle: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  heroSub:   { color: C.sub, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 18 },

  successWrap:  { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successTitle: { color: C.text, fontSize: 26, fontWeight: '900', marginBottom: 14, textAlign: 'center' },
  successMsg:   { color: C.sub, fontSize: 15, textAlign: 'center', lineHeight: 24 },
});
