import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONT } from '../lib/fonts';
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
// Fix 10 (19 Nov 2026): this is also the Journey tab (`asTab`): no back
// arrow, no keyboard popping up, and it reloads each time it is opened.
export default function SearchActsScreen({ navigation, user, asTab = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  useFocusEffect(useCallback(() => {
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
  }, [user?.email]));

  const results = useMemo(() => filterActs(rows, query), [rows, query]);
  const total = filterActs(rows, '').length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title={asTab ? 'Journey' : 'Search my acts'}
        onBack={asTab ? undefined : () => navigation.goBack()}
      />
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={20} color={C.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type a word, e.g. neighbor, thank you"
          placeholderTextColor={C.muted}
          style={s.input}
          autoFocus={!asTab}
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
    backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12,
  },
  input: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 12, ...FONT.body },
  count: { color: C.muted, fontSize: 14, marginBottom: 10, ...FONT.semi },
  empty: { color: C.muted, fontSize: 16, textAlign: 'center', marginTop: 30, ...FONT.body },
  row: {
    backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12,
    padding: 14, marginBottom: 10,
  },
  date: { color: C.muted, fontSize: 13, marginBottom: 4, ...FONT.semi },
  title: { color: C.text, fontSize: 16, lineHeight: 22, ...FONT.bold },
  story: { color: C.sub, fontSize: 16, lineHeight: 22, marginTop: 4, ...FONT.body },
});
