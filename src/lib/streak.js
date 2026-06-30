import { supabase } from './supabase';

// ── Local-time date helpers ────────────────────────────────────────────────
// IMPORTANT: JavaScript's Date.toISOString() returns UTC, which can be a
// different calendar day than the user's local time (e.g. 11:36pm CDT on
// Apr 30 is already May 1 in UTC). All scheduledDate strings in this app
// are local-calendar "YYYY-MM-DD", so we must format using local time to
// avoid off-by-one bugs. NEVER use completed_at.split('T')[0] to derive a
// calendar date — always go through localDateStr(new Date(completed_at)).

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(str) {
  const [y, m, d] = (str || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Strip @phone.30acts.app suffix to get just the phone number.
export function extractPhone(email) {
  if (!email || typeof email !== 'string') return null;
  if (!email.endsWith('@phone.30acts.app')) return null;
  return email.replace('@phone.30acts.app', '');
}

/**
 * Given completion rows from Supabase, return the most recent unbroken
 * streak as an array of rows. "Unbroken" = consecutive local calendar
 * days with no gaps.
 */
// Helper: get the calendar date for a completion. Prefers the locked-in
// local_date column (set at write-time using the user's home timezone).
// Falls back to deriving from completed_at in device-local time, so old
// rows without local_date still work.
function rowLocalDate(row) {
  if (row?.local_date) return row.local_date;
  if (row?.completed_at) return localDateStr(new Date(row.completed_at));
  return null;
}

export function findMostRecentStreak(completions) {
  if (!completions?.length) return [];

  // Dedupe rows that share the same calendar day (keep the latest)
  const byDate = new Map();
  for (const row of completions) {
    const dateStr = rowLocalDate(row);
    if (!dateStr) continue;
    const existing = byDate.get(dateStr);
    if (!existing || (row.completed_at || '') > (existing.completed_at || '')) {
      byDate.set(dateStr, row);
    }
  }

  // Sort by calendar date (not completed_at, which can be misleading across TZs)
  const unique = [...byDate.values()].sort((a, b) =>
    (rowLocalDate(a) || '').localeCompare(rowLocalDate(b) || '')
  );

  // Return ALL completions in calendar order. Gaps between days are
  // handled by buildGridFromStreak, which renders missing positions
  // as NOT_SET (empty, tappable) so the user can fill them in.
  // Restart Challenge is the explicit "wipe and start over" mechanism;
  // a single missing day should NOT collapse the user's history.
  return unique;
}

/**
 * Rebuild the 30-day grid from a surviving streak.
 * Day 1's scheduledDate = the local date of the streak's first completion.
 */
export function buildGridFromStreak(streak) {
  if (!streak?.length) return null;

  // Current tier is determined by how many days have been completed.
  // 0-29 done  → tier 1 (days 1-30)
  // 30-59 done → tier 2 (days 31-60)
  // 60-89 done → tier 3 (days 61-90), etc.
  const completedCount = streak.length;
  const tierIndex = Math.floor(completedCount / 30); // 0, 1, 2, ...
  const tierStartDay = tierIndex * 30 + 1;            // 1, 31, 61, ...
  const tierStartIdx = tierIndex * 30;                // slice offset into streak

  // Anchor = the calendar date of the FIRST completion in this tier.
  // Prefers row.local_date (locked in at write-time, travel-stable).
  // If the user hasn't started this tier yet (just rolled over),
  // anchor on today so the new tier's Day N opens fresh from today.
  const tierStartCompletion = streak[tierStartIdx];
  const anchorDate = tierStartCompletion
    ? parseLocalDate(rowLocalDate(tierStartCompletion))
    : parseLocalDate(localDateStr(new Date()));

// Build a date → completion lookup so each grid slot pulls the row
  // whose local_date matches that slot's calendar date. This is
  // gap-safe: a missing middle day leaves that slot NOT_SET while
  // later days still align with their real dates.
  const byDate = new Map();
  for (const row of streak) {
    const d = rowLocalDate(row);
    if (d) byDate.set(d, row);
  }

  const grid = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(anchorDate);
    d.setDate(anchorDate.getDate() + i);
    const scheduledDate = localDateStr(d);
    const match = byDate.get(scheduledDate);

    if (match) {
      return {
        dayNumber:     tierStartDay + i,
        scheduledDate,
        status:        'COMPLETED',
        title:         match.act_title  || '',
        proofType:     match.proof_type || null,
        // Stable identifier for the underlying row. The displayed dayNumber is
        // renumbered per tier/restart and no longer matches the stored
        // day_number, so detail screens must look the completion up by this id,
        // not by dayNumber.
        completionId:  match.id || null,
      };
    }
    return {
      dayNumber:     tierStartDay + i,
      scheduledDate,
      status:        'NOT_SET',
      title:         '',
      proofType:     null,
    };
  });

  return grid;
}



