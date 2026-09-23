// Counts quick repeated taps. Returns a function to call on each tap; it
// returns true on the tap that completes `count` taps within `windowMs`, then
// starts over. Pure, so it is unit-tested without React.
//
// Used by item 43 (23 Sep 2026): five taps on the Settings build stamp send a
// test event to Sentry, so "no new issues" can be told apart from "errors are
// not reaching Sentry" after any config change.
export function createTapCounter({ count = 5, windowMs = 3000 } = {}) {
  let taps = [];
  return function tap(now) {
    taps = taps.filter((t) => now - t < windowMs);
    taps.push(now);
    if (taps.length >= count) {
      taps = [];
      return true;
    }
    return false;
  };
}
