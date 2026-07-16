import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform, Modal,
  InputAccessoryView, Keyboard,
} from 'react-native';
import { Card, ScreenHeader } from '../components';
import { C } from '../constants';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

import { supabase } from '../lib/supabase';

const REST_HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
};

const KEYBOARD_ACCESSORY_ID = 'adminKeyboardAccessory';

const STATS = {
  totalUsers: 1842, activeUsers: 634,
  challengesStarted: 1203, challengesActive: 421,
  challengesCompleted: 318, challengesAbandoned: 464,
  completionRate: 0.64, recentRate: 0.71, missedDayRate: 0.23,
  photo: 4821, video: 2103, story: 3940,
  qrViews: 892, copies: 441, opens: 367,
  feedbackCount: 128,
};

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

function StatTile({ icon, label, value, color }) {
  return (
    <View style={[s.tile, { borderColor: (color || C.primary) + '44' }]}>
      <Text style={{ fontSize: 22, marginBottom: 6 }}>{icon}</Text>
      <Text style={[s.tileVal, { color: color || C.primary }]}>{value}</Text>
      <Text style={s.tileLbl}>{label}</Text>
    </View>
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
// SponsorList
// IMPORTANT: `phone` here is RAW DIGITS. Display formatting happens via
// `formatDigitsForDisplay(phone)` only — keeping the TextInput's `value`
// drift to a single character per keystroke (otherwise iOS drops focus
// after the first digit when value jumps from "" to "(9").
// ─────────────────────────────────────────────────────────────────────────
function SponsorList({
  items, loading, sponsors, loadingSponsors,
  onAdd, onRemove,
  phone, setPhone, name, setName, email, setEmail,
  selectedSponsorId, setSelectedSponsorId,
  adding,
}) {
  const [showSponsorPicker, setShowSponsorPicker] = useState(false);

  const validPhone = phone.length === 10;
  const canAdd = validPhone && !!selectedSponsorId;

  const selectedSponsor = sponsors.find(sp => sp.id === selectedSponsorId);
  const sponsorById = sponsors.reduce((acc, sp) => { acc[sp.id] = sp.name; return acc; }, {});

  return (
    <Card>
      <Text style={s.section}>🏢 Organizer</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 6, marginBottom: 10 }}>
        Grant sponsor access by phone number. Sponsors log in the same way as
        employees (phone OTP) — this table just tells the app they belong to a
        sponsor company. Email and name are optional.
      </Text>

      <TextInput
        value={formatDigitsForDisplay(phone)}
        onChangeText={t => setPhone(digitsOnly(t))}
        placeholder="Phone — (917) 721-8269"
        placeholderTextColor={C.muted}
        keyboardType="phone-pad"
        maxLength={14}
        inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
        style={s.searchInput}
      />

      <TouchableOpacity
        onPress={() => setShowSponsorPicker(true)}
        disabled={loadingSponsors || sponsors.length === 0}
        style={[s.searchInput, { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 }]}
      >
        <Text style={{
          color: selectedSponsor ? C.text : C.muted,
          fontSize: 13,
          flex: 1,
        }}>
          {loadingSponsors
            ? 'Loading sponsors…'
            : selectedSponsor
              ? selectedSponsor.name
              : sponsors.length === 0
                ? 'No sponsors found — create one in DB first'
                : 'Select sponsor…'}
        </Text>
        <Text style={{ color: C.sub }}>▾</Text>
      </TouchableOpacity>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name (optional)"
        placeholderTextColor={C.muted}
        style={s.searchInput}
      />

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email (optional)"
        placeholderTextColor={C.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        style={s.searchInput}
      />

      <TouchableOpacity
        onPress={onAdd}
        disabled={adding || !canAdd}
        style={{
          backgroundColor: C.primary, borderRadius: 10,
          paddingVertical: 11, alignItems: 'center',
          opacity: !canAdd ? 0.4 : 1, marginBottom: 16,
        }}
      >
        {adding
          ? <ActivityIndicator size="small" color={C.bg} />
          : <Text style={{ color: C.bg, fontWeight: '700' }}>+ Add Organizer Admin</Text>}
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={C.primary} />
      ) : items.length === 0 ? (
        <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
          No sponsor admins yet
        </Text>
      ) : items.map(item => {
        const sponsorName = sponsorById[item.sponsor_id] || '(unknown sponsor)';
        const primaryLabel = item.name || e164ToDisplay(item.phone);
        const secondaryBits = [];
        if (item.name) secondaryBits.push(e164ToDisplay(item.phone));
        if (item.email) secondaryBits.push(item.email);

        return (
          <View key={item.id} style={s.userRow}>
            <View style={s.userAvatar}>
              <Text style={{ fontSize: 16 }}>🏢</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.userEmail} numberOfLines={1}>{primaryLabel}</Text>
              <Text style={[s.userMeta, { color: C.primary }]} numberOfLines={1}>
                {sponsorName}
              </Text>
              {secondaryBits.length > 0 && (
                <Text style={s.userMeta} numberOfLines={1}>
                  {secondaryBits.join(' · ')}
                </Text>
              )}
              <Text style={s.userMeta}>
                Added {item.added_at ? new Date(item.added_at).toLocaleDateString() : '—'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => onRemove(item)} style={s.deleteBtn}>
              <Text style={{ fontSize: 16 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <Modal visible={showSponsorPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitleInline}>Select Sponsor</Text>
            <TouchableOpacity onPress={() => setShowSponsorPicker(false)}>
              <Text style={{ color: C.primary, fontSize: 16, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {sponsors.map(sp => {
              const isSelected = sp.id === selectedSponsorId;
              return (
                <TouchableOpacity
                  key={sp.id}
                  onPress={() => { setSelectedSponsorId(sp.id); setShowSponsorPicker(false); }}
                  style={[s.actRow, isSelected && { backgroundColor: C.primary + '22' }]}
                >
                  <Text style={{ fontSize: 20, marginRight: 10 }}>🏢</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.userEmail, isSelected && { color: C.primary }]}>{sp.name}</Text>
                    <Text style={s.userMeta}>{sp.slug}</Text>
                  </View>
                  {isSelected && <Text style={{ color: C.primary }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </Card>
  );
}

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

  const [sponsorAdmins,        setSponsorAdmins]        = useState([]);
  const [loadingSponsorAdmins, setLoadingSponsorAdmins] = useState(false);
  const [sponsors,             setSponsors]             = useState([]);
  const [loadingSponsors,      setLoadingSponsors]      = useState(false);
  const [newSponsorPhone,      setNewSponsorPhone]      = useState('');
  const [newSponsorName,       setNewSponsorName]       = useState('');
  const [newSponsorEmail,      setNewSponsorEmail]      = useState('');
  const [newSponsorSponsorId,  setNewSponsorSponsorId]  = useState(null);
  const [addingSponsor,        setAddingSponsor]        = useState(false);

  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) =>
    setConfirmModal({ visible: true, title, message, onConfirm });
  const hideConfirm = () =>
    setConfirmModal(m => ({ ...m, visible: false, onConfirm: null }));

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, phone, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      setUsers(rows);
      setFilteredUsers(rows);
    } catch (e) { console.warn('Error loading users:', e.message); }
    finally { setLoadingUsers(false); }
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

  const fetchSponsors = useCallback(async () => {
    setLoadingSponsors(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/sponsors?select=*&active=eq.true&order=name.asc`,
        { headers: REST_HEADERS }
      );
      const data = await res.json();
      setSponsors(Array.isArray(data) ? data : []);
    } catch (e) { console.warn('Error loading sponsors:', e.message); }
    finally { setLoadingSponsors(false); }
  }, []);

  const fetchSponsorAdmins = useCallback(async () => {
    setLoadingSponsorAdmins(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/sponsor_admins?select=*&order=added_at.desc`,
        { headers: REST_HEADERS }
      );
      const data = await res.json();
      setSponsorAdmins(Array.isArray(data) ? data : []);
    } catch (e) { console.warn('Error loading sponsor admins:', e.message); }
    finally { setLoadingSponsorAdmins(false); }
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

  const handleAddSponsor = useCallback(async () => {
    const e164 = digitsToE164(newSponsorPhone);
    if (!e164) {
      Alert.alert('Invalid phone', 'Enter a 10-digit US phone number like (917) 721-8269.');
      return;
    }
    if (!newSponsorSponsorId) {
      Alert.alert('Missing sponsor', 'Please select which sponsor company this admin belongs to.');
      return;
    }
    setAddingSponsor(true);
    try {
      const body = {
        phone:      e164,
        sponsor_id: newSponsorSponsorId,
        name:       newSponsorName.trim()  || null,
        email:      newSponsorEmail.trim() || null,
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/sponsor_admins`, {
        method: 'POST',
        headers: { ...REST_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      });
      if (res.ok || res.status === 201) {
        setNewSponsorPhone('');
        setNewSponsorName('');
        setNewSponsorEmail('');
        setNewSponsorSponsorId(null);
        fetchSponsorAdmins();
      } else {
        const t = await res.text();
        Alert.alert('Failed', t);
      }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setAddingSponsor(false); }
  }, [newSponsorPhone, newSponsorSponsorId, newSponsorName, newSponsorEmail, fetchSponsorAdmins]);

  const handleRemoveSponsor = useCallback((sa) => {
    const display = e164ToDisplay(sa.phone);
    showConfirm('Remove Sponsor Admin', `Remove ${sa.name || display} as sponsor admin?`, () => {
      hideConfirm();
      fetch(`${SUPABASE_URL}/rest/v1/sponsor_admins?id=eq.${sa.id}`, {
        method: 'DELETE', headers: REST_HEADERS,
      })
        .then(res => {
          if (res.ok || res.status === 204) {
            setSponsorAdmins(prev => prev.filter(x => x.id !== sa.id));
          } else {
            res.text().then(t => Alert.alert('Failed', t));
          }
        });
    });
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchCompletions();
    fetchAdmins();
    fetchReviewers();
    fetchSponsors();
    fetchSponsorAdmins();
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
        keyboardShouldPersistTaps="handled">

        <Card>
          <Text style={s.section}>👥 Users</Text>
          <View style={s.row}>
            <StatTile icon="🧑‍🤝‍🧑" label="Total"  value={STATS.totalUsers.toLocaleString()} />
            <StatTile icon="⚡"       label="Active" value={STATS.activeUsers} color={C.success} />
          </View>
        </Card>

        <Card>
          <Text style={s.section}>🏆 Challenges</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            <StatTile icon="🚀" label="Started"   value={STATS.challengesStarted} />
            <StatTile icon="🔥" label="Active"    value={STATS.challengesActive}    color={C.warning} />
            <StatTile icon="✅" label="Completed" value={STATS.challengesCompleted} color={C.success} />
            <StatTile icon="💤" label="Abandoned" value={STATS.challengesAbandoned} color={C.error} />
          </View>
        </Card>

        <Card>
          <Text style={s.section}>📊 Completion Rates</Text>
          <View style={s.row}>
            <RateBar label="Overall"     pct={STATS.completionRate} />
            <RateBar label="Recent (7d)" pct={STATS.recentRate}     color={C.success} />
          </View>
          <View style={{ marginTop: 14 }}>
            <RateBar label="Missed Day Rate" pct={STATS.missedDayRate} color={C.error} />
          </View>
        </Card>

        <Card>
          <Text style={s.section}>📎 Proof Types</Text>
          <View style={s.row}>
            <StatTile icon="📷" label="Photo" value={STATS.photo.toLocaleString()} color="#4ade80" />
            <StatTile icon="🎥" label="Video" value={STATS.video.toLocaleString()} color="#86efac" />
            <StatTile icon="✍️" label="Story" value={STATS.story.toLocaleString()} color="#a3e635" />
          </View>
        </Card>

        <Card>
          <Text style={s.section}>💛 Donations</Text>
          <View style={s.row}>
            <StatTile icon="👁️" label="QR Views" value={STATS.qrViews} />
            <StatTile icon="📋" label="Copies"   value={STATS.copies} />
            <StatTile icon="🔗" label="Opens"    value={STATS.opens}   color={C.success} />
          </View>
        </Card>

        <Card>
          <Text style={s.section}>💬 Feedback</Text>
          <StatTile icon="📝" label="Total Submissions" value={STATS.feedbackCount} />
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }}
          keyboardShouldPersistTaps="handled">
          <View style={[s.tabRow, { paddingHorizontal: 2 }]}>
            {[
              { key: 'completions', label: `🔍 Review${completions.length > 0 ? ` (${completions.length})` : ''}` },
              { key: 'users',       label: `👥 Users${users.length > 0 ? ` (${users.length})` : ''}` },
              { key: 'admins',      label: '🔐 Admins' },
              { key: 'reviewers',   label: '🔍 Reviewers' },
              { key: 'sponsors',    label: `🏢 Sponsors${sponsorAdmins.length > 0 ? ` (${sponsorAdmins.length})` : ''}` },
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
              const acts = completions.filter(c => c.user_phone === u.phone).length;
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

        {activeTab === 'sponsors' && (
          <SponsorList
            items={sponsorAdmins}
            loading={loadingSponsorAdmins}
            sponsors={sponsors}
            loadingSponsors={loadingSponsors}
            onAdd={handleAddSponsor}
            onRemove={handleRemoveSponsor}
            phone={newSponsorPhone}                 setPhone={setNewSponsorPhone}
            name={newSponsorName}                   setName={setNewSponsorName}
            email={newSponsorEmail}                 setEmail={setNewSponsorEmail}
            selectedSponsorId={newSponsorSponsorId} setSelectedSponsorId={setNewSponsorSponsorId}
            adding={addingSponsor}
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