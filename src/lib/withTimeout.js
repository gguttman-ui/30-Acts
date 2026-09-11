// ─────────────────────────────────────────────────────────────────────────────
// withTimeout.js — bound a promise that might never settle.
//
// THE BUG THIS EXISTS FOR
// Every share handler starts with `if (sharing) return; setSharing(true)` and
// clears the flag in a `finally`. That is correct — right up until an await
// never settles. Then the `finally` never runs, `sharing` stays true, and from
// that moment EVERY share button on the screen silently ignores taps. Nothing
// appears on screen to explain it. The person reports "sharing stopped
// working", which is indistinguishable from a dozen other faults.
//
// It has happened twice: RNShare.shareSingle with Social.EMAIL never resolved
// (2026-08-30), and the same risk was found on every remaining RNShare.open
// call (2026-09-01). The offender is always a bridge call into native UI, where
// a cancel or a dismissal can be dropped rather than reported.
//
// Four screens had grown three copies of this helper under two different names
// (`cap` and `capped`) with different signatures. One definition, tested.
//
// The timeout is a BACKSTOP, not a deadline. A share sheet can legitimately sit
// open for minutes while someone picks a contact and types — so the limit is
// generous. It exists to guarantee the flag is eventually cleared, not to hurry
// anyone along.
// ─────────────────────────────────────────────────────────────────────────────

/** Generous by design: long enough that a real person is never cut off. */
export const SHARE_SHEET_TIMEOUT_MS = 120000;

/** Local work — a screen capture, a file read. Should be seconds, not minutes. */
export const CAPTURE_TIMEOUT_MS = 20000;

/**
 * Resolve with `promise`, or reject once `ms` has passed — whichever is first.
 *
 * The timer is always cleared, so a settled promise never leaves one pending.
 * The rejection carries `label` so a warning in the log says which step gave up
 * rather than just "timeout".
 *
 * @param   {Promise} promise
 * @param   {number}  ms       milliseconds before giving up
 * @param   {string}  [label]  what timed out, for the error message
 * @returns {Promise}
 */
export function withTimeout(promise, ms, label = 'timed out') {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(label));
    }, ms);

    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    Promise.resolve(promise).then(finish(resolve), finish(reject));
  });
}
