// emptySearch.js -- what the act list says when nothing matches
// (David's UX review Q5, 17 Nov 2026).
//
// It used to say "No acts match those filters. Try widening the time or cost."
// even when the person had only typed a search - the screen shows no time or
// cost filters. Now it names what they searched for.

export function emptyActsMessage(search, filtersActive) {
  const q = String(search || '').trim();
  if (q) return `No match for "${q}".`;
  if (filtersActive) return 'No acts match those filters.';
  return 'No acts found.';
}

/** The search text, to start the person's own story with. */
export function draftFromSearch(search) {
  return String(search || '').trim();
}
