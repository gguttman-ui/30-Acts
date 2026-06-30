import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, FlatList, Alert,
} from 'react-native';
import { Card, ScreenHeader } from '../components';
import { C, ACT_CATEGORIES } from '../constants';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const REST_HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
};

const APPROVED_MSG = "Great work making the World a Kinder place";
const REJECTED_MSG = "We have reviewed your act and is not within our guidelines and will be deleted. Please perform an Act today that will bring happiness to someone else";

const SORT_OPTIONS = [
  { key: 'date_desc', label: '📅 Newest' },
  { key: 'date_asc',  label: '📅 Oldest' },
  { key: 'email',     label: '👤 Email' },
  { key: 'title',     label: '📝 Title' },
  { key: 'status',    label: '🔍 Status' },
];

export default function ReviewerScreen({ navigation, user, actCategories }) {
  const categories = actCategories || ACT_CATEGORIES;

  const [acts,       setActs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(null);
  const [selections, setSelections] = useState({});

  // Filters
  const [searchEmail,    setSearchEmail]    = useState('');
  const [searchTitle,    setSearchTitle]    = useState('');
  const [searchDate,     setSearchDate]     = useState('');
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [fromListFilter, setFromListFilter] = useState('all');
  const [sortBy,         setSortBy]         = useState('date_desc');
  const [showFilters,    setShowFilters]    = useState(true);

  // Add to list modal
  const [addModalAct,       setAddModalAct]       = useState(null); // act being added
  const [addStep,           setAddStep]           = useState('category'); // 'category' | 'newCategory'
  const [selectedCatId,     setSelectedCatId]     = useState(null);
  const [newCatLabel,       setNewCatLabel]        = useState('');
  const [newCatEmoji,       setNewCatEmoji]        = useState('⭐');
  const [addingToList,      setAddingToList]       = useState(false);

  const fetchActs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/completions?select=*&order=completed_at.desc&limit=500`,
        { headers: REST_HEADERS }
      );
      const data = await res.json();
      setActs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Error loading acts:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchActs(); }, []);

  const filteredActs = useMemo(() => {
    let list = [...acts];

    if (searchEmail.trim()) {
      const q = searchEmail.toLowerCase();
      list = list.filter(a => a.user_email?.toLowerCase().includes(q));
    }
    if (searchTitle.trim()) {
      const q = searchTitle.toLowerCase();
      list = list.filter(a => a.act_title?.toLowerCase().includes(q));
    }
    if (searchDate.trim()) {
      list = list.filter(a => a.completed_at?.startsWith(searchDate.trim()));
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        list = list.filter(a => !a.review_status || a.review_status === 'pending');
      } else {
        list = list.filter(a => a.review_status === statusFilter);
      }
    }
    if (fromListFilter === 'list') {
      list = list.filter(a => a.from_list === true);
    } else if (fromListFilter === 'custom') {
      list = list.filter(a => !a.from_list);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':  return new Date(a.completed_at) - new Date(b.completed_at);
        case 'date_desc': return new Date(b.completed_at) - new Date(a.completed_at);
        case 'email':     return (a.user_email || '').localeCompare(b.user_email || '');
        case 'title':     return (a.act_title || '').localeCompare(b.act_title || '');
        case 'status':    return (a.review_status || 'pending').localeCompare(b.review_status || 'pending');
        default:          return 0;
      }
    });

    return list;
  }, [acts, searchEmail, searchTitle, searchDate, statusFilter, fromListFilter, sortBy]);

  const handleSelect = (id, value) => {
    setSelections(prev => ({ ...prev, [id]: prev[id] === value ? null : value }));
  };

  const sendMessage = async (act, status) => {
    const message = status === 'approved' ? APPROVED_MSG : REJECTED_MSG;
    const isPhone = act.user_email?.includes('@phone.30acts.app');
    try {
      if (isPhone) {
        const phoneNumber = act.user_email.replace('@phone.30acts.app', '');
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_sms_notification`, {
          method: 'POST', headers: REST_HEADERS,
          body: JSON.stringify({ phone_number: phoneNumber, message }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_email_notification`, {
          method: 'POST', headers: REST_HEADERS,
          body: JSON.stringify({ to_email: act.user_email, message, act_title: act.act_title }),
        });
      }
    } catch (e) { console.warn('Notification error:', e.message); }
  };

  const handleSubmit = async (act) => {
    const status = selections[act.id];
    if (!status) return;
    setSubmitting(act.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/completions?id=eq.${act.id}`, {
        method: 'PATCH',
        headers: { ...REST_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          review_status: status,
          reviewed_by:   user?.email || '',
          reviewed_at:   new Date().toISOString(),
        }),
      });
      if (res.ok || res.status === 204) {
        await sendMessage(act, status);
        setActs(prev => prev.map(a =>
          a.id === act.id ? { ...a, review_status: status, reviewed_by: user?.email } : a
        ));
        setSelections(prev => ({ ...prev, [act.id]: null }));
      } else {
        alert('Update failed: ' + await res.text());
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSubmitting(null);
    }
  };

  // ── Add to list ────────────────────────────────────────────────────────────
  const openAddModal = (act) => {
    setAddModalAct(act);
    setAddStep('category');
    setSelectedCatId(null);
    setNewCatLabel('');
    setNewCatEmoji('⭐');
  };

  const closeAddModal = () => {
    setAddModalAct(null);
    setAddStep('category');
    setSelectedCatId(null);
  };

  const handleAddToList = async () => {
    if (!addModalAct) return;

    let catId, catLabel, catEmoji;

    if (selectedCatId === '__new__') {
      if (!newCatLabel.trim()) {
        Alert.alert('Enter a category name');
        return;
      }
      catId    = newCatLabel.trim().toLowerCase().replace(/\s+/g, '_');
      catLabel = newCatLabel.trim();
      catEmoji = newCatEmoji.trim() || '⭐';
    } else {
      const cat = categories.find(c => c.id === selectedCatId);
      if (!cat) { Alert.alert('Select a category'); return; }
      catId    = cat.id;
      catLabel = cat.label;
      catEmoji = cat.emoji;
    }

    setAddingToList(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/custom_acts`, {
        method: 'POST',
        headers: { ...REST_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          category_id:    catId,
          category_label: catLabel,
          category_emoji: catEmoji,
          act_title:      addModalAct.act_title,
          added_by:       user?.email || null,
        }),
      });

      if (res.ok || res.status === 201 || res.status === 204) {
        Alert.alert('✅ Added!', `"${addModalAct.act_title}" added to ${catLabel}`);
        closeAddModal();
      } else {
        const err = await res.text();
        Alert.alert('Error', err);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setAddingToList(false);
    }
  };

  const clearFilters = () => {
    setSearchEmail('');
    setSearchTitle('');
    setSearchDate('');
    setStatusFilter('all');
    setFromListFilter('all');
    setSortBy('date_desc');
  };

  const hasFilters = searchEmail || searchTitle || searchDate
    || statusFilter !== 'all' || fromListFilter !== 'all' || sortBy !== 'date_desc';

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  };

  const statusColor = (s) => s === 'approved' ? C.success : s === 'rejected' ? C.error : C.muted;
  const statusLabel = (s) => s === 'approved' ? '✅ Approved' : s === 'rejected' ? '❌ Rejected' : '⏳ Pending';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Review Acts" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>

        {/* Filter toggle */}
        <TouchableOpacity
          onPress={() => setShowFilters(v => !v)}
          style={[s.filterToggle, hasFilters && { borderColor: C.primary }]}
        >
          <Text style={[s.filterToggleText, hasFilters && { color: C.primary }]}>
            🔍 Filters & Sort {hasFilters ? '(active)' : ''} {showFilters ? '▲' : '▼'}
          </Text>
          {hasFilters && (
            <TouchableOpacity onPress={clearFilters}>
              <Text style={{ color: C.error, fontSize: 12, fontWeight: '700' }}>Clear</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {showFilters && (
          <Card>
            <TextInput
              value={searchEmail} onChangeText={setSearchEmail}
              placeholder="Filter by email..." placeholderTextColor={C.muted}
              style={s.input} autoCapitalize="none"
            />
            <TextInput
              value={searchTitle} onChangeText={setSearchTitle}
              placeholder="Filter by act title..." placeholderTextColor={C.muted}
              style={s.input}
            />
            <TextInput
              value={searchDate} onChangeText={setSearchDate}
              placeholder="Filter by date (e.g. 2026-03-28)..." placeholderTextColor={C.muted}
              style={s.input}
            />

            <Text style={s.filterLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['all', 'pending', 'approved', 'rejected'].map(opt => (
                  <TouchableOpacity key={opt} onPress={() => setStatusFilter(opt)}
                    style={[styles.chip, statusFilter === opt && styles.chipActive]}>
                    <Text style={[styles.chipText, statusFilter === opt && styles.chipTextActive]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.filterLabel}>Act Source</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { key: 'all',    label: 'All Acts' },
                  { key: 'list',   label: '📋 From List' },
                  { key: 'custom', label: '✏️ Custom' },
                ].map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => setFromListFilter(opt.key)}
                    style={[styles.chip, fromListFilter === opt.key && styles.chipActive]}>
                    <Text style={[styles.chipText, fromListFilter === opt.key && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.filterLabel}>Sort by</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => setSortBy(opt.key)}
                    style={[styles.chip, sortBy === opt.key && styles.chipActive]}>
                    <Text style={[styles.chipText, sortBy === opt.key && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Card>
        )}

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { label: 'Total',    num: acts.length,                                                                color: C.text },
            { label: 'Approved', num: acts.filter(a => a.review_status === 'approved').length,                    color: C.success },
            { label: 'Rejected', num: acts.filter(a => a.review_status === 'rejected').length,                    color: C.error },
            { label: 'Pending',  num: acts.filter(a => !a.review_status || a.review_status === 'pending').length, color: C.warning },
          ].map(({ label, num, color }) => (
            <View key={label} style={s.badge}>
              <Text style={[s.badgeNum, { color }]}>{num}</Text>
              <Text style={s.badgeLbl}>{label}</Text>
            </View>
          ))}
        </View>

        {hasFilters && (
          <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>
            Showing {filteredActs.length} of {acts.length} acts
          </Text>
        )}

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={C.primary} />
            <Text style={{ color: C.muted, marginTop: 8 }}>Loading acts…</Text>
          </View>
        ) : filteredActs.length === 0 ? (
          <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 32 }}>No acts found</Text>
        ) : (
          filteredActs.map(act => {
            const sel = selections[act.id];
            const isCustom = !act.from_list;
            return (
              <Card key={act.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={s.actTitle} numberOfLines={1}>{act.act_title || '(untitled)'}</Text>
                  <Text style={[s.status, { color: statusColor(act.review_status) }]}>
                    {statusLabel(act.review_status)}
                  </Text>
                </View>
                <Text style={s.actMeta}>{act.user_email}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={s.actDate}>
                    Day {act.day_number}  •  {formatDate(act.completed_at)}  •  {act.proof_type}
                  </Text>
                  {act.from_list
                    ? <Text style={s.fromListBadge}>📋 From list</Text>
                    : <Text style={s.customBadge}>✏️ Custom</Text>
                  }
                </View>
                {act.notes ? <Text style={s.actNotes} numberOfLines={3}>"{act.notes}"</Text> : null}
                {act.reviewed_by ? <Text style={s.reviewedBy}>Reviewed by {act.reviewed_by}</Text> : null}

                {/* Add to list button for custom acts */}
                {isCustom && (
                  <TouchableOpacity onPress={() => openAddModal(act)} style={s.addToListBtn}>
                    <Text style={s.addToListText}>➕ Add to Act List</Text>
                  </TouchableOpacity>
                )}

                <View style={s.checkRow}>
                  <TouchableOpacity style={s.checkItem} onPress={() => handleSelect(act.id, 'approved')}>
                    <View style={[s.checkbox, sel === 'approved' && { backgroundColor: C.success, borderColor: C.success }]}>
                      {sel === 'approved' && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={[s.checkLabel, sel === 'approved' && { color: C.success }]}>Validated</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={s.checkItem} onPress={() => handleSelect(act.id, 'rejected')}>
                    <View style={[s.checkbox, sel === 'rejected' && { backgroundColor: C.error, borderColor: C.error }]}>
                      {sel === 'rejected' && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={[s.checkLabel, sel === 'rejected' && { color: C.error }]}>Rejected</Text>
                  </TouchableOpacity>

                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    {submitting === act.id ? (
                      <ActivityIndicator color={C.primary} />
                    ) : (
                      <TouchableOpacity onPress={() => handleSubmit(act)} disabled={!sel}
                        style={[s.submitBtn, !sel && { opacity: 0.4 }]}>
                        <Text style={s.submitBtnText}>Submit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* ── Add to List Modal ── */}
      <Modal visible={!!addModalAct} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            {addStep === 'newCategory' ? (
              <TouchableOpacity onPress={() => setAddStep('category')}>
                <Text style={{ color: C.primary, fontSize: 15, fontWeight: '700' }}>← Back</Text>
              </TouchableOpacity>
            ) : (
              <Text style={s.modalTitle}>Add to Act List</Text>
            )}
            <TouchableOpacity onPress={closeAddModal}>
              <Text style={{ color: C.muted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Act being added */}
          <View style={{ padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>ADDING ACT</Text>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{addModalAct?.act_title}</Text>
          </View>

          {addStep === 'category' ? (
            <>
              <Text style={{ color: C.sub, fontSize: 13, padding: 16, paddingBottom: 8 }}>
                Choose a category to add this act to:
              </Text>
              <FlatList
                data={[...categories, { id: '__new__', label: '+ Create New Category', emoji: '✨' }]}
                keyExtractor={item => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 12 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedCatId(item.id);
                      if (item.id === '__new__') {
                        setAddStep('newCategory');
                      }
                    }}
                    style={[s.catPickRow, selectedCatId === item.id && { borderColor: C.primary, backgroundColor: C.primary + '18' }]}
                  >
                    <Text style={{ fontSize: 24, marginRight: 12 }}>{item.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.catPickLabel, item.id === '__new__' && { color: C.primary }]}>{item.label}</Text>
                      {item.acts && <Text style={s.catPickCount}>{item.acts.length} acts</Text>}
                    </View>
                    {selectedCatId === item.id && item.id !== '__new__' && (
                      <Text style={{ color: C.primary, fontSize: 16 }}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListFooterComponent={
                  selectedCatId && selectedCatId !== '__new__' ? (
                    <TouchableOpacity
                      onPress={handleAddToList}
                      disabled={addingToList}
                      style={[s.confirmBtn, addingToList && { opacity: 0.5 }]}
                    >
                      {addingToList
                        ? <ActivityIndicator color={C.bg} />
                        : <Text style={s.confirmBtnText}>Add to This Category ✓</Text>
                      }
                    </TouchableOpacity>
                  ) : null
                }
              />
            </>
          ) : (
            // New category form
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
              <Text style={{ color: C.sub, fontSize: 13, marginBottom: 8 }}>
                Create a new category for this act:
              </Text>

              <View>
                <Text style={s.fieldLabel}>Category Name *</Text>
                <TextInput
                  value={newCatLabel}
                  onChangeText={setNewCatLabel}
                  placeholder="e.g. Acts of Gratitude"
                  placeholderTextColor={C.muted}
                  style={s.input}
                />
              </View>

              <View>
                <Text style={s.fieldLabel}>Emoji</Text>
                <TextInput
                  value={newCatEmoji}
                  onChangeText={setNewCatEmoji}
                  placeholder="⭐"
                  placeholderTextColor={C.muted}
                  style={[s.input, { fontSize: 24, textAlign: 'center' }]}
                  maxLength={2}
                />
              </View>

              <TouchableOpacity
                onPress={handleAddToList}
                disabled={addingToList || !newCatLabel.trim()}
                style={[s.confirmBtn, (addingToList || !newCatLabel.trim()) && { opacity: 0.5 }]}
              >
                {addingToList
                  ? <ActivityIndicator color={C.bg} />
                  : <Text style={s.confirmBtnText}>Create Category & Add Act ✓</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  filterToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.card2, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.border,
  },
  filterToggleText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  filterLabel: { color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: C.card2, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 9, color: C.text, fontSize: 13,
    borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  badge: { flex: 1, backgroundColor: C.card2, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  badgeNum: { fontSize: 20, fontWeight: '900' },
  badgeLbl: { color: C.muted, fontSize: 10, marginTop: 2 },
  actTitle:   { color: C.text, fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  status:     { fontSize: 11, fontWeight: '700' },
  actMeta:    { color: C.primary, fontSize: 11, marginBottom: 2 },
  actDate:    { color: C.muted, fontSize: 11 },
  actNotes:   { color: C.sub, fontSize: 11, fontStyle: 'italic', marginBottom: 4 },
  reviewedBy: { color: C.muted, fontSize: 10, marginBottom: 8 },
  fromListBadge: { color: C.primary, fontSize: 10, fontWeight: '700', backgroundColor: C.primary + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  customBadge:   { color: C.muted,   fontSize: 10, fontWeight: '700', backgroundColor: C.surface,        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  addToListBtn: {
    backgroundColor: C.primary + '18', borderWidth: 1, borderColor: C.primary + '44',
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    alignSelf: 'flex-start', marginBottom: 10,
  },
  addToListText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  checkRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 16 },
  checkItem:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: C.border, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card2,
  },
  checkmark:    { color: '#fff', fontSize: 14, fontWeight: '900' },
  checkLabel:   { color: C.muted, fontSize: 13, fontWeight: '600' },
  submitBtn:    { backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  submitBtnText: { color: C.bg, fontWeight: '700', fontSize: 13 },
  // Modal
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  catPickRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  catPickLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  catPickCount: { color: C.muted, fontSize: 12, marginTop: 2 },
  fieldLabel: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  confirmBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  confirmBtnText: { color: C.bg, fontWeight: '800', fontSize: 15 },
});

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
  },
  chipActive:     { backgroundColor: C.primary + '33', borderColor: C.primary },
  chipText:       { color: C.muted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: C.primary, fontWeight: '700' },
});