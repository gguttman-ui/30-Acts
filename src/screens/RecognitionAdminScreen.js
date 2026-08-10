import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

// Admin fulfillment view for bracelet orders. Reads/updates recognition_orders
// directly; RLS grants access to admins via the is_admin() policy. Shows each
// order's address + payment method, and lets an admin mark it Paid then Shipped.
export default function RecognitionAdminScreen({ navigation }) {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);

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

  const addressOf = (o) => [
    o.ship_street1,
    o.ship_street2,
    `${o.ship_city || ''}, ${o.ship_state || ''} ${o.ship_zip || ''}`.trim(),
  ].filter(Boolean).join('\n');

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
        {loading && orders.length === 0 ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />
        ) : orders.length === 0 ? (
          <Text style={s.empty}>No bracelet orders yet.</Text>
        ) : (
          orders.map((o) => {
            const paid    = o.payment_status === 'paid';
            const shipped = o.fulfillment_status === 'shipped';
            return (
              <Card key={o.id} style={s.mb}>
                <Text style={s.name}>{o.ship_name || '(no name)'}</Text>
                <Text style={s.addr}>{addressOf(o)}</Text>
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
                <Text style={s.date}>Ordered {new Date(o.created_at).toLocaleDateString()}</Text>
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
  refresh: { color: C.primary, fontWeight: '700', fontSize: 15 },
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
});
