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

const TILES_PER_PAGE = 30;

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

// One tile per CALENDAR DATE across a run's span. Completed dates render as
// act tiles; an internal single missed day (which does NOT break the run)
// renders as a gap tile. Used for the consolidated "earlier streaks" pages.
function buildRunDateTiles(run) {
  const byDate = new Map();
  run.rows.forEach((r) => { const d = rowLocalDate(r); if (d) byDate.set(d, r); });
  const tiles = [];
  let actNo = 0;
  const start = new Date(run.startDate + 'T00:00:00');
  const end   = new Date(run.endDate + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = localDateStr(d);
    const match = byDate.get(iso);
    if (match) { actNo++; tiles.push({ type: 'act', date: iso, actNo, row: match }); }
    else { tiles.push({ type: 'gap', date: iso }); }
  }
  return tiles;
}

// Turn the runs into swipe pages:
//   - the current (live/last) run's active lap        -> its own page (rightmost)
//   - any full 30-act lap                             -> its own page
//   - short/partial runs                              -> consolidated together,
//     one blank separator tile between them, wrapping at 30 tiles per page.
// Chronological order: oldest left, current right.
function buildPages(runs) {
  const lastIdx = runs.length - 1;

  const segments = [];
  runs.forEach((run, ri) => {
    const laps = lapCount(run);
    for (let li = 0; li < laps; li++) {
      const isCurrent = ri === lastIdx && li === laps - 1;
      const actsThisLap = Math.max(0, Math.min(30, run.length - li * 30));
      if (isCurrent) segments.push({ kind: 'current', run, lapIndex: li });
      else if (actsThisLap === 30) segments.push({ kind: 'full', run, lapIndex: li });
      else segments.push({ kind: 'partial', run, lapIndex: li });
    }
  });

  const pages = [];
  let buffer = null;
  const flush = () => { if (buffer && buffer.cells.length) pages.push(buffer); buffer = null; };

  for (const seg of segments) {
    if (seg.kind === 'current') { flush(); pages.push({ type: 'current', run: seg.run, lapIndex: seg.lapIndex }); continue; }
    if (seg.kind === 'full')    { flush(); pages.push({ type: 'full',    run: seg.run, lapIndex: seg.lapIndex }); continue; }

    // partial -> consolidate (single-lap partial => the whole run's date tiles)
    const tiles = buildRunDateTiles(seg.run);
    const need = (buffer && buffer.cells.length ? 1 : 0) + tiles.length;
    if (!buffer) buffer = { type: 'consolidated', cells: [] };
    if (buffer.cells.length + need > TILES_PER_PAGE) { flush(); buffer = { type: 'consolidated', cells: [] }; }
    if (buffer.cells.length) buffer.cells.push({ type: 'sep' });
    tiles.forEach((t) => buffer.cells.push(t));
  }
  flush();

  pages.forEach((p, i) => { p.id = i; });
  return pages;
}

