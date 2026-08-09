import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, ActivityIndicator,
} from 'react-native';
import { C, todayStr } from '../constants';
import {
  loadRuns, buildRunGrid, bestRunLength, lifetimeActs, lifetimeCompletionCount,
  lapCount, actsInLap, rowLocalDate,
} from '../lib/runs';

const SCREEN_W = Dimensions.get('window').width;
const FONT_BASE_W = 390;
const fontScale = Math.min(Math.max(SCREEN_W / FONT_BASE_W, 0.85), 1.1);
const sf = (n) => Math.round(n * fontScale);

const TILES_PER_PAGE = 30;

// Tile grid sizing. Compute the tile width in pixels from the screen width so
// six columns + gaps + padding are GUARANTEED to fit inside the page on every
// device (a percentage width + gaps could overflow the right edge on some
// screens). Rows are centered, so any leftover splits evenly on both sides.
const GRID_COLS  = 6;
const GRID_PAD_H = 8;
const GRID_GAP   = 4;
const TILE_W = Math.floor((SCREEN_W - GRID_PAD_H * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);

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

// Turn the completion history into swipe pages.
//
// The history is cut into "pieces". A single missed day is NEVER a page break --
// it shows as a blank tile inside the streak, and numbering stays continuous
// (day 1, 2, 3 ...). A piece only ends at:
//   - a break of 2+ missed days in a row (a real streak break), OR
//   - the edge of a 30-days-in-a-row completed challenge (carved out).
//
// Each piece is then:
//   - a "challenge" (30+ consecutive days) -> its own "Completed" page, or
//   - a "fragment" (an ordinary streak, single misses shown as blanks) ->
//     the interactive current page if it's the latest piece, otherwise packed
//     together with other short fragments (30 tiles per page).
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

  // Which dates belong to a 30+ consecutive-day block (a completed challenge)?
  const challengeDates = new Set();
  {
    let s = 0;
    for (let i = 1; i <= dates.length; i++) {
      if (i === dates.length || dayDiffDays(dates[i - 1], dates[i]) !== 1) {
        if (i - s >= CHALLENGE_LEN) for (let k = s; k < i; k++) challengeDates.add(dates[k]);
        s = i;
      }
    }
  }

  // Cut the history into pieces: a challenge block, or a fragment (ordinary
  // streak that tolerates single-day gaps but breaks at 2+ missed days).
  const pieces = [];
  let i = 0;
  while (i < dates.length) {
    if (challengeDates.has(dates[i])) {
      let j = i + 1;
      while (j < dates.length && challengeDates.has(dates[j]) && dayDiffDays(dates[j - 1], dates[j]) === 1) j++;
      pieces.push({ kind: 'challenge', dates: dates.slice(i, j) });
      i = j;
    } else {
      let j = i + 1;
      // A streak is now ONLY truly-consecutive days: ANY gap (a single missed,
      // un-backfilled day) ends the streak, so the next completion starts a
      // fresh streak numbered from Day 1.
      while (j < dates.length && !challengeDates.has(dates[j]) && dayDiffDays(dates[j - 1], dates[j]) === 1) j++;
      pieces.push({ kind: 'fragment', dates: dates.slice(i, j) });
      i = j;
    }
  }

  // Fragment -> cells, with a blank tile for each internal missed day and
  // continuous numbering across those blanks.
  const fragmentCells = (ds, interactive) => {
    const cells = [];
    let actNo = 0;
    for (let k = 0; k < ds.length; k++) {
      if (k > 0) {
        const diff = dayDiffDays(ds[k - 1], ds[k]);
        for (let g = 1; g < diff; g++) cells.push({ type: 'gap' });
      }
      actNo++;
      cells.push({ type: 'act', date: ds[k], actNo, row: byDate.get(ds[k]), interactive });
    }
    return cells;
  };

  // Pad the current streak's cells out to a full 30-slot board so the current
  // page always shows the whole 30-day journey: logged days fill from the
  // top-left, the "+" sits on today's slot, and every remaining slot is an
  // empty placeholder that still shows its day number and projected date.
  const addDaysStr = (dateStr, n) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const padBoard = (cells, startDate) => {
    const out = cells.slice(0, CHALLENGE_LEN);
    for (let i = out.length; i < CHALLENGE_LEN; i++) {
      out.push({ type: 'future', dayNo: i + 1, date: startDate ? addDaysStr(startDate, i) : null });
    }
    return out;
  };

  const lastIdx = pieces.length - 1;
  const pages = [];
  let buffer = null;
  const flush = () => { if (buffer && buffer.cells.length) pages.push(buffer); buffer = null; };

  // Pack a set of cells into the running consolidated buffer, keeping a piece
  // together when it fits and wrapping only a piece too big for one page.
  const packInto = (cells) => {
    const sep = (buffer && buffer.cells.length) ? 1 : 0;
    if (buffer && buffer.cells.length && buffer.cells.length + sep + cells.length > TILES_PER_PAGE) flush();
    if (!buffer) buffer = { type: 'consolidated', cells: [] };
    if (buffer.cells.length) buffer.cells.push({ type: 'sep' });
    for (const c of cells) {
      if (buffer.cells.length >= TILES_PER_PAGE) { flush(); buffer = { type: 'consolidated', cells: [] }; }
      buffer.cells.push(c);
    }
  };

  let currentPlaced = false;
  pieces.forEach((pc, pi) => {
    const isCurrent = pi === lastIdx;

    if (pc.kind === 'challenge') {
      flush();
      const tiles = pc.dates.map((d, k) => ({ type: 'act', date: d, actNo: k + 1, row: byDate.get(d) }));
      pages.push({ type: 'challenge', tiles, start: pc.dates[0], end: pc.dates[pc.dates.length - 1] });
      return;
    }

    // fragment
    if (isCurrent) {
      const lastDate   = pc.dates[pc.dates.length - 1];
      const gapToToday = dayDiffDays(lastDate, today);
      if (gapToToday <= 1) {
        // Streak still alive — the last logged day is today (0) or yesterday (1),
        // so today continues THIS streak with no gap. It owns the 30-slot board.
        const cells = fragmentCells(pc.dates, true);
        if (hasLoggableDay) {
          cells.push({ type: 'next', interactive: true });
        }
        flush();
        pages.push({ type: 'current', cells: padBoard(cells, pc.dates[0]), hasCurrent: true });
      } else {
        // The last streak ENDED (yesterday was missed) — show it as a past
        // streak, and start today on a brand-new board as Day 1 (own page).
        packInto(fragmentCells(pc.dates, false));
        flush();
        if (hasLoggableDay) {
          pages.push({ type: 'current', cells: padBoard([{ type: 'next', interactive: true }], today), hasCurrent: true });
        }
      }
      currentPlaced = true;
    } else {
      packInto(fragmentCells(pc.dates, false));
    }
  });
  flush();

  // Edge case: the latest piece was a 30+ challenge (a live long streak) and
  // today is still open -> give a small current page to log today.
  if (hasLoggableDay && !currentPlaced) {
    // Fresh board after a completed 30-day challenge: today is day 1.
    const cells = [{ type: 'next', interactive: true }];
    pages.push({ type: 'current', cells: padBoard(cells, today), hasCurrent: true });
  }

  pages.forEach((p, idx) => { p.id = idx; });
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
  const [lifetimeCount, setLifetimeCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  const today     = todayStr();
  const yesterday = yesterdayStr();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [r, cnt] = await Promise.all([loadRuns(phone), lifetimeCompletionCount(phone)]);
      if (!cancelled) { setRuns(r); setLifetimeCount(cnt); setLoading(false); }
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
    // Brand-new user: no completions yet. Without a button here the only way to
    // log a first act was the in-grid "+" tile, which doesn't render in this
    // empty state — so a fresh user had no way to log at all. This CTA opens
    // the same act-logging flow the "+" tile and header use (startNewAct).
    return (
      <View style={s.centerBox}>
        <Text style={s.emptyBig}>No acts yet</Text>
        <Text style={s.emptySub}>Log your first act and your streak starts today.</Text>
        <TouchableOpacity
          style={[s.logCta, { marginTop: 20 }]}
          onPress={() => navigation.navigate('MyStory', {
            day: {
              dayNumber: 1,
              scheduledDate: today,
              status: 'NOT_SET',
              title: '',
              proofType: null,
              completionId: null,
            },
            returnTo: 'MyStory',
          })}
        >
          <Text style={s.logCtaText}>+ Log Today's Act</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentRun = runs[runs.length - 1];
  const isLive     = currentRun.isAlive;
  const best       = bestRunLength(runs);
  // Lifetime = straight count of completion rows (falls back to the runs-based
  // sum only if the count query didn't come back).
  const lifetime   = lifetimeCount != null ? lifetimeCount : lifetimeActs(runs);

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
    navigation.navigate('MyStory', {
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

    // A not-yet-reached day on the current 30-slot board: a faint placeholder
    // that still shows its day number and projected date so the whole 30-day
    // plan is visible up front.
    if (cell.type === 'future') {
      return (
        <View key={key} style={[s.dayCell, s.dayCellEmpty]}>
          <Text style={s.dayNum}>{cell.dayNo != null ? cell.dayNo : ' '}</Text>
          <View style={s.centerSlot} />
          <View style={s.bottomSlot}>
            <Text style={s.tileDate} numberOfLines={1} adjustsFontSizeToFit>
              {cell.date ? fmtMonthDay(cell.date) : ''}
            </Text>
          </View>
        </View>
      );
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
          <View style={s.centerSlot}><Text style={s.nextGlyph} allowFontScaling={false}>+</Text></View>
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
        navigation.navigate('MyStory', { day: { ...day, scheduledDate: today }, returnTo: 'MyStory' });
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
              <Text style={s.nextGlyph} allowFontScaling={false}>+</Text>
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
                : renderTileCell(cell, `cu-${i}`, {})
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
            <Text style={s.statLine}>{isLive ? 'This streak' : 'Last streak'} {'\u00b7'} <Text style={s.statVal}>{currentRun.length}</Text></Text>
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

      {/* The pages are full-screen-width (SCREEN_W) and paging snaps on
          SCREEN_W boundaries. This pager lives inside HomeScreen's
          ScrollView, whose content has paddingHorizontal: 6 — so without
          this the real viewport is 12px narrower than each page and the
          snap points drift, leaving the dashboard off-center (worse the
          more streak pages there are). marginLeft: -6 + width: SCREEN_W
          makes the pager span the true screen width so page == viewport. */}
      <FlatList
        ref={listRef}
        data={pages}
        renderItem={renderPage}
        keyExtractor={(item) => `page-${item.id}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width: SCREEN_W, marginLeft: -6 }}
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
    justifyContent: 'center',
    columnGap: GRID_GAP,
    rowGap: 12,
    paddingHorizontal: GRID_PAD_H,
  },

  dayCell: {
    width: TILE_W,
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
    // The "+" glyph sits low in its line box (unlike the top-heavy check),
    // so nudge it up to visually center it in the tile like the checkmarks.
    transform: [{ translateY: -3 }],
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
