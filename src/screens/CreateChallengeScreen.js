import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Platform, Modal, Image,
  InputAccessoryView, Keyboard, Alert,
} from 'react-native';
import { Btn, ScreenHeader } from '../components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  C, ALL_ACTS, formatTimeLabel, formatCostLabel,
  TIME_BUCKETS, COST_BUCKETS,
} from '../constants';
import { supabase } from '../lib/supabase';

const COMPANY_ICON = require('../assets/categories/Company.png');

const KB_DONE_ID = 'createChallengeKbDone';

// Filter dropdown options derived from the shared TIME_BUCKETS / COST_BUCKETS.
// "Any" is added on top so the user can clear the filter.
const TIME_OPTIONS = [
  { id: 'any', label: 'Any time', test: () => true },
  ...TIME_BUCKETS.map(b => ({
    id:    b.id,
    label: b.label,
    test:  a => b.test(a.timeMinutes),
  })),
];

const COST_OPTIONS = [
  { id: 'any', label: 'Any cost', test: () => true },
  ...COST_BUCKETS.map(b => ({
    id:    b.id,
    label: b.label,
    test:  a => b.test(a.costDollars),
  })),
];

const findOption = (options, id) =>
  options.find(o => o.id === id) ?? options[0];

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

export default function CreateChallengeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const day = route.params?.day || null;

  const [timeFilterId, setTimeFilterId] = useState('any');
  const [costFilterId, setCostFilterId] = useState('any');
  const [search,       setSearch]       = useState('');
  const [picked,       setPicked]       = useState(null);
  const [pickerOpen,   setPickerOpen]   = useState(null);

  // User's own custom acts. Fetched once on mount, merged into the
  // pickable list alongside ALL_ACTS.
  const [userCustomActs, setUserCustomActs] = useState([]);

// Fetch the user's personal acts catalog on mount.
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const phone = extractPhone(user?.email);
        if (!phone) return;

        const { data, error } = await supabase
          .from('user_custom_acts')
          .select('*')
          .eq('user_phone', phone)
          .eq('active', true);

        if (error) {
          console.warn('Fetch user custom acts error:', error.message);
          return;
        }

        // Normalize to the same shape ALL_ACTS uses.
        const normalized = (data || []).map(row => ({
          id:            `uca-${row.id}`,
          title:         row.title,
          timeMinutes:   row.time_minutes,
          costDollars:   row.cost_dollars != null ? Number(row.cost_dollars) : null,
          categoryId:    row.category_id || 'custom',
          categoryLabel: 'My Acts',
          categoryEmoji: COMPANY_ICON, // reuse for now; can give My Acts its own icon later
        }));
        setUserCustomActs(normalized);
      } catch (e) {
        console.warn('Fetch user custom acts failed:', e.message);
      }
    })();
  }, []);

  const timeOption      = findOption(TIME_OPTIONS, timeFilterId);
  const costOption      = findOption(COST_OPTIONS, costFilterId);
  const timeActive      = timeFilterId !== 'any';
  const costActive      = costFilterId !== 'any';

  // Standard acts + the user's personal acts, A-Z by title.
  const sourceActs = useMemo(() => {
    const list = [
      ...ALL_ACTS.filter(a => a.categoryId !== 'sponsor' && a.categoryLabel !== 'Company'),
      ...userCustomActs,
    ];
    return list.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    );
  }, [userCustomActs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sourceActs.filter(a => {
      if (!timeOption.test(a))                        return false;
      if (!costOption.test(a))                        return false;
      if (q && !a.title.toLowerCase().includes(q))    return false;
      return true;
    });
  }, [sourceActs, timeOption, costOption, search]);

const canCreate = !!picked;

  const handleCreate = () => {
    if (!canCreate) return;

    const preselectedAct = {
      id:            picked.id,
      title:         picked.title,
      timeMinutes:   picked.timeMinutes,
      costDollars:   picked.costDollars,
      categoryId:    picked.categoryId,
      categoryLabel: picked.categoryLabel,
      categoryEmoji: picked.categoryEmoji,
    };

    // When the picker was opened from the new My Story screen, return there
    // with the chosen act (and the story draft the user already typed),
    // instead of jumping into the full DailyAct flow. Default behavior
    // (calendar → picker → DailyAct) is unchanged.
    if (route.params?.returnTo === 'MyStory') {
      navigation.navigate('MyStory', {
        preselectedAct,
        day: route.params?.day || null,
        draftStory: route.params?.draftStory || '',
      });
      return;
    }

    // Story-only app: even without an explicit returnTo, land on MyStory
    // (act + story), never the retired DailyAct screen.
    navigation.navigate('MyStory', {
      day,
      preselectedAct,
    });
  };

  const renderItem = ({ item }) => {
    const isPicked = picked?.id === item.id;
    return (
      <TouchableOpacity
        onPress={() => setPicked(picked?.id === item.id ? null : item)}
        activeOpacity={0.7}
        style={[s.row, isPicked && s.rowPicked]}
      >
        <Text
          style={s.rowTitle}
          numberOfLines={4}
          ellipsizeMode="tail"
        >
          {item.title}
        </Text>

        {isPicked ? <Text style={s.checkMark}>✓</Text> : null}
      </TouchableOpacity>
    );
  };

