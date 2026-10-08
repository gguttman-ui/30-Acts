// Name rules (8 Oct 2026, after Ghenno's account turned up with no name).
//
// Every member needs a first name and at least a last initial: names are shown
// as "First L." on leaderboards and the tree, and the launch emails greet
// people by first name. Sign-up and the Me screen both check with this module
// so the two can never drift apart again.
//
// A name counts only if it holds at least one letter. Digits, spaces and
// ASCII punctuation alone ("1", " ", ".") do not. Accented and non-Latin
// letters are fine.

const LETTER = /[^\s0-9!-/:-@[-`{-~]/;

export function cleanName(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

export function hasLetter(value) {
  return LETTER.test(cleanName(value));
}

// Returns {} when both are fine, otherwise { first?: msg, last?: msg }.
export function nameErrors(first, last) {
  const e = {};
  if (!hasLetter(first)) e.first = 'Enter your first name';
  if (!hasLetter(last))  e.last  = 'Enter at least your last initial';
  return e;
}

// One sentence for an alert, or '' when the name is fine.
export function nameProblem(first, last) {
  const e = nameErrors(first, last);
  if (e.first && e.last) return 'Please enter your first name and at least your last initial.';
  if (e.first) return 'Please enter your first name.';
  if (e.last)  return 'Please enter at least your last initial.';
  return '';
}
