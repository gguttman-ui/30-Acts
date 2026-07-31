import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, FlatList, Share,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { extractPhone } from '../lib/streak';
import { isContentBlocked, BLOCKED_MESSAGE } from '../lib/moderation';

const CHALLENGE_TYPES = ['Local', 'Place of Worship', 'Business'];
const CHALLENGE_LENGTHS = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KIND-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Reusable simple dropdown
function Dropdown({ value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  return (
    <>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={styles.dropdownText}>{selectedLabel}</Text>
        <Text style={styles.dropdownArrow}>▼</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.modalContent}>
            <FlatList
              data={options}
              keyExtractor={item => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    item.value === value && styles.modalItemSelected,
                  ]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function CreateChallengeAdminScreen({ navigation }) {
  const [isSponsor, setIsSponsor] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState(CHALLENGE_TYPES[0]);
  const [lengthDays, setLengthDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  // After a successful create, hold onto the new row so we can show
  // the post-creation success screen (invite code + share button).
  const [created, setCreated] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsSponsor(false);
        return;
      }
      const phone = extractPhone(user.email);
      const { data, error } = await supabase
        .from('sponsor_admins')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      setIsSponsor(!error && !!data);
    })();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Please enter a challenge name.');
      return;
    }
    setSubmitting(true);

    // The challenge name is shown to EVERY user who joins via the invite
    // code, so it is the one field of free text this app publishes to other
    // people. It must be moderated (Apple Guideline 1.2).
    if (await isContentBlocked(name)) {
      setSubmitting(false);
      Alert.alert('Name Not Allowed', BLOCKED_MESSAGE);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const inviteCode = generateInviteCode();

    const { data, error } = await supabase
      .from('challenges')
      .insert({
        created_by: user.id,
        name: name.trim(),
        type,
        length_days: lengthDays,
        invite_code: inviteCode,
        start_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    setSubmitting(false);

    if (error) {
      Alert.alert('Error creating challenge', error.message);
      return;
    }

setCreated(data);
  };

  // Live App Store listing (works once the app is public).
  const APP_STORE_URL = 'https://apps.apple.com/app/id6762151038';

  const handleInvite = async () => {
    if (!created) return;
    const message =
      `Hey, I'm running a 30 Acts of Kindness™ challenge called "${created.name}". ` +
      `Join me using code ${created.invite_code}. ` +
      `Download: ${APP_STORE_URL}`;
    try {
      await Share.share({ message });
    } catch (e) {
      console.warn('Invite share error:', e.message);
    }
  };

  if (isSponsor === null) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }
// Post-creation success screen — shows the invite code and lets the
  // user open the iOS share sheet to invite contacts via Messages/Mail/etc.
  if (created) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>🎉 Challenge created!</Text>
        <Text style={styles.successName}>{created.name}</Text>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>INVITE CODE</Text>
          <Text style={styles.codeValue}>{created.invite_code}</Text>
          <Text style={styles.codeHint}>
            Share this code with friends so they can join your challenge.
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleInvite}>
          <Text style={styles.buttonText}>📲 Invite Friends</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }// Post-creation success screen — shows the invite code and lets the
  // user open the iOS share sheet to invite contacts via Messages/Mail/etc.
  if (created) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>🎉 Challenge created!</Text>
        <Text style={styles.successName}>{created.name}</Text>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>INVITE CODE</Text>
          <Text style={styles.codeValue}>{created.invite_code}</Text>
          <Text style={styles.codeHint}>
            Share this code with friends so they can join your challenge.
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleInvite}>
          <Text style={styles.buttonText}>📲 Invite Friends</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Convert types to {label, value} shape for the Dropdown
  const typeOptions = CHALLENGE_TYPES.map(t => ({ label: t, value: t }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Create a Challenge</Text>

      <Text style={styles.label}>Challenge Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Spring Kindness Drive"
      />

      <Text style={styles.label}>Challenge Type</Text>
      <Dropdown
        value={type}
        options={typeOptions}
        onChange={setType}
        placeholder="Select type"
      />

      <Text style={styles.label}>Challenge Length</Text>
      <Dropdown
        value={lengthDays}
        options={CHALLENGE_LENGTHS}
        onChange={setLengthDays}
        placeholder="Select length"
      />

      <TouchableOpacity
        style={[styles.button, submitting && { opacity: 0.6 }]}
        onPress={handleCreate}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? 'Creating...' : 'Create Challenge'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  denied: { fontSize: 16, color: '#666', textAlign: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 16,
  },
  dropdown: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  dropdownText: { fontSize: 16, color: '#333' },
  dropdownArrow: { fontSize: 12, color: '#666' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: 12,
    width: '100%', maxHeight: 300,
    overflow: 'hidden',
  },
  modalItem: {
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalItemSelected: { backgroundColor: '#e8f5e9' },
  modalItemText: { fontSize: 16, color: '#333' },
  button: {
    backgroundColor: '#2e7d32', padding: 16, borderRadius: 8,
    marginTop: 24, alignItems: 'center',
  },
 buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#2e7d32',
    marginTop: 10,
  },
  buttonTextSecondary: { color: '#2e7d32' },

  successName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 20,
  },
  codeCard: {
    backgroundColor: '#f5f9f5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2e7d32',
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#666',
  },
  codeValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2e7d32',
    letterSpacing: 2,
    marginVertical: 12,
  },
  codeHint: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },

  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#2e7d32',
    marginTop: 10,
  },
  buttonTextSecondary: { color: '#2e7d32' },

  successName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 20,
  },
  codeCard: {
    backgroundColor: '#f5f9f5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2e7d32',
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#666',
  },
  codeValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2e7d32',
    letterSpacing: 2,
    marginVertical: 12,
  },
  codeHint: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
});