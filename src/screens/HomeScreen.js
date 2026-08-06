import * as Sentry from '@sentry/react-native';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert, Share, Image,
  FlatList, Dimensions, ActivityIndicator,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;

// Font scaling by device width. Base = iPhone 12–15 (390pt). Clamped so small
// phones (SE/mini) shrink slightly and large phones (Pro Max) grow slightly.
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn, ScreenHeader, TypedConfirmModal } from '../components';
import { C, todayStr, getActIcon, ALL_ACTS, localDateInTZ } from '../constants';
import { supabase } from '../lib/supabase';
import { rowLocalDate, windowStartDate, currentWindowIndex } from '../lib/streak';
import DashboardView from './DashboardView';

const PROOF_CAMERA_ICON = require('../assets/proof/Camera.png');
const PROOF_VIDEO_ICON  = require('../assets/proof/Video.png');
const APP_LOGO          = require('../../assets/logo.png');

const PROOF_TYPES = ['photo', 'video', 'story'];

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
};

// "YYYY-MM-DD" -> "Jul 5". Parsed with T00:00:00 so it stays local (no day shift).
function fmtMonthDay(scheduledDate) {
  if (!scheduledDate) return '';
  const d = new Date(scheduledDate + 'T00:00:00');
  if (isNaN(d)) return scheduledDate.slice(8, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const extractPhone = (email) => {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
};

// Shows the "Document your act?" prompt once per app session (the first time
// the calendar grid loads). Resets on a full app restart, not on tab switches.
let documentPromptShownThisSession = false;

export default function HomeScreen({ days, daysReloading, navigation, onRestart, onLogout, user, onReloadDays }) {
const [confirmRestart, setConfirmRestart] = useState(false);
const [missedPrompt,   setMissedPrompt]   = useState(false);
const [documentPrompt, setDocumentPrompt] = useState(false);
const [seedingTest,    setSeedingTest]    = useState(false);
const [resettingTest,  setResettingTest]  = useState(false);
const [exporting,      setExporting]      = useState(false);
const [exportData,     setExportData]     = useState(null);
const [confirmWipe,    setConfirmWipe]    = useState(false);
const [confirmSeed,    setConfirmSeed]    = useState(false);

  // Dashboard is the chosen view. (Calendar render kept below but unreachable.)
  const [viewMode,  setViewMode]  = useState('dashboard'); // 'calendar' | 'dashboard'
  const [dashPhone, setDashPhone] = useState(null);

  // Past tiers built from completions. Each entry is { tierNumber, days[] }.
  // Newest tier is the live `days` prop; older tiers are fetched lazily.
  const [pastTiers, setPastTiers] = useState([]);
  const tierListRef = useRef(null);

  const scrollRef   = useRef(null);
  const hasScrolled = useRef(false);
  const gridY       = useRef(0);

  const today     = todayStr();
  const yesterday = yesterdayStr();
  const completed = days?.filter(d => d.status === 'COMPLETED').length ?? 0;
  const percent   = Math.round((completed / 30) * 100);
  // Tier label derived from the first day in the grid (1, 31, 61, ...)
  const tierStart = days?.[0]?.dayNumber ?? 1;
  const tierEnd   = tierStart + 29;
  const tierLabel = tierStart === 1 ? '' : `Days ${tierStart}–${tierEnd}`;
  const isOwner   = user?.role === 'OWNER';

  useEffect(() => { hasScrolled.current = false; }, [days]);
  // Build past tiers (everything before the current tier window).
  useEffect(() => {
    if (!days || days.length === 0) { setPastTiers([]); return; }
    const currentTierStart = days[0]?.dayNumber ?? 1;
    if (currentTierStart === 1) { setPastTiers([]); return; } // no history yet

    (async () => {
      try {
        const phone = await getUserPhone();
        if (!phone) return;

        const { data, error } = await supabase
          .from('completions')
          .select('id, day_number, act_title, proof_type, completed_at, local_date')
          .eq('user_phone', phone)
          .order('completed_at', { ascending: true });

        if (error || !data || data.length === 0) {
          if (error) console.warn('Past tiers fetch error:', error.message);
          return;
        }

        // Past windows are 30-CALENDAR-DAY blocks from the anchor -- the same
        // dates buildGridFromStreak uses for the current window. This used to
        // group by stored day_number, which drifts out of step with the dates
        // as soon as the user misses days. Matching by local_date also fixes
        // the old completed_at.split('T')[0], which is UTC and shifted the day
        // for anyone logging an act late at night.
        const dated = data
          .map(r => ({ ...r, _d: rowLocalDate(r) }))
          .filter(r => r._d)
          .sort((a, b) => a._d.localeCompare(b._d));
        if (dated.length === 0) return;

        const anchor = dated[0]._d;
        const curIdx = currentWindowIndex(anchor);
        if (curIdx === 0) { setPastTiers([]); return; }   // no history yet

        const byDate = new Map(dated.map(r => [r._d, r]));

        const tiers = [];
        for (let w = 0; w < curIdx; w++) {
          const wStart = windowStartDate(anchor, w);
          const [sy, sm, sd] = wStart.split('-').map(Number);
          const startDateObj = new Date(sy, sm - 1, sd);

          const tierGrid = Array.from({ length: 30 }, (_, i) => {
            const dd = new Date(startDateObj);
            dd.setDate(startDateObj.getDate() + i);
            const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
            const match = byDate.get(iso);
            const dayNum = w * 30 + i + 1;

            if (match) {
              return {
                dayNumber:     dayNum,
                scheduledDate: iso,
                status:        'COMPLETED',
                title:         match.act_title  || '',
                proofType:     match.proof_type || null,
                completionId:  match.id || null,
              };
            }
            return {
              dayNumber:     dayNum,
              scheduledDate: iso,
              status:        'MISSED',
              title:         '',
              proofType:     null,
            };
          });
          tiers.push({ tierNumber: w + 1, days: tierGrid });
        }        setPastTiers(tiers);
      } catch (e) {
        console.warn('Past tiers build failed:', e.message);
      }
    })();
  }, [days]);

  const handleTodayLayout = (e) => {
    if (hasScrolled.current) return;
    const cellY = e.nativeEvent.layout.y;
    const targetY = Math.max(0, cellY - 240);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
    hasScrolled.current = true;
  };
  const handleGridLayout = (e) => { gridY.current = e.nativeEvent.layout.y; };

  // Missed-yesterday prompt. Shows EVERY time the calendar loads while yesterday
  // is still incomplete and still actionable -- no once-per-day gate. It stops
  // appearing on its own once the user completes yesterday (status becomes
  // COMPLETED) or once yesterday is no longer in the current tier (streak broken
  // / 2+ days elapsed), because `yesterdayDay` will no longer be found.
  useEffect(() => {
    if (!days) return;
    const yesterdayDay = days.find(d => d.scheduledDate === yesterday);
    const todayDay     = days.find(d => d.scheduledDate === today);
    const shouldPrompt = yesterdayDay && yesterdayDay.status !== 'COMPLETED' && todayDay;
    if (!shouldPrompt) return;
    setMissedPrompt(true);
  }, [days]);

  const handleRestart = () => { onRestart?.(); setConfirmRestart(false); setMissedPrompt(false); };

  // Post-login "Do you want to document your act?" prompt. Shows once per app
  // session the first time the calendar has loaded its grid, regardless of how
  // the user entered (fresh login, biometric, or silent session restore).
  // The module-level guard below prevents it re-firing on every tab switch
  // back to the calendar within the same session. Defers to the
  // missed-yesterday prompt so two modals never stack.
  useEffect(() => {
    if (!days || missedPrompt) return;
    if (documentPromptShownThisSession) return;
    documentPromptShownThisSession = true;
    setDocumentPrompt(true);
  }, [days, missedPrompt]);

  // "Yes" → go straight to the new low-friction story screen.
  const handleDocumentYes = () => {
    setDocumentPrompt(false);
    navigation.navigate('MyStory');
  };
  // "No" → stay on the calendar.
  const handleDocumentNo = () => setDocumentPrompt(false);


  const openEditableDay = (day) => {
    const isEmpty = !day.title && day.status === 'NOT_SET';
    if (isEmpty) {
      // New flow: pick an act, then land on the MyStory screen (act + story),
      // not the full DailyAct form. The picker honors returnTo: 'MyStory'.
      navigation.navigate('ChooseAct', { day, returnTo: 'MyStory' });
    } else if (day.status === 'COMPLETED') {
      // Completed → open MyStory in share mode (loads the saved story).
      navigation.navigate('MyStory', { day });
    } else {
      // In-progress / not-yet-completed editable day → MyStory create mode.
      navigation.navigate('MyStory', { day });
    }
  };

  const handleAddYesterday = () => {
    const yesterdayDay = days?.find(d => d.scheduledDate === yesterday);
    setMissedPrompt(false);
    if (yesterdayDay) {
      // Go straight to "Document Your Act" for yesterday (skip the act picker).
      // After it's saved, handleSave routes to the dashboard so the user can
      // log today's act next. The "Browse acts" button is available in there
      // if they'd rather pick from the list.
      navigation.navigate('MyStory', { day: yesterdayDay, returnTo: 'MyStory' });
    }
  };
  const handleMissedRestart = () => { setMissedPrompt(false); setConfirmRestart(true); };

  const getUserPhone = async () => {
    const propPhone = extractPhone(user?.email);
    if (propPhone) return propPhone;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      return extractPhone(authUser?.email);
    } catch {
      return null;
    }
  };

  // Resolve the phone once so DashboardView can load runs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ph = await getUserPhone();
      if (!cancelled) setDashPhone(ph);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const phone = await getUserPhone();
      if (!phone) {
        Alert.alert('Export failed', 'Could not identify your phone number. Please log out and back in.');
        return;
      }
      const { data, error } = await supabase
        .from('completions')
        .select('*')
        .eq('user_phone', phone)
        .order('completed_at', { ascending: true });

      if (error) { Alert.alert('Export failed', error.message); return; }
      if (!data || data.length === 0) {
        Alert.alert('Nothing to export', 'You have no completions yet.');
        return;
      }
      const json = JSON.stringify(data, null, 2);
      setExportData({ json, count: data.length });
    } catch (e) {
      Sentry.captureException(e);
      Alert.alert('Error', e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleShareExport = async () => {
    if (!exportData) return;
    try {
      await Share.share({ message: exportData.json });
    } catch (e) {
      console.warn('Share export error:', e.message);
    }
  };

// Seed 29 days of test data. Tapping the button opens TypedConfirmModal;
// the actual destructive work runs in handleConfirmSeed below.
const handleSeed29 = () => {
  setConfirmSeed(true);
};

const handleConfirmSeed = async () => {
  setSeedingTest(true);
  const { data: sess } = await supabase.auth.getSession();
  try {
    const phone = await getUserPhone();
    if (!phone) {
      Alert.alert('Seed failed', 'Could not identify your phone number.');
      return;
    }

    await supabase.from('completions').delete().eq('user_phone', phone);

    // Clear any restart marker so seeded data shows in the active grid.
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.id) {
      await supabase.from('profiles')
        .update({ last_restart_at: null })
        .eq('id', authUser.id);
    }

    const rows = [];
    for (let i = 0; i < 29; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      d.setHours(12, 0, 0, 0);

      const dayNum = i + 1;
      let proofType;
      let actTitle;

      if (dayNum === 28) {
        proofType    = 'photo';
        actTitle     = "Covered a coworker's shift";
      } else if (dayNum === 29) {
        proofType = 'video';
        actTitle  = "Watched a neighbor's pet for free";
      } else if (dayNum === 27) {
        proofType = 'photo';
        const act = ALL_ACTS[Math.floor(Math.random() * ALL_ACTS.length)];
        actTitle  = act?.title || `Test act Day ${dayNum}`;
      } else {
        proofType = PROOF_TYPES[Math.floor(Math.random() * PROOF_TYPES.length)];
        const act = ALL_ACTS[Math.floor(Math.random() * ALL_ACTS.length)];
        actTitle  = act?.title || `Test act Day ${dayNum}`;
      }

      const hasMedia = dayNum === 28 || dayNum === 29;

      rows.push({
        user_phone:     phone,
        day_number:     dayNum,
        act_title:      actTitle,
        proof_type:     proofType,
        notes:          proofType === 'story'
          ? `Seeded test completion for Day ${dayNum}. This is filler content used for end-to-end testing the Day 30 flow.`
          : null,
        completed_at:   d.toISOString(),
        local_date:     localDateInTZ(user?.timezone || 'America/New_York', d),
        from_list:      true,
        has_media:      hasMedia,
        is_sponsor_act: false,
      });
    }

    const { data: insertedRows, error } = await supabase
      .from('completions')
      .insert(rows)
      .select('id, day_number');
    if (error) {
      Alert.alert('Seed failed', error.message);
      return;
    }

    const day28 = insertedRows?.find(r => r.day_number === 28);
    const day29 = insertedRows?.find(r => r.day_number === 29);
    const mediaRows = [];
    if (day28) mediaRows.push({ completion_id: day28.id, media_type: 'photo', file_path: 'Day 28.PNG' });
    if (day29) mediaRows.push({ completion_id: day29.id, media_type: 'video', file_path: 'Day 29.MOV' });
    if (mediaRows.length > 0) {
      const { error: mediaErr } = await supabase.from('act_media').insert(mediaRows);
      if (mediaErr) console.warn('Seed media link error:', mediaErr.message);
    }

    if (onReloadDays) await onReloadDays();
    setConfirmSeed(false);
    Alert.alert('Seeded ✓', 'Days 1-29 are now completed. Complete today to trigger Day 30 celebration.');
  } catch (e) {
    Sentry.captureException(e);
    Alert.alert('Error', e.message);
  } finally {
    setSeedingTest(false);
  }
};

// Wipe All Completions. Tapping the button opens TypedConfirmModal;
// the actual destructive work runs in handleConfirmWipe below.
const handleResetTest = () => {
  setConfirmWipe(true);
};

const handleConfirmWipe = async () => {
  setResettingTest(true);
  try {
    const phone = await getUserPhone();
    if (!phone) {
      Alert.alert('Reset failed', 'Could not identify your phone number.');
      return;
    }

    const { error } = await supabase.from('completions').delete().eq('user_phone', phone);
    if (error) {
      Alert.alert('Reset failed', error.message);
      return;
    }

    // Also clear restart marker so subsequent seeds aren't hidden.
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.id) {
      await supabase.from('profiles')
        .update({ last_restart_at: null })
        .eq('id', authUser.id);
    }

    if (onReloadDays) await onReloadDays();
    setConfirmWipe(false);
    Alert.alert('Reset ✓', 'All completions wiped.');
  } catch (e) {
    Sentry.captureException(e);
    Alert.alert('Error', e.message);
  } finally {
    setResettingTest(false);
  }
};

  if (!days) {
    // First load in flight — show a spinner instead of the "no challenge"
    // empty state, otherwise the empty state flashes for a beat every cold start.
    if (daysReloading) {
      return (
        <View style={s.empty}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      );
    }
    return (
      <View style={s.empty}>
        <Text style={{ fontSize: sf(56) }}>🕊️</Text>
        <Text style={s.emptyTitle}>You haven't started yet</Text>
        <Text style={s.emptySub}>Start your 30-day journey from Settings.</Text>
        <Btn label="Go to Settings" onPress={() => navigation.navigate('Me')} style={{ width: 200 }} />
      </View>
    );
  }

  // Renders the small bottom proof-type icon. Uses the camera/video PNG
  // assets and an inline emoji for "story". Returns null if no proof.
  const renderProofIcon = (proofType) => {
    if (proofType === 'photo') {
      return <Image source={PROOF_CAMERA_ICON} style={s.proofIcon} resizeMode="contain" />;
    }
    if (proofType === 'video') {
      return <Image source={PROOF_VIDEO_ICON} style={s.proofIcon} resizeMode="contain" />;
    }
    if (proofType === 'story') {
      return <Text style={s.proofGlyph}>✍️</Text>;
    }
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="My 30 Acts"
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('Me')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 22 }}>⚙️</Text>
          </TouchableOpacity>
        }
      />

      {viewMode === 'calendar' && (
      <View style={s.stickyHeader}>
        <View style={s.progressCard}>
          <View style={s.progressTopRow}>
            <View>
              <Text style={s.progressLabel}>
                {tierLabel ? `PROGRESS — ${tierLabel.toUpperCase()}` : 'PROGRESS TOWARD GOAL'}
              </Text>
              <Text style={s.progressStats}>
                <Text style={s.progressBig}>{completed}</Text>
                <Text style={s.progressOfThirty}> / 30 days</Text>
              </Text>
            </View>
            <View style={s.percentPill}>
              <Text style={s.percentPillText}>{percent}%</Text>
            </View>
          </View>
          <View style={s.progressBarTrack}>
            <View style={[s.progressBarFill, { width: `${percent}%` }]} />
          </View>
        </View>
        <Text style={s.subtitle}>
          Tap today or yesterday to record Acts of Kindness. Prior days are view-only.
        </Text>
      </View>
      )}

      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll}>

        {viewMode === 'dashboard' && (
          <DashboardView
            phone={dashPhone}
            navigation={navigation}
            reloadKey={days}
          />
        )}

