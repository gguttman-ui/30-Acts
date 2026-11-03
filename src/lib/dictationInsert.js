// dictationInsert.js -- where the app's microphone puts spoken words (3 Nov 2026).
//
// Gary: "I place the cursor where I want to add the new data but it is added
// at the end." The mic used to append every transcript to the end of the story.
// Now the box is split at the cursor when the mic starts, and each result is
// placed between the two halves, with a space on either side where needed.
//
// Only the join changes. When dictation starts and stops (item 54, and the
// 2 Sep known-good baseline in MyStoryScreen) is untouched.
//
// Pure: no React Native. See __tests__/dictationInsert.test.js.

/**
 * Split the text at the cursor. A selection replaces the selected words.
 * No selection known (the person never tapped in the box) = the end, as before.
 */
export function splitAtCursor(text, selection) {
  const t = String(text == null ? '' : text);
  if (!selection || !Number.isFinite(selection.start)) return { before: t, after: '' };
  const start = Math.max(0, Math.min(selection.start, t.length));
  const endRaw = Number.isFinite(selection.end) ? selection.end : start;
  const end = Math.max(start, Math.min(endRaw, t.length));
  return { before: t.slice(0, start), after: t.slice(end) };
}

/**
 * before + transcript + after, with single spaces where the words meet, cut to
 * max characters. When the cap is reached the spoken words are shortened, never
 * the text the person had already written after the cursor.
 */
export function joinDictation({ before = '', after = '', transcript = '', max = Infinity } = {}) {
  const words = String(transcript || '').trim();
  if (!words) return before + after;

  const lead  = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^[\s.,!?;:)]/.test(after) ? ' ' : '';

  const room = max - before.length - lead.length - trail.length - after.length;
  if (room <= 0) return (before + after).slice(0, max);
  return before + lead + words.slice(0, room) + trail + after;
}
