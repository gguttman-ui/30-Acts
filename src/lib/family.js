// family.js -- backlog 94, children's profiles Stage 1 (1 Nov 2026).
//
// A parent adds children as family profiles under their own account. A child
// has no phone number or sign-in of their own: their acts are stored in
// `completions` under a hidden member key, the parent's phone plus a suffix,
// e.g. "+19177218269-01". The database (family_members table, RLS) only lets a
// parent create keys that start with their own number.
//
// Pure: no React Native, no Supabase. See __tests__/family.test.js.

import { hasLetter, cleanName } from './nameRules';

// Must match the CHECK constraint on family_members.age_range.
export const AGE_RANGES = ['6-9', '10-12', '13-17'];

export const MAX_CHILDREN = 9;
export const CHILD_NAME_MAX = 30; // matches the database check (1-30)

// Bump the version whenever the wording changes; the version is stored with
// each child's consent record.
export const FAMILY_CONSENT_VERSION = '2026-11-01';
export const FAMILY_CONSENT_TEXT =
  "I am this child's parent or legal guardian. I agree that 30 Acts of Kindness " +
  "may store my child's first name, age range and the acts they log, under my " +
  "account. I can remove my child at any time, which permanently erases their " +
  'profile and acts.';

/** '' when the child's first name is fine, otherwise a message for an alert. */
export function childNameProblem(name) {
  const n = cleanName(name);
  if (!hasLetter(n)) return "Please enter your child's first name.";
  if (n.length > CHILD_NAME_MAX) return `Please keep the name to ${CHILD_NAME_MAX} characters or fewer.`;
  return '';
}

/**
 * The next free member key for this parent, e.g. "+19177218269-03".
 * Uses one more than the highest suffix already in use, so a removed child's
 * key is not handed straight to a new child. Returns null when the parent
 * phone is missing or the parent already has MAX_CHILDREN children.
 */
export function nextMemberKey(parentPhone, existingKeys = []) {
  if (!parentPhone || typeof parentPhone !== 'string') return null;
  const prefix = `${parentPhone}-`;
  const mine = existingKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
  if (mine.length >= MAX_CHILDREN) return null;
  let max = 0;
  for (const k of mine) {
    const n = parseInt(k.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = max + 1;
  if (next > 99) return null;
  return `${prefix}${String(next).padStart(2, '0')}`;
}

/** True for a child member key (parent phone + "-NN"), false for an adult phone. */
export function isMemberKey(value) {
  return typeof value === 'string' && /^\+\d{11,15}-\d{2}$/.test(value);
}

// ── Text-code check before adding a child (1 Nov 2026) ─────────────────
// The database refuses a new child unless the parent's phone passed a code
// check in the last 10 minutes (policy "parent adds child after code check",
// function parent_recently_verified). These two accounts never receive real
// texts; for them the app accepts DEMO_CODE and the database exempts them.
// Keep this list in step with parent_recently_verified() and AuthScreen.
export const CODE_EXEMPT_PHONES = ['+15550100100', '+15550100142'];
export const DEMO_CODE = '123456';
export const CODE_WINDOW_MINUTES = 10;

export function isCodeExempt(phone) {
  return CODE_EXEMPT_PHONES.includes(phone);
}

/** Keep digits only, at most 6. */
export function cleanCode(text) {
  return String(text == null ? '' : text).replace(/\D/g, '').slice(0, 6);
}

/** True when send_phone_otp reports the text was sent. */
export function codeWasSent(data) {
  return data?.status === 200 || data?.status === 201;
}

/** True when verify_phone_otp reports the code is correct. */
export function codeApproved(data) {
  if (!data) return false;
  let body = data.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return false; }
  }
  return body?.status === 'approved';
}
