import React, { useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

const TREE_SAPLING = require('../assets/tree/tree-sapling.png');
const TREE_YOUNG   = require('../assets/tree/tree-young.png');
const TREE_FULL    = require('../assets/tree/tree-full.png');

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

const treeForCount = (count) => {
  if (count <= 10) return TREE_SAPLING;
  if (count <= 20) return TREE_YOUNG;
  return TREE_FULL;
};

const stageLabel = (count) => {
  if (count <= 10) return 'Sapling';
  if (count <= 20) return 'Young Tree';
  return 'Mature Tree';
};

export default function TreeScreen({ user }) {
  const [loading, setLoading]     = useState(true);
  const [myActs, setMyActs]               = useState(0);
  const [totalActs, setTotalActs]         = useState(0);
  const [peopleUnderMe, setPeopleUnderMe] = useState(0);
  const [totalMin, setTotalMin]   = useState(0);
  const [totalCents, setTotalCts] = useState(0);

  // Refetch stats every time the user navigates to this tab.
  // This keeps the tree image and stats live with new completions.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const phone = extractPhone(user?.email);
          if (!phone) { if (!cancelled) setLoading(false); return; }

          const { data: { user: authUser } } = await supabase.auth.getUser();
          const myUserId = authUser?.id || null;

          // --- My Acts: acts I personally performed. This drives the tree. ---
          const { data: mine, error } = await supabase
            .from('completions')
            .select('id')
            .eq('user_phone', phone);
          if (error) throw error;
          const myActCount = (mine || []).length;

          // --- People under me = people I referred UNION members of any
          // challenge I created, de-duplicated by phone (completions are keyed
          // by user_phone, so phone is the shared identity). ---
          const underPhones = new Set();

          // Referral downline: profiles.referred_by = my phone.
          const { data: refRows } = await supabase
            .from('profiles')
            .select('phone')
            .eq('referred_by', phone);
          (refRows || []).forEach(r => { if (r.phone) underPhones.add(r.phone); });

          // Members of challenges I created: participant user_ids -> phones.
          if (myUserId) {
            const { data: myCh } = await supabase
              .from('challenges')
              .select('id')
              .eq('created_by', myUserId);
            const chIds = (myCh || []).map(c => c.id);
            if (chIds.length) {
              const { data: parts } = await supabase
                .from('challenge_participants')
                .select('user_id')
                .in('challenge_id', chIds);
              const memberIds = [...new Set((parts || []).map(p => p.user_id).filter(Boolean))];
              if (memberIds.length) {
                const { data: memberProfiles } = await supabase
                  .from('profiles')
                  .select('phone')
                  .in('id', memberIds);
                (memberProfiles || []).forEach(p => { if (p.phone) underPhones.add(p.phone); });
              }
            }
          }

          // Never count myself as being under me.
          underPhones.delete(phone);

          // --- Acts performed by everyone under me ---
          let underActCount = 0;
          if (underPhones.size) {
            const { data: theirs } = await supabase
              .from('completions')
              .select('id')
              .in('user_phone', [...underPhones]);
            underActCount = (theirs || []).length;
          }

          if (cancelled) return;

          setMyActs(myActCount);
          setTotalActs(myActCount + underActCount);   // my acts + acts by people under me
          setPeopleUnderMe(underPhones.size);
        } catch (e) {
          console.warn('Tree screen load failed:', e.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [user?.email])
  );

  const formatTime = (mins) => {
    if (mins < 60)  return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const rem   = mins % 60;
    return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
  };
  const formatCost = (cents) => `$${(cents / 100).toFixed(2)}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="My Tree" />
      <ScrollView contentContainerStyle={s.scroll}>
        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 100 }} />
        ) : (
          <>
            <View style={s.treeWrap}>
              <Image source={treeForCount(myActs)} style={s.tree} resizeMode="contain" />
            </View>

            <Text style={s.stageLabel}>{stageLabel(myActs).toUpperCase()}</Text>

            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={s.statValue}>{myActs}</Text>
                <Text style={s.statLabel}>My{'\n'}Acts</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statValue}>{totalActs}</Text>
                <Text style={s.statLabel}>Total{'\n'}Acts</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statValue}>{peopleUnderMe}</Text>
                <Text style={s.statLabel}>People{'\n'}Under Me</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, alignItems: 'center' },
  treeWrap: {
    width: '100%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  tree: { width: '100%', height: '100%' },
  stageLabel: {
    color: C.primary, fontSize: 12, fontWeight: '900',
    letterSpacing: 1.5, marginTop: -8, marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    width: '100%', paddingHorizontal: 8,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 6 },
  statLabel: {
    color: C.sub, fontSize: 11, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.4, lineHeight: 14,
  },
});