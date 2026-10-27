// afterModalClose.js -- item 93 (Janie, 26 Oct 2026).
//
// Navigating (or opening a second pop-up) while a transparent Modal is still
// fading out leaves an invisible layer over the screen on iPhone: every tap on
// Home does nothing until the app is closed or the tab is switched. "Add
// yesterday's act" used to wait only one animation frame (~16 ms) for a 300 ms
// fade.
//
// schedule(fn) holds fn until the Modal reports it has closed (onDismiss, on
// iPhone) or, as a fallback, until fallbackMs has passed (Android, or if
// onDismiss never fires). fn runs exactly once.

export const MODAL_CLOSE_FALLBACK_MS = 500;

export function createAfterClose(fallbackMs = MODAL_CLOSE_FALLBACK_MS, timers = { setTimeout, clearTimeout }) {
  let pending = null;
  let timer = null;

  const run = () => {
    if (timer) { timers.clearTimeout(timer); timer = null; }
    const fn = pending;
    pending = null;
    if (fn) fn();
  };

  return {
    schedule(fn) {
      pending = fn;
      if (timer) timers.clearTimeout(timer);
      timer = timers.setTimeout(run, fallbackMs);
    },
    onDismiss: run,
  };
}