/**
 * Read-only grid load: never deletes or
 * renumbers anything. Used at login and after marking a day complete,
 * so that user data is never silently destroyed. Restart Challenge
 * still uses the destructive collapse to actually consolidate streaks.
 */
export async function loadGridReadOnly(email, buildFreshDays) {
  try {
    const phone = extractPhone(email);
    if (!phone) return buildFreshDays();

    // Look up the user's last_restart_at marker. Completions before this
    // timestamp count for lifetime stats (Tree screen) but are excluded
    // from the active calendar grid so the user sees a fresh Day 1.
    // Read the auth id from the LOCAL session, not getUser(): getUser() makes a
    // network round-trip to /auth/v1/user that can return null right after a
    // fresh login (notably in Expo Go over a tunnel), which would silently skip
    // the restart filter and surface every lifetime completion. getSession()
    // reads the persisted session synchronously — and the completions query
    // below already proves the session is valid.
    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id;
    let lastRestartAt = null;
    if (authUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_restart_at')
        .eq('id', authUserId)
        .maybeSingle();
      lastRestartAt = profile?.last_restart_at || null;
    }

    let query = supabase
      .from('completions')
      .select('*')
      .eq('user_phone', phone)
      .order('completed_at', { ascending: true });

    if (lastRestartAt) {
      query = query.gte('completed_at', lastRestartAt);
    }

    const { data, error } = await query;

if (error || !data || data.length === 0) return buildFreshDays();

    const streak = findMostRecentStreak(data);
    if (streak.length === 0) return buildFreshDays();

    return buildGridFromStreak(streak);
  } catch (e) {
    console.warn('loadGridReadOnly failed:', e.message);
    return buildFreshDays();
  }
}
/**
 * Returns true if removing a given day_number from the grid would create
 * a gap in the surviving streak.
 */
export function deletionBreaksStreak(days, deletedDayNumber) {
  if (!days) return false;
  const before = days.some(d => d.dayNumber < deletedDayNumber && d.status === 'COMPLETED');
  const after  = days.some(d => d.dayNumber > deletedDayNumber && d.status === 'COMPLETED');
  return before && after;
}
/**
 * Return the list of challenge IDs the user is currently a participant in.
 * Used at completion time to populate the completion_challenges join table
 * so each act of kindness gets attributed to every active challenge.
 *
 * Returns [] if the user is not in any challenges, or if anything fails.
 * Never throws — callers can safely spread the result.
 */
export async function getActiveChallengeIds(authUserId) {
  if (!authUserId) return [];
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('challenge_id')
      .eq('user_id', authUserId);

    if (error) {
      console.warn('getActiveChallengeIds error:', error.message);
      return [];
    }
    return (data || []).map(r => r.challenge_id).filter(Boolean);
  } catch (e) {
    console.warn('getActiveChallengeIds failed:', e.message);
    return [];
  }
}
/**
 * Return active challenges for the user as full objects {id, name}.
 * Used by DailyActScreen to show "Counts toward: [names]" indicator.
 *
 * Returns [] on any failure — UI just hides the indicator.
 */
export async function getActiveChallenges(authUserId) {
  if (!authUserId) return [];
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('challenge_id, challenges (id, name)')
      .eq('user_id', authUserId);

    if (error) {
      console.warn('getActiveChallenges error:', error.message);
      return [];
    }
    return (data || [])
      .map(r => r.challenges)
      .filter(Boolean);
  } catch (e) {
    console.warn('getActiveChallenges failed:', e.message);
    return [];
  }
}

/**
 * Returns everything ChallengeDetailScreen needs in one shot.
 *
 * @param {string} challengeId   - the challenge to load
 * @param {string} authUserId    - the current user's auth.users.id (for "is sponsor?" + "is participant?" checks)
 * @returns {Promise<{
 *   challenge: { id, name, type, length_days, invite_code, start_date, created_at, created_by },
 *   isSponsor: boolean,
 *   isParticipant: boolean,
 *   me: { count, firstActAt, lastActAt, showName, joinedAt } | null,
 *   leaderboard: Array<{
 *     userId, firstName, lastInitial, displayName, showName,
 *     count, firstActAt, lastActAt, joinedAt
 *   }>,
 *   totalActs: number
 * }>}
 */
