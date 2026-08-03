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
// Public live Branch key (also embedded in the app via Info.plist). Safe to
// include here — it's the client-side key, used to create links via Branch's
// web API so link generation never depends on the native SDK being initialized.
const BRANCH_KEY = 'key_live_hxAVySfBnexcBbICp4gznckeFqjrD981';
const BRANCH_API_URL = 'https://api2.branch.io/v1/url';

// In-memory copy of the most recent referral captured from a Branch link, so
// sign-up can read it right after install/open without waiting on storage.
let pendingReferral = null;
let unsubscribe = null;

function stashReferral(ref, group) {
  if (!ref && !group) return;
  pendingReferral = { ref: ref || null, group: group || null };
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
      stashReferral(ref, group);
    });
  } catch (e) {
    // no-op — Branch not available / not initialized
  }
  return () => {
    try { if (unsubscribe) unsubscribe(); } catch (e) {}
    unsubscribe = null;
  };
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

// Build an invite link that carries the inviter's phone (ref) and, for group
// invites, the group join code. Returns a Branch airpa.app.link short URL that
// bounces new users to the App Store and attributes them after install. Falls
// back to the website link if Branch isn't available (e.g. Expo Go).
export async function generateInviteLink({ phone, group } = {}) {
  const fallback = phone
    ? `${WEBSITE_URL}?ref=${encodeURIComponent(phone)}${group ? `&group=${encodeURIComponent(group)}` : ''}`
    : WEBSITE_URL;
  if (!phone) return fallback;
  try {
    // Create the link through Branch's web API (no native SDK dependency).
    // Returns a short airpa.app.link URL carrying the referral data.
    const res = await fetch(BRANCH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_key: BRANCH_KEY,
        channel: 'app',
        feature: group ? 'group_invite' : 'invite',
        data: {
          ref: String(phone),
          ...(group ? { group: String(group) } : {}),
          $desktop_url: fallback,
          $fallback_url: fallback,
          $og_title: '30 Acts of Kindness',
          $og_description: 'Join me — one kind act a day.',
        },
      }),
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    return json?.url || fallback;
  } catch (e) {
    return fallback;
  }
}

// Apply a pending Branch referral to the just-signed-up user: set their
// referrer (so they land on the inviter's tree) and, for a group invite,
// auto-join that group. Best-effort and FULLY GUARDED — this must never throw
// into or block the login flow. Call once, right after a successful sign-up.
export async function applyPendingReferral(ownPhone) {
  let pending = null;
  try { pending = await getPendingReferral(); } catch (e) { return; }
  if (!pending) return;
  const ref = pending.ref;
  const group = pending.group;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Tree attribution: set referred_by when we have a referrer who isn't the
    // user themselves and the profile doesn't already have one.
    if (ref && ref !== ownPhone) {
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
