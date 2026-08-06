import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  Platform, InputAccessoryView, Keyboard,
  Image, Modal,
} from 'react-native';
import { AppInput, Btn, ScreenHeader } from '../components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  C, ACT_CATEGORIES, todayStr, getActIcon, localDateInTZ,
  TIME_BUCKETS, COST_BUCKETS,
} from '../constants';
import { supabase } from '../lib/supabase';
import { getActiveSponsorIds } from '../lib/streak';

const KB_DONE_ID = 'createActKbDone';

// Map bucket id -> numeric midpoint stored in user_custom_acts.
// Mirrors the boundaries in TIME_BUCKETS / COST_BUCKETS.
const TIME_MIDPOINT_BY_ID = {
  immediate:   1,
  short:       3,
  brief:       10,
  moderate:    37,
  substantial: 120,
  major:       240,
};

const COST_MIDPOINT_BY_ID = {
  free:        0,
  small:       3,
  modest:      15,
  generous:    62,
  significant: 300,
  major:       750,
};

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

export default function CreateNewActScreen({ navigation, route, user, onComplete }) {
  const insets = useSafeAreaInsets();
  // The day for which we're auto-completing this new act.
  // Passed in from ChooseActScreen via route.params.day.
  const day = route?.params?.day || null;

  const [title,       setTitle]       = useState(route?.params?.prefillTitle || '');
  const [categoryId,  setCategoryId]  = useState(null);
  const [timeBucketId, setTimeBucketId] = useState(null);
  const [costBucketId, setCostBucketId] = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [savedAct,    setSavedAct]    = useState(null); // confirmation banner

  // Actual time/cost — only collected when this act is being logged as
  // today's act (i.e. `day` is present). Estimated lives on the act itself
  // (the buckets above); actual is per-use and is written to `completions`.
  const [actualHours,       setActualHours]       = useState('');
  const [actualMinutes,     setActualMinutes]     = useState('');
  const [actualCostDollars, setActualCostDollars] = useState('');

  // Modal visibility for each dropdown
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showTimePicker,     setShowTimePicker]     = useState(false);
  const [showCostPicker,     setShowCostPicker]     = useState(false);

  const scrollRef = useRef(null);

  // Actual time/cost validation (only enforced in the today's-act flow).
  const hoursDigitsOk   = /^\d*$/.test(actualHours.trim());
  const minutesDigitsOk = /^\d*$/.test(actualMinutes.trim());
  const hoursNum   = actualHours.trim()   === '' ? 0 : parseInt(actualHours,   10);
  const minutesNum = actualMinutes.trim() === '' ? 0 : parseInt(actualMinutes, 10);
  const totalMinutes = hoursNum * 60 + minutesNum;
  const timeFilled = actualHours.trim() !== '' || actualMinutes.trim() !== '';
  const actualTimeValid = hoursDigitsOk && minutesDigitsOk && timeFilled && minutesNum < 60;
  const actualCostValid = /^\d+(\.\d{1,2})?$/.test(actualCostDollars.trim());

  const canSave =
    title.trim().length > 0 &&
    !saving;

  const selectedCategory   = ACT_CATEGORIES.find(c => c.id === categoryId);
  const selectedTimeBucket = TIME_BUCKETS.find(b => b.id === timeBucketId);
  const selectedCostBucket = COST_BUCKETS.find(b => b.id === costBucketId);

  const handleSave = async () => {
    if (!canSave) return;
    const phone = extractPhone(user?.email);
    if (!phone) {
      Alert.alert('Error', 'Could not identify your account. Please log out and back in.');
      return;
    }

    setSaving(true);
    try {
      const trimmedTitle = title.trim();
      // Convert bucket selections to numeric midpoints for storage.
      // null when user didn't pick a bucket (time/cost are optional).
      const tMins  = timeBucketId ? TIME_MIDPOINT_BY_ID[timeBucketId] : null;
      const cDolls = costBucketId ? COST_MIDPOINT_BY_ID[costBucketId] : null;

      // 1. Add to the user's personal catalog (also flagged for admin review).
      const { data: insertedAct, error: insertErr } = await supabase
        .from('user_custom_acts')
        .insert({
          user_phone:           phone,
          title:                trimmedTitle,
          submitted_for_review: true,
        })
        .select()
        .single();

      if (insertErr) {
        Alert.alert('Could not save', insertErr.message);
        setSaving(false);
        return;
      }

      // 2. Auto-complete today's act with this new one (if a day was passed in).
      //    Skips this step if user reached the screen outside the daily flow.
      if (day) {
        // Resolve the auth session once — needed both for the timezone lookup
        // and for challenge attribution below. The `user` PROP has no id, so we
        // must read it from the auth session (same fix as MyStoryScreen).
        const { data: { user: authUser } } = await supabase.auth.getUser();

        // Compute local date in user's home timezone so the streak is anchored
        // correctly even if user is currently traveling.
        let localDateValue = day.scheduledDate;
        try {
          if (authUser?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('iana_timezone')
              .eq('id', authUser.id)
              .maybeSingle();
            const tz = profile?.iana_timezone || null;
            // Only snap to "now" when logging TODAY. A back-filled day must keep
            // its own scheduled date (matches DailyActScreen / MyStoryScreen);
            // otherwise a custom act meant for yesterday lands on today and can
            // collide with today's existing act.
            const isToday = day.scheduledDate === todayStr();
            if (isToday && tz) localDateValue = localDateInTZ(tz, new Date());
          }
        } catch (e) {
          console.warn('iana_timezone lookup failed, using scheduledDate:', e.message);
        }

        const { data: completionData, error: completionErr } = await supabase
          .from('completions')
          .insert({
            user_phone:  phone,
            day_number:  day.dayNumber,
            act_title:   trimmedTitle,
            completed_at: new Date().toISOString(),
            local_date:  localDateValue,
            from_list:   false,   // user-authored, not from the canned list
          })
          .select()
          .single();

        if (completionErr) {
          console.warn('Auto-complete failed:', completionErr.message);
          // Non-fatal: the act is saved to the catalog, user can still use it later.
        } else {
          // Tag this completion against every challenge the user is currently in
          // (forward-only). Uses the auth session id, not the `user` prop (which
          // has no id). Non-fatal on failure — the act still counts personally.
          try {
            const sponsorIds = await getActiveSponsorIds(authUser?.id);
            if (sponsorIds.length > 0 && completionData?.id) {
              const joinRows = sponsorIds.map(cid => ({
                completion_id: completionData.id,
                sponsor_id:  cid,
              }));
              const { error: linkError } = await supabase
                .from('completion_sponsors')
                .insert(joinRows);
              if (linkError) console.warn('completion_challenges link error:', linkError.message);
            }
          } catch (e) {
            console.warn('Challenge attribution failed:', e.message);
          }

          if (onComplete) {
            // Update parent state so the calendar refreshes when we return.
            onComplete({
              dayNumber: day.dayNumber,
              status:    'COMPLETED',
              title:     trimmedTitle,
              proofType: null,
            });
          }
        }
      }

      setSavedAct({ title: trimmedTitle, completed: !!day });
      setTitle('');
      setCategoryId(null);
      setTimeBucketId(null);
      setCostBucketId(null);
      setActualHours('');
      setActualMinutes('');
      setActualCostDollars('');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Reusable dropdown row (matches Settings age bracket pattern)
const DropdownRow = ({ value, placeholder, onPress }) => (
  <TouchableOpacity onPress={onPress} style={s.dropdownBtn} activeOpacity={0.7}>
    <Text
      style={[s.dropdownVal, !value && { color: C.muted }]}
      numberOfLines={1}
    >
      {value || placeholder}
    </Text>
    <Text style={{ color: C.sub }}>▾</Text>
  </TouchableOpacity>
);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="Create a New Act"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
        keyboardShouldPersistTaps="handled"
      >
        {savedAct && (
          <View style={s.savedBanner}>
            <Text style={s.savedTitle}>✓ Saved</Text>
            <Text style={s.savedBody}>
              "{savedAct.title}" added to your personal acts
              {savedAct.completed ? ' and logged as today\'s act.' : '.'}
              {'\n'}It will also be reviewed for the global catalog.
            </Text>
            <Btn
              label={savedAct.completed ? 'Back to My 30 Acts' : 'Done'}
              onPress={() => {
                if (savedAct.completed) {
                  navigation.navigate('Main', { screen: 'Home' });
                } else {
                  navigation.goBack();
                }
              }}
              style={{ marginTop: 14 }}
            />
            <Btn
              label="Add Another Act"
              variant="secondary"
              onPress={() => setSavedAct(null)}
              style={{ marginTop: 8 }}
            />
          </View>
        )}

        {!savedAct && (
          <>
            <Text style={s.helper}>
              Describe a kind act you did or would like to add to the catalog.
            </Text>

            <AppInput
              label="Act Description *"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., Helped a neighbor carry groceries"
              autoCapitalize="sentences"
              multiline
              inputAccessoryViewID={KB_DONE_ID}
            />

            <Text style={s.hint}>* Required.</Text>

            <Btn
              label={day ? 'Save & Complete Today\'s Act' : 'Save to My Acts'}
              onPress={handleSave}
              disabled={!canSave}
              loading={saving}
              style={{ marginTop: 16 }}
            />
            <Btn
              label="Cancel"
              variant="secondary"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 8 }}
            />
          </>
        )}
      </ScrollView>

      {/* Category picker modal */}
      <Modal
        visible={showCategoryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select Category</Text>
            <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
              <Text style={s.modalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {ACT_CATEGORIES.map(cat => {
              const isActive = categoryId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => {
                    setCategoryId(cat.id);
                    setShowCategoryPicker(false);
                  }}
                  style={[s.pickerRow, isActive && { backgroundColor: C.primary + '22' }]}
                >
                  {cat.emoji && (
                    <Image
                      source={cat.emoji}
                      style={s.pickerRowIcon}
                      resizeMode="contain"
                    />
                  )}
                  <Text
                    style={[
                      s.pickerRowText,
                      isActive && { color: C.primary, fontWeight: '700' },
                    ]}
                  >
                    {cat.label}
                  </Text>
                  {isActive && <Text style={{ color: C.primary }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Time picker modal */}
      <Modal
        visible={showTimePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Time Spent</Text>
            <TouchableOpacity onPress={() => setShowTimePicker(false)}>
              <Text style={s.modalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          {TIME_BUCKETS.map(b => {
            const isActive = timeBucketId === b.id;
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => {
                  setTimeBucketId(b.id);
                  setShowTimePicker(false);
                }}
                style={[s.pickerRow, isActive && { backgroundColor: C.primary + '22' }]}
              >
                <Text
                  style={[
                    s.pickerRowText,
                    isActive && { color: C.primary, fontWeight: '700' },
                  ]}
                >
                  {b.label}
                </Text>
                {isActive && <Text style={{ color: C.primary }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
          {/* Clear option */}
          <TouchableOpacity
            onPress={() => {
              setTimeBucketId(null);
              setShowTimePicker(false);
            }}
            style={s.pickerRow}
          >
            <Text style={[s.pickerRowText, { color: C.muted, fontStyle: 'italic' }]}>
              Clear selection
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Cost picker modal */}
      <Modal
        visible={showCostPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCostPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Cost</Text>
            <TouchableOpacity onPress={() => setShowCostPicker(false)}>
              <Text style={s.modalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          {COST_BUCKETS.map(b => {
            const isActive = costBucketId === b.id;
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => {
                  setCostBucketId(b.id);
                  setShowCostPicker(false);
                }}
                style={[s.pickerRow, isActive && { backgroundColor: C.primary + '22' }]}
              >
                <Text
                  style={[
                    s.pickerRowText,
                    isActive && { color: C.primary, fontWeight: '700' },
                  ]}
                >
                  {b.label}
                </Text>
                {isActive && <Text style={{ color: C.primary }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => {
              setCostBucketId(null);
              setShowCostPicker(false);
            }}
            style={s.pickerRow}
          >
            <Text style={[s.pickerRowText, { color: C.muted, fontStyle: 'italic' }]}>
              Clear selection
            </Text>
          </TouchableOpacity>
        </View>
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
  scroll: { padding: 16, paddingBottom: 60 },
  helper: { color: C.sub, fontSize: 13, lineHeight: 18, marginBottom: 16 },
  hint:   { color: C.muted, fontSize: 11, marginTop: 8, fontStyle: 'italic' },

  sectionLabel: {
    color: C.primary, fontSize: 11, fontWeight: '900',
    letterSpacing: 1, marginTop: 16, marginBottom: 10,
  },

  // Dropdown row (matches Settings age bracket button)
dropdownBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  backgroundColor: C.card2,
  borderRadius: 10,
  padding: 12,
  gap: 8,
},
  dropdownLabel: { color: C.muted, fontSize: 12, fontWeight: '600', width: 64 },
  dropdownVal: { color: C.text, fontSize: 13, flex: 1, textAlign: 'left' },

  // Modal styles (matches Settings modal)
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  modalDone:  { color: C.primary, fontSize: 16, fontWeight: '700' },

  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border + '44',
    gap: 10,
  },
  pickerRowIcon: { width: 22, height: 22 },
  pickerRowText: { color: C.text, fontSize: 15, flex: 1 },

  savedBanner: {
    backgroundColor: C.success + '22',
    borderColor: C.success,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
  },
  savedTitle: { color: C.success, fontSize: 15, fontWeight: '900', marginBottom: 8 },
  savedBody:  { color: C.text, fontSize: 13, lineHeight: 19 },

  kbBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  kbDone: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
});