const pickerOptions  = pickerOpen === 'time' ? TIME_OPTIONS
                       : pickerOpen === 'cost' ? COST_OPTIONS
                       : null;
  const pickerSelected = pickerOpen === 'time' ? timeFilterId
                       : pickerOpen === 'cost' ? costFilterId
                       : null;
  const pickerTitle    = pickerOpen === 'time' ? 'Filter by time'
                       : pickerOpen === 'cost' ? 'Filter by cost'
                       : '';

  const handlePickerSelect = (id) => {
    if (pickerOpen === 'time') setTimeFilterId(id);
    if (pickerOpen === 'cost') setCostFilterId(id);
    setPickerOpen(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="Create Act of Kindness"
        onBack={() => navigation.navigate('Main', { screen: 'Challenge' })}
      />

      <View style={s.controls}>
        {/* Search row */}
        <View style={s.searchRow}>
          <Text style={s.searchLabel}>Search</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Type to filter acts…"
            placeholderTextColor={C.muted}
            style={s.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            inputAccessoryViewID={KB_DONE_ID}
          />
        </View>

        <Text style={s.matchCount}>
          {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={{ fontSize: 36 }}>🔍</Text>
            <Text style={s.emptyText}>
              No acts match those filters. Try widening the time or cost.
            </Text>
            <Btn
              label="+ Create a New Act"
              onPress={() => navigation.navigate('MyStory', {
                day,
                draftStory: search.trim() ? `${search.trim()} ` : '',
              })}
              style={{ marginTop: 16 }}
            />
          </View>
        }
      />

     <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.footerRow}>
          <View style={{ flex: 1 }}>
            <Btn
              label={!picked ? 'Pick an Act' : 'Select Act'}
              variant="secondary"
              onPress={() => {
                if (!picked) {
                  Alert.alert('Pick an act', 'Tap an act from the list above first, then tap this button to log it.');
                  return;
                }
                handleCreate();
              }}
            />
          </View>
          <Text style={s.orLabel}>or</Text>
          <View style={{ flex: 1 }}>
            <Btn
              label="+ New Act"
              variant="secondary"
              onPress={() => navigation.navigate('MyStory', { day })}
            />
          </View>
        </View>
      </View>

      <Modal
        visible={pickerOpen != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(null)}
      >
        <TouchableOpacity
          style={s.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setPickerOpen(null)}
        >
          <View style={s.pickerCard}>
            <Text style={s.pickerTitle}>{pickerTitle}</Text>
            {pickerOptions?.map(opt => {
              const isActive = pickerSelected === opt.id;
              return (
                <TouchableOpacity
                  key={String(opt.id)}
                  style={[s.pickerOption, isActive && s.pickerOptionActive]}
                  onPress={() => handlePickerSelect(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerOptionText, isActive && s.pickerOptionTextActive]}>
                    {opt.label}
                  </Text>
                  {isActive && <Text style={s.pickerCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={KB_DONE_ID}>
          <View style={s.kbBar}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={s.kbDone}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  controls: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border + '55',
  },

  // Sponsor checkbox row at top — no box, just inline checkbox + label
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  checkRowActive: {
    // No styling needed — checkbox itself indicates state
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: C.bg,
  },
  checkRowIcon: {
    width: 28,
    height: 28,
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkboxMark: {
    color: C.bg,
    fontSize: 14,
    fontWeight: '900',
  },
  checkLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  checkLabelActive: {
    color: C.primary,
    fontWeight: '800',
  },

  filterRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card2,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownActive: {
    backgroundColor: C.primary + '22',
    borderColor: C.primary,
  },
  // When the recipient dropdown is unset, draw user attention since it's required.
  dropdownRequired: {
    borderColor: C.warning,
    borderStyle: 'dashed',
  },
  dropdownText: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  dropdownTextActive: {
    color: C.primary,
    fontWeight: '800',
  },
  dropdownTextRequired: {
    color: C.warning,
    fontWeight: '700',
  },
  dropdownCaret: {
    color: C.sub,
    fontSize: 18,
    marginLeft: 6,
  },

  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  recipientLabel: {
    color: C.sub,
    fontSize: 13,
    fontWeight: '700',
    width: 72,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  searchLabel: {
    color: C.sub,
    fontSize: 13,
    fontWeight: '700',
    width: 72,
  },
  searchInput: {
    flex: 1,
    backgroundColor: C.card2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
    borderWidth: 1.5,
    borderColor: C.border,
  },

  matchCount: { color: C.muted, fontSize: 11, marginTop: 6, textAlign: 'right' },

 row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    marginTop: 8,
  },
  rowPicked: { borderColor: C.primary, backgroundColor: C.primary + '15' },

  iconCol: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIcon:   { width: 26, height: 26 },
  rowIconLarge: { width: 38, height: 38 },
  checkMark: { color: C.primary, fontSize: 22, fontWeight: '900' },

  rowTitle: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },

  metaCol: {
    minWidth: 64,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metaTime: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '700',
  },
  metaCategory: {
    color: C.text,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  metaCost: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },

  emptyWrap:  { alignItems: 'center', padding: 32, paddingBottom: 140, gap: 12 },
  emptyText:  { color: C.sub, fontSize: 14, textAlign: 'center' },

footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: C.bg,
    borderTopWidth: 1, borderTopColor: C.border + '55',
  },
footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orLabel: {
    color: C.primary,
    fontWeight: '700',
    fontSize: 14,
    marginHorizontal: 12,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerCard: {
    width: '100%',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 8,
  },
  pickerTitle: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerOptionActive: {
    backgroundColor: C.primary + '15',
  },
  pickerOptionText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  pickerOptionTextActive: {
    color: C.primary,
    fontWeight: '800',
  },
  pickerCheck: {
    color: C.primary,
    fontSize: 18,
    fontWeight: '900',
  },

  kbBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  kbDone: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
});