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

// Whole days from a -> b (both "YYYY-MM-DD"). Positive when b is later.
function dayDiffDays(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function fmtMonthDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr.slice(8, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// One tile per CALENDAR DATE across ONE LAP of a run (acts lapIndex*30 ..
// +30). Completed dates render as act tiles; an internal single missed day
// (which does NOT break the run) renders as a gap tile.
//
// IMPORTANT: this renders only the requested lap, NOT the whole run. A run
// that spans more than 30 acts already shows its full laps on their own
// "STREAK · Completed" pages; rendering the whole run here re-drew those same
// acts and produced the duplicate "Earlier Streaks" page. Slicing to the lap
// fixes that -- for a normal short run (single lap) this is the whole run, so
// nothing changes there.
function buildRunDateTiles(run, lapIndex = 0) {
  const offset = lapIndex * 30;
  const rows   = (run.rows || []).slice(offset, offset + 30);
  const byDate = new Map();
  rows.forEach((r) => { const d = rowLocalDate(r); if (d) byDate.set(d, r); });
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return [];
  const tiles = [];
  let actNo = offset;
  const start = new Date(dates[0] + 'T00:00:00');
  const end   = new Date(dates[dates.length - 1] + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = localDateStr(d);
    const match = byDate.get(iso);
    if (match) { actNo++; tiles.push({ type: 'act', date: iso, actNo, row: match }); }
    else { tiles.push({ type: 'gap', date: iso }); }
  }
  return tiles;
}

// Expand a 30-slot lap grid into display cells, inserting a blank gap tile for
// each internal missed day. A run's internal gaps are only ever a single day
// (2+ missed days would have split the run in splitIntoRuns), so at most one
// blank is inserted between two consecutive completed acts. Act numbering is
// preserved -- completed slots keep their dayNumber; gaps are unnumbered
// blanks, matching how the "earlier streaks" pages already render.
function withGapTiles(grid) {
  const cells = [];
  for (let i = 0; i < grid.length; i++) {
    const cur = grid[i];
    if (i > 0) {
      const prev = grid[i - 1];
      if (prev.status === 'COMPLETED' && cur.status === 'COMPLETED' && prev.scheduledDate && cur.scheduledDate) {
        const diff = Math.round(
          (new Date(cur.scheduledDate + 'T00:00:00') - new Date(prev.scheduledDate + 'T00:00:00')) / 86400000
        );
        for (let g = 1; g < diff; g++) cells.push({ type: 'gap' });
      }
    }
    cells.push({ type: 'act', day: cur });
  }
  return cells;
}

// Turn the completion history into swipe pages, built from CONSECUTIVE-DAY
// blocks (ANY missed day ends a block):
//   - a block of 30+ days in a row -> its own "Completed" challenge page
//   - the current (latest) block   -> the interactive current page (with the
//     "+" tile for logging today); folds onto the packed page when it is small
//     and there is room to spare, otherwise its own page
//   - every other short block      -> packed together as much as possible
//     (one blank tile between blocks), wrapping at 30 tiles per page
// Chronological order: oldest left, current right.
const CHALLENGE_LEN = 30;
function buildPages(runs, { today = '', hasLoggableDay = false } = {}) {
  // Every completion row, de-duped by calendar date, oldest first.
  const byDate = new Map();
  runs.forEach((run) => (run.rows || []).forEach((r) => {
    const d = rowLocalDate(r);
    if (d && !byDate.has(d)) byDate.set(d, r);
  }));
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return [];

  // Split into maximal consecutive-day blocks.
  const blocks = [];
  let curBlock = [dates[0]];
  for (let i = 1; i < dates.length; i++) {
    if (dayDiffDays(dates[i - 1], dates[i]) === 1) curBlock.push(dates[i]);
    else { blocks.push(curBlock); curBlock = [dates[i]]; }
  }
  blocks.push(curBlock);

  const tilesFor = (blk) =>
    blk.map((d, i) => ({ type: 'act', date: d, actNo: i + 1, row: byDate.get(d) }));

  const lastIdx = blocks.length - 1;
  const pages = [];
  let buffer = null;
  const flush = () => { if (buffer && buffer.cells.length) pages.push(buffer); buffer = null; };

  blocks.forEach((blk, bi) => {
    const isCurrent = bi === lastIdx;
    const start = blk[0], end = blk[blk.length - 1];

    // 30+ days in a row = a completed challenge on its own page (unless it is
    // the live current block, which stays interactive on the current page).
    if (blk.length >= CHALLENGE_LEN && !isCurrent) {
      flush();
      pages.push({ type: 'challenge', tiles: tilesFor(blk), start, end });
      return;
    }

    if (isCurrent) {
      const cells = tilesFor(blk).map((t) => ({ ...t, interactive: true }));
      if (hasLoggableDay) {
        // One blank tile before today's "+" when the last act is >1 day back.
        if (dayDiffDays(end, today) >= 2) cells.push({ type: 'gap' });
        cells.push({ type: 'next', interactive: true });
      }
      const sepNeeded = (buffer && buffer.cells.length) ? 1 : 0;
      const openAfter = TILES_PER_PAGE - ((buffer ? buffer.cells.length : 0) + sepNeeded + cells.length);
      // Fold a SMALL current block onto the packed page when there is room to
      // spare; a challenge-length current block always gets its own page.
      if (blk.length < CHALLENGE_LEN && buffer && buffer.cells.length && openAfter >= 5) {
        buffer.cells.push({ type: 'sep' });
        cells.forEach((t) => buffer.cells.push(t));
        buffer.hasCurrent = true;
        flush();
      } else {
        flush();
        pages.push({ type: 'current', cells, hasCurrent: true });
      }
      return;
    }

    // A short, past block -> pack it (fit as much as possible).
    const tiles = tilesFor(blk);
    const need = (buffer && buffer.cells.length ? 1 : 0) + tiles.length;
    if (!buffer) buffer = { type: 'consolidated', cells: [] };
    if (buffer.cells.length + need > TILES_PER_PAGE) { flush(); buffer = { type: 'consolidated', cells: [] }; }
    if (buffer.cells.length) buffer.cells.push({ type: 'sep' });
    tiles.forEach((t) => buffer.cells.push(t));
  });
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

  const currentLap  = lapCount(currentRun) - 1;
  const currentDone = actsInLap(currentRun, currentLap);

  // Is there actually a day the user may log right now? You may log TODAY, or
  // back-fill YESTERDAY -- nothing else. "Alive" only means a run COULD be
  // extended; it does not mean an unlogged day exists.
  const loggedDates      = new Set(currentRun.rows.map((r) => rowLocalDate(r)));
  const canLogToday      = !loggedDates.has(today);
  const canLogYesterday  = !loggedDates.has(yesterday);
  // The in-grid "+" TODAY tile shows whenever today is unlogged -- whether the
  // streak is still alive (logging extends it) or has ended (logging starts a
  // new one). It replaces the old header "Log today's act" button, so ended
  // streaks now log the same way live ones do: tap the "+" on today's tile.
  const hasLoggableDay   = canLogToday;

  // Build the swipe pages from consecutive-day blocks (see buildPages).
  const pages = buildPages(runs, { today, hasLoggableDay });
  const initialIndex = pages.length - 1;

  // When the streak has ENDED there is no in-grid "+" tile, so the dashboard
  // gave no way to log at all. Start a fresh act (which begins a new streak)
  // straight from the header. Mirrors the Calendar view's tap-to-log flow.
  const startNewAct = (dateToLog) => {
    navigation.navigate('CreateChallenge', {
      day: {
        dayNumber: 1,
        scheduledDate: dateToLog,
        status: 'NOT_SET',
        title: '',
        proofType: null,
        completionId: null,
      },
      returnTo: 'MyStory',
    });
  };

  // -- One tile. cell = { type:'act', day } | { type:'gap' } | { type:'sep' }.
  const renderTileCell = (cell, key, opts) => {
    if (cell.type === 'sep' || cell.type === 'gap') {
      return <View key={key} style={[s.dayCell, s.dayCellBlank]} />;
    }

    // A folded-in current streak carries its own "+" cell for logging today.
    if (cell.type === 'next') {
      return (
        <TouchableOpacity
          key={key}
          onPress={() => startNewAct(today)}
          style={[s.dayCell, s.dayCellNext]}
        >
          <Text style={s.dayNum}>{' '}</Text>
          <View style={s.centerSlot}><Text style={s.nextGlyph}>+</Text></View>
          <View style={s.bottomSlot}>
            <Text style={[s.tileDate, s.tileDateDone]} numberOfLines={1} adjustsFontSizeToFit>TODAY</Text>
          </View>
        </TouchableOpacity>
      );
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
        // empty scheduledDate). The in-grid "+" only ever logs TODAY, so attach
        // today's date so the save can build a valid date instead of crashing
        // on an empty string.
        navigation.navigate('CreateChallenge', { day: { ...day, scheduledDate: today }, returnTo: 'MyStory' });
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

  // Build a day object from a block act cell and render it.
  const renderActCell = (cell, key, interactive) => {
    const day = {
      dayNumber:    cell.actNo,
      scheduledDate: cell.date,
      status:       'COMPLETED',
      title:        cell.row ? (cell.row.act_title || '') : '',
      proofType:    cell.row ? (cell.row.proof_type || null) : null,
      completionId: cell.row ? (cell.row.id || null) : null,
    };
    return renderTileCell({ type: 'act', day }, key, { interactive });
  };

  const renderPage = ({ item }) => {
    // A completed challenge: 30+ consecutive days on its own page.
    if (item.type === 'challenge') {
      const label = `STREAK ${'·'} Completed ${'·'} ${fmtMonthDay(item.start)}${'–'}${fmtMonthDay(item.end)}`;
      return (
        <View style={{ width: SCREEN_W }}>
          <Text style={s.pastRunLabel}>{label}</Text>
          <View style={s.grid}>
            {item.tiles.map((cell, i) => renderActCell(cell, `ch-${i}`, false))}
          </View>
          {pages.length > 1 && renderDots(item)}
        </View>
      );
    }

    // The current (latest) block -- interactive, may end with the "+" tile.
    if (item.type === 'current') {
      return (
        <View style={{ width: SCREEN_W }}>
          <View style={{ height: 8 }} />
          <View style={s.grid}>
            {item.cells.map((cell, i) =>
              cell.type === 'act'
                ? renderActCell(cell, `cu-${i}`, true)
                : renderTileCell({ type: cell.type }, `cu-${i}`, {})
            )}
          </View>
          {pages.length > 1 && renderDots(item)}
        </View>
      );
    }

    // consolidated (may end with the current streak folded in)
    return (
      <View style={{ width: SCREEN_W }}>
        {item.hasCurrent
          ? <View style={{ height: 8 }} />
          : <Text style={s.pastRunLabel}>EARLIER STREAKS</Text>}
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
              return renderTileCell({ type: 'act', day }, `k-${i}`, { interactive: !!cell.interactive });
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
            ? 'This streak ended — tap + to log today and start a new one.'
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

  logCtaWrap: { alignItems: 'center', marginTop: 12 },
  logCta: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 28,
    minWidth: 220, alignItems: 'center',
  },
  logCtaText: { color: C.bg, fontSize: sf(15), fontWeight: '900' },
  logCtaAlt: {
    color: C.muted, fontSize: sf(12), fontWeight: '700',
    marginTop: 8, textDecorationLine: 'underline',
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
    height: 80,
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

  centerSlot: { alignItems: 'center', justifyContent: 'center', flex: 1, alignSelf: 'stretch' },
  // No explicit lineHeight / includeFontPadding here: on iOS a fixed lineHeight
  // clips the tall check glyph at the top. Letting the font's natural metrics
  // size the line box (and centering it in the flex slot) keeps it whole.
  doneCheck:  {
    fontSize: 20, fontWeight: '900',
    color: C.primary, textAlign: 'center',
  },
  nextGlyph:  {
    fontSize: 24, fontWeight: '900',
    color: C.primary + 'aa', textAlign: 'center',
  },

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
