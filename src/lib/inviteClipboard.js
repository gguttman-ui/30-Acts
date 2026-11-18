// inviteClipboard.js -- item 112 (18 Nov 2026): carry an invite code from the
// website to a brand-new install without Branch (whose link creation is paid).
//
// The website copies "30ACTS-INVITE:<CODE>" to the clipboard when someone
// opens an invite link and taps Download. At sign-up the app reads the
// clipboard ONCE (iPhone asks "Allow paste?") and fills in the code. The person
// can also type it. Codes: 8 characters from A-Z (no I, O) and 2-9.

export const INVITE_MARKER = '30ACTS-INVITE:';
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/** A clean invite code, or null. Accepts lower case and stray spaces. */
export function cleanInviteCode(text) {
  const c = String(text || '').replace(/\s+/g, '').toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** Find an invite code in clipboard text: our marker, or an ?inv= link. */
export function inviteCodeFromClipboard(text) {
  const t = String(text || '');
  const marker = t.match(/30ACTS-INVITE:\s*([A-Za-z0-9]{8})/i);
  if (marker) return cleanInviteCode(marker[1]);
  const link = t.match(/[?&]inv=([A-Za-z0-9]{8})/i);
  if (link) return cleanInviteCode(link[1]);
  return null;
}
