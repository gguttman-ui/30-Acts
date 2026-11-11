// "Search my acts" (Gary 10 Nov 2026). Pure helpers so the matching can be
// tested without the database.

// Case-insensitive match on every word typed, in any order.
export function filterActs(rows, query) {
  const list = (rows || []).filter((r) => r && (r.act_title || '').trim());
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return list;
  return list.filter((r) => {
    const text = (r.act_title || '').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

// "Nov 3, 2026" from local_date (YYYY-MM-DD) or, failing that, completed_at.
export function actDateLabel(row) {
  const raw = row?.local_date ? `${row.local_date}T00:00:00` : row?.completed_at;
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
