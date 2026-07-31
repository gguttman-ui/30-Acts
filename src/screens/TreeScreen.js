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
  const [actCount, setActCount]   = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [challengeCount, setChallengeCount] = useState(0);
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

          // My auth id — needed to find the challenges I created.
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const myUserId = authUser?.id || null;

          // My team = everyone who joined from my invite (profiles.referred_by = my phone).
          const { data: tree } = await supabase
            .from('profiles')
            .select('phone')
            .eq('referred_by', phone);
          const teamPhones = (tree || []).map(r => r.phone).filter(Boolean);

          // My own acts.
          const { data: mine, error } = await supabase
            .from('completions')
            .select('id')
            .eq('user_phone', phone);
          if (error) throw error;
          const myIds = new Set((mine || []).map(r => r.id));

          // My team's acts — every completion by someone I referred.
          let teamIds = new Set();
          if (teamPhones.length) {
            const { data: t } = await supabase
              .from('completions')
              .select('id')
              .in('user_phone', teamPhones);
            teamIds = new Set((t || []).map(r => r.id));
          }

          // My challenges' acts — completions tagged to any challenge I created.
          // completion_challenges can list one completion under several of my
          // challenges, so a Set collapses it to distinct acts.
          let challengeIds = new Set();
          if (myUserId) {
            const { data: myCh } = await supabase
              .from('challenges')
              .select('id')
              .eq('created_by', myUserId);
            const chIds = (myCh || []).map(c => c.id);
            if (chIds.length) {
              const { data: links } = await supabase
                .from('completion_challenges')
                .select('completion_id')
                .in('challenge_id', chIds);
              challengeIds = new Set((links || []).map(l => l.completion_id));
            }
          }

          if (cancelled) return;

          // "My Challenges" = acts by the people who joined my challenges
          // (my own acts inside my challenge are excluded so this reflects
          // the kindness my challenges inspired in others).
          let challengeMemberCount = 0;
          challengeIds.forEach(id => { if (!myIds.has(id)) challengeMemberCount++; });

          // "Acts of Kindness" headline = total distinct impact: my own acts +
          // my team's acts + my challenges' acts, de-duplicated so nobody who
          // is both a referral and a challenge member is counted twice.
          const union = new Set(myIds);
          teamIds.forEach(id => union.add(id));
          challengeIds.forEach(id => union.add(id));

          setActCount(union.size);
          setTeamCount(teamIds.size);
          setChallengeCount(challengeMemberCount);
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
              <Image source={treeForCount(actCount)} style={s.tree} resizeMode="contain" />
            </View>

            <Text style={s.stageLabel}>{stageLabel(actCount).toUpperCase()}</Text>

            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={s.statValue}>{actCount}</Text>
                <Text style={s.statLabel}>Acts of{'\n'}Kindness</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statValue}>{challengeCount}</Text>
                <Text style={s.statLabel}>My{'\n'}Challenges</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statValue}>{teamCount}</Text>
                <Text style={s.statLabel}>My Team's{'\n'}Acts</Text>
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