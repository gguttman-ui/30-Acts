// ─────────────────────────────────────────────────────────────────────────────
// xIntent.js — builds the URLs that open X's composer with the caption already
// in it.
//
// This module is deliberately PURE: no React Native, no Expo. That is what
// makes it unit-testable in __tests__/xIntent.test.js. The screens do the
// Linking / Clipboard / Photos work; this only decides the URLs.
//
// WHY THE APP DOES NOT JUST USE THE SHARE SHEET
// It used to. Picking X out of the iOS share sheet hands X's SHARE EXTENSION
// the real file, so the picture and the caption both arrive — genuinely the
// nicest result of any platform. The problem is that iOS decides the order of
// the apps in that sheet and gives no way to pin one or open one by name. On a
// phone where X is not in the first few slots, the person has to swipe the row
// to find it, and most will not.
//
// So X now works the way TikTok does: the card is saved to Photos, the composer
// is opened with the caption prefilled, and the person attaches the picture.
// Two extra taps, but identical on every phone.
//
// THE TWO URLS
//   appUrl — twitter://post, the URL SCHEME. Opens the composer straight away.
//            Carries text only; it can never attach media, which is the whole
//            reason the picture goes to Photos first. Requires "twitter" in
//            LSApplicationQueriesSchemes (it is in app.json) or canOpenURL
//            returns false and the caller falls through to webUrl.
//   webUrl — https://x.com/intent/post, a universal link. iOS hands it to the X
//            app when installed and to Safari when not, so it is a real
//            fallback rather than a dead end.
// ─────────────────────────────────────────────────────────────────────────────

/** X's post length limit. */
export const X_MAX_CHARS = 280;

/**
 * X counts every link as this many characters no matter how long it is, so a
 * naive caption.length under-reports for short links and over-reports for long
 * ones. Counting the way X counts is the only way to know a caption will fit.
 */
export const X_LINK_WEIGHT = 23;

const URL_RE = /https?:\/\/\S+/g;

/** Length of a caption as X will count it: every URL weighs X_LINK_WEIGHT. */
export function xPostLength(text = '') {
  const s = String(text || '');
  let length = s.length;
  for (const url of s.match(URL_RE) || []) {
    length += X_LINK_WEIGHT - url.length;
  }
  return length;
}

/** True when the caption will fit in X's composer without being over limit. */
export function fitsInXPost(text = '') {
  return xPostLength(text) <= X_MAX_CHARS;
}

/**
 * The two URLs that open X's composer with `caption` prefilled.
 *
 * Neither carries the picture — nothing does, through a URL. The caller saves
 * the card to Photos first so the person can attach it in the composer.
 *
 * @param   {object} o
 * @param   {string} [o.caption]
 * @returns {{ appUrl: string, webUrl: string }}
 */
export function buildXIntentUrls({ caption = '' } = {}) {
  const text = encodeURIComponent(String(caption || ''));
  return {
    appUrl: `twitter://post?message=${text}`,
    webUrl: `https://x.com/intent/post?text=${text}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// What the person is told before X opens.
//
// Pure so the wording lives in one place and is tested. Four screens show this
// alert; four copies of prose is four chances to drift.
//
// The picture cannot travel through the compose URL - no URL can carry a file -
// so it goes by one of two routes, and the alert has to name whichever one
// actually worked:
//   clipboard — long-press in the post, tap Paste. One gesture.
//   Photos    — tap the photo icon, pick the newest. Two, and a hunt.
// ─────────────────────────────────────────────────────────────────────────────
const X_OPENS = 'X will open with your caption already written.';

export function buildXShareAlert({
  imageOnClipboard = false,
  savedToPhotos = false,
} = {}) {
  if (imageOnClipboard) {
    return `${X_OPENS}\n\nTo add the picture: touch and hold inside the post, `
         + 'then tap Paste.'
         + (savedToPhotos
             ? '\n\nIt is in your Photos too, if you would rather add it from there.'
             : '');
  }
  if (savedToPhotos) {
    return `${X_OPENS}\n\nTo add the picture: tap the photo icon below the post `
         + 'and pick the newest one — it is saved in your Photos.';
  }
  return `${X_OPENS}\n\nThe picture could not be prepared this time, so you will `
       + 'need to add one yourself.';
}
