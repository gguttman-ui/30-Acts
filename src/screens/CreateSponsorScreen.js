import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, FlatList, Share, Platform, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { extractPhone } from '../lib/streak';
import { generateInviteLink } from '../lib/branch';
import { isContentBlocked, BLOCKED_MESSAGE } from '../lib/moderation';

const GROUP_TYPES = ['Local', 'Place of Worship', 'Business'];
const GROUP_LENGTHS = [
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

export default function CreateSponsorScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState(GROUP_TYPES[0]);
  const [lengthDays, setLengthDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  // The creator's phone (from the synthetic @phone.30acts.app email). Used to
  // stamp the invite link with ?ref=<phone> so everyone who joins through it is
  // attributed to this person's kindness tree — same as the personal invite.
  const [myPhone, setMyPhone] = useState(null);

  // After a successful create, hold onto the new row so we can show
  // the post-creation success screen (QR code + share button).
  const [created, setCreated] = useState(null);
  const [isExisting, setIsExisting] = useState(false);

  // Off-screen branded card (QR + instructions) captured to an image so the
  // invite the user sends carries the QR code, not just a link.
  const qrCardRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      setMyPhone(extractPhone(user.email));

      // One group per creator: if this person already created a group, jump
      // straight to its invite screen so "Create a Group" becomes "add more
      // people to your existing group" instead of making another.
      const { data: mine } = await supabase
        .from('sponsors')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mine) {
        setIsExisting(true);
        setCreated(mine);
      }
      setLoading(false);
    })();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', 'Please enter a group name.');
      return;
    }
    setSubmitting(true);

    // The group name is shown to EVERY user who joins via the invite code, so
    // it is the one field of free text this app publishes to other people. It
    // must be moderated (Apple Guideline 1.2).
    if (await isContentBlocked(name)) {
      setSubmitting(false);
      Alert.alert('Name Not Allowed', BLOCKED_MESSAGE);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const inviteCode = generateInviteCode();

    const { data, error } = await supabase
      .from('sponsors')
      .insert({
        created_by: user.id,
        name: name.trim(),
        type,
        length_days: lengthDays,
        join_code: inviteCode,
        start_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    setSubmitting(false);

    if (error) {
      Alert.alert('Error creating group', error.message);
      return;
    }

    setCreated(data);
  };

  // The invite/referral link — a Branch link (airpa.app.link) carrying ref
  // (tree) + the group code, so a scan bounces to the App Store and, after
  // install, attributes the joiner to this user's tree and their group. Starts
  // as the website fallback, then upgrades to the Branch short link.
  const [groupInviteUrl, setGroupInviteUrl] = useState('https://30ActsofKindness.org');
  useEffect(() => {
    const code = created?.join_code;
    const fallback = myPhone
      ? `https://30ActsofKindness.org?ref=${encodeURIComponent(myPhone)}${code ? `&group=${encodeURIComponent(code)}` : ''}`
      : 'https://30ActsofKindness.org';
    setGroupInviteUrl(fallback);
    if (!myPhone) return;
    let alive = true;
    generateInviteLink({ phone: myPhone, group: code }).then((url) => {
      if (alive && url) setGroupInviteUrl(url);
    });
    return () => { alive = false; };
  }, [myPhone, created?.join_code]);

  const buildInviteMessage = () =>
    'Join my 30 Acts of Kindness™ group!\n\n' +
    "Here's how:\n" +
    '1. Scan the QR code, or tap the link below\n' +
    '2. Download the free 30 Acts of Kindness app\n' +
    '3. Sign up with your phone number\n' +
    `4. Tap "Join a Group" and enter code ${created?.join_code}\n\n` +
    "You'll be added to my kindness tree too 🌳\n\n" +
    groupInviteUrl;

  const handleInvite = async () => {
    if (!created) return;
    const message = buildInviteMessage();
    try {
      // Capture the off-screen branded card (QR + instructions) to a JPEG so
      // the shared invite includes the QR image. Two passes: the first capture
      // can race the off-screen layout on cold renders.
      let uri = null;
      if (qrCardRef.current) {
        try {
          await captureRef(qrCardRef, { format: 'jpg', quality: 0.92 });
          uri = await captureRef(qrCardRef, { format: 'jpg', quality: 0.92 });
        } catch (err) {
          console.warn('QR card capture failed:', err);
        }
      }

      if (uri) {
        const fileUri = uri.startsWith('file://') || uri.startsWith('ph://') ? uri : `file://${uri}`;
        // Keep the written instructions on the clipboard so the user can paste
        // them alongside the image on apps that don't accept both at once.
        try { await Clipboard.setStringAsync(message); } catch {}
        let Sharing = null;
        try { Sharing = require('expo-sharing'); } catch {}
        if (Sharing && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(fileUri, {
            UTI: 'public.jpeg',
            mimeType: 'image/jpeg',
            dialogTitle: 'Invite to your group',
          });
        } else {
          await Share.share(
            Platform.OS === 'ios' ? { url: fileUri } : { url: fileUri, message }
          );
        }
      } else {
        await Share.share({ message });
      }
    } catch (e) {
      if (e?.message !== 'User did not share') console.warn('Invite share error:', e.message);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  // Post-creation success screen — shows a QR code + step-by-step instructions
  // and lets the user open the iOS share sheet to invite contacts. No group
  // name or raw invite code on screen: the QR is the hero, like a social post.
  if (created) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>{isExisting ? 'Your Group' : '🎉 Group created!'}</Text>

        <View style={styles.qrCard}>
          <View style={styles.qrBox}>
            <QRCode value={groupInviteUrl} size={200} backgroundColor="#ffffff" color="#111111" />
          </View>
          <Text style={styles.scanLabel}>Scan to join my group</Text>
        </View>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How to invite people</Text>
          <Text style={styles.step}>1. Share this QR code (or the link)</Text>
          <Text style={styles.step}>2. They scan it and download the free app</Text>
          <Text style={styles.step}>3. They sign up with their phone number</Text>
          <Text style={styles.step}>4. They tap “Join a Group” to join yours 🌳</Text>
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

        {/* Off-screen branded card captured to an image for sharing. Kept inside
            the window (1px, clipped) so iOS composites and captures it; a fully
            off-screen view snapshots blank. */}
        <View style={styles.captureHost} pointerEvents="none">
          <View ref={qrCardRef} collapsable={false} style={styles.captureCard}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.captureLogo}
              resizeMode="contain"
            />
            <Text style={styles.captureBrand}>30 Acts of Kindness™</Text>
            <Text style={styles.captureHeadline}>Join my group!</Text>
            <View style={styles.captureQrBox}>
              <QRCode value={groupInviteUrl} size={320} backgroundColor="#ffffff" color="#111111" />
            </View>
            <Text style={styles.captureSteps}>
              Scan the code → get the free app → sign up → do one kind act a day 🌳
            </Text>
            <Text style={styles.captureHashtag}>#30ActsOfKindness</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // Convert types to {label, value} shape for the Dropdown
  const typeOptions = GROUP_TYPES.map(t => ({ label: t, value: t }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Create a New Group</Text>

      <Text style={styles.label}>Group Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Spring Kindness Drive"
      />

      <Text style={styles.label}>Group Type</Text>
      <Dropdown
        value={type}
        options={typeOptions}
        onChange={setType}
        placeholder="Select type"
      />

      <Text style={styles.label}>Group Length</Text>
      <Dropdown
        value={lengthDays}
        options={GROUP_LENGTHS}
        onChange={setLengthDays}
        placeholder="Select length"
      />

      <TouchableOpacity
        style={[styles.button, submitting && { opacity: 0.6 }]}
        onPress={handleCreate}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? 'Creating...' : 'Create Group'}
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

  // On-screen QR (the hero of the success screen)
  qrCard: {
    alignItems: 'center',
    marginBottom: 20,
  },
  qrBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2e7d32',
  },
  scanLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2e7d32',
    marginTop: 12,
  },

  // Step-by-step instructions card
  stepsCard: {
    backgroundColor: '#f5f9f5',
    borderRadius: 12,
    padding: 18,
    marginBottom: 8,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#333',
    marginBottom: 10,
  },
  step: {
    fontSize: 14,
    color: '#444',
    lineHeight: 24,
  },

  // Off-screen capture card (rendered to an image for sharing)
  captureHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
  captureCard: {
    width: 900,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 60,
  },
  captureLogo: { width: 120, height: 120, marginBottom: 12 },
  captureBrand: { fontSize: 40, fontWeight: '800', color: '#111', marginBottom: 6 },
  captureHeadline: { fontSize: 34, fontWeight: '700', color: '#2e7d32', marginBottom: 28 },
  captureQrBox: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#2e7d32',
  },
  captureSteps: {
    fontSize: 30,
    fontWeight: '700',
    color: '#2e7d32',
    textAlign: 'center',
    marginTop: 34,
    lineHeight: 42,
  },
  captureHashtag: { fontSize: 28, fontWeight: '700', color: '#111', marginTop: 18 },
});
