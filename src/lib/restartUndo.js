// restartUndo.js -- backlog 70 (Gary, 21 Oct 2026).
//
// Restart ("Start over at Day 1") only writes profiles.last_restart_at; no act
// is deleted. Bridget tapped it by mistake on 30 Sep and had to be fixed by
// hand in SQL. Now the home screen offers "Undo start over" for 24 hours,
// which simply clears the marker again.
//
// Pure: no React Native, no Supabase.

export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True while a start-over can still be undone. */
export function canUndoRestart(lastRestartAt, now = Date.now()) {
  if (!lastRestartAt) return false;
  const t = new Date(lastRestartAt).getTime();
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= 0 && age < UNDO_WINDOW_MS;
}
