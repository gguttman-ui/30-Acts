// supabase.js keeps these module-local, so mirror them here using the SAME
// publishable key it uses. Do NOT paste the old legacy anon JWT -- it is
// disabled, and any call made with it fails.
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7Yy5NBm4XmpO1syrdjT62A_4stDanF9';

// -- Content moderation ----------------------------------------------------
// Lifted out of DailyActScreen so it can guard EVERY user-authored field,
// not just the act text.
//
// Why this matters: act titles and stories are private to their author --
// nobody else ever sees them. The fields that ARE shown to other users are
// challenge names (visible to everyone who joins by invite code) and profile
// names (rendered "First L." on challenge leaderboards). Those were the two
// fields with no filter at all. Protection was on the private content and
// absent from the public content -- exactly backwards.
//
// Apple Guideline 1.2 asks for filtering of objectionable content in apps
// with user-generated content. This is that filter.

const PARTIAL_BANNED = [
  'fuck', 'shit', 'bitch', 'cunt', 'cock', 'dick', 'pussy', 'nigger', 'nigga',
  'faggot', 'porn', 'nude', 'naked', 'erotic', 'orgasm', 'penis', 'vagina',
  'boob', 'breast', 'masturbat', 'rape', 'molest', 'tit',
];

const EXACT_BANNED = [
  'ass', 'bastard', 'damn', 'crap', 'piss', 'whore', 'slut', 'retard',
  'predator', 'sex', 'sexy',
];

/**
 * Fast local wordlist check. No network, so it is safe to call on every save.
 */
export function containsProfanity(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  const partialMatch = PARTIAL_BANNED.some(w => lower.includes(w));
  const exactMatch   = EXACT_BANNED.some(w => new RegExp(`\\b${w}\\b`, 'i').test(lower));
  return partialMatch || exactMatch;
}

/**
 * Server-side moderation via the moderate-content edge function.
 * Returns true if the text is flagged. Fails OPEN (returns false) on any
 * network/parse error so a flaky connection can never block a legitimate save.
 */
export async function moderateContent(text) {
  if (!text || !String(text).trim()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/moderate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!(json?.flagged);
  } catch (e) {
    console.warn('moderateContent failed:', e.message);
    return false;
  }
}

/**
 * Local check first (instant), then the server check.
 *
 * @returns {Promise<boolean>} true if the text should be REJECTED
 */
export async function isContentBlocked(text) {
  if (!text || !String(text).trim()) return false;
  if (containsProfanity(text)) return true;
  return await moderateContent(text);
}

/** Standard rejection copy, so every screen says the same thing. */
export const BLOCKED_MESSAGE =
  'That contains language which is not allowed under our Community Guidelines. Please revise and try again.';