{/* Render a single tier's grid. `isCurrent` flag controls editability:
            current tier supports tap-to-edit on today/yesterday; past tiers
            are view-only DayDetail. */}
        {viewMode === 'calendar' && (() => {
          // Build the array of tier pages (oldest → newest). Current tier last.
          const allTiers = [
            ...pastTiers,
            { tierNumber: pastTiers.length + 1, days, isCurrent: true },
          ];
          const initialIndex = allTiers.length - 1; // Default to current (rightmost)

          const renderTierGrid = ({ item: tier }) => {
            const isCurrent = !!tier.isCurrent;
            const tierStart = tier.days[0]?.dayNumber ?? 1;
            const tierEndN  = tierStart + 29;

            return (
              <View style={{ width: SCREEN_W }}>
                {!isCurrent && (
                  <Text style={s.pastTierLabel}>
                    📅 LOOKING BACK · DAYS {tierStart}–{tierEndN}
                  </Text>
                )}
                <View style={s.grid} onLayout={isCurrent ? handleGridLayout : undefined}>
                  {tier.days.map(day => {
                    const isToday     = isCurrent && day.scheduledDate === today;
                    const isYesterday = isCurrent && day.scheduledDate === yesterday;
                    const isEditable  = isCurrent && (isToday || isYesterday);
                    const isPastDone  = day.status === 'COMPLETED' && !isToday && !isYesterday;
                    const isFuture    = isCurrent && day.scheduledDate > today;
                    const tappable    = isEditable || isPastDone;

                    const onPress = () => {
                      if (isEditable)      openEditableDay(day);
                      else if (isPastDone) navigation.navigate('MyStory', { day });
                    };

                    return (
                      <TouchableOpacity
                        key={day.dayNumber}
                        disabled={!tappable}
                        onPress={onPress}
                        onLayout={isToday ? handleTodayLayout : undefined}
                        style={[
                          s.dayCell,
                          isToday     && s.dayCellToday,
                          isYesterday && s.dayCellYesterday,
                          isFuture    && s.dayCellFuture,
                        ]}
                      >
                        <Text style={[s.dayNum, isToday && s.dayNumToday]}>
                          {day.dayNumber}
                        </Text>

                        {isToday && day.status === 'COMPLETED' ? (
                          <>
                            <View style={s.centerSlot}>
                              <Text style={s.doneCheck}>✓</Text>
                            </View>
                            <View style={s.bottomSlot}>
                              <Text style={s.todayLabel} numberOfLines={1}>TODAY</Text>
                            </View>
                          </>
                        ) : isToday ? (
                          <View style={s.centerSlot}>
                            <Text style={s.todayLabel} numberOfLines={1}>TODAY</Text>
                          </View>
                        ) : day.status === 'COMPLETED' ? (
                          <>
                            <View style={s.centerSlot}>
                              <Text style={s.doneCheck}>✓</Text>
                            </View>
                            <View style={s.bottomSlot}>
                              <Text
                                style={[s.domNumDate, s.domNumDone]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                              >
                                {fmtMonthDay(day.scheduledDate)}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <View style={s.centerSlot}>
                            <Text
                              style={[
                                s.domNumDate,
                                day.status === 'MISSED' && s.domNumMissed,
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                            >
                              {fmtMonthDay(day.scheduledDate)}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Page indicator dots, only when there's history */}
                {allTiers.length > 1 && (
                  <View style={s.pageDots}>
                    {allTiers.map((_, i) => {
                      const isActive = i === allTiers.length - 1
                        ? isCurrent
                        : (!isCurrent && pastTiers[i]?.tierNumber === tier.tierNumber);
                      return (
                        <View
                          key={i}
                          style={[s.pageDot, isActive && s.pageDotActive]}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
            );
          };

          return (
            <FlatList
              ref={tierListRef}
              data={allTiers}
              renderItem={renderTierGrid}
              keyExtractor={(item) => `tier-${item.tierNumber}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({
                length: SCREEN_W,
                offset: SCREEN_W * index,
                index,
              })}
            />
          );
        })()}

         <View style={s.btnRow}>
          <Btn label="↺ Restart" onPress={() => setConfirmRestart(true)} variant="danger" style={{ flex: 1 }} />
          <Btn label="Settings"  onPress={() => navigation.navigate('Me')}  variant="secondary" style={{ flex: 1 }} />
        </View>

        <Btn
          label="🎟️ Join a Group"
          onPress={() => navigation.navigate('JoinSponsor')}
          variant="secondary"
          style={{ marginTop: 10 }}
        />

        {isOwner && (
          <View style={s.testPanel}>
            <Text style={s.testPanelTitle}>🧪 OWNER TEST TOOLS</Text>
            <Text style={s.testPanelSub}>
              Back up first, then seed 29 days to test the Day 30 celebration.
              Real Twilio/email notifications WILL fire on Day 30.
            </Text>
            <Btn
              label="📥 Export Completions (backup)"
              onPress={handleExport}
              loading={exporting}
              variant="secondary"
              style={{ marginBottom: 8 }}
            />
            <Btn
              label="🌱 Seed 29 Days"
              onPress={handleSeed29}
              loading={seedingTest}
              style={{ marginBottom: 8 }}
            />
            <Btn
              label="🗑️ Wipe All Completions"
              onPress={handleResetTest}
              loading={resettingTest}
              variant="secondary"
            />
          </View>
        )}
      </ScrollView>

      <Modal visible={!!exportData} transparent animationType="fade">
        <View style={s.modalBg}>
          <View style={[s.modalCard, { maxHeight: '80%' }]}>
            <Text style={{ fontSize: sf(32), textAlign: 'center', marginBottom: 8 }}>📥</Text>
            <Text style={s.modalTitle}>Backup Ready</Text>
            <Text style={s.modalBody}>
              {exportData?.count} completion{exportData?.count === 1 ? '' : 's'}. Tap Share to
              save as a note, email it to yourself, or copy the text.
            </Text>
            <ScrollView style={s.exportScroll}>
              <Text style={s.exportText} selectable>{exportData?.json || ''}</Text>
            </ScrollView>
            <Btn
              label="Share / Copy"
              onPress={handleShareExport}
              style={{ marginTop: 14, marginBottom: 10 }}
            />
            <Btn
              label="Close"
              onPress={() => setExportData(null)}
              variant="secondary"
            />
          </View>
        </View>
      </Modal>

      <Modal visible={missedPrompt} transparent animationType="fade">
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={{ fontSize: sf(44), textAlign: 'center', marginBottom: 12 }}>⏰</Text>
            <Text style={s.modalTitle}>Missed yesterday?</Text>
            <Text style={s.modalBody}>
              You didn't log an act yesterday. You have one chance to add it
              now and keep your streak — or restart from your most recent
              unbroken streak.
            </Text>
            <Btn label="Add yesterday's act" onPress={handleAddYesterday} style={{ marginBottom: 10 }} />
            <Btn label="Restart" onPress={handleMissedRestart} variant="secondary" style={{ marginBottom: 10 }} />
            <TouchableOpacity onPress={() => setMissedPrompt(false)}>
              <Text style={s.dismissLink}>Remind me later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={documentPrompt} transparent animationType="fade">
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Image source={APP_LOGO} style={s.docPromptLogo} resizeMode="contain" />
            <Text style={s.modalTitle}>Document your Act of Kindness?</Text>
            <Text style={s.modalBody}>
              Want to write down an act of kindness you did today?
            </Text>
            <Btn label="Yes" onPress={handleDocumentYes} style={{ marginBottom: 10 }} />
            <Btn label="No" onPress={handleDocumentNo} variant="secondary" />
          </View>
        </View>
      </Modal>

      <Modal visible={confirmRestart} transparent animationType="fade">
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={{ fontSize: sf(44), textAlign: 'center', marginBottom: 12 }}>⚠️</Text>
            <Text style={s.modalTitle}>Restart?</Text>
            <Text style={s.modalBody}>
              We'll keep your most recent unbroken streak of completed days
              and drop the rest. If you have no completed days, you'll start
              fresh from Day 1.
            </Text>
            <Btn label="Yes, restart" onPress={handleRestart}
              style={{ backgroundColor: C.error, borderWidth: 0, marginBottom: 10 }} />
            <Btn label="Keep everything" onPress={() => setConfirmRestart(false)} variant="secondary" />
          </View>
        </View>
      </Modal>

<TypedConfirmModal
  visible={confirmWipe}
  title="Wipe all completions?"
  body="This permanently deletes ALL your completions. You can re-seed from scratch afterward. Make sure you exported first if you want a backup."
  confirmWord="DELETE"
  confirmLabel="Wipe everything"
  loading={resettingTest}
  onConfirm={handleConfirmWipe}
  onCancel={() => setConfirmWipe(false)}
/>
<TypedConfirmModal
  visible={confirmSeed}
  title="Seed 29 completed days?"
  body="This REPLACES your existing completions with 29 days of test data ending yesterday. Today stays open so you can complete Day 30. Make sure you exported first if you want a backup."
  confirmWord="SEED"
  confirmLabel="Seed test data"
  loading={seedingTest}
  onConfirm={handleConfirmSeed}
  onCancel={() => setConfirmSeed(false)}
/>
    </View>
  );
}

const s = StyleSheet.create({
  // Reduced horizontal padding so 6-across cells fit comfortably with
  // tight margins on either side.
  scroll: { paddingHorizontal: 6, paddingTop: 4, paddingBottom: 24 },
  empty: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: C.text, fontSize: sf(20), fontWeight: '800', marginTop: 16, marginBottom: 8 },
  emptySub: { color: C.sub, fontSize: sf(14), textAlign: 'center', marginBottom: 24 },

  stickyHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border + '44',
  },

  progressCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.primary + '44',
    borderRadius: 14, padding: 10,
  },
  progressTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { color: C.muted, fontSize: sf(10), fontWeight: '800', letterSpacing: 0.8, marginBottom: 2 },
  progressStats: { color: C.text },
  progressBig: { fontSize: sf(20), fontWeight: '900', color: C.primary },
  progressOfThirty: { fontSize: sf(14), color: C.sub, fontWeight: '600' },
  percentPill: {
    backgroundColor: C.primary + '22', borderWidth: 1, borderColor: C.primary + '55',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  percentPillText: { color: C.primary, fontSize: sf(15), fontWeight: '800' },
  progressBarTrack: { height: 8, backgroundColor: C.surface, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: C.primary, borderRadius: 4 },

  subtitle: { color: C.sub, fontSize: sf(11), textAlign: 'center', marginTop: 6 },

  // -- TEMP A/B switch styles -- remove with the toggle --------------------
  abRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingVertical: 10,
  },
  abPill: {
    paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  abPillOn: { backgroundColor: C.primary, borderColor: C.primary },
  abText:   { color: C.sub, fontSize: sf(12), fontWeight: '800' },
  abTextOn: { color: C.bg },

  // ── Grid ────────────────────────────────────────────────────────────────
  // 6 cells per row with a tight 4px column gap and 4px row gap.
  // 6 cells * 15.5% = 93%, leaving ~7% (≈ 5 gaps × 4px on a 360px screen)
  // for the column gaps. Tight but not crowded.
grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 4,
    rowGap: 12,
    paddingHorizontal: 6,
  },

  pastTierLabel: {
    color: C.warning,
    fontSize: sf(11),
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  pageDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.border,
  },
  pageDotActive: {
    backgroundColor: C.primary,
    width: 18,
  },
  dayCell: {
    width: '15%',
    height: 74,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border + '55',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCellToday: {
    borderColor: C.primary,
    borderWidth: 2,
  },
  dayCellYesterday: {
    borderColor: C.primary + '88',
    borderWidth: 1.5,
  },
  dayCellFuture: {
    opacity: 0.45,
  },

  dayNum: {
    fontSize: sf(11),
    fontWeight: '700',
    color: C.sub,
    alignSelf: 'flex-start',
    paddingLeft: 4,
  },
  dayNumToday: {
    color: C.primary,
  },

  centerSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  dayCellIcon:   { width: 22, height: 22 },
  dayCellGlyph:  { fontSize: sf(14), color: C.muted },

  // Day-of-month shown in the center of each non-today tile.
  domNum:       { fontSize: sf(20), fontWeight: '800', color: C.sub },
  domNumDate:   { fontSize: sf(13), fontWeight: '800', color: C.sub, paddingHorizontal: 2 },
  domNumDone:   { color: C.primary },
  doneCheck:    { fontSize: 18, fontWeight: '900', color: C.primary, lineHeight: 26, textAlign: 'center', includeFontPadding: false },
  domNumMissed: { color: C.error },
  missedGlyph:   { fontSize: sf(14), color: C.error, fontWeight: '900' },

  bottomSlot: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofIcon:  { width: 18, height: 18 },
  proofGlyph: { fontSize: sf(16) },
  todayLabel: {
    fontSize: sf(8),
    fontWeight: '900',
    color: C.primary,
    letterSpacing: 0.3,
  },

  // ── Buttons & panels ────────────────────────────────────────────────────
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 32 },

  testPanel: {
    marginTop: 32,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.warning + '77',
    borderStyle: 'dashed',
    backgroundColor: C.warning + '14',
  },
  testPanelTitle: { color: C.warning, fontWeight: '900', fontSize: sf(12), letterSpacing: 1, marginBottom: 4 },
  testPanelSub:   { color: C.sub, fontSize: sf(12), lineHeight: 17, marginBottom: 14 },

  modalBg: { flex: 1, backgroundColor: '#000000BB', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: {
    backgroundColor: C.card, borderRadius: 22, padding: 28,
    borderWidth: 1.5, borderColor: C.primary + '55', width: '100%',
  },
  docPromptLogo: { width: sf(72), height: sf(72), alignSelf: 'center', marginBottom: 12 },
  modalTitle: { color: C.text, fontSize: sf(19), fontWeight: '900', textAlign: 'center', marginBottom: 8 },  modalBody: { color: C.sub, fontSize: sf(14), lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  dismissLink: { color: C.muted, fontSize: sf(13), textAlign: 'center', marginTop: 6, textDecorationLine: 'underline' },

  exportScroll: {
    maxHeight: 300,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  exportText: { color: C.text, fontSize: sf(11), fontFamily: 'Courier' },
});