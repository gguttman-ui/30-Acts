// updateGate.js -- backlog 78 (8 Oct 2026): app updates reach people faster.
//
// expo-updates only checks on a fresh start, and only switches to a new update
// on the NEXT fresh start, so someone who just switches back to the app stays
// on old code for days. App.js now checks whenever the app comes back to the
// front and downloads any update. This gate decides WHEN to switch to it: only
// on a safe screen (the Home tab), never in the middle of writing a story or
// signing up. If the update arrives elsewhere, it waits until Home is shown.
//
// Pure: the reload function is passed in, so __tests__/updateGate.test.js can
// run it without expo-updates.

export const SAFE_ROUTES = new Set(['Home']);

export function createUpdateGate(reload) {
  let ready    = false;
  let route    = null;
  let applying = false;

  const maybeApply = () => {
    if (!ready || applying || !SAFE_ROUTES.has(route)) return;
    applying = true;
    ready    = false;
    Promise.resolve()
      .then(() => reload())
      .catch(() => { applying = false; });
  };

  return {
    /** Tell the gate which screen is showing (route name). */
    noteRoute(name) { route = name || null; maybeApply(); },
    /** An update has been downloaded and is waiting. */
    markReady()     { ready = true; maybeApply(); },
    get isReady()   { return ready; },
    get route()     { return route; },
  };
}
