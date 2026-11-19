import React, { useState, useCallback } from 'react';
import { show, LABELS, NUMBER_PLACEHOLDER } from '../lib/myNumbers';
import { treeForCount, stageLabel } from '../lib/treeImage';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

export default function TreeScreen({ user }) {
  const [loading, setLoading]     = useState(true);
  // Fix 5 (19 Nov 2026): null until loaded -> "…", never 0. Same labels as
  // Today and Me (src/lib/myNumbers.js). "Acts by people you invited" is the
  // tree's acts WITHOUT your own (Total Acts used to mix yours in).
  const [myActs, setMyActs]               = useState(null);
  const [invitedActs, setInvitedActs]     = useState(null);
  const [peopleUnderMe, setPeopleUnderMe] = useState(null);
  const [totalMin, setTotalMin]   = useState(0);
  const [totalCents, setTotalCts] = useState(0);

  // Refetch stats every time the user navigates to this tab.
  // This keeps the tree image and stats live with new completions.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          // My Acts / Total Acts / People Under Me are computed server-side by
          // the get_tree_stats() SECURITY DEFINER function. This is required:
          // completions RLS is own-rows-only for non-admins, so the app itself
          // cannot read a downline member's acts. The function tallies them with
          // elevated permissions and returns only the three totals.
          const { data, error } = await supabase.rpc('get_tree_stats');
          if (error) throw error;
          if (cancelled) return;

          const mine  = data?.my_acts ?? null;
          const total = data?.total_acts ?? null;
          setMyActs(mine);
          setInvitedActs(mine != null && total != null ? Math.max(0, total - mine) : null);
          setPeopleUnderMe(data?.people_under_me ?? null);
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
        {/* No spinner: the layout shows at once with "…" in each number. */}
        {(
          <>
            <View style={s.treeWrap}>
              <Image source={treeForCount(myActs || 0)} style={s.tree} resizeMode="contain" />
            </View>

            <Text style={s.stageLabel}>{myActs == null ? NUMBER_PLACEHOLDER : stageLabel(myActs).toUpperCase()}</Text>

            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={s.statValue}>{show(myActs)}</Text>
                <Text style={s.statLabel}>{LABELS.lifetime}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statValue}>{show(invitedActs)}</Text>
                <Text style={s.statLabel}>{LABELS.invitedActs}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statValue}>{show(peopleUnderMe)}</Text>
                <Text style={s.statLabel}>{LABELS.invitedPeople}</Text>
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
    color: C.primaryText, fontSize: 12, fontWeight: '900',
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