import React, { useState, useCallback, useEffect } from 'react';
import { show, LABELS } from '../lib/myNumbers';
import KindnessTree from '../components/KindnessTree';
import { generateInviteLink } from '../lib/branch';
import { actDateLabel } from '../lib/searchActs';
import { FONT } from '../lib/fonts';
import { View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader, Btn } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

export default function TreeScreen({ user }) {
  // Fix 5: null until loaded -> "…", never 0.
  // Fix 9 (19 Nov 2026): the tree is drawn from real data (KindnessTree);
  // numbers are All-time acts / People you inspired / Acts on your tree.
  const [myActs, setMyActs]               = useState(null);
  const [treeActs, setTreeActs]           = useState(null);
  const [peopleUnderMe, setPeopleUnderMe] = useState(null);
  const [ownActs, setOwnActs]             = useState([]);   // oldest first
  const [branches, setBranches]           = useState([]);   // acts per person, most first
  const [picked, setPicked]               = useState(null); // { own: act } | { friend: true }
  const [inviteUrl, setInviteUrl]         = useState(null);
  // Gary 19 Nov: tap "People you inspired" -> everyone in your tree with their
  // act count (first name + last initial only; from get_tree_people()).
  const [peopleOpen, setPeopleOpen]       = useState(false);
  const [people, setPeople]               = useState(null);  // null = loading

  const openPeople = async () => {
    setPeopleOpen(true);
    setPeople(null);
    try {
      const { data, error } = await supabase.rpc('get_tree_people');
      if (error) throw error;
      setPeople(Array.isArray(data?.people) ? data.people : []);
    } catch (e) {
      console.warn('Tree people load failed:', e.message);
      setPeople([]);
    }
  };

  // Refetch every time the tab is opened, so a new act shows straight away.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        // Counts across your whole tree come from the server (completions RLS
        // only lets the app read your own rows). get_tree_stats() = totals;
        // get_tree_branches() = acts per person you inspired - counts only.
        try {
          const { data, error } = await supabase.rpc('get_tree_stats');
          if (error) throw error;
          if (!cancelled) {
            setMyActs(data?.my_acts ?? null);
            setTreeActs(data?.total_acts ?? null);
            setPeopleUnderMe(data?.people_under_me ?? null);
          }
        } catch (e) { console.warn('Tree stats load failed:', e.message); }
        try {
          const { data, error } = await supabase.rpc('get_tree_branches');
          if (error) throw error;
          if (!cancelled) setBranches(Array.isArray(data?.branches) ? data.branches : []);
        } catch (e) { console.warn('Tree branches load failed:', e.message); }
        try {
          const phone = extractPhone(user?.email);
          if (!phone) return;
          const { data, error } = await supabase
            .from('completions')
            .select('id, act_title, notes, local_date, completed_at')
            .eq('user_phone', phone)
            .order('completed_at', { ascending: true });
          if (error) throw error;
          if (!cancelled) setOwnActs(data || []);
        } catch (e) { console.warn('Tree acts load failed:', e.message); }
      })();
      return () => { cancelled = true; };
    }, [user?.email])
  );

  useEffect(() => {
    const phone = extractPhone(user?.email);
    if (!phone) return;
    generateInviteLink({ phone }).then((u) => u && setInviteUrl(u)).catch(() => {});
  }, [user?.email]);

  // Invite link only - never a phone number.
  const invite = async () => {
    const url = inviteUrl || (await generateInviteLink({ phone: extractPhone(user?.email) }));
    try {
      await Share.share({ message: `Join me doing 30 Acts of Kindness - one small act a day: ${url}` });
    } catch (_) { /* closed */ }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="My Tree" />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.treeWrap}>
          <KindnessTree
            ownActs={ownActs}
            branches={branches}
            onOwnLeaf={(act) => act && setPicked({ own: act })}
            onFriendLeaf={() => setPicked({ friend: true })}
          />
        </View>
        <Text style={s.hint}>Tap a leaf to see the act.</Text>

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{show(myActs)}</Text>
            <Text style={s.statLabel}>{LABELS.lifetime}</Text>
          </View>
          <TouchableOpacity style={s.stat} onPress={openPeople} accessibilityRole="button" accessibilityLabel="See the people you inspired">
            <Text style={s.statValue}>{show(peopleUnderMe)}</Text>
            <Text style={[s.statLabel, s.statLink]}>{LABELS.invitedPeople}</Text>
          </TouchableOpacity>
          <View style={s.stat}>
            <Text style={s.statValue}>{show(treeActs)}</Text>
            <Text style={s.statLabel}>{LABELS.treeActs}</Text>
          </View>
        </View>

        <View style={s.legend}>
          <Text style={s.legendText}><Text style={{ color: '#114E33' }}>●</Text> your acts   <Text style={{ color: '#EABA4B' }}>●</Text> newest   <Text style={{ color: '#5FAE7C' }}>●</Text> people you inspired</Text>
        </View>

        <Btn label="Invite someone" onPress={invite} style={{ marginTop: 18 }} />
      </ScrollView>

      {/* Everyone in your tree, most acts first. */}
      <Modal visible={peopleOpen} transparent animationType="fade" onRequestClose={() => setPeopleOpen(false)}>
        <View style={s.dim}>
          <View style={[s.leafCard, { maxHeight: '80%' }]}>
            <Text style={s.peopleTitle}>{LABELS.invitedPeople}</Text>
            {people == null ? (
              <Text style={s.leafDate}>Loading…</Text>
            ) : people.length === 0 ? (
              <Text style={s.leafStory}>No one yet - tap Invite someone to start your tree.</Text>
            ) : (
              <ScrollView style={{ marginTop: 6 }}>
                {people.map((p, i) => (
                  <View key={`${p.name}-${i}`} style={s.personRow}>
                    <Text style={s.personName} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.personActs}>{p.acts} {p.acts === 1 ? 'act' : 'acts'}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <Btn label="Close" variant="secondary" onPress={() => setPeopleOpen(false)} style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>

      {/* Tapped leaf: your own act's story and date; a friend's stays private. */}
      <Modal visible={!!picked} transparent animationType="fade" onRequestClose={() => setPicked(null)}>
        <TouchableOpacity style={s.dim} activeOpacity={1} onPress={() => setPicked(null)}>
          <View style={s.leafCard}>
            {picked?.own ? (
              <>
                <Text style={s.leafDate}>{actDateLabel(picked.own)}</Text>
                <Text style={s.leafStory}>{picked.own.notes || picked.own.act_title}</Text>
              </>
            ) : (
              <Text style={s.leafStory}>An act of kindness by someone you inspired.</Text>
            )}
            <Btn label="Close" variant="secondary" onPress={() => setPicked(null)} style={{ marginTop: 16 }} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, alignItems: 'center' },
  treeWrap: { width: '100%', maxWidth: 420, marginTop: 4 },
  hint: { color: C.sub, fontSize: 14, marginTop: 2, marginBottom: 18, ...FONT.body },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    width: '100%', paddingHorizontal: 8,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: C.text, fontSize: 26, marginBottom: 6, ...FONT.heading },
  statLabel: {
    color: C.sub, fontSize: 13,
    textAlign: 'center', letterSpacing: 0.2, lineHeight: 17, ...FONT.semi,
  },
  legend: { marginTop: 16 },
  legendText: { color: C.sub, fontSize: 13, textAlign: 'center', ...FONT.body },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  leafCard: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border },
  leafDate: { color: C.sub, fontSize: 14, marginBottom: 8, ...FONT.semi },
  leafStory: { color: C.text, fontSize: 17, lineHeight: 24, ...FONT.body },
  statLink: { color: C.primaryText, textDecorationLine: 'underline' },
  peopleTitle: { color: C.text, fontSize: 20, marginBottom: 6, ...FONT.heading },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.border },
  personName: { flex: 1, color: C.text, fontSize: 16, marginRight: 12, ...FONT.semi },
  personActs: { color: C.sub, fontSize: 16, ...FONT.bold },
});
