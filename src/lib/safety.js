import { supabase } from './supabase';

// -- User safety: report + block -------------------------------------------
// Apple Guideline 1.2 requires apps with user-generated content to let people
// report offensive content and block abusive users. Requires the tables in
// reports_and_blocks.sql.

export const REPORT_REASONS = [
  'Offensive or inappropriate name',
  'Harassment or bullying',
  'Spam or scam',
  'Impersonation',
  'Other',
];

/**
 * File a report against a challenge and/or a user.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function fileReport({ challengeId = null, reportedUserId = null, reason, details = null }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You must be signed in to report.' };
    if (!challengeId && !reportedUserId) {
      return { ok: false, error: 'Nothing to report.' };
    }

    const { error } = await supabase.from('reports').insert({
      reporter_id:      user.id,
      challenge_id:     challengeId,
      reported_user_id: reportedUserId,
      reason,
      details,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Block a user. Blocked users are hidden from leaderboards.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function blockUser(blockedId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You must be signed in.' };
    if (user.id === blockedId) return { ok: false, error: 'You cannot block yourself.' };

    const { error } = await supabase
      .from('blocked_users')
      .upsert({ blocker_id: user.id, blocked_id: blockedId },
              { onConflict: 'blocker_id,blocked_id' });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Unblock a user. */
export async function unblockUser(blockedId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You must be signed in.' };

    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * The set of user ids the current user has blocked.
 * Returns an empty Set on any failure -- a lookup problem must never make
 * the leaderboard disappear.
 */
export async function getBlockedIds() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();

    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);

    if (error) {
      console.warn('getBlockedIds error:', error.message);
      return new Set();
    }
    return new Set((data || []).map(r => r.blocked_id));
  } catch (e) {
    console.warn('getBlockedIds failed:', e.message);
    return new Set();
  }
}