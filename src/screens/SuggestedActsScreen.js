import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

// Admin review of user-submitted act suggestions (public.act_suggestions).
// Reached from a button atop the Review screen. Reads/writes through the
// authenticated supabase-js client -- the anon key is blocked by RLS on this
// table (403), which is why the list previously showed nothing.

const FILTERS = ['pending', 'approved', 'rejected', 'all'];
const statusColor = (st) => st === 'approved' ? C.success : st === 'rejected' ? C.error : C.warning;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function SuggestedActsScreen({ navigation, user }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(null);
  const [filter,  setFilter]  = useState('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('act_suggestions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) { console.warn('load suggestions failed:', error.message); setItems([]); }
      else setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('load suggestions failed:', e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (item, status) => {
    setBusy(item.id);
    try {
      const { error } = await supabase
        .from('act_suggestions')
        .update({
          status,
          reviewed_by: user?.email || '',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      if (!error) {
        setItems(prev => prev.map(i => (i.id === item.id ? { ...i, status, reviewed_by: user?.email } : i)));
      } else {
        Alert.alert('Update failed', error.message);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(null);
    }
  };

  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } };
  const who = (i) => i.user_phone || (i.user_email || '').replace('@phone.30acts.app', '') || 'Unknown';
  const shown = items.filter(i => (filter === 'all' ? true : (i.status || 'pending') === filter));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Suggested Acts" onBack={() => navigation.goBack()} />

      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipActive]}>
            <Text style={[s.chipText, filter === f && s.chipTextActive]}>{cap(f)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={load} style={s.refresh}>
          <Text style={s.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {shown.length === 0 ? (
            <Text style={s.empty}>No {filter === 'all' ? '' : filter} suggestions.</Text>
          ) : shown.map(item => {
            const st = item.status || 'pending';
            return (
              <Card key={item.id} style={{ marginBottom: 12 }}>
                <Text style={s.desc}>{item.description}</Text>
                <Text style={s.meta}>
                  {who(item)} {'·'} {fmtDate(item.created_at)} {'·'}{' '}
                  <Text style={{ color: statusColor(st), fontWeight: '800' }}>{cap(st)}</Text>
                </Text>
                {st === 'pending' && (
                  <View style={s.actions}>
                    <TouchableOpacity
                      disabled={busy === item.id}
                      onPress={() => setStatus(item, 'approved')}
                      style={[s.actionBtn, { backgroundColor: C.success }]}
                    >
                      <Text style={s.actionText}>{busy === item.id ? '…' : '✓ Approve'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={busy === item.id}
                      onPress={() => setStatus(item, 'rejected')}
                      style={[s.actionBtn, { backgroundColor: C.error }]}
                    >
                      <Text style={s.actionText}>✕ Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: C.border,
  },
  chipActive:     { backgroundColor: C.primary + '22', borderColor: C.primary },
  chipText:       { color: C.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: C.primary },
  refresh:        { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 4 },
  refreshText:    { color: C.primary, fontSize: 20, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  empty:  { color: C.muted, textAlign: 'center', marginTop: 40, fontSize: 14 },

  desc: { color: C.text, fontSize: 15, lineHeight: 21, marginBottom: 8 },
  meta: { color: C.muted, fontSize: 12 },

  actions:    { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn:  { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