export async function getChallengeDetail(challengeId, authUserId) {
  // 1. Challenge metadata
  const { data: challenge, error: chErr } = await supabase
    .from('challenges')
    .select('id, name, type, length_days, invite_code, start_date, created_at, created_by')
    .eq('id', challengeId)
    .maybeSingle();

  if (chErr || !challenge) {
    throw new Error(chErr?.message || 'Challenge not found');
  }

  const isSponsor = challenge.created_by === authUserId;
  // Look up the sponsor's name from profiles
  let sponsor = null;
  if (challenge.created_by) {
    const { data: sp } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', challenge.created_by)
      .maybeSingle();
    if (sp) {
      const firstName = sp.first_name || '';
      const lastName  = sp.last_name  || '';
      const lastInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';
      sponsor = {
        firstName,
        displayName: [firstName, lastInitial].filter(Boolean).join(' ').trim() || 'Unknown',
      };
    }
  }

  // 2. All participants for this challenge
  const { data: participants, error: pErr } = await supabase
    .from('challenge_participants')
    .select('user_id, joined_at, show_name')
    .eq('challenge_id', challengeId);

  if (pErr) throw new Error(pErr.message);

  const participantIds = (participants || []).map(p => p.user_id);
  const isParticipant = participantIds.includes(authUserId);

  // 3. Profile info for everyone (for names)
  let profilesById = {};
  if (participantIds.length > 0) {
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', participantIds);

    if (profErr) throw new Error(profErr.message);
    profilesById = Object.fromEntries(
      (profiles || []).map(p => [p.id, p])
    );
  }

  // 4. All completion_challenges rows for this challenge, joined to completions
  //    so we can group by user and compute counts + first/last act timestamps.
  let activityByUser = {};
  let totalActs = 0;
  if (participantIds.length > 0) {
    const { data: links, error: lErr } = await supabase
      .from('completion_challenges')
      .select('completion_id, completions ( user_phone, completed_at )')
      .eq('challenge_id', challengeId);

    if (lErr) throw new Error(lErr.message);

    // user_phone in completions matches profiles.phone, not auth.users.id.
    // Build a phone -> user_id map from participant profiles.
    // (profiles.phone was populated in handleSave; we rely on it here.)
    const { data: phoneRows } = await supabase
      .from('profiles')
      .select('id, phone')
      .in('id', participantIds);

    const userIdByPhone = Object.fromEntries(
      (phoneRows || []).filter(r => r.phone).map(r => [r.phone, r.id])
    );

    totalActs = (links || []).length;

    for (const link of (links || [])) {
      const phone = link.completions?.user_phone;
      const userId = userIdByPhone[phone];
      if (!userId) continue;

      if (!activityByUser[userId]) {
        activityByUser[userId] = { count: 0, firstActAt: null, lastActAt: null };
      }
      const a = activityByUser[userId];
      a.count += 1;
      const at = link.completions?.completed_at;
      if (at && (!a.firstActAt || at < a.firstActAt)) a.firstActAt = at;
      if (at && (!a.lastActAt  || at > a.lastActAt))  a.lastActAt  = at;
    }
  }

  // 5. Build leaderboard: one entry per participant, sorted by count DESC.
  const leaderboard = (participants || []).map(p => {
    const prof = profilesById[p.user_id] || {};
    const firstName = prof.first_name || '';
    const lastName  = prof.last_name  || '';
    const lastInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';
    const fullDisplay = [firstName, lastInitial].filter(Boolean).join(' ').trim();
    // For Local challenges, respect opt-out. For other types, always show.
    const displayName = (challenge.type === 'Local' && !p.show_name)
      ? 'Anonymous'
      : (fullDisplay || 'Unknown');
    const act = activityByUser[p.user_id] || { count: 0, firstActAt: null, lastActAt: null };
    return {
      userId:      p.user_id,
      firstName,
      lastInitial,
      displayName,
      showName:    p.show_name,
      count:       act.count,
      firstActAt:  act.firstActAt,
      lastActAt:   act.lastActAt,
      joinedAt:    p.joined_at,
    };
  }).sort((a, b) => b.count - a.count);

  // 6. "me" block (null if not a participant)
  const meRow = (participants || []).find(p => p.user_id === authUserId);
  const meActivity = activityByUser[authUserId] || { count: 0, firstActAt: null, lastActAt: null };
  const me = meRow ? {
    count:      meActivity.count,
    firstActAt: meActivity.firstActAt,
    lastActAt:  meActivity.lastActAt,
    showName:   meRow.show_name,
    joinedAt:   meRow.joined_at,
  } : null;

  return {
    challenge,
    sponsor,
    isSponsor,
    isParticipant,
    me,
    leaderboard,
    totalActs,
  };
}