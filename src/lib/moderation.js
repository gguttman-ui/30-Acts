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

// THE SERVER CHECK IS GONE (item 15, 2026-09-22)
// ----------------------------------------------
// moderateContent() used to POST every saved story to a `moderate-content`
// edge function. That function was never deployed. Every call 404'd, the
// catch swallowed it, and false came back — so the local wordlist above was
// doing all of the work, on every save, behind a wasted network round trip.
//
// Deleted rather than built. Building it would mean sending every private
// story to a third-party moderation provider, which has to be declared in the
// App Store privacy answers, for a filter the local list already covers.
//
// The bar the filter has to clear has not moved: stories are private to their
// author, and anything that can reach another person is human-approved before
// it does. Nothing slips past this list into public view.
//
// If a server check is ever wanted, it is a new decision with a privacy
// disclosure attached — not a matter of redeploying this.

/**
 * Local wordlist check. No network, so it cannot fail and cannot block a
 * legitimate save through a flaky connection.
 *
 * Async deliberately: every call site already awaits it, and keeping the
 * signature means this change touches one file.
 *
 * @returns {Promise<boolean>} true if the text should be REJECTED
 */
export async function isContentBlocked(text) {
  if (!text || !String(text).trim()) return false;
  return containsProfanity(text);
}

/** Standard rejection copy, so every screen says the same thing. */
export const BLOCKED_MESSAGE =
  'That contains language which is not allowed under our Community Guidelines. Please revise and try again.';
