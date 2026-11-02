// actingAs.js -- backlog 94, children's profiles Stage 1 (1 Nov 2026).
//
// "Who is doing today's act?" The parent is signed in; a child never signs in.
// When the parent taps a child's name on Home, every act screen reads, saves,
// edits and deletes acts under that child's member key (e.g.
// "+19177218269-01") instead of the parent's phone. Tapping the parent's own
// name switches back (plain tap, no Face ID - Gary, 1 Nov 2026).
//
// While a child is selected:
//   - acts go to the child's key (the database lets a parent do this only for
//     their own children);
//   - sharing buttons are hidden (no social sharing for children);
//   - acts are not linked to the parent's groups;
//   - the Day-30 congratulations text/email is not sent to the parent's phone.
//
// Pure: no React Native, no Supabase. App.js persists the choice.

const PROXY_DOMAIN = '@phone.30acts.app';

let acting = null;            // { member_key, first_name } or null (= the parent)
const listeners = new Set();

/** The selected child, or null when the parent is acting for themselves. */
export function getActingMember() {
  return acting;
}

export function isActingAsChild() {
  return !!acting;
}

/** Select a child ({ member_key, first_name }) or pass null for the parent. */
export function setActingMember(member) {
  const next = member && member.member_key
    ? { member_key: member.member_key, first_name: member.first_name || '' }
    : null;
  if ((acting && acting.member_key) === (next && next.member_key)) return;
  acting = next;
  listeners.forEach((fn) => { try { fn(acting); } catch (e) { /* ignore */ } });
}

/** Calls fn(member) on every change. Returns an unsubscribe function. */
export function subscribeActing(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The phone (or child member key) that acts belong to right now.
 * Drop-in for the old extractPhone(email): returns null for a non-phone email.
 */
export function actingPhone(email) {
  if (!email || typeof email !== 'string' || !email.endsWith(PROXY_DOMAIN)) return null;
  const parentPhone = email.slice(0, -PROXY_DOMAIN.length);
  // Only ever a child of THIS parent; a stale choice from another account is ignored.
  if (acting && acting.member_key.startsWith(`${parentPhone}-`)) return acting.member_key;
  return parentPhone;
}

/**
 * The signed-in parent's own phone, whoever is selected. For things that
 * belong to the account rather than the act - e.g. the invite QR on a
 * certificate, so a child's certificate credits the parent's tree.
 */
export function accountPhone(email) {
  if (!email || typeof email !== 'string' || !email.endsWith(PROXY_DOMAIN)) return null;
  return email.slice(0, -PROXY_DOMAIN.length);
}

/** Test helper: forget the selection. */
export function _resetActingForTests() {
  acting = null;
  listeners.clear();
}
