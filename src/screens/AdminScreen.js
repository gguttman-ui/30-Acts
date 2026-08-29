import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform, Modal,
  InputAccessoryView, Keyboard,
} from 'react-native';
import { Card, ScreenHeader } from '../components';
import { C } from '../constants';

// Same hardcoded fallbacks as lib/supabase.js. EXPO_PUBLIC_* vars are only
// inlined when they're set in the environment at bundle-build time, and they
// aren't during `eas update` — so without these fallbacks the raw REST fetches
// below hit `undefined/rest/v1/...` and fail with "Network request failed".
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7Yy5NBm4XmpO1syrdjT62A_4stDanF9';

import { supabase } from '../lib/supabase';

const REST_HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
};

const KEYBOARD_ACCESSORY_ID = 'adminKeyboardAccessory';

const PROOF_ICONS = { photo: '📷', video: '🎥', story: '✍️' };

// ── Phone helpers ─────────────────────────────────────────────────────────

// Strip everything but digits, cap at 10 (drop a leading 1 if 11 digits).
function digitsOnly(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return d.slice(0, 10);
}

// Format raw digit string for display ONLY. State holds raw digits.
function formatDigitsForDisplay(d) {
  if (!d) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Raw digits → "+19177218269@phone.30acts.app"
function digitsToProxyEmail(d) {
  if (!d || d.length !== 10) return null;
  return `+1${d}@phone.30acts.app`;
}

// Raw digits → "+19177218269"
function digitsToE164(d) {
  if (!d || d.length !== 10) return null;
  return `+1${d}`;
}

// Format proxy email back to display phone "(917) 721-8269"
function proxyEmailToDisplay(proxyEmail) {
  if (!proxyEmail) return '';
  const match = proxyEmail.match(/^\+1(\d{10})@phone\.30acts\.app$/);
  if (!match) return proxyEmail;
  const d = match[1];
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function e164ToDisplay(e164) {
  if (!e164) return '';
  const match = e164.match(/^\+1(\d{10})$/);
  if (!match) return e164;
  const d = match[1];
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function isProxyEmail(v) {
  return !!v && v.includes('@phone.30acts.app');
}

function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
      <View style={s.accessoryBar}>
        <TouchableOpacity onPress={() => Keyboard.dismiss()}>
          <Text style={s.accessoryDone}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

function ConfirmModal({ visible, title, message, onConfirm, onCancel, confirmLabel = 'Delete' }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ backgroundColor: '#1c1c1e', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
          <Text style={{ color: '#aaa', fontSize: 14, marginBottom: 24 }}>{message}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={onCancel} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2c2c2e', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#ff3b30', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatTile({ icon, label, value, color, onPress }) {
  const Cmp = onPress ? TouchableOpacity : View;
  return (
    <Cmp onPress={onPress} activeOpacity={0.7} style={[s.tile, { borderColor: (color || C.primary) + '44' }]}>
      <Text style={{ fontSize: 22, marginBottom: 6 }}>{icon}</Text>
      <Text style={[s.tileVal, { color: color || C.primary }]}>{value}</Text>
      <Text style={s.tileLbl}>{label}</Text>
    </Cmp>
  );
}

function RateBar({ label, pct, color }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.ratePct, { color: color || C.primary }]}>{Math.round(pct * 100)}%</Text>
      <Text style={s.rateLbl}>{label}</Text>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: color || C.primary }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// ManageList: Admins / Reviewers
// `phone` is RAW DIGITS in state. Format only on display.
// ─────────────────────────────────────────────────────────────────────────
function ManageList({ items, loading, onAdd, onRemove, phone, setPhone, adding, emoji, label }) {
  const valid = phone.length === 10;
  return (
    <Card>
      <Text style={s.section}>{emoji} {label}</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 6, marginBottom: 8 }}>
        Enter a 10-digit US phone number. Format is flexible.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <TextInput
          value={formatDigitsForDisplay(phone)}
          onChangeText={t => setPhone(digitsOnly(t))}
          placeholder="(917) 721-8269"
          placeholderTextColor={C.muted}
          keyboardType="phone-pad"
          maxLength={14}
          inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
          style={[s.searchInput, { flex: 1, marginBottom: 0 }]}
        />
        <TouchableOpacity onPress={onAdd} disabled={adding || !valid}
          style={{ backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', opacity: !valid ? 0.4 : 1 }}>
          {adding ? <ActivityIndicator size="small" color={C.bg} /> : <Text style={{ color: C.bg, fontWeight: '700' }}>Add</Text>}
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color={C.primary} /> : items.length === 0 ? (
        <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No {label.toLowerCase()} found</Text>
      ) : items.map(item => {
        const isPhone = isProxyEmail(item.email);
        const display = isPhone ? proxyEmailToDisplay(item.email) : item.email;
        return (
          <View key={item.id} style={s.userRow}>
            <View style={s.userAvatar}><Text style={{ fontSize: 16 }}>{isPhone ? '📱' : emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.userEmail} numberOfLines={1}>{display}</Text>
              <Text style={s.userMeta}>
                {isPhone ? 'Phone user' : 'Email user'} · Added {item.added_at ? new Date(item.added_at).toLocaleDateString() : '—'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => onRemove(item)} style={s.deleteBtn}>
              <Text style={{ fontSize: 16 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </Card>
  );
}

export default function AdminScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('completions');

  const [users,         setUsers]         = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loadingUsers,  setLoadingUsers]  = useState(true);
  const [deletingUser,  setDeletingUser]  = useState(null);
  const [userSearch,    setUserSearch]    = useState('');

  const [completions,         setCompletions]         = useState([]);
  const [filteredCompletions, setFilteredCompletions] = useState([]);
  const [loadingCompletions,  setLoadingCompletions]  = useState(true);
  const [deletingComp,        setDeletingComp]        = useState(null);
  const [compSearch,          setCompSearch]          = useState('');
  const [sortBy,              setSortBy]              = useState('date');
  const [userSort,            setUserSort]            = useState('joined'); // joined | name | phone

  // Phone state values are RAW DIGITS (e.g. "9177218269"), formatted only on display.
  const [admins,           setAdmins]           = useState([]);
  const [loadingAdmins,    setLoadingAdmins]    = useState(false);
  const [newAdminPhone,    setNewAdminPhone]    = useState('');
  const [addingAdmin,      setAddingAdmin]      = useState(false);

  const [reviewers,        setReviewers]        = useState([]);
  const [loadingReviewers, setLoadingReviewers] = useState(false);
  const [newReviewerPhone, setNewReviewerPhone] = useState('');
  const [addingReviewer,   setAddingReviewer]   = useState(false);

  // App-wide dashboard stats from the admin-only RPC (bypasses RLS). null = loading.
  const [stats, setStats] = useState(null);

  // Growth funnel from admin_growth_stats(). null = loading or unavailable.
  const [growth, setGrowth] = useState(null);

  const [groups,        setGroups]        = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [zips,          setZips]          = useState([]);
  const [loadingZips,   setLoadingZips]   = useState(true);

  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) =>
    setConfirmModal({ visible: true, title, message, onConfirm });
  const hideConfirm = () =>
    setConfirmModal(m => ({ ...m, visible: false, onConfirm: null }));

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      // Admin-only RPC so the list includes ALL users (a direct table query is
      // limited by RLS to just the rows this session can see).
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      setUsers(rows);
      setFilteredUsers(rows);
    } catch (e) { console.warn('Error loading users:', e.message); }
    finally { setLoadingUsers(false); }
  }, []);

  // App-wide stats via the admin-only SECURITY DEFINER function. A normal
  // RLS-limited client query can't see all rows, so counts must come from here.
  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_dashboard_stats');
      if (error) throw error;
      setStats(data);
    } catch (e) { console.warn('Stats load failed:', e.message); }
  }, []);

  // Launch-funnel numbers. Returns nulls / zeros until there is real data,
  // so this is safe to ship before go-live. Downloads are NOT queryable from
  // the database (App Store Connect owns that number) - the RPC reads it from
  // the app_metrics table, where it can be entered by hand.
  const fetchGrowth = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_growth_stats');
      if (error) throw error;
      setGrowth(data);
    } catch (e) { console.warn('Growth stats load failed:', e.message); }
  }, []);

  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_groups');
      if (error) throw error;
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) { console.warn('Error loading groups:', e.message); }
    finally { setLoadingGroups(false); }
  }, []);

  const fetchZips = useCallback(async () => {
    setLoadingZips(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_zips');
      if (error) throw error;
      setZips(Array.isArray(data) ? data : []);
    } catch (e) { console.warn('Error loading zips:', e.message); }
    finally { setLoadingZips(false); }
  }, []);

  const fetchCompletions = useCallback(async () => {
    setLoadingCompletions(true);
    try {
      const { data, error } = await supabase
        .from('completions')
        .select('*')
        .order('completed_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setCompletions(Array.isArray(data) ? data : []);
      setFilteredCompletions(Array.isArray(data) ? data : []);
    } catch (e) { setCompletions([]); setFilteredCompletions([]); }
    finally { setLoadingCompletions(false); }
  }, []);

  const fetchAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/admins?select=*&order=added_at.desc`, { headers: REST_HEADERS });
      const data = await res.json();
      setAdmins(Array.isArray(data) ? data : []);
    } catch (e) { console.warn('Error loading admins:', e.message); }
    finally { setLoadingAdmins(false); }
  }, []);

  const fetchReviewers = useCallback(async () => {
    setLoadingReviewers(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviewers?select=*&order=added_at.desc`, { headers: REST_HEADERS });
      const data = await res.json();
      setReviewers(Array.isArray(data) ? data : []);
    } catch (e) { console.warn('Error loading reviewers:', e.message); }
    finally { setLoadingReviewers(false); }
  }, []);

  const handleAddAdmin = useCallback(async () => {
    const proxyEmail = digitsToProxyEmail(newAdminPhone);
    if (!proxyEmail) {
      Alert.alert('Invalid phone', 'Enter a 10-digit US phone number like (917) 721-8269.');
      return;
    }
    setAddingAdmin(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/admins`, {
        method: 'POST', headers: { ...REST_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email: proxyEmail }),
      });
      if (res.ok || res.status === 201) { setNewAdminPhone(''); fetchAdmins(); }
      else { const t = await res.text(); Alert.alert('Failed', t); }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setAddingAdmin(false); }
  }, [newAdminPhone, fetchAdmins]);

  const handleRemoveAdmin = useCallback((admin) => {
    const display = isProxyEmail(admin.email) ? proxyEmailToDisplay(admin.email) : admin.email;
    showConfirm('Remove Admin', `Remove ${display} as admin?`, () => {
      hideConfirm();
      fetch(`${SUPABASE_URL}/rest/v1/admins?id=eq.${admin.id}`, { method: 'DELETE', headers: REST_HEADERS })
        .then(res => {
          if (res.ok || res.status === 204) setAdmins(prev => prev.filter(a => a.id !== admin.id));
          else res.text().then(t => Alert.alert('Failed', t));
        });
    });
  }, []);

  const handleAddReviewer = useCallback(async () => {
    const proxyEmail = digitsToProxyEmail(newReviewerPhone);
    if (!proxyEmail) {
      Alert.alert('Invalid phone', 'Enter a 10-digit US phone number like (917) 721-8269.');
      return;
    }
    setAddingReviewer(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviewers`, {
        method: 'POST', headers: { ...REST_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email: proxyEmail }),
      });
      if (res.ok || res.status === 201) { setNewReviewerPhone(''); fetchReviewers(); }
      else { const t = await res.text(); Alert.alert('Failed', t); }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setAddingReviewer(false); }
  }, [newReviewerPhone, fetchReviewers]);

  const handleRemoveReviewer = useCallback((reviewer) => {
    const display = isProxyEmail(reviewer.email) ? proxyEmailToDisplay(reviewer.email) : reviewer.email;
    showConfirm('Remove Reviewer', `Remove ${display} as reviewer?`, () => {
      hideConfirm();
      fetch(`${SUPABASE_URL}/rest/v1/reviewers?id=eq.${reviewer.id}`, { method: 'DELETE', headers: REST_HEADERS })
        .then(res => {
          if (res.ok || res.status === 204) setReviewers(prev => prev.filter(r => r.id !== reviewer.id));
          else res.text().then(t => Alert.alert('Failed', t));
        });
    });
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchCompletions();
    fetchAdmins();
    fetchReviewers();
    fetchStats();
    fetchGrowth();
    fetchGroups();
    fetchZips();
  }, []);

  useEffect(() => {
    const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim();
    let list = [...users];
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      list = list.filter(u =>
        (u.phone || '').toLowerCase().includes(q) ||
        fullName(u).toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (userSort === 'name')  return fullName(a).localeCompare(fullName(b));
      if (userSort === 'phone') return (a.phone || '').localeCompare(b.phone || '');
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    setFilteredUsers(list);
  }, [userSearch, userSort, users]);

  useEffect(() => {
    let list = [...completions];
    if (compSearch.trim()) {
      const q = compSearch.toLowerCase();
      list = list.filter(c => (c.user_phone || '').toLowerCase().includes(q));
    }
    list.sort(sortBy === 'date'
      ? (a, b) => new Date(b.completed_at) - new Date(a.completed_at)
      : (a, b) => (a.user_phone || '').localeCompare(b.user_phone || ''));
    setFilteredCompletions(list);
  }, [compSearch, sortBy, completions]);

  const handleDeleteUser = useCallback((user) => {
    showConfirm(
      'Delete User',
      `Permanently delete ${user.email || user.phone} and text them that their account violated our Terms of Service?`,
      () => {
        hideConfirm();
        setDeletingUser(user.id);

        // Resolve the user's phone (E.164) for the Terms-of-Service notice.
        // Phone accounts store the number on profiles.phone; the proxy email
        // "+1XXXXXXXXXX@phone.30acts.app" already carries E.164 before the "@".
        const phone = user.phone
          || (isProxyEmail(user.email) ? user.email.split('@')[0] : null);
        const ACCOUNT_TERMS_SMS =
          'Your 30 Acts of Kindness account has been removed because your ' +
          'activity violated our Terms of Service.';

        fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_user`, {
          method: 'POST', headers: REST_HEADERS,
          body: JSON.stringify({ user_id: user.id }),
        })
          .then(async (res) => {
            if (res.ok || res.status === 204) {
              setUsers(prev => prev.filter(u => u.id !== user.id));
              // Notify the removed user. Non-blocking: a Twilio failure must
              // not make a successful delete look like it failed.
              if (phone) {
                try {
                  await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_sms_notification`, {
                    method: 'POST', headers: REST_HEADERS,
                    body: JSON.stringify({ phone_number: phone, message: ACCOUNT_TERMS_SMS }),
                  });
                } catch (e) { console.warn('Account Terms SMS failed:', e.message); }
              }
            } else {
              res.text().then(t => Alert.alert('Delete Failed', `${res.status}: ${t}`));
            }
          })
          .catch(e => Alert.alert('Error', e.message))
          .finally(() => setDeletingUser(null));
      }
    );
  }, []);

  // Reused Terms wording, matching the message DailyActScreen shows on a
  // blocked submission.
  const TERMS_SMS = 'Your 30 Acts of Kindness post was removed because it ' +
    'contains content that is not appropriate based on our Terms of Service.';

  // Remove an inappropriate act AND text the author that it violated our
  // Terms of Service. All app users are phone-based.
  const handleRemoveAndNotify = useCallback((comp) => {
    showConfirm(
      'Remove & Notify',
      `Remove "${comp.act_title || 'this act'}" and text ${comp.user_phone} that it violated our Terms of Service?`,
      async () => {
        hideConfirm();
        setDeletingComp(comp.id);
        try {
          const { error } = await supabase.from('completions').delete().eq('id', comp.id);
          if (error) { Alert.alert('Remove Failed', error.message); return; }
          setCompletions(prev => prev.filter(c => c.id !== comp.id));
          if (comp.user_phone) {
            try {
              await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_sms_notification`, {
                method: 'POST', headers: REST_HEADERS,
                body: JSON.stringify({ phone_number: comp.user_phone, message: TERMS_SMS }),
              });
            } catch (e) { console.warn('Terms SMS failed:', e.message); }
          }
        } finally {
          setDeletingComp(null);
        }
      }
    );
  }, []);

  const handleDeleteCompletion = useCallback((comp) => {
    showConfirm('Remove Act', `Remove "${comp.act_title || 'this act'}" by ${comp.user_phone}?`, () => {
      hideConfirm();
      setDeletingComp(comp.id);
      supabase.from('completions').delete().eq('id', comp.id)
        .then(({ error }) => {
          if (error) Alert.alert('Delete Failed', error.message);
          else setCompletions(prev => prev.filter(c => c.id !== comp.id));
        })
        .finally(() => setDeletingComp(null));
    });
  }, []);

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const confirmedCount   = users.filter(u => u.email_confirmed_at).length;
  const unconfirmedCount = users.length - confirmedCount;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Admin Dashboard" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}>

        <Card>
          <Text style={s.section}>📊 Overview</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            <StatTile icon="🧑‍🤝‍🧑" label="Users"  value={stats?.users  ?? '—'} onPress={() => setActiveTab('users')} />
            <StatTile icon="✅" label="Acts"   value={stats?.acts   ?? '—'} color={C.success} onPress={() => setActiveTab('completions')} />
            <StatTile icon="🏆" label="Groups" value={stats?.groups ?? '—'} color={C.warning} onPress={() => setActiveTab('groups')} />
            <StatTile icon="📍" label="ZIPs"   value={stats?.zips   ?? '—'} onPress={() => setActiveTab('zips')} />
          </View>
        </Card>

        <Card>
          <Text style={s.section}>📈 Growth</Text>
          <Text style={s.growthNote}>
            Fills in once the app is live. A dash means no data yet.
          </Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            <StatTile icon="⬇️" label="Downloads"        value={growth?.downloads   ?? '—'} />
            <StatTile icon="🔑" label="Signed in"        value={growth?.signins     ?? '—'} color={C.accent} />
            <StatTile icon="🌱" label="Did 1+ act"       value={growth?.did_one_act ?? '—'} color={C.success} />
            <StatTile icon="🔥" label="30 days in a row" value={growth?.streak_30   ?? '—'} color={C.gold} />
          </View>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }}
          keyboardShouldPersistTaps="handled">
          <View style={[s.tabRow, { paddingHorizontal: 2 }]}>
            {[
              { key: 'completions', label: `🔍 Review${completions.length > 0 ? ` (${completions.length})` : ''}` },
              { key: 'users',       label: `👥 Users${users.length > 0 ? ` (${users.length})` : ''}` },
              { key: 'groups',      label: `🏆 Groups${groups.length > 0 ? ` (${groups.length})` : ''}` },
              { key: 'zips',        label: `📍 ZIPs${zips.length > 0 ? ` (${zips.length})` : ''}` },
              { key: 'admins',      label: '🔐 Admins' },
              { key: 'reviewers',   label: '🔍 Reviewers' },
            ].map(tab => (
              <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)}
                style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}>
                <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {activeTab === 'completions' && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={s.section}>🔍 Review Acts of Kindness</Text>
              <TouchableOpacity onPress={fetchCompletions} style={s.refreshBtn}>
                <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>
            <View style={s.sortRow}>
              <Text style={{ color: C.muted, fontSize: 12, marginRight: 8 }}>Sort:</Text>
              <TouchableOpacity onPress={() => setSortBy('date')} style={[s.sortBtn, sortBy === 'date' && s.sortBtnActive]}>
                <Text style={[s.sortText, sortBy === 'date' && s.sortTextActive]}>📅 Date</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSortBy('user')} style={[s.sortBtn, sortBy === 'user' && s.sortBtnActive]}>
                <Text style={[s.sortText, sortBy === 'user' && s.sortTextActive]}>👤 User</Text>
              </TouchableOpacity>
            </View>
            <TextInput value={compSearch} onChangeText={setCompSearch} placeholder="Search by email or act title..." placeholderTextColor={C.muted} style={s.searchInput} />
            {loadingCompletions ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={C.primary} />
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Loading acts…</Text>
              </View>
            ) : filteredCompletions.length === 0 ? (
              <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                {compSearch ? 'No results match your search' : 'No acts recorded yet'}
              </Text>
            ) : filteredCompletions.map((c) => (
              <View key={c.id} style={s.compRow}>
                <View style={s.compIcon}><Text style={{ fontSize: 18 }}>{PROOF_ICONS[c.proof_type] || '✅'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.compTitle} numberOfLines={1}>{c.act_title || '(untitled)'}</Text>
                  <Text style={s.compMeta} numberOfLines={1}>
                    {c.user_phone || '(no phone)'}
                  </Text>
                  <Text style={s.compDate}>Day {c.day_number}  •  {formatDateTime(c.completed_at)}</Text>
                  {c.notes ? <Text style={s.compNotes} numberOfLines={2}>"{c.notes}"</Text> : null}
                </View>
                <TouchableOpacity onPress={() => handleRemoveAndNotify(c)} disabled={deletingComp === c.id} style={s.deleteBtn}>
                  <Text style={{ fontSize: 16 }}>🚫</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteCompletion(c)} disabled={deletingComp === c.id} style={s.deleteBtn}>
                  {deletingComp === c.id ? <ActivityIndicator size="small" color={C.error} /> : <Text style={{ fontSize: 16 }}>🗑️</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        )}

        {activeTab === 'users' && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={s.section}>🗂 Manage Users</Text>
              <TouchableOpacity onPress={fetchUsers} style={s.refreshBtn}>
                <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => setUserSort('joined')} style={[s.sortBtn, userSort === 'joined' && s.sortBtnActive]}>
                <Text style={[s.sortText, userSort === 'joined' && s.sortTextActive]}>{'\uD83D\uDCC5'} Joined</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUserSort('name')} style={[s.sortBtn, userSort === 'name' && s.sortBtnActive]}>
                <Text style={[s.sortText, userSort === 'name' && s.sortTextActive]}>{'\uD83D\uDD24'} Name</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUserSort('phone')} style={[s.sortBtn, userSort === 'phone' && s.sortBtnActive]}>
                <Text style={[s.sortText, userSort === 'phone' && s.sortTextActive]}>{'\uD83D\uDCDE'} Phone</Text>
              </TouchableOpacity>
            </View>
            {loadingUsers ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={C.primary} />
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Loading users…</Text>
              </View>
            ) : filteredUsers.length === 0 ? (
              <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                No users found
              </Text>
            ) : filteredUsers.map((u) => {
              const nm = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
              const name = nm || 'Test';
              const phoneDisp = u.phone ? e164ToDisplay(u.phone) : '(no phone)';
              const acts = u.acts ?? completions.filter(c => c.user_phone === u.phone).length;
              return (
                <View key={u.id} style={s.userRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.userEmail} numberOfLines={1}>{name}</Text>
                    <Text style={s.userMeta} numberOfLines={1}>
                      {phoneDisp}  •  {acts} {acts === 1 ? 'act' : 'acts'}  •  Joined {formatDate(u.created_at)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteUser(u)} disabled={deletingUser === u.id} style={s.deleteBtn}>
                    {deletingUser === u.id ? <ActivityIndicator size="small" color={C.error} /> : <Text style={{ fontSize: 16 }}>🗑️</Text>}
                  </TouchableOpacity>
                </View>
              );
            })}
          </Card>
        )}

        {activeTab === 'groups' && (
          <Card>
            <Text style={s.section}>🏆 Groups</Text>
            {loadingGroups ? <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} /> : groups.length === 0 ? (
              <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No groups found</Text>
            ) : groups.map(g => (
              <View key={g.id} style={s.userRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.userEmail} numberOfLines={1}>{g.name || '(unnamed)'}</Text>
                  <Text style={s.userMeta} numberOfLines={1}>
                    {(g.members ?? 0)} {Number(g.members) === 1 ? 'member' : 'members'}  •  Code {g.join_code || '—'}  •  by {g.created_by_name || '—'}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {activeTab === 'zips' && (
          <Card>
            <Text style={s.section}>📍 ZIP Codes Covered</Text>
            {loadingZips ? <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} /> : zips.length === 0 ? (
              <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No ZIP data found</Text>
            ) : zips.map((z, i) => (
              <View key={z.zip || i} style={s.userRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.userEmail} numberOfLines={1}>{z.zip}{z.state ? `  ·  ${z.state}` : ''}</Text>
                  <Text style={s.userMeta} numberOfLines={1}>{z.users} {Number(z.users) === 1 ? 'user' : 'users'}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {activeTab === 'admins' && (
          <ManageList
            items={admins} loading={loadingAdmins}
            onAdd={handleAddAdmin} onRemove={handleRemoveAdmin}
            phone={newAdminPhone} setPhone={setNewAdminPhone}
            adding={addingAdmin} emoji="🔐" label="Admins"
          />
        )}

        {activeTab === 'reviewers' && (
          <ManageList
            items={reviewers} loading={loadingReviewers}
            onAdd={handleAddReviewer} onRemove={handleRemoveReviewer}
            phone={newReviewerPhone} setPhone={setNewReviewerPhone}
            adding={addingReviewer} emoji="🔍" label="Reviewers"
          />
        )}

      </ScrollView>

      <KeyboardDoneBar />

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={hideConfirm}
      />
    </View>
  );
}

const s = StyleSheet.create({
  section: { color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 0, flex: 1 },
  row:     { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minWidth: '45%', backgroundColor: C.card2, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center' },
  tileVal: { fontSize: 24, fontWeight: '900' },
  tileLbl: { color: C.muted, fontSize: 11, marginTop: 4, textAlign: 'center' },
  growthNote: { color: C.muted, fontSize: 11, marginBottom: 10, marginTop: -4 },
  ratePct: { fontSize: 26, fontWeight: '900' },
  rateLbl: { color: C.muted, fontSize: 11, marginBottom: 6 },
  barBg:   { height: 6, backgroundColor: C.surface, borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
  tabRow:  { flexDirection: 'row', gap: 8 },
  tabBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: C.border },
  tabBtnActive:  { backgroundColor: C.primary, borderColor: C.primary },
  tabText:       { color: C.muted, fontWeight: '700', fontSize: 12 },
  tabTextActive: { color: C.bg },
  refreshBtn: { backgroundColor: C.primary + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badge: { backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  searchInput: { backgroundColor: C.card2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  sortRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sortBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, marginRight: 8 },
  sortBtnActive:  { backgroundColor: C.primary + '33', borderColor: C.primary },
  sortText:       { color: C.muted, fontSize: 12, fontWeight: '600' },
  sortTextActive: { color: C.primary, fontWeight: '700' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border + '44' },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  userEmail: { color: C.text, fontSize: 13, fontWeight: '600' },
  userMeta:  { color: C.muted, fontSize: 11, marginTop: 2 },
  deleteBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.error + '18' },
  compRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border + '44' },
  compIcon: { width: 36, height: 36, borderRadius: 10, marginTop: 2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  compTitle:  { color: C.text, fontSize: 13, fontWeight: '600' },
  compMeta:   { color: C.primary, fontSize: 11, marginTop: 2 },
  compDate:   { color: C.muted, fontSize: 11, marginTop: 2 },
  compNotes:  { color: C.sub, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitleInline: { color: C.text, fontSize: 18, fontWeight: '900' },
  actRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border + '44' },
  accessoryBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  accessoryDone: {
    color: '#0a84ff', fontSize: 16, fontWeight: '700',
  },
});
