import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, InputAccessoryView, Keyboard, Alert, Switch,
} from 'react-native';
import { AppInput, Btn, ScreenHeader } from '../components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

const KB_DONE_ID = 'joinChallengeKbDone';

function normalizeInviteCode(raw) {
  if (!raw) return '';
  let code = raw.toUpperCase().replace(/\s+/g, '');
  code = code.replace(/-/g, '');
  if (code.startsWith('KIND')) code = code.slice(4);
  if (!code) return '';
  return `KIND-${code}`;
}

export default function JoinChallengeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [code,       setCode]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined,     setJoined]     = useState(null);

  // Two-step flow: after a successful lookup we set `pendingChallenge` and
  // show a confirmation card. For Local challenges that card includes a
  // "show my name to other participants" toggle. The actual insert
  // happens when the user taps Confirm.
  const [pendingChallenge, setPendingChallenge] = useState(null);
  const [showName,         setShowName]         = useState(true);

  // Step 1: look up the challenge but don't insert yet.
  const handleLookup = async () => {
    const normalized = normalizeInviteCode(code);
    if (!normalized || normalized.length < 6) {
      Alert.alert('Invalid code', 'Please enter the full invite code (e.g., KIND-AB12).');
      return;
    }

    setSubmitting(true);
    try {
      const { data: challenge, error: lookupErr } = await supabase
        .from('challenges')
        .select('id, name, type, length_days, start_date, invite_code')
        .eq('invite_code', normalized)
        .maybeSingle();

      if (lookupErr) {
        Alert.alert('Error', lookupErr.message);
        return;
      }
      if (!challenge) {
        Alert.alert('Not found', `No challenge found with code ${normalized}. Check the code and try again.`);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Could not identify your account. Please log out and back in.');
        return;
      }

      // Already a member? Skip the confirmation step.
      const { data: existing } = await supabase
        .from('challenge_participants')
        .select('challenge_id')
        .eq('challenge_id', challenge.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        setJoined({ challenge, alreadyMember: true });
        return;
      }

      // One challenge at a time: is the user already in a DIFFERENT challenge?
      // If so, joining this one MOVES them — past acts stay credited to the old
      // challenge, all future acts credit here. Surface it as a switch choice.
      const { data: others } = await supabase
        .from('challenge_participants')
        .select('challenge_id, challenges ( name )')
        .eq('user_id', user.id)
        .neq('challenge_id', challenge.id);
      const switchFrom = (others || []).map(o => ({
        id:   o.challenge_id,
        name: o.challenges?.name || 'your current challenge',
      }));

      // Local: default opt-in to TRUE but make the user see the toggle.
      // Non-Local (Worship/Business): show_name is forced to true.
      setShowName(true);
      setPendingChallenge({ challenge, user, switchFrom });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: actually insert the participant row.
  const handleConfirmJoin = async () => {
    if (!pendingChallenge) return;
    const { challenge, user, switchFrom } = pendingChallenge;
    const isLocal = challenge.type === 'Local';

    setSubmitting(true);
    try {
      // One challenge at a time: leave any current challenge(s) first so future
      // acts credit here. Past acts stay tagged to the old challenge (their
      // completion_challenges rows are never touched).
      if (switchFrom && switchFrom.length) {
        const { error: leaveErr } = await supabase
          .from('challenge_participants')
          .delete()
          .eq('user_id', user.id)
          .in('challenge_id', switchFrom.map(sf => sf.id));
        if (leaveErr) {
          Alert.alert('Could not switch', leaveErr.message);
          return;
        }
      }

      const { error: joinErr } = await supabase
        .from('challenge_participants')
        .insert({
          challenge_id: challenge.id,
          user_id:      user.id,
          show_name:    isLocal ? showName : true,
        });

      if (joinErr) {
        Alert.alert('Could not join', joinErr.message);
        return;
      }

      setPendingChallenge(null);
      setJoined({ challenge, alreadyMember: false });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Confirmation screen (after lookup, before insert) ────────────────
  if (pendingChallenge) {
    const c = pendingChallenge.challenge;
    const isLocal = c.type === 'Local';
    const switchFrom = pendingChallenge.switchFrom || [];
    const isSwitch = switchFrom.length > 0;
    const fromName = switchFrom[0]?.name || 'your current challenge';
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Confirm Join" onBack={() => setPendingChallenge(null)} />
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}>
          <View style={s.confirmCard}>
            <Text style={s.confirmTitle}>Joining this challenge:</Text>
            <Text style={s.joinedName}>{c.name}</Text>

            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Type</Text>
              <Text style={s.detailValue}>{c.type}</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Length</Text>
              <Text style={s.detailValue}>{c.length_days} days</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Started</Text>
              <Text style={s.detailValue}>{c.start_date}</Text>
            </View>

            {isSwitch && (
              <Text style={s.switchNotice}>
                You're currently in "{fromName}". You can be in only one challenge at a
                time. Moving here keeps your past acts credited to "{fromName}" — all
                future acts will count toward "{c.name}".
              </Text>
            )}

            {isLocal && (
              <View style={s.privacyBox}>
                <View style={s.privacyToggleRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={s.privacyTitle}>Show my name to other participants</Text>
                    <Text style={s.privacySub}>
                      This is a Local challenge — other community members may not know you.
                      Turn this off to appear as "Anonymous" on the leaderboard.
                    </Text>
                  </View>
                  <Switch
                    value={showName}
                    onValueChange={setShowName}
                    trackColor={{ false: C.border, true: C.primary + '88' }}
                    thumbColor={showName ? C.primary : '#f4f3f4'}
                  />
                </View>
              </View>
            )}
          </View>

          <Btn
            label={isSwitch ? 'Move to this challenge' : 'Confirm & Join'}
            onPress={handleConfirmJoin}
            loading={submitting}
            style={{ marginTop: 18 }}
          />
          <Btn
            label={isSwitch ? `Stay in ${fromName}` : 'Cancel'}
            variant="secondary"
            onPress={() => setPendingChallenge(null)}
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="Join a Challenge"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
        {joined ? (
          <View style={s.joinedBanner}>
            <Text style={s.joinedTitle}>
              {joined.alreadyMember ? '✓ Already joined' : '🎉 Joined!'}
            </Text>
            <Text style={s.joinedName}>{joined.challenge.name}</Text>

            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Type</Text>
              <Text style={s.detailValue}>{joined.challenge.type}</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Length</Text>
              <Text style={s.detailValue}>{joined.challenge.length_days} days</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Started</Text>
              <Text style={s.detailValue}>{joined.challenge.start_date}</Text>
            </View>

            {joined.alreadyMember && (
              <Text style={s.alreadyHint}>
                You were already part of this challenge. Your existing daily acts still count.
              </Text>
            )}

           <Btn
              label="See Details →"
              onPress={() => navigation.replace('ChallengeDetail', { challengeId: joined.challenge.id })}
              style={{ marginTop: 18 }}
            />
            <Btn
              label="Go to Today's Act"
              variant="secondary"
              onPress={() => navigation.navigate('Main', { screen: 'Challenge' })}
              style={{ marginTop: 8 }}
            />
            <Btn
              label="Join Another"
              variant="ghost"
              onPress={() => { setJoined(null); setCode(''); }}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : (
          <>
            <Text style={s.helper}>
              Got an invite code from a friend, employer, or community? Enter it
              below to join their challenge. You can be in one challenge at a time —
              if you're already in one, you'll choose whether to stay or move here.
            </Text>

            <AppInput
              label="Invite Code"
              value={code}
              onChangeText={setCode}
              placeholder="KIND-XXXX"
              autoCapitalize="characters"
              autoCorrect={false}
              inputAccessoryViewID={KB_DONE_ID}
            />

            <Text style={s.hint}>
              Case doesn't matter. You can leave out the dash if you like.
            </Text>

            <Btn
              label="Find Challenge"
              onPress={handleLookup}
              loading={submitting}
              disabled={!code.trim() || submitting}
              style={{ marginTop: 18 }}
            />
            <Btn
              label="Cancel"
              variant="secondary"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 8 }}
            />
          </>
        )}
      </ScrollView>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={KB_DONE_ID}>
          <View style={s.kbBar}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={s.kbDone}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 60 },
  helper: { color: C.sub, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  hint:   { color: C.muted, fontSize: 11, marginTop: 8, fontStyle: 'italic' },

  confirmCard: {
    backgroundColor: C.card2,
    borderColor: C.primary + '55',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
  },
  confirmTitle: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },

  joinedBanner: {
    backgroundColor: C.success + '22',
    borderColor: C.success,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    marginTop: 8,
  },
  joinedTitle: { color: C.success, fontSize: 15, fontWeight: '900', marginBottom: 6, letterSpacing: 0.5 },
  joinedName:  { color: C.text,    fontSize: 20, fontWeight: '800', marginBottom: 16 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border + '55',
  },
  detailLabel: { color: C.sub,  fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  detailValue: { color: C.text, fontSize: 14, fontWeight: '700' },
  alreadyHint: {
    color: C.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 12,
    lineHeight: 17,
  },
  switchNotice: {
    color: C.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 14,
  },

  privacyBox: {
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border,
  },
  privacyToggleRow: { flexDirection: 'row', alignItems: 'center' },
  privacyTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  privacySub:   { color: C.sub,  fontSize: 12, lineHeight: 17 },

  kbBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  kbDone: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
});