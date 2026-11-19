// actTags.js - David's UX fix 7 (18 Nov 2026): filter chips above the act list.
//
// Each act in ALL_ACTS gets tags worked out from its title, time and cost, so
// a new act is tagged without anyone editing a table. "Quick" and "Costs
// nothing" come straight from timeMinutes / costDollars; the people tags come
// from words in the title. TAG_OVERRIDES fixes the few titles the words get
// wrong.

export const ACT_TAGS = [
  { id: 'quick',     label: 'Quick' },
  { id: 'free',      label: 'Costs nothing' },
  { id: 'strangers', label: 'Strangers' },
  { id: 'neighbors', label: 'Neighbors' },
  { id: 'family',    label: 'Family' },
  { id: 'friends',   label: 'Friends' },
  { id: 'coworkers', label: 'Co-workers' },
  { id: 'community', label: 'Community' },
];

const WORDS = {
  strangers: /\b(stranger|strangers|random|cashier|customer|tourist|mail carrier|in line|on transit|vending machine|meter|car windshield|caught in rain|looked hungry|elderly person|directions|flat tire|door open|at the store|restaurant|tip)\b/i,
  neighbors: /\bneighbou?rs?('s)?\b/i,
  family:    /\b(family|parent|sibling|relative|loved ones)\b/i,
  friends:   /\bfriends?('s)?\b|\bfriendship\b/i,
  coworkers: /\b(coworkers?('s)?|colleagues?|team|teammate|new hire|at work|slack|shift|pto|deadline|workspace|junior)\b/i,
  community: /\b(community|shelter|food bank|food pantry|charity|library|school|classroom|volunteer(ed)?|nonprofit|park|beach|litter|trash|neighborhood|public|tree|waterway|recycling|road|trail|voters|donation drive|thrift|crowdfunding|hospital|nursing home|animal|environmental|small business|youth|tutored|in need|homeless|pollinator|monarchs|bird feeder)\b/i,
};

// Titles the word rules get wrong. Listed tags REPLACE the people tags.
export const TAG_OVERRIDES = {
  'kw-009': ['strangers'],            // "Told a parent they're doing a great job" - a parent you see out
  'hh-009': ['friends', 'family'],    // babysat for a parent
  'hh-027': ['neighbors'],            // helped a neighbor with their kids
  'hh-049': ['family'],
  'gg-013': ['community'],            // gift cards to a family in need (not your family)
  'hh-025': ['neighbors'],            // a neighbor's trash cans
  'lp-012': ['friends'],              // visited a friend in the hospital
  'sk-011': [],                       // talked to myself like a friend - self-kindness
  'wk-001': ['community', 'neighbors'],
  'wk-002': ['community', 'neighbors'],
  'wk-003': ['community', 'neighbors'],
  'wk-010': ['community', 'neighbors'],
  'wk-011': ['community', 'neighbors'],
};

export function actTags(act) {
  if (!act) return [];
  const tags = [];
  if (typeof act.timeMinutes === 'number' && act.timeMinutes <= 5) tags.push('quick');
  if (act.costDollars === 0) tags.push('free');
  const people = TAG_OVERRIDES[act.id]
    || Object.keys(WORDS).filter((k) => WORDS[k].test(act.title || ''));
  for (const t of people) if (!tags.includes(t)) tags.push(t);
  return tags;
}

/** Acts that carry EVERY chosen tag (no chips chosen = all acts). */
export function filterByTags(acts, chosen) {
  if (!chosen || chosen.length === 0) return acts;
  return acts.filter((a) => {
    const t = actTags(a);
    return chosen.every((c) => t.includes(c));
  });
}
