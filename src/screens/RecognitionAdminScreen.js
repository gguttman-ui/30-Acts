import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';
import * as Clipboard from 'expo-clipboard';
import {
  TABS, ordersForTab, orderStage, nextStepText, mailingLabel, addressBlock, isChildOrder,
} from '../lib/braceletOrders';

// Admin fulfillment view for bracelet orders. Reads/updates recognition_orders
// directly; RLS grants access to admins via the is_admin() policy.
// 2 Nov 2026 (Gary: "need a better way to deal with shipping bracelets"):
// opens on a To do list, each order says what to do next and which payment to
// look for, and Copy label puts a ready-to-paste address on the clipboard.
// New orders also text Gary (trigger recognition_orders_notify).
export default function RecognitionAdminScreen({ navigation }) {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);
  const [tab, setTab]         = useState('todo');
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recognition_orders')
        .select('*')
        .eq('bracelet_requested', true)
        .order('created_at', { ascending: false });
      if (error) { Alert.alert('Could not load', error.message); setOrders([]); }
      else setOrders(data || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id, patch) => {
    setBusyId(id);
    try {
      const { error } = await supabase.from('recognition_orders').update(patch).eq('id', id);
      if (error) Alert.alert('Update failed', error.message);
      else await load();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const markPaid    = (o) => update(o.id, { payment_status: 'paid', paid_at: new Date().toISOString() });
  const markShipped = (o) => update(o.id, { fulfillment_status: 'shipped', shipped_at: new Date().toISOString() });

  const copyLabel = async (o) => {
    try {
      await Clipboard.setStringAsync(mailingLabel(o));
      setCopiedId(o.id);
      setTimeout(() => setCopiedId((cur) => (cur === o.id ? null : cur)), 2500);
    } catch (e) {
      Alert.alert('Could not copy', e.message);
    }
  };

  const shown = ordersForTab(orders, tab);
  const todoCount = ordersForTab(orders, 'todo').length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="Recognition Orders"
        onBack={() => navigation.goBack()}
        right={<TouchableOpacity onPress={load}><Text style={s.refresh}>Refresh</Text></TouchableOpacity>}
      />
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.primary} />}
      >
        <View style={s.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabOn]}>
              <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>
                {t.key === 'todo' ? `${t.label} (${todoCount})` : t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && orders.length === 0 ? (
          <ActivityIndicator color={C.primaryText} style={{ marginTop: 32 }} />
        ) : shown.length === 0 ? (
          <Text style={s.empty}>{tab === 'todo' ? 'Nothing to do - every order is shipped.' : 'No bracelet orders here.'}</Text>
        ) : (
          shown.map((o) => {
            const paid    = o.payment_status === 'paid';
            const shipped = o.fulfillment_status === 'shipped';
            const stage   = orderStage(o);
            return (
              <Card key={o.id} style={s.mb}>
                <Text style={[s.next, stage === 'done' && s.nextDone]}>{nextStepText(o)}</Text>
                <Text style={s.name}>{o.ship_name || '(no name)'}</Text>
                {isChildOrder(o) ? <Text style={s.child}>For a child on this account - mail to the parent</Text> : null}
                <Text selectable style={s.addr}>{addressBlock(o)}</Text>
                {!shipped && (
                  <TouchableOpacity onPress={() => copyLabel(o)} style={s.copyBtn} activeOpacity={0.75}>
                    <Text style={s.copyText}>{copiedId === o.id ? 'Label copied ✓' : 'Copy label'}</Text>
                  </TouchableOpacity>
                )}
                <View style={s.metaRow}>
                  <Text style={s.meta}>Phone: {o.user_phone}</Text>
                  <Text style={s.meta}>Paid via: {o.payment_method || '—'}</Text>
                </View>
                <View style={s.badges}>
                  <Text style={[s.badge, paid ? s.badgeGood : s.badgeWarn]}>{paid ? 'PAID' : 'payment pending'}</Text>
                  <Text style={[s.badge, shipped ? s.badgeGood : s.badgeWarn]}>{shipped ? 'SHIPPED' : 'not shipped'}</Text>
                  {o.certificate_requested ? <Text style={[s.badge, s.badgeInfo]}>+ certificate</Text> : null}
                </View>
                <View style={s.btnRow}>
                  {!paid && (
                    <Btn label="Mark Paid" onPress={() => markPaid(o)} loading={busyId === o.id} style={{ flex: 1 }} />
                  )}
                  {paid && !shipped && (
                    <Btn label="Mark Shipped" onPress={() => markShipped(o)} loading={busyId === o.id} style={{ flex: 1 }} />
                  )}
                </View>
                <Text style={s.date}>
                  Ordered {new Date(o.created_at).toLocaleDateString()}
                  {o.paid_at ? ` · paid ${new Date(o.paid_at).toLocaleDateString()}` : ''}
                  {o.shipped_at ? ` · shipped ${new Date(o.shipped_at).toLocaleDateString()}` : ''}
                </Text>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  refresh: { color: C.primaryText, fontWeight: '700', fontSize: 15 },
  empty: { color: C.sub, textAlign: 'center', marginTop: 40, fontSize: 15 },
  mb: { marginBottom: 14 },
  name: { color: C.text, fontSize: 18, fontWeight: '800' },
  addr: { color: C.sub, fontSize: 14, lineHeight: 20, marginTop: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  meta: { color: C.muted, fontSize: 12.5 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 12 },
  badge: { fontSize: 11, fontWeight: '800', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, overflow: 'hidden' },
  badgeGood: { color: '#04140a', backgroundColor: C.primary },
  badgeWarn: { color: '#3a2a00', backgroundColor: '#e0b352' },
  badgeInfo: { color: C.text, backgroundColor: C.surface },
  btnRow: { flexDirection: 'row', gap: 10 },
  date: { color: C.muted, fontSize: 11.5, marginTop: 10 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: C.border },
  tabOn: { borderColor: C.primary, backgroundColor: C.primary + '22' },
  tabText: { color: C.sub, fontSize: 13.5, fontWeight: '700' },
  tabTextOn: { color: C.primaryText },
  next: { color: '#e0b352', fontSize: 13, fontWeight: '700', marginBottom: 8, lineHeight: 18 },
  nextDone: { color: C.muted },
  child: { color: C.primaryText, fontSize: 12, fontWeight: '700', marginTop: 2 },
  copyBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: C.primary },
  copyText: { color: C.primaryText, fontSize: 13, fontWeight: '700' },
});
