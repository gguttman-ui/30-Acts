// ─────────────────────────────────────────────────────────────────────────────
// shareClipboard.js — putting the rendered card on the clipboard as a PICTURE.
//
// WHY THIS EXISTS
// iOS gives an app exactly two ways to hand something to another app: a URL
// (text only, never a file) and the share sheet (a real file, but the target
// app's position in it is Apple's choice, not ours). For X we open the composer
// by URL, because the share sheet buries X behind a swipe on most phones. That
// gets the caption in and leaves the picture behind.
//
// The clipboard is the third door. It is not a handoff - the person pastes -
// but X's composer accepts a pasted image, and a long-press is one gesture
// rather than a hunt through Photos.
//
// The trick is that the clipboard holds ONE thing. It used to hold the caption,
// which is why an earlier attempt at pasting the picture came up empty: the
// caption was sitting on it. Now the caption arrives prefilled through the
// compose intent, so the clipboard is free to carry the picture instead.
//
// Not unit-tested: it is all I/O. The wording the person reads is in
// buildXShareAlert in xIntent.js, which is pure and is tested.
// ─────────────────────────────────────────────────────────────────────────────
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Put the image at `uri` on the clipboard so it can be pasted into a composer.
 *
 * Only local files work: `ph://` is a Photos asset reference, not a readable
 * file, and a remote URL would have to be downloaded first. Both return false
 * rather than throwing, so the caller can fall back to the Photos route.
 *
 * @param   {string} uri  a file:// URI
 * @returns {Promise<boolean>} true when the picture is on the clipboard
 */
export async function copyImageToClipboard(uri) {
  if (!uri || !uri.startsWith('file://')) return false;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    if (!base64) return false;
    await Clipboard.setImageAsync(base64);
    return true;
  } catch (e) {
    console.warn('copyImageToClipboard failed:', e && e.message);
    return false;
  }
}
