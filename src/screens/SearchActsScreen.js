import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';
import { actingPhone } from '../lib/actingAs';
import { filterActs, actDateLabel } from '../lib/searchActs';

// Search every act this person has logged - all streaks and laps, not just
// the current 30 days. Read-only: tap a result to see its full text.
export default function SearchActsScreen({ navigation, user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const phone = actingPhone(user?.email);
        if (!phone) return;
        const { data, error } = await supabase
          .from('completions')
          .select('id, act_title, notes, completed_at, local_date')
          .eq('user_phone', phone)
          .order('completed_at', { ascending: false });
        if (error) console.warn('Search my acts load failed:', error.message);
        if (alive) setRows(data || []);
      } catch (e) {
        console.warn('Search my acts load failed:', e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user?.email]);

  const results = useMemo(() => filterActs(rows, query), [rows, query]);
  const total = filterActs(rows, '').length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Search my acts" onBack={() => navigation.goBack()} />
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type a word, e.g. neighbor, thank you"
          placeholderTextColor={C.muted}
          style={s.input}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search my acts"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={C.primaryText} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => String(r.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            <Text style={s.count}>
              {query.trim()
                ? `${results.length} of ${total} acts`
                : `All ${total} acts, newest first`}
            </Text>
          }
          ListEmptyComponent={
            <Text style={s.empty}>
              {total === 0 ? "You haven't logged any acts yet." : 'No acts match that search.'}
            </Text>
          }
          renderItem={({ item }) => {
            const open = openId === item.id;
            return (
              <TouchableOpacity
                onPress={() => setOpenId(open ? null : item.id)}
                style={s.row}
                accessibilityRole="button"
              >
                <Text style={s.date}>{actDateLabel(item)}</Text>
                {item.act_title ? (
                  <Text style={s.title} numberOfLines={open ? undefined : 2}>{item.act_title}</Text>
                ) : null}
                {item.notes ? (
                  <Text style={s.story} numberOfLines={open ? undefined : 2}>{item.notes}</Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, marginBottom: 0, paddingHorizontal: 14,
    backgroundColor: C.card2, borderColor: C.border, borderWidth: 1, borderRadius: 12,
  },
  searchIcon: { fontSize: 16 },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 12 },
  count: { color: C.muted, fontSize: 12, marginBottom: 10 },
  empty: { color: C.muted, fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 30 },
  row: {
    backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12,
    padding: 14, marginBottom: 10,
  },
  date: { color: C.muted, fontSize: 11, marginBottom: 4 },
  title: { color: C.text, fontSize: 15, lineHeight: 21 },
  story: { color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
});
