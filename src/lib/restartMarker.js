// restartMarker.js -- backlog 94 (1 Nov 2026).
//
// "Start over at Day 1" writes a marker; acts saved before it are hidden from
// the board (nothing is deleted). An adult's marker is profiles.last_restart_at;
// a child's is family_members.last_restart_at, found by the child's member key.
// Every screen that reads or writes the marker goes through here so a child's
// Start over never touches the parent's board, and vice versa.
import { supabase } from './supabase';
import { isMemberKey } from './family';

async function authUserId() {
  // getSession reads the local session (no network round-trip) - see streak.js.
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** The marker for this phone or child key, or null. Never throws. */
export async function getRestartMarker(phoneOrKey) {
  try {
    if (isMemberKey(phoneOrKey)) {
      const { data } = await supabase
        .from('family_members').select('last_restart_at')
        .eq('member_key', phoneOrKey).maybeSingle();
      return data?.last_restart_at || null;
    }
    const id = await authUserId();
    if (!id) return null;
    const { data } = await supabase
      .from('profiles').select('last_restart_at').eq('id', id).maybeSingle();
    return data?.last_restart_at || null;
  } catch (e) {
    return null;
  }
}

/** Set (ISO string) or clear (null) the marker. Returns the Supabase error, if any. */
export async function setRestartMarker(phoneOrKey, value) {
  try {
    if (isMemberKey(phoneOrKey)) {
      const { error } = await supabase
        .from('family_members').update({ last_restart_at: value })
        .eq('member_key', phoneOrKey);
      return error || null;
    }
    const id = await authUserId();
    if (!id) return new Error('Could not identify your account.');
    const { error } = await supabase
      .from('profiles').update({ last_restart_at: value }).eq('id', id);
    return error || null;
  } catch (e) {
    return e;
  }
}
