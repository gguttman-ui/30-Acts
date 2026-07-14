import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, ActivityIndicator,
} from 'react-native';
import { C, todayStr } from '../constants';
import {
  loadRuns, buildRunGrid, bestRunLength, lifetimeActs, lapCount, actsInLap,
  rowLocalDate,
} from '../lib/runs';

const SCREEN_W = Dimensions.get('window').width;
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);

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

function fmtMonthDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr.slice(8, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Dashboard: shows the CURRENT run only -- the acts you have strung together
 * right now. Swipe right to page back through earlier runs.
 *
 * Deliberately framed as "runs", not "attempts". A 10-day run that ended is
 * still 10 acts of kindness that happened; the history is a record of effort,
 * not a list of failures.
 */
export default function DashboardView({ phone, navigation, reloadKey }) {
  const [runs, setRuns]       = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  const today     = todayStr();
  const yesterday = yesterdayStr();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await loadRuns(phone);
      if (!cancelled) { setRuns(r); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [phone, reloadKey]);

  if (loading) {
    return (
      <View style={s.centerBox}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (!runs.length) {
    return (
      <View style={s.centerBox}>
        <Text style={s.emptyBig}>No acts yet</Text>
        <Text style={s.emptySub}>Log your first act and your run starts today.</Text>
      </View>
    );
  }

  const currentRun = runs[runs.length - 1];
  const isLive     = currentRun.isAlive;
  const best       = bestRunLength(runs);
  const lifetime   = lifetimeActs(runs);

  // One page per LAP, flattened across every run. A 32-act run yields two
  // pages: acts 1-30, then acts 31-60. Oldest leftmost, current rightmost --
  // same paging feel as the calendar's tiers.
  const pages = [];
  runs.forEach((run, ri) => {
    const laps = lapCount(run);
    for (let li = 0; li < laps; li++) {
      pages.push({
        run,
        runNumber: ri + 1,
        lapIndex:  li,
        totalLaps: laps,
        isCurrent: ri === runs.length - 1 && li === laps - 1,
      });
    }
  });
  const initialIndex = pages.length - 1;

  const currentLap  = lapCount(currentRun) - 1;
  const currentDone = actsInLap(currentRun, currentLap);

  // Is there actually a day the user may log right now?
  // You may log TODAY, or back-fill YESTERDAY -- nothing else. A run being
  // "alive" only means it COULD be extended; it does not mean an unlogged
  // day exists. With both today and yesterday already logged there is no
  // legal move, so no "+" slot should be offered. (Offering one would invite
  // logging an act for TOMORROW, which must never be possible.)
  const loggedDates      = new Set(currentRun.rows.map(r => rowLocalDate(r)));
  const canLogToday      = !loggedDates.has(today);
  const canLogYesterday  = !loggedDates.has(yesterday);
  const hasLoggableDay   = isLive && (canLogToday || canLogYesterday);

  const renderRun = ({ item }) => {
    const { run, runNumber, lapIndex, totalLaps, isCurrent } = item;
    const grid = buildRunGrid(run, lapIndex);

    return (
      <View style={{ width: SCREEN_W }}>
        {!isCurrent && (
          <Text style={s.pastRunLabel}>
            RUN {runNumber}
            {totalLaps > 1 ? ` ${'\u00b7'} LAP ${lapIndex + 1}` : ''}
            {' '}{'\u00b7'} {actsInLap(run, lapIndex)}{' '}
            {actsInLap(run, lapIndex) === 1 ? 'ACT' : 'ACTS'} {'\u00b7'}{' '}
            {fmtMonthDay(run.startDate)}{'\u2013'}{fmtMonthDay(run.endDate)}
          </Text>
        )}

        <View style={s.grid}>
          {grid.map(day => {
            const isToday     = isCurrent && day.scheduledDate === today;
            const isYesterday = isCurrent && day.scheduledDate === yesterday;
            const isDone      = day.status === 'COMPLETED';

            // Only the current live run is editable, and only its next slot.
            const isNextSlot  = isCurrent && hasLoggableDay && !isDone
              && grid.findIndex(d => d.status === 'NOT_SET') === grid.indexOf(day);

            const tappable = isDone || isNextSlot;

            const onPress = () => {
              if (isDone)          navigation.navigate('MyStory', { day });
              else if (isNextSlot) navigation.navigate('CreateChallenge', { day, returnTo: 'MyStory' });
            };

            return (
              <TouchableOpacity
                key={day.dayNumber}
                disabled={!tappable}
                onPress={onPress}
                style={[
                  s.dayCell,
                  isToday      && s.dayCellToday,
                  isYesterday  && s.dayCellYesterday,
                  isNextSlot   && s.dayCellNext,
                  !isDone && !isNextSlot && s.dayCellEmpty,
                ]}
              >
                <Text style={[s.dayNum, isToday && s.dayNumToday]}>{day.dayNumber}</Text>

                {isDone ? (
                  <>
                    <View style={s.centerSlot}>
                      <Text style={s.doneCheck}>{'\u2713'}</Text>
                    </View>
                    <View style={s.bottomSlot}>
                      <Text
                        style={[s.tileDate, s.tileDateDone]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {isToday ? 'TODAY' : fmtMonthDay(day.scheduledDate)}
                      </Text>
                    </View>
                  </>
                ) : isNextSlot ? (
                  <View style={s.centerSlot}>
                    <Text style={s.nextGlyph}>+</Text>
                  </View>
                ) : (
                  <View style={s.centerSlot} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {pages.length > 1 && (
          <View style={s.pageDots}>
            {pages.map((p, i) => (
              <View
                key={i}
                style={[
                  s.pageDot,
                  p.runNumber === runNumber && p.lapIndex === lapIndex && s.pageDotActive,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View>
      {/* -- Current run header ------------------------------------------- */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerLabel}>
              {isLive ? 'CURRENT RUN' : 'LAST RUN'}
              {currentLap > 0 ? ` ${'\u00b7'} LAP ${currentLap + 1}` : ''}
            </Text>
            <Text>
              <Text style={s.runBig}>{currentDone}</Text>
              <Text style={s.runOfThirty}> / 30 acts</Text>
            </Text>
          </View>
          <View style={s.statsRight}>
            <Text style={s.statLine}>This run {'\u00b7'} <Text style={s.statVal}>{currentRun.length}</Text></Text>
            <Text style={s.statLine}>Best run {'\u00b7'} <Text style={s.statVal}>{best}</Text></Text>
            <Text style={s.statLine}>Lifetime {'\u00b7'} <Text style={s.statVal}>{lifetime}</Text></Text>
          </View>
        </View>

        <View style={s.progressBarTrack}>
          <View
            style={[
              s.progressBarFill,
              { width: `${Math.round((currentDone / 30) * 100)}%` },
            ]}
          />
        </View>

        <Text style={s.subtitle}>
          {!isLive
            ? 'This run has ended. Log an act to start a new one.'
            : hasLoggableDay
              ? 'Tap + to log. Miss two days in a row and a new run begins.'
              : 'All caught up. Come back tomorrow.'}
        </Text>
        {pages.length > 1 && (
          <Text style={s.swipeHint}>{'\u2190'} Swipe to see earlier runs</Text>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={pages}
        renderItem={renderRun}
        keyExtractor={(item) => `run-${item.runNumber}-lap-${item.lapIndex}`}
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
    </View>
  );
}

const s = StyleSheet.create({
  centerBox: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 60, paddingHorizontal: 24,
  },
  emptyBig: { color: C.text, fontSize: sf(20), fontWeight: '800' },
  emptySub: { color: C.sub, fontSize: sf(13), marginTop: 8, textAlign: 'center' },

  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  headerLabel: {
    color: C.sub, fontSize: sf(10), fontWeight: '900',
    letterSpacing: 1.2, marginBottom: 2,
  },
  runBig:       { color: C.primary, fontSize: sf(34), fontWeight: '900' },
  runOfThirty:  { color: C.sub, fontSize: sf(14), fontWeight: '700' },

  statsRight: { alignItems: 'flex-end' },
  statLine:   { color: C.muted, fontSize: sf(11), fontWeight: '600' },
  statVal:    { color: C.sub, fontWeight: '900' },

  progressBarTrack: {
    height: 8, backgroundColor: C.surface,
    borderRadius: 4, overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%', backgroundColor: C.primary, borderRadius: 4,
  },

  subtitle: {
    color: C.sub, fontSize: sf(11),
    textAlign: 'center', marginTop: 8,
  },
  swipeHint: {
    color: C.muted, fontSize: sf(10), fontWeight: '700',
    textAlign: 'center', marginTop: 4,
  },

  pastRunLabel: {
    color: C.warning, fontSize: sf(11), fontWeight: '900',
    letterSpacing: 1, textAlign: 'center',
    marginBottom: 12, marginTop: 4,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 4,
    rowGap: 12,
    paddingHorizontal: 6,
  },

  dayCell: {
    width: '15%',
    height: 70,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border + '55',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCellToday: { borderColor: C.primary, borderWidth: 2 },
  // Same lighter band the calendar uses for yesterday -- it is still
  // back-fillable, so it reads as 'reachable' rather than 'done and gone'.
  dayCellYesterday: { borderColor: C.primary + '88', borderWidth: 1.5 },
  dayCellNext:  { borderColor: C.primary + '88', borderWidth: 1.5 },
  dayCellEmpty: { opacity: 0.4 },

  dayNum: {
    fontSize: sf(11), fontWeight: '700', color: C.sub,
    alignSelf: 'flex-start', paddingLeft: 4,
  },
  dayNumToday: { color: C.primary },

  centerSlot: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  doneCheck:  {
    fontSize: sf(22), fontWeight: '900',
    color: C.primary, lineHeight: sf(26),
  },
  nextGlyph:  { fontSize: sf(22), fontWeight: '900', color: C.primary + 'aa' },

  bottomSlot:   { height: 22, alignItems: 'center', justifyContent: 'center' },
  tileDate:     { fontSize: sf(11), fontWeight: '800', color: C.sub, paddingHorizontal: 2 },
  tileDateDone: { color: C.primary },

  pageDots: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 6, marginTop: 16,
  },
  pageDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  pageDotActive: { backgroundColor: C.primary, width: 18 },
});