// supabase.js keeps these module-local, so mirror them here using the SAME
// publishable key it uses. Do NOT paste the old legacy anon JWT -- it is
// disabled, and any call made with it fails.
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || 'https://mtfyekdxtkdiaqbgaoza.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7Yy5NBm4XmpO1syrdjT62A_4stDanF9';

// -- Content moderation ----------------------------------------------------
// Lifted out of DailyActScreen so it can guard EVERY user-authored field,
// not just the act text.
//
// Apple Guideline 1.2 asks for filtering of objectionable content in apps
// with user-generated content. This is that filter.
//
// THE SCUNTHORPE FIX (2026-09-02)
// -------------------------------
// Until today every banned word was matched with `lower.includes(word)`.
// That was tolerable while the filter only ran on the retired DailyAct path
// and on display names. The moment it started screening the story field --
// the one every user writes in, every day -- the substring matching became a
// serious defect. Real kindness stories it rejected:
//
//     "I bought grapes for my neighbour"          -> "rape"
//     "I changed my attitude and apologised"      -> "tit"
//     "I signed a petition for the food bank"     -> "tit"
//     "I scraped ice off a stranger's car"        -> "rape"
//     "I read Dickens to my grandmother"          -> "dick"
//     "I fed the peacock at the sanctuary"        -> "cock"
//     "I donated to the constitution drive"       -> "tit"
//
// A false positive here is far more damaging than a false negative. Stories
// are private to their author, and anything that could reach another person
// is human-approved before it does -- so nothing slips past this list into
// public view. But a rejected story is a person being told their act of
// kindness contains language "not allowed", which is both wrong and insulting.
//
// So the list is split in two:
//
//   STEM_BANNED  -- strings that do not occur inside innocent English words.
//                   Matched anywhere, so "shitty" and "fucking" are caught
//                   without listing every inflection.
//   WORD_BANNED  -- ordinary words that DO occur inside innocent ones.
//                   Matched only as whole words, plus the usual suffixes
//                   (-s, -ed, -ing, ...), so "tits" is caught and "attitude"
//                   is not.
//
// Deliberately NOT on either list: "breast". "I walked for breast cancer
// research" is a plausible act of kindness, and blocking it would be worse
// than anything letting the word through could cost.
//
// If you add a word, put it in WORD_BANNED unless you have checked that it
// appears inside no ordinary English word. __tests__/moderationWordlist.test.js
// holds the regression cases.

// Matched as substrings.
const STEM_BANNED = [
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'nigger', 'nigga', 'faggot',
  'porn', 'erotic', 'orgasm', 'penis', 'vagina', 'masturbat', 'molest',
  'whore',
];

// Matched as whole words only (with common suffixes).
const WORD_BANNED = [
  'cock', 'dick', 'nude', 'naked', 'boob', 'rape', 'tit', 'ass', 'bastard',
  'damn', 'crap', 'piss', 'slut', 'retard', 'predator', 'sex',
];

/**
 * "tit" -> tit, tits, titted, titting, ...   "rape" -> rape, rapes, raped,
 * raping (the trailing e is dropped before a vowel suffix, as in English).
 * Anything longer than a suffix -- "attitude", "breastfeeding", "raptor" --
 * fails the word boundary and is left alone.
 */
function wordVariants(word) {
  const out = new Set([word]);
  const add = (stem) => {
    for (const suffix of ['s', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'y']) {
      out.add(stem + suffix);
    }
  };
  add(word);
  if (word.endsWith('e')) add(word.slice(0, -1));
  return [...out];
}

// One regex, built once at load. Word characters only, so no escaping needed.
const WORD_BANNED_RE = new RegExp(
  `\\b(?:${WORD_BANNED.flatMap(wordVariants).join('|')})\\b`,
  'i'
);

/**
 * Fast local wordlist check. No network, so it is safe to call on every save.
 */
export function containsProfanity(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  if (STEM_BANNED.some(w => lower.includes(w))) return true;
  return WORD_BANNED_RE.test(lower);
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
