// ──────────────────────────────────────────────────────────────────────────────
// branch.js — deferred deep linking / referral attribution via Branch.io.
//
// Replaces the old website-hop referral flow: an invite link now points at a
// Branch link (airpa.app.link) that bounces a new user to the App Store and,
// after they install and open the app, hands us the inviter's referral tag —
// even on a fresh install ("deferred deep link"). We stash that tag and apply
// it at sign-up (see Part 2 wiring in AuthScreen), so the joiner lands on the
// inviter's tree and, for a group invite, auto-joins the group.
//
// react-native-branch is a NATIVE module: it does not exist in Expo Go or on
// web. Everything here is loaded and called defensively so those environments
// simply no-op instead of crashing. Deferred deep linking only matters in the
// real native (EAS) build anyway.
// ──────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

let branch = null;
try {
  // eslint-disable-next-line global-require
  branch = require('react-native-branch').default;
} catch (e) {
  branch = null;
}

export const BRANCH_AVAILABLE = !!branch;

const PENDING_KEY = 'pending_referral';
const WEBSITE_URL = 'https://30ActsofKindness.org';

// In-memory copy of the most recent referral captured from a Branch link, so
// sign-up can read it right after install/open without waiting on storage.
let pendingReferral = null;
let unsubscribe = null;

// inv   = the inviter's invite code (links made since 18 Nov 2026, fix 4)
// ref   = the inviter's phone (OLD links only - still honored, never created)
// group = group join code
function stashReferral(ref, group, inv) {
  if (!ref && !group && !inv) return;
  pendingReferral = { ref: ref || null, group: group || null, inv: inv || null };
  AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pendingReferral)).catch(() => {});
}

// Subscribe to Branch deep links. Call once, early in app start-up. On a
// deferred deep link (fresh install from an invite) or a normal link open,
// Branch returns the inviter's `ref` (phone) and optional `group` code, which
// we stash for the sign-up step to consume. Returns a teardown function.
export function initBranch() {
  if (!branch || unsubscribe) return () => {};
  try {
    unsubscribe = branch.subscribe(({ error, params }) => {
      if (error || !params) return;
      // Only trust params that actually came from a Branch link click/install.
      if (!params['+clicked_branch_link'] && !params['+is_first_session']) return;
      const ref = params.ref || null;
      const group = params.group || null;
      const inv = params.inv || null;
      stashReferral(ref, group, inv);
    });
  } catch (e) {
    // no-op — Branch not available / not initialized
  }
  return () => {
    try { if (unsubscribe) unsubscribe(); } catch (e) {}
    unsubscribe = null;
  };
}

// Item 112: an invite code typed at sign-up or found on the clipboard. It
// replaces any older pending referral's inviter but keeps a pending group.
export async function setPendingInviteCode(code) {
  if (!code) return;
  const prev = await getPendingReferral();
  stashReferral(null, prev?.group || null, code);
}

// Read the pending referral (memory first, then persisted). Used at sign-up.
export async function getPendingReferral() {
  if (pendingReferral) return pendingReferral;
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (raw) { pendingReferral = JSON.parse(raw); return pendingReferral; }
  } catch (e) {}
  return null;
}

// Clear it once it's been applied to an account, so it can't attach twice.
export async function clearPendingReferral() {
  pendingReferral = null;
  try { await AsyncStorage.removeItem(PENDING_KEY); } catch (e) {}
}

// The signed-in person's invite code (created by the database on first use).
// Cached per signed-in account (so a different account on the same phone never
// shares someone else's code). Null if signed out or the lookup fails.
let cached = { uid: null, code: null };
export async function getMyInviteCode() {
  try {
    const { data: { session } = {} } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return null;
    if (cached.uid === uid && cached.code) return cached.code;
    const { data, error } = await supabase.rpc('my_invite_code');
    if (error || !data) return null;
    cached = { uid, code: String(data) };
    return cached.code;
  } catch (e) {
    return null;
  }
}
export function resetInviteCodeCache() { cached = { uid: null, code: null }; }

/** Website link for an invite: only the code and group - NEVER a phone (fix 4). */
export function websiteInviteUrl(code, group) {
  const q = [];
  if (code) q.push(`inv=${encodeURIComponent(code)}`);
  if (group) q.push(`group=${encodeURIComponent(group)}`);
  return q.length ? `${WEBSITE_URL}?${q.join('&')}` : WEBSITE_URL;
}

// Build an invite link that carries the inviter's invite CODE (never the
// phone - UX review fix 4, 18 Nov 2026) and, for group invites, the group
// join code. `phone` only tells us someone is signed in; it is never in a link.
export async function generateInviteLink({ phone, group } = {}) {
  if (!phone) return WEBSITE_URL;
  // Item 112 (18 Nov 2026): Branch will not create links on our plan - its
  // HTTP API returns 403 and the in-app SDK refused too (tested on staging).
  // So invites are the website link with the invite CODE. The website copies
  // the code when the person taps Download, and sign-up picks it up from the
  // clipboard (or they type it) - see src/lib/inviteClipboard.js.
  const code = await getMyInviteCode();
  return websiteInviteUrl(code, group);
}

// Apply a pending Branch referral to the just-signed-up user: set their
// referrer (so they land on the inviter's tree) and, for a group invite,
// auto-join that group. Best-effort and FULLY GUARDED — this must never throw
// into or block the login flow. Call once, right after a successful sign-up.
export async function applyPendingReferral(ownPhone) {
  let pending = null;
  try { pending = await getPendingReferral(); } catch (e) { return; }
  if (!pending) return;
  const ref = pending.ref;      // old links only
  const inv = pending.inv;      // fix 4 links
  const group = pending.group;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Tree attribution from an invite code: the database credits the inviter
    // without ever telling the app their phone (fix 4).
    if (inv) {
      await supabase.rpc('apply_invite_code', { p_code: String(inv) });
    }

    // OLD links (made before 18 Nov 2026) carry the inviter's phone: still
    // honored so nobody loses credit. Set referred_by when we have a referrer
    // who isn't the user themselves and the profile doesn't already have one.
    if (!inv && ref && ref !== ownPhone) {
      const { data: prof } = await supabase
        .from('profiles').select('referred_by').eq('id', user.id).maybeSingle();
      if (!prof) {
        await supabase.from('profiles').upsert({ id: user.id, referred_by: ref }, { onConflict: 'id' });
      } else if (!prof.referred_by) {
        await supabase.from('profiles').update({ referred_by: ref }).eq('id', user.id);
      }
    }

    // Group auto-join: look up the group by its code and add a membership row.
    if (group) {
      const { data: sponsor } = await supabase
        .from('sponsors').select('id').eq('join_code', group).maybeSingle();
      if (sponsor) {
        const { data: existing } = await supabase
          .from('sponsor_members').select('sponsor_id')
          .eq('sponsor_id', sponsor.id).eq('user_id', user.id).maybeSingle();
        if (!existing) {
          await supabase.from('sponsor_members').insert({
            sponsor_id: sponsor.id, user_id: user.id, show_name: true,
          });
        }
      }
    }
  } catch (e) {
    // swallow — referral is best-effort and must not break login
  } finally {
    try { await clearPendingReferral(); } catch (e) {}
  }
}
