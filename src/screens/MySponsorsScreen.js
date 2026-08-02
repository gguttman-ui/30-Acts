import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Btn, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

export default function MySponsorsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState([]);
  const [joined,  setJoined]  = useState([]);

  const loadChallenges = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Challenges this user created
      const { data: createdRows, error: createdErr } = await supabase
        .from('sponsors')
        .select('id, name, type, length_days, join_code, start_date, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (createdErr) console.warn('Created challenges error:', createdErr.message);
      setCreated(createdRows || []);

      // Challenges this user has joined (excluding ones they created — those go in Created)
      const { data: participantRows, error: partErr } = await supabase
        .from('sponsor_members')
        .select('sponsor_id, joined_at, sponsors(id, name, type, length_days, join_code, start_date, created_by)')
        .eq('user_id', user.id);

      if (partErr) console.warn('Participant challenges error:', partErr.message);
      const joinedFiltered = (participantRows || [])
        .map(r => ({ ...r.sponsors, joined_at: r.joined_at }))
        .filter(c => c && c.created_by !== user.id);
      setJoined(joinedFiltered);
    } catch (e) {
      console.warn('Load challenges failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadChallenges(); }, [loadChallenges]));

const confirmDelete = (challenge) => {
        Alert.alert(
      'Delete group?',
      `Delete "${challenge.name}"? Participants will lose access. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => doDelete(challenge) },
      ]
    );
  };

  const doDelete = async (challenge) => {
    try {
      // Remove participants first (FK dependency)
      const { error: partErr } = await supabase
        .from('sponsor_members')
        .delete()
        .eq('sponsor_id', challenge.id);
      if (partErr) { Alert.alert('Could not delete', partErr.message); return; }

      const { error: chErr } = await supabase
        .from('sponsors')
        .delete()
        .eq('id', challenge.id);
      if (chErr) { Alert.alert('Could not delete', chErr.message); return; }

      setCreated(prev => prev.filter(c => c.id !== challenge.id));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const confirmLeave = (challenge) => {
    Alert.alert(
      'Leave group?',
      `Leave "${challenge.name}"? Your completed acts stay in your record. You can rejoin later with the invite code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => doLeave(challenge) },
      ]
    );
  };

  const doLeave = async (challenge) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('sponsor_members')
        .delete()
        .eq('sponsor_id', challenge.id)
        .eq('user_id', user.id);
      if (error) { Alert.alert('Could not leave', error.message); return; }
      setJoined(prev => prev.filter(c => c.id !== challenge.id));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="My Groups" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.scroll}>
        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            <Text style={s.sectionLabel}>GROUPS I CREATED</Text>
            {created.length === 0 ? (
              <Text style={s.empty}>You haven't created any groups yet.</Text>
            ) : (
              created.map(c => (
                <View key={c.id} style={s.card}>
                  <Text style={s.cardName}>{c.name}</Text>
                  <View style={s.metaRow}>
                    <Text style={s.metaText}>{c.type} · {c.length_days} days · {c.join_code}</Text>
                  </View>
                  <Text style={s.metaSub}>Started {c.start_date}</Text>
                  <Btn
                    label="Delete Group"
                    variant="danger"
                    onPress={() => confirmDelete(c)}
                    style={{ marginTop: 12 }}
                  />
                </View>
              ))
            )}

            <Text style={[s.sectionLabel, { marginTop: 30 }]}>GROUPS I JOINED</Text>
            {joined.length === 0 ? (
              <Text style={s.empty}>You haven't joined any groups yet.</Text>
            ) : (
              joined.map(c => (
                <View key={c.id} style={s.card}>
                  <Text style={s.cardName}>{c.name}</Text>
                  <View style={s.metaRow}>
                    <Text style={s.metaText}>{c.type} · {c.length_days} days · {c.join_code}</Text>
                  </View>
                  <Text style={s.metaSub}>Started {c.start_date}</Text>
                  <Btn
                    label="Leave Group"
                    variant="secondary"
                    onPress={() => confirmLeave(c)}
                    style={{ marginTop: 12 }}
                  />
                </View>
              ))
            )}

            <View style={s.createWrap}>
              <Btn
                label="+ Create a New Group"
                onPress={() => navigation.navigate('CreateSponsor')}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },

  sectionLabel: {
    color: C.primary,
    fontSize: 11, fontWeight: '900',
    letterSpacing: 1, marginBottom: 12,
  },
  empty: { color: C.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 8 },

  card: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardName:  { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap' },
  metaText:  { color: C.sub, fontSize: 12, fontWeight: '600' },
  metaSub:   { color: C.muted, fontSize: 11, marginTop: 4 },

  createWrap: { marginTop: 24 },
});