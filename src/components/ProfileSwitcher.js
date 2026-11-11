// ProfileSwitcher -- backlog 94, children's profiles Stage 1 (1 Nov 2026).
//
// "Who's doing today's act?" row on Home: the parent's own name plus one pill
// per child. Tapping a pill switches every act screen to that person
// (src/lib/actingAs.js). Plain tap both ways - no Face ID (Gary, 1 Nov 2026).
// Hidden when the parent has no children.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Text } from './scaledText';
import { C } from '../constants';
import { supabase } from '../lib/supabase';
import { getActingMember, setActingMember, subscribeActing } from '../lib/actingAs';

/** Re-renders the caller whenever the selected person changes. */
export function useActingMember() {
  const [m, setM] = useState(getActingMember());
  useEffect(() => subscribeActing(setM), []);
  return m;
}

export default function ProfileSwitcher({ parentName }) {
  const acting = useActingMember();
  const isFocused = useIsFocused();
  const [children, setChildren] = useState([]);

  // Reload whenever Home comes back into view (a child may have been added or
  // removed in Settings > Family meanwhile).
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('family_members')
        .select('member_key, first_name')
        .order('created_at', { ascending: true });
      if (cancelled || error) return;
      const list = data || [];
      setChildren(list);
      // The selected child was removed: switch back to the parent.
      const cur = getActingMember();
      if (cur && !list.some((c) => c.member_key === cur.member_key)) setActingMember(null);
    })();
    return () => { cancelled = true; };
  }, [isFocused]);

  if (children.length === 0) return null;

  const pills = [{ member_key: null, first_name: parentName || 'Me' }, ...children];
  const activeKey = acting?.member_key || null;

  return (
    <View style={s.wrap}>
      <Text style={s.label}>WHO'S DOING TODAY'S ACT?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {pills.map((p) => {
          const on = p.member_key === activeKey;
          return (
            <TouchableOpacity
              key={p.member_key || 'parent'}
              onPress={() => setActingMember(p.member_key ? p : null)}
              style={[s.pill, on && s.pillOn]}
              activeOpacity={0.75}
            >
              <Text style={[s.pillText, on && s.pillTextOn]}>{p.first_name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  label: { color: C.primaryText, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  row:   { gap: 8 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1.5, borderColor: C.border,
  },
  pillOn:     { borderColor: C.primary, backgroundColor: C.primary + '22' },
  pillText:   { color: C.sub, fontSize: 14, fontWeight: '700' },
  pillTextOn: { color: C.primaryText },
});
