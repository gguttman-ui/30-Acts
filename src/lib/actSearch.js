// actSearch.js - David's UX fix 7 (18 Nov 2026): forgiving act search.
// Ignores capitals and punctuation and allows a typo or two, so "bout" finds
// "Bought a coffee for a stranger" and "cofee" finds "coffee". Exact matches
// come first; if there are none, the closest matches are shown instead.

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Edit distance (insert, delete, change one letter), stopping early past max.
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Typos allowed for a typed word: none under 4 letters, 1 for 4-5, 2 after.
const allowed = (w) => (w.length < 4 ? 0 : w.length <= 5 ? 1 : 2);

// How well one typed word fits one title word: 0 = exact start, else typos.
function wordFit(q, w) {
  if (w.startsWith(q)) return 0;
  const max = allowed(q);
  if (!max) return Infinity;
  // compare with the start of the title word (same length, +/- 1)
  let best = Infinity;
  for (let len = q.length - 1; len <= q.length + 1; len++) {
    if (len < 1 || len > w.length) continue;
    best = Math.min(best, editDistance(q, w.slice(0, len), max));
  }
  return best <= max ? best : Infinity;
}

/**
 * Score a title against the search. Returns null if it does not match.
 * Lower is better: 0 = plain match, more = more typos.
 */
export function searchScore(title, query) {
  const q = norm(query);
  if (!q) return 0;
  const t = norm(title);
  if (t.includes(q)) return 0;
  const words = t.split(' ');
  let total = 0;
  for (const qw of q.split(' ')) {
    let best = Infinity;
    for (const w of words) best = Math.min(best, wordFit(qw, w));
    if (best === Infinity) return null;
    total += best;
  }
  return total;
}

/**
 * Acts that match the search, best first (ties keep the list's own order).
 * `closest` is true when nothing matched exactly and these are near misses.
 */
export function searchActs(acts, query) {
  if (!norm(query)) return { results: acts, closest: false };
  const scored = [];
  acts.forEach((a, i) => {
    const sc = searchScore(a.title, query);
    if (sc != null) scored.push({ a, sc, i });
  });
  scored.sort((x, y) => x.sc - y.sc || x.i - y.i);
  const closest = scored.length > 0 && scored[0].sc > 0;
  return { results: scored.map((x) => x.a), closest };
}
