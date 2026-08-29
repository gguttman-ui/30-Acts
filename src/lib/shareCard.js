// ─────────────────────────────────────────────────────────────────────────────
// shareCard.js — hosting the rendered act card so it can be shown INSIDE an
// email rather than hanging off it as an attachment.
//
// Why: an attached image is a file the reader has to tap. An <img> in an HTML
// body renders in place. Email clients will not display a data: URI (Gmail and
// others strip them), so the picture has to live at a real URL. We upload the
// card to the existing public `act-media` bucket and point the email at it.
//
// Everything here except uploadShareCard is PURE — no React Native, no Expo, no
// Supabase — so it is unit tested directly in __tests__/shareCard.test.js.
// uploadShareCard takes its dependencies as arguments for the same reason.
//
// PRIVACY: the bucket is public. Anyone holding the URL can view the card. That
// is the same bargain the app already makes for act media, and it is what makes
// the image render in someone else's inbox. Do not put anything here that is
// not already meant to be shared.
// ─────────────────────────────────────────────────────────────────────────────

export const SHARE_CARD_BUCKET = 'act-media';
export const SHARE_CARD_PREFIX = 'share-cards';

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 → Uint8Array, with no dependency on atob or Buffer (neither is
 * reliably present in React Native). Supabase Storage accepts the bytes
 * directly.
 */
export function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array(0);

  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;

  const byteLength = (clean.length / 4) * 3 - padding;
  const bytes = new Uint8Array(byteLength > 0 ? byteLength : 0);

  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64_ALPHABET.indexOf(clean[i]);
    const e2 = B64_ALPHABET.indexOf(clean[i + 1]);
    const e3 = B64_ALPHABET.indexOf(clean[i + 2]);
    const e4 = B64_ALPHABET.indexOf(clean[i + 3]);

    const chunk =
      (e1 << 18) | (e2 << 12) | ((e3 < 0 ? 0 : e3) << 6) | (e4 < 0 ? 0 : e4);

    if (p < byteLength) bytes[p++] = (chunk >> 16) & 0xff;
    if (p < byteLength) bytes[p++] = (chunk >> 8) & 0xff;
    if (p < byteLength) bytes[p++] = chunk & 0xff;
  }
  return bytes;
}

/**
 * Storage path for one card. Namespaced by prefix so share cards never collide
 * with act media, and salted so two shares in the same millisecond differ.
 */
export function buildCardFileName({ dayNumber, now = Date.now(), salt } = {}) {
  const day  = Number.isFinite(dayNumber) ? dayNumber : 0;
  const tail = salt != null ? String(salt) : Math.random().toString(36).slice(2, 8);
  return `${SHARE_CARD_PREFIX}/day${day}-${now}-${tail}.jpg`;
}

/** Minimal HTML escaping for values dropped into the email body. */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The email body. The card carries the day number, branding, hashtag and QR,
 * so the HTML around it stays out of the way: the picture, and a tappable link
 * for anyone who cannot scan a QR code from the screen they are reading on.
 */
export function buildShareEmailHtml({ imageUrl, inviteUrl } = {}) {
  if (!imageUrl) return '';

  const img = escapeHtml(imageUrl);
  const link = inviteUrl
    ? `<p style="margin:16px 0 0;font:15px -apple-system,Helvetica,Arial,sans-serif">` +
      `<a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>`
    : '';

  return (
    `<div style="margin:0;padding:0">` +
    `<img src="${img}" alt="My 30 Acts of Kindness card" ` +
    `style="display:block;width:100%;max-width:600px;height:auto;border:0" ` +
    `width="600" />` +
    link +
    `</div>`
  );
}

/**
 * Upload the rendered card and return its public URL.
 * Dependencies are injected so this can be tested without Supabase or Expo.
 *
 * @param {object}   o
 * @param {object}   o.supabase   supabase client
 * @param {function} o.readBase64 (uri) => Promise<string>
 * @param {string}   o.uri        local file uri of the captured card
 * @param {string}   [o.fileName] storage path; generated when omitted
 * @returns {Promise<string|null>} public URL, or null if anything failed
 */
export async function uploadShareCard({ supabase, readBase64, uri, fileName, dayNumber }) {
  if (!supabase || !readBase64 || !uri) return null;

  try {
    const base64 = await readBase64(uri);
    const bytes = base64ToBytes(base64);
    if (!bytes.byteLength) return null;

    const path = fileName || buildCardFileName({ dayNumber });

    const { error } = await supabase.storage
      .from(SHARE_CARD_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from(SHARE_CARD_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.warn('Share card upload failed:', e && e.message);
    return null;
  }
}