/**
 * Dashboard: shows the CURRENT streak -- the acts you have strung together
 * right now. Swipe right to page back through earlier streaks. Earlier short
 * streaks are consolidated onto shared pages (one blank tile between them);
 * a full 30-act streak gets its own page.
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
        <Text style={s.emptySub}>Log your first act and your streak starts today.</Text>
      </View>
    );
  }

  const currentRun = runs[runs.length - 1];
  const isLive     = currentRun.isAlive;
  const best       = bestRunLength(runs);
  const lifetime   = lifetimeActs(runs);

  const pages = buildPages(runs);
  const initialIndex = pages.length - 1;

  const currentLap  = lapCount(currentRun) - 1;
  const currentDone = actsInLap(currentRun, currentLap);

  // Is there actually a day the user may log right now? You may log TODAY, or
  // back-fill YESTERDAY -- nothing else. "Alive" only means a run COULD be
  // extended; it does not mean an unlogged day exists.
  const loggedDates      = new Set(currentRun.rows.map((r) => rowLocalDate(r)));
  const canLogToday      = !loggedDates.has(today);
  const canLogYesterday  = !loggedDates.has(yesterday);
  const hasLoggableDay   = isLive && (canLogToday || canLogYesterday);

  // -- One tile. cell = { type:'act', day } | { type:'gap' } | { type:'sep' }.
  const renderTileCell = (cell, key, opts) => {
    if (cell.type === 'sep' || cell.type === 'gap') {
      return <View key={key} style={[s.dayCell, s.dayCellBlank]} />;
    }

    const day         = cell.day;
    const interactive = !!(opts && opts.interactive);
    const grid        = opts && opts.grid;
    const isToday     = interactive && day.scheduledDate === today;
    const isYesterday = interactive && day.scheduledDate === yesterday;
    const isDone      = day.status === 'COMPLETED';
    const isNextSlot  = interactive && hasLoggableDay && !isDone
      && grid.findIndex((d) => d.status === 'NOT_SET') === grid.indexOf(day);

    const tappable = isDone || isNextSlot;
    const onPress = () => {
      if (isDone) {
        navigation.navigate('MyStory', { day });
      } else if (isNextSlot) {
        // The "+" slot has no calendar date of its own (future slots carry an
        // empty scheduledDate). Attach the day actually being logged -- today,
        // or yesterday when today is already done -- so the save can build a
        // valid date instead of crashing on an empty string.
        const logDate = canLogToday ? today : yesterday;
        navigation.navigate('CreateChallenge', { day: { ...day, scheduledDate: logDate }, returnTo: 'MyStory' });
      }
    };

    return (
      <TouchableOpacity
        key={key}
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
          <>
            <View style={s.centerSlot}>
              <Text style={s.nextGlyph}>+</Text>
            </View>
            <View style={s.bottomSlot}>
              <Text
                style={[s.tileDate, isToday && s.tileDateDone]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {isToday ? 'TODAY' : fmtMonthDay(day.scheduledDate)}
              </Text>
            </View>
          </>
        ) : (
          <View style={s.centerSlot} />
        )}
      </TouchableOpacity>
    );
  };

  const renderDots = (item) => (
    <View style={s.pageDots}>
      {pages.map((p) => (
        <View key={p.id} style={[s.pageDot, p.id === item.id && s.pageDotActive]} />
      ))}
    </View>
  );

  const renderPage = ({ item }) => {
    if (item.type === 'current') {
      const grid = buildRunGrid(item.run, item.lapIndex);
      return (
        <View style={{ width: SCREEN_W }}>
          <View style={s.grid}>
            {grid.map((day, i) => renderTileCell({ type: 'act', day }, `c-${i}`, { interactive: true, grid }))}
          </View>
          {pages.length > 1 && renderDots(item)}
        </View>
      );
    }

    if (item.type === 'full') {
      const grid = buildRunGrid(item.run, item.lapIndex);
      const label = `STREAK ${'\u00b7'} 30 ACTS ${'\u00b7'} ${fmtMonthDay(item.run.startDate)}${'\u2013'}${fmtMonthDay(item.run.endDate)}`;
      return (
        <View style={{ width: SCREEN_W }}>
          <Text style={s.pastRunLabel}>{label}</Text>
          <View style={s.grid}>
            {grid.map((day, i) => renderTileCell({ type: 'act', day }, `f-${i}`, { interactive: false }))}
          </View>
          {pages.length > 1 && renderDots(item)}
        </View>
      );
    }

    // consolidated
    return (
      <View style={{ width: SCREEN_W }}>
        <Text style={s.pastRunLabel}>EARLIER STREAKS</Text>
        <View style={s.grid}>
          {item.cells.map((cell, i) => {
            if (cell.type === 'act') {
              const day = {
                dayNumber:    cell.actNo,
                scheduledDate: cell.date,
                status:       'COMPLETED',
                title:        cell.row ? (cell.row.act_title || '') : '',
                proofType:    cell.row ? (cell.row.proof_type || null) : null,
                completionId: cell.row ? (cell.row.id || null) : null,
              };
              return renderTileCell({ type: 'act', day }, `k-${i}`, { interactive: false });
            }
            return renderTileCell({ type: cell.type }, `k-${i}`, {});
          })}
        </View>
        {pages.length > 1 && renderDots(item)}
      </View>
    );
  };

  return (
    <View>
      {/* -- Current streak header --------------------------------------- */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerLabel}>
              {isLive ? 'CURRENT STREAK' : 'LAST STREAK'}
              {currentLap > 0 ? ` ${'\u00b7'} LAP ${currentLap + 1}` : ''}
            </Text>
            <Text>
              <Text style={s.runBig}>{currentDone}</Text>
              <Text style={s.runOfThirty}> / 30 acts</Text>
            </Text>
          </View>
          <View style={s.statsRight}>
            <Text style={s.statLine}>This streak {'\u00b7'} <Text style={s.statVal}>{currentRun.length}</Text></Text>
            <Text style={s.statLine}>Best streak {'\u00b7'} <Text style={s.statVal}>{best}</Text></Text>
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
            ? 'This streak has ended. Log an act to start a new one.'
            : hasLoggableDay
              ? 'Tap + to log. Miss two days in a row and a new streak begins.'
              : 'All caught up. Come back tomorrow.'}
        </Text>
        {pages.length > 1 && (
          <Text style={s.swipeHint}>{'\u2190'} Swipe to see earlier streaks</Text>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={pages}
        renderItem={renderPage}
        keyExtractor={(item) => `page-${item.id}`}
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
  dayCellYesterday: { borderColor: C.primary + '88', borderWidth: 1.5 },
  dayCellNext:  { borderColor: C.primary + '88', borderWidth: 1.5 },
  dayCellEmpty: { opacity: 0.4 },
  // Separator between consolidated streaks, and internal single-miss gaps.
  dayCellBlank: {
    backgroundColor: 'transparent',
    borderColor: C.border + '44',
    borderStyle: 'dashed',
  },

  dayNum: {
    fontSize: sf(11), fontWeight: '700', color: C.sub,
    alignSelf: 'flex-start', paddingLeft: 4,
  },
  dayNumToday: { color: C.primary },

  centerSlot: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  doneCheck:  {
    fontSize: 20, fontWeight: '900',
    color: C.primary, lineHeight: 22,
  },
  nextGlyph:  { fontSize: 20, fontWeight: '900', color: C.primary + 'aa', lineHeight: 22 },

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
