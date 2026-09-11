// ─────────────────────────────────────────────────────────────────────────────
// storySeed.js — deciding what the story box should contain when the act picker
// sends the user back to MyStoryScreen.
//
// THE BUG THIS EXISTS FOR
// React Navigation reuses a screen that is already mounted. Navigating to
// MyStory when MyStory is already on the stack updates `route.params` but does
// NOT re-run its `useState` initialisers. So anything the picker hands back has
// to be applied by an effect, or it is silently dropped.
//
// Someone had already hit this once and patched the `preselectedAct` half of
// it. The other half — `draftStory`, the words typed into the picker's Search
// box before tapping "+ Create a New Act" — was never wired up. A tester typed
// "Did dishes to help a friend", got no matches, tapped Create a New Act, and
// landed on an empty box with his sentence gone. Reported 2026-08-31.
//
// This module is PURE so the rules are testable without a navigator:
// __tests__/storySeed.test.js.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the picker is asking us to put in the story box.
 *
 * A chosen act wins over typed text: picking an act from the list is the more
 * deliberate action, and the picker sends the existing draft alongside it, so
 * preferring the draft would make choosing an act do nothing.
 *
 * @param   {object} o
 * @param   {string} [o.actTitle]    title of an act chosen from the list
 * @param   {string} [o.draftStory]  text handed back from the picker
 * @param   {number} [o.maxLength]   the story box's own character cap
 * @returns {string} '' when the picker sent nothing worth applying
 */
export function nextStorySeed({ actTitle = '', draftStory = '', maxLength = Infinity } = {}) {
  const title = (actTitle || '').trim();
  const draft = (draftStory || '').trim();

  const seed = title ? `${title}. ` : (draft ? `${draft} ` : '');
  return seed.length > maxLength ? seed.slice(0, maxLength) : seed;
}

/**
 * What the story box should hold now.
 *
 * The rule: a seed may replace an empty box, or a box still holding the seed we
 * put there last time. It may never replace something the person wrote
 * themselves — losing your own sentence to a stray navigation is worse than
 * having to clear a suggestion you did not want.
 *
 * `lastSeed` is what makes that distinction possible. Without it, text we put
 * in the box is indistinguishable from text the person typed, and the choice
 * becomes clobber-always or clobber-never — the two options that produced this
 * bug and its first bad fix.
 *
 * @param   {object} o
 * @param   {string} [o.current]   what is in the box right now
 * @param   {string} [o.seed]      what the picker wants to put there
 * @param   {string} [o.lastSeed]  what we put there the previous time
 * @returns {string} the text the box should hold
 */
export function applyStorySeed({ current = '', seed = '', lastSeed = '' } = {}) {
  if (!seed) return current;
  const isOurs = !current.trim() || current === lastSeed;
  return isOurs ? seed : current;
}
