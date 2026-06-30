import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Modal, Platform,
  InputAccessoryView, Keyboard,
} from 'react-native';
import { Card, ScreenHeader, Btn } from '../components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

const KB_ACCESSORY_ID = 'sponsorDashKb';

// ── Phone helpers (same behavior as other screens) ─────────────────────────
// Format "(917) 721-8269" for display
function e164ToDisplay(e164) {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{10})$/);
  if (!m) return e164;
  const d = m[1];
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Parse a raw phone entry into E.164 "+1XXXXXXXXXX" or null
function toE164(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+1${digits.slice(1)}`;
  return null;
}

// Parse CSV-paste text into array of {phone, name, email}.
// Expected format per line: "phone,name,email" — extra whitespace OK.
// Skips blank lines and lines where phone can't be parsed.
function parseCsvPaste(text) {
  const rows = [];
  const seen = new Set();
  const lines = (text || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Split on comma or tab; keep at most 3 parts
    const parts = trimmed.split(/[,\t]/).map(p => p.trim());
    const phoneE164 = toE164(parts[0] || '');
    if (!phoneE164) continue;
    if (seen.has(phoneE164)) continue;
    seen.add(phoneE164);
    rows.push({
      phone: phoneE164,
      name:  parts[1] || null,
      email: parts[2] || null,
    });
  }
  return rows;
}

// Done-bar above iOS number/phone keyboards
function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KB_ACCESSORY_ID}>
      <View style={s.accessoryBar}>
        <TouchableOpacity onPress={() => Keyboard.dismiss()}>
          <Text style={s.accessoryDone}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

function StatTile({ label, value, sub, color }) {
  return (
    <View style={[s.statTile, { borderColor: (color || C.primary) + '44' }]}>
      <Text style={[s.statValue, { color: color || C.primary }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function SponsorDashboardScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const sponsorId   = route?.params?.sponsorId   || null;
  const sponsorName = route?.params?.sponsorName || 'Sponsor';

  const [loading,     setLoading]     = useState(true);
  const [employees,   setEmployees]   = useState([]);
  const [customActs,  setCustomActs]  = useState([]);
  const [actCountByPhone, setActCountByPhone] = useState({});

  const [search,      setSearch]      = useState('');
  const [showAllActs, setShowAllActs] = useState(false);
  const [showCsv,     setShowCsv]     = useState(false);
  const [csvText,     setCsvText]     = useState('');
  const [csvBusy,     setCsvBusy]     = useState(false);

  // ── Load all sponsor data in one pass ───────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!sponsorId) return;
    setLoading(true);
    try {
      // Fetch employees
      const { data: empData, error: empErr } = await supabase
        .from('sponsor_employees')
        .select('*')
        .eq('sponsor_id', sponsorId)
        .order('added_at', { ascending: false });
      if (empErr) throw empErr;
      const emps = empData || [];
      setEmployees(emps);

      // Fetch custom acts
      const { data: actData, error: actErr } = await supabase
        .from('sponsor_custom_acts')
        .select('*')
        .eq('sponsor_id', sponsorId)
        .eq('active', true)
        .order('category', { ascending: true });
      if (actErr) throw actErr;
      setCustomActs(actData || []);

      // Fetch completion counts — one round-trip, aggregated client-side
      if (emps.length > 0) {
        const phones = emps.map(e => e.phone);
        const { data: compData, error: compErr } = await supabase
          .from('completions')
          .select('user_phone')
          .in('user_phone', phones);
        if (compErr) {
          console.warn('Completion count fetch failed:', compErr.message);
          setActCountByPhone({});
        } else {
          const counts = {};
          for (const row of compData || []) {
            counts[row.user_phone] = (counts[row.user_phone] || 0) + 1;
          }
          setActCountByPhone(counts);
        }
      } else {
        setActCountByPhone({});
      }
    } catch (e) {
      console.warn('Dashboard load failed:', e.message);
      Alert.alert('Error', 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [sponsorId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived stats ───────────────────────────────────────────────────────
  const totalEmployees  = employees.length;
  const activeEmployees = employees.filter(e => (actCountByPhone[e.phone] || 0) > 0).length;
  const completedEmployees = employees.filter(e => (actCountByPhone[e.phone] || 0) >= 30).length;
  const completionRate = activeEmployees > 0
    ? Math.round((completedEmployees / activeEmployees) * 100)
    : 0;

  // ── Employee list filter ────────────────────────────────────────────────
  const filteredEmployees = search.trim()
    ? employees.filter(e => {
        const q = search.toLowerCase();
        return (
          (e.name  || '').toLowerCase().includes(q) ||
          (e.phone || '').includes(q) ||
          (e.email || '').toLowerCase().includes(q)
        );
      })
    : employees;

  // ── CSV paste submit ────────────────────────────────────────────────────
  const handleCsvSubmit = async () => {
    const rows = parseCsvPaste(csvText);
    if (rows.length === 0) {
      Alert.alert('Nothing to add', 'Could not find any valid phone numbers in the pasted text.');
      return;
    }
    setCsvBusy(true);
    try {
      const body = rows.map(r => ({
        sponsor_id: sponsorId,
        phone:      r.phone,
        name:       r.name,
        email:      r.email,
      }));
      // Supabase handles conflicts via our unique (sponsor_id, phone) constraint.
      // Use Prefer: resolution=ignore-duplicates so existing rows are skipped.
      const { error } = await supabase
        .from('sponsor_employees')
        .upsert(body, { onConflict: 'sponsor_id,phone', ignoreDuplicates: true });
      if (error) {
        Alert.alert('Upload failed', error.message);
        return;
      }
      Alert.alert(
        'Success',
        `Parsed ${rows.length} ${rows.length === 1 ? 'employee' : 'employees'}. Duplicates were skipped.`
      );
      setCsvText('');
      setShowCsv(false);
      loadAll();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setCsvBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const displayedActs = showAllActs ? customActs : customActs.slice(0, 3);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="Sponsor Dashboard"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={loadAll}>
            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>↻</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Sponsor header */}
        <Card style={[s.mb, { borderColor: C.primary + '55', borderWidth: 1.5 }]}>
          <Text style={s.sponsorName}>🏢 {sponsorName}</Text>
          <Text style={s.sponsorSub}>Company dashboard</Text>
        </Card>

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={C.primary} />
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>Loading…</Text>
          </View>
        ) : (
          <>
            {/* Summary */}
            <Card style={s.mb}>
              <Text style={s.section}>📊 Summary</Text>
              <View style={s.statRow}>
                <StatTile label="Employees" value={totalEmployees} />
                <StatTile label="Active"    value={activeEmployees} color={C.success} sub="≥1 act done" />
                <StatTile label="Completed" value={`${completionRate}%`} color={C.warning} sub="of active" />
              </View>
            </Card>

            {/* Custom acts */}
            <Card style={s.mb}>
              <View style={s.sectionRow}>
                <Text style={s.section}>📝 Custom Acts</Text>
                <Text style={s.badge}>{customActs.length}</Text>
              </View>
              {customActs.length === 0 ? (
                <Text style={s.empty}>No custom acts yet for this sponsor.</Text>
              ) : (
                <>
                  {displayedActs.map(a => (
                    <View key={a.id} style={s.actRow}>
                      <Text style={s.actCategory}>{a.category}</Text>
                      <Text style={s.actText} numberOfLines={2}>{a.act_text}</Text>
                    </View>
                  ))}
                  {customActs.length > 3 && (
                    <TouchableOpacity
                      onPress={() => setShowAllActs(v => !v)}
                      style={s.showMoreBtn}
                    >
                      <Text style={s.showMoreText}>
                        {showAllActs ? 'Show less ↑' : `View all ${customActs.length} acts →`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </Card>

            {/* Employees */}
            <Card style={s.mb}>
              <View style={s.sectionRow}>
                <Text style={s.section}>👥 Employees</Text>
                <Text style={s.badge}>{totalEmployees}</Text>
              </View>

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, phone, or email…"
                placeholderTextColor={C.muted}
                style={s.searchInput}
              />

              {filteredEmployees.length === 0 ? (
                <Text style={s.empty}>
                  {search ? 'No employees match your search.' : 'No employees yet. Paste a CSV below to add some.'}
                </Text>
              ) : filteredEmployees.map(emp => {
                const count = actCountByPhone[emp.phone] || 0;
                const progressLabel =
                  count === 0 ? 'not yet active'
                  : count >= 30 ? 'completed all 30 ✨'
                  : `${count}/30 acts`;
                const progressColor =
                  count === 0 ? C.muted
                  : count >= 30 ? C.success
                  : C.primary;

                return (
                  <TouchableOpacity
                    key={emp.id}
                    onPress={() => Alert.alert(
                      emp.name || e164ToDisplay(emp.phone),
                      `Phone: ${e164ToDisplay(emp.phone)}\n` +
                      `Email: ${emp.email || '—'}\n` +
                      `Acts completed: ${count}/30`
                    )}
                    style={s.empRow}
                    activeOpacity={0.7}
                  >
                    <View style={s.empAvatar}>
                      <Text style={{ fontSize: 16 }}>
                        {count >= 30 ? '🏆' : count > 0 ? '⚡' : '⏳'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.empName} numberOfLines={1}>
                        {emp.name || e164ToDisplay(emp.phone)}
                      </Text>
                      <Text style={s.empMeta} numberOfLines={1}>
                        {emp.name ? e164ToDisplay(emp.phone) : 'Phone employee'}
                      </Text>
                    </View>
                    <Text style={[s.empProgress, { color: progressColor }]}>
                      {progressLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                onPress={() => setShowCsv(true)}
                style={s.csvBtn}
              >
                <Text style={s.csvBtnText}>+ Paste CSV / List</Text>
              </TouchableOpacity>
            </Card>
          </>
        )}
      </ScrollView>

      {/* CSV paste modal */}
      <Modal visible={showCsv} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCsv(false); setCsvText(''); }}>
              <Text style={{ color: C.muted, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Paste Employees</Text>
            <TouchableOpacity onPress={handleCsvSubmit} disabled={csvBusy || !csvText.trim()}>
              <Text style={{
                color: csvBusy || !csvText.trim() ? C.muted : C.primary,
                fontSize: 15, fontWeight: '700',
              }}>
                {csvBusy ? 'Adding…' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.csvHelper}>
              Paste one employee per line, in the format:
            </Text>
            <View style={s.csvExample}>
              <Text style={s.csvMono}>phone,name,email</Text>
              <Text style={s.csvMono}>(917) 555-1234,Alice Martinez,alice@acme.com</Text>
              <Text style={s.csvMono}>+13125551234,Bob Chen,bob@acme.com</Text>
              <Text style={s.csvMono}>5551239876,Carmen R.</Text>
            </View>
            <Text style={s.csvHelper}>
              Name and email are optional. Any phone format works; duplicates
              and existing employees are skipped automatically.
            </Text>

            <TextInput
              value={csvText}
              onChangeText={setCsvText}
              placeholder="Paste employees here…"
              placeholderTextColor={C.muted}
              multiline
              autoFocus
              style={s.csvInput}
            />

            {csvText.trim().length > 0 && (
              <View style={s.csvPreview}>
                <Text style={s.csvPreviewLabel}>
                  Will add {parseCsvPaste(csvText).length} employee
                  {parseCsvPaste(csvText).length === 1 ? '' : 's'} (invalid lines ignored)
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <KeyboardDoneBar />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  mb: { marginBottom: 14 },

  sponsorName: { color: C.text, fontSize: 20, fontWeight: '900', marginBottom: 2 },
  sponsorSub:  { color: C.sub, fontSize: 13 },

  section:    { color: C.text, fontSize: 15, fontWeight: '800', flex: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  badge: {
    backgroundColor: C.primary + '22', color: C.primary,
    fontSize: 12, fontWeight: '800',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, overflow: 'hidden',
  },

  // Summary stats
  statRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1, backgroundColor: C.card2, borderRadius: 12, borderWidth: 1,
    padding: 12, alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { color: C.muted, fontSize: 10, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  statSub:   { color: C.muted, fontSize: 9, marginTop: 2, textAlign: 'center' },

  // Custom acts list
  actRow: {
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.border + '44',
  },
  actCategory: {
    color: C.primary, fontSize: 10, fontWeight: '800',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3,
  },
  actText: { color: C.text, fontSize: 13, lineHeight: 18 },

  showMoreBtn:  { marginTop: 10, alignItems: 'center', paddingVertical: 6 },
  showMoreText: { color: C.primary, fontSize: 12, fontWeight: '700' },

  // Employees list
  searchInput: {
    backgroundColor: C.card2, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    color: C.text, fontSize: 13,
    borderWidth: 1, borderColor: C.border, marginBottom: 10,
  },
  empRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border + '44',
  },
  empAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  empName:     { color: C.text, fontSize: 13, fontWeight: '600' },
  empMeta:     { color: C.muted, fontSize: 11, marginTop: 2 },
  empProgress: { fontSize: 11, fontWeight: '700', marginLeft: 8 },

  empty: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 14 },

  csvBtn: {
    backgroundColor: C.primary + '22', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
    borderWidth: 1, borderColor: C.primary + '44',
    marginTop: 14,
  },
  csvBtnText: { color: C.primary, fontSize: 13, fontWeight: '700' },

  // CSV modal
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  csvHelper:  { color: C.sub, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  csvExample: {
    backgroundColor: C.card2, borderRadius: 10,
    padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  csvMono: {
    color: C.text, fontSize: 12, fontFamily: 'Courier',
    marginBottom: 3, lineHeight: 16,
  },
  csvInput: {
    backgroundColor: C.card2, borderRadius: 10,
    padding: 12, color: C.text, fontSize: 13,
    borderWidth: 1, borderColor: C.border,
    minHeight: 180, textAlignVertical: 'top',
    marginTop: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  csvPreview: {
    marginTop: 12, padding: 10,
    backgroundColor: C.success + '18',
    borderWidth: 1, borderColor: C.success + '44',
    borderRadius: 10,
  },
  csvPreviewLabel: {
    color: C.success, fontSize: 12, fontWeight: '700', textAlign: 'center',
  },

  // Keyboard accessory
  accessoryBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  accessoryDone: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
});