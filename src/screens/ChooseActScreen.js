import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
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
import { emptyActsMessage, draftFromSearch } from '../lib/emptySearch';
import { searchActs } from '../lib/actSearch';
import { ACT_TAGS, filterByTags } from '../lib/actTags';

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

// Backlog 94: while a child profile is selected on Home, acts belong to the
// child's member key, so "whose acts" comes from src/lib/actingAs.js.
import { actingPhone, isActingAsChild } from '../lib/actingAs';
const extractPhone = (email) => actingPhone(email);

export default function ChooseActScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const day = route.params?.day || null;

  const [timeFilterId, setTimeFilterId] = useState('any');
  const [costFilterId, setCostFilterId] = useState('any');
  const [search,       setSearch]       = useState('');
  // Fix 7: filter chips (several can be on; an act must match them all).
  const [chips,        setChips]        = useState([]);
  const toggleChip = (id) =>
    setChips((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
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

  // Fix 7: forgiving search (capitals, a typo or two) plus the chips. When
  // nothing matches exactly, the closest matches are shown with a note.
  const { filtered, closest } = useMemo(() => {
    const base = filterByTags(
      sourceActs.filter(a => timeOption.test(a) && costOption.test(a)),
      chips,
    );
    const { results, closest: near } = searchActs(base, search);
    return { filtered: results, closest: near };
  }, [sourceActs, timeOption, costOption, search, chips]);

  // Fix 7: tapping an act goes straight back to the log screen with the act
  // in the story - no separate select button.
  const handleCreate = (picked) => {
    if (!picked) return;

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

  const renderItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => handleCreate(item)}
      activeOpacity={0.7}
      style={s.row}
    >
      <Text style={s.rowTitle} numberOfLines={4} ellipsizeMode="tail">
        {item.title}
      </Text>
      <Text style={s.rowChevron}>›</Text>
    </TouchableOpacity>
  );

  // "Write my own instead": the log screen, keeping any words already typed
  // (here in Search, or on the log screen before it opened this list).
  const writeOwn = () => navigation.navigate('MyStory', {
    day,
    draftStory: draftFromSearch(search) || route.params?.draftStory || '',
  });

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
        onBack={() => navigation.navigate('Main', { screen: 'Home' })}
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {ACT_TAGS.map((t) => {
            const on = chips.includes(t.id);
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => toggleChip(t.id)}
                style={[s.chip, on && s.chipOn]}
                activeOpacity={0.7}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{on ? '✓ ' : ''}{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={s.matchCount}>
          {closest
            ? `No exact match. Closest ${filtered.length === 1 ? 'match' : 'matches'}:`
            : `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'}`}
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
              {emptyActsMessage(search, timeActive || costActive || chips.length > 0)}
            </Text>
            <Btn
              label="Write my own act"
              onPress={writeOwn}
              style={{ marginTop: 16 }}
            />
          </View>
        }
      />

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Btn label="Write my own instead" variant="secondary" onPress={writeOwn} />
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
    color: C.onPrimary,
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
    color: C.primaryText,
    fontWeight: '800',
  },

  // Fix 7: filter chips
  chipRow:     { gap: 8, paddingTop: 10, paddingBottom: 2, paddingRight: 8 },
  chip:        { borderWidth: 1.5, borderColor: C.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: C.card2 },
  chipOn:      { borderColor: C.primary, backgroundColor: C.primary + '33' },
  chipText:    { color: C.text, fontSize: 13, fontWeight: '600' },
  chipTextOn:  { color: C.primaryText, fontWeight: '800' },
  rowChevron:  { color: C.muted, fontSize: 20, fontWeight: '600', marginLeft: 8 },

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
    color: C.primaryText,
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
  checkMark: { color: C.primaryText, fontSize: 22, fontWeight: '900' },

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
    color: C.primaryText,
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
    color: C.primaryText,
    fontWeight: '800',
  },
  pickerCheck: {
    color: C.primaryText,
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