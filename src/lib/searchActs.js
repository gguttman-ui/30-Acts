// "Search my acts" (Gary 10 Nov 2026). Pure helpers so the matching can be
// tested without the database.

// Lower-case, drop accents (Michał -> michal) and straighten curly quotes so
// what people type matches what they wrote.
export function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l').replace(/Ł/g, 'l')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .toLowerCase();
}

// The words an act is searched by: its title AND the story written for it
// (completions.notes) - names like Patti are usually in the story (11 Nov).
export function actSearchText(r) {
  return normalize(`${r?.act_title || ''} ${r?.notes || ''}`);
}

// Case-insensitive match on every word typed, in any order.
export function filterActs(rows, query) {
  const list = (rows || []).filter((r) => r && actSearchText(r).trim());
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return list;
  return list.filter((r) => {
    const text = actSearchText(r);
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
