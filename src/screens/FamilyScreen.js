// FamilyScreen -- backlog 94, children's profiles Stage 1 (1 Nov 2026).
//
// Settings > Family. A parent lists, adds and removes their children.
// Adding needs a first name, an age range and the consent box ticked.
// Removing is permanent: the database trigger family_members_erase_acts
// deletes every act filed under the child's member key.
//
// Adding a child needs a fresh text code to the parent's phone; the database
// enforces this too (policy "parent adds child after code check").
//
// Not in this change (next step): the profile switcher on Home that lets a
// child log their act.
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { AppInput, Btn, Card, ScreenHeader } from '../components';
import { Text } from '../components/scaledText';
import { C } from '../constants';
import { supabase } from '../lib/supabase';
import { extractPhone } from '../lib/streak';
import { cleanName } from '../lib/nameRules';
import {
  AGE_RANGES, MAX_CHILDREN, CHILD_NAME_MAX,
  FAMILY_CONSENT_TEXT, FAMILY_CONSENT_VERSION,
  childNameProblem, nextMemberKey,
  isCodeExempt, cleanCode, codeWasSent, codeApproved, DEMO_CODE, CODE_WINDOW_MINUTES,
} from '../lib/family';

export default function FamilyScreen({ navigation, user }) {
  const parentPhone = extractPhone(user?.email);

  const [children, setChildren] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);
  const [saving, setSaving]     = useState(false);

  const [name, setName]         = useState('');
  const [ageRange, setAgeRange] = useState(null);
  const [consent, setConsent]   = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('family_members')
      .select('id, first_name, age_range, member_key, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      Alert.alert('Could not load your family', error.message);
    } else {
      setChildren(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setName(''); setAgeRange(null); setConsent(false); setAdding(false);
    setCodeSent(false); setCode('');
  };

  // Step 1: check the form, then text a code to the parent's phone.
  const handleSendCode = async () => {
    const problem = childNameProblem(name);
    if (problem) return Alert.alert('First name needed', problem);
    if (!ageRange) return Alert.alert('Age range needed', 'Please choose an age range.');
    if (!consent) return Alert.alert('Permission needed', 'Please tick the box to give your permission.');
    if (!nextMemberKey(parentPhone, children.map((c) => c.member_key))) {
      return Alert.alert('Family is full', `You can add up to ${MAX_CHILDREN} children.`);
    }

    // Test accounts never receive real texts; they use the demo code.
    if (isCodeExempt(parentPhone)) { setCodeSent(true); return; }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('send_phone_otp', { phone_number: parentPhone });
      if (error || !codeWasSent(data)) throw new Error('Could not send the code. Please try again.');
      setCode('');
      setCodeSent(true);
    } catch (e) {
      Alert.alert('Could not send the code', e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  // Step 2: check the code, then save the child.
  const handleConfirmCode = async () => {
    if (code.length !== 6) return Alert.alert('Code needed', 'Enter the 6-digit code we texted you.');

    setSaving(true);
    try {
      if (isCodeExempt(parentPhone)) {
        if (code !== DEMO_CODE) throw new Error('That code is not right. Please try again.');
      } else {
        const { data, error } = await supabase.rpc('verify_phone_otp', { phone_number: parentPhone, code });
        if (error) throw new Error('Could not check the code. Please try again.');
        if (!codeApproved(data)) throw new Error('That code is not right. Please try again.');
      }

      const memberKey = nextMemberKey(parentPhone, children.map((c) => c.member_key));
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('You are signed out. Please sign in again.');
      const { error } = await supabase.from('family_members').insert({
        parent_id:       authUser.id,
        first_name:      cleanName(name),
        age_range:       ageRange,
        member_key:      memberKey,
        consent_version: FAMILY_CONSENT_VERSION,
      });
      if (error) {
        // 42501 = refused by the database rule: the code check is too old.
        if (error.code === '42501') {
          setCodeSent(false); setCode('');
          throw new Error(`The code check has expired (${CODE_WINDOW_MINUTES} minutes). Please tap Send code again.`);
        }
        throw error;
      }
      resetForm();
      await load();
    } catch (e) {
      Alert.alert('Could not add your child', e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (child) => {
    Alert.alert(
      `Remove ${child.first_name}?`,
      `This permanently erases ${child.first_name}'s profile and all of their acts. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove forever', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('family_members').delete().eq('id', child.id);
            if (error) return Alert.alert('Could not remove', error.message);
            await load();
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Family" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <Card style={s.mb}>
          <Text style={s.cardTitle}>Your children</Text>
          <Text style={s.cardSub}>
            Children take part under your account, on your phone or a home tablet.
            They don't need a phone number, and they never sign in on their own.
          </Text>

          {loading ? (
            <ActivityIndicator color={C.primaryText} />
          ) : children.length === 0 ? (
            <Text style={s.empty}>No children added yet.</Text>
          ) : (
            children.map((c) => (
              <View key={c.id} style={s.childRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.childName}>{c.first_name}</Text>
                  <Text style={s.childAge}>Age {c.age_range}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemove(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.remove}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </Card>

        {!adding ? (
          <Btn
            label="+ Add a child"
            onPress={() => setAdding(true)}
            disabled={loading || children.length >= MAX_CHILDREN}
          />
        ) : (
          <Card style={s.mb}>
            <Text style={s.cardTitle}>Add a child</Text>

            <AppInput
              label="CHILD'S FIRST NAME"
              value={name}
              onChangeText={setName}
              placeholder="First name only"
              maxLength={CHILD_NAME_MAX}
              autoCapitalize="words"
            />

            <Text style={s.label}>AGE RANGE</Text>
            <View style={s.chips}>
              {AGE_RANGES.map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setAgeRange(r)}
                  style={[s.chip, ageRange === r && s.chipOn]}
                >
                  <Text style={[s.chipText, ageRange === r && s.chipTextOn]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={s.consentRow} onPress={() => setConsent(!consent)} activeOpacity={0.7}>
              <View style={[s.box, consent && s.boxOn]}>
                {consent && <Text style={s.tick}>✓</Text>}
              </View>
              <Text style={s.consentText}>{FAMILY_CONSENT_TEXT}</Text>
            </TouchableOpacity>

            {!codeSent ? (
              <>
                <Text style={s.codeNote}>
                  To confirm it's you, we'll text a 6-digit code to your phone.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn label="Cancel" variant="secondary" onPress={resetForm} style={{ flex: 1 }} />
                  <Btn label="Send code" onPress={handleSendCode} loading={saving} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <>
                <AppInput
                  label="CODE FROM YOUR TEXTS"
                  value={code}
                  onChangeText={(t) => setCode(cleanCode(t))}
                  placeholder="6-digit code"
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn label="Cancel" variant="secondary" onPress={resetForm} style={{ flex: 1 }} />
                  <Btn label="Add child" onPress={handleConfirmCode} loading={saving} style={{ flex: 1 }} />
                </View>
                <TouchableOpacity onPress={handleSendCode} disabled={saving} style={{ alignItems: 'center', marginTop: 12 }}>
                  <Text style={s.resend}>Send a new code</Text>
                </TouchableOpacity>
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll:    { padding: 16, paddingBottom: 40 },
  mb:        { marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  cardSub:   { color: C.sub, fontSize: 13, marginBottom: 14, lineHeight: 18 },
  empty:     { color: C.muted, fontSize: 13, fontStyle: 'italic' },
  childRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  childName: { color: C.text, fontSize: 15, fontWeight: '700' },
  childAge:  { color: C.sub, fontSize: 12, marginTop: 2 },
  remove:    { color: C.error, fontSize: 13, fontWeight: '700' },
  label:     { color: C.primaryText, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  chips:     { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border,
  },
  chipOn:     { borderColor: C.primary, backgroundColor: C.primary + '22' },
  chipText:   { color: C.sub, fontSize: 14, fontWeight: '700' },
  chipTextOn: { color: C.primaryText },
  consentRow: { flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'flex-start' },
  box: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: C.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxOn:       { backgroundColor: C.primary },
  tick:        { color: C.onPrimary, fontSize: 14, fontWeight: '900' },
  consentText: { color: C.sub, fontSize: 12, lineHeight: 17, flex: 1 },
  codeNote:    { color: C.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  resend:      { color: C.primaryText, fontSize: 13, fontWeight: '700' },
});
