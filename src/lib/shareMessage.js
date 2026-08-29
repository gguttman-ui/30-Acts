// ─────────────────────────────────────────────────────────────────────────────
// shareMessage.js — builds the caption text for every share.
//
// This module is deliberately PURE: no React Native imports, no Expo, no
// Supabase. That is what makes it unit-testable in __tests__/shareMessage.test.js.
// Keep it that way — if you need a value from a screen, pass it in as an
// argument rather than importing anything here.
//
// WHY THIS EXISTS
// The caption used to be built inline in MyStoryScreen and said:
//
//     1. Scan the QR code, or tap the link below
//
// ...on every channel. But a QR code only reaches the reader when an IMAGE goes
// with the message — the StoryCard render embeds one. SMS (`sms:`) and email
// (`mailto:`) are plain text: no attachment, no QR code. Recipients were being
// told to scan a QR code that was not there.
// ─────────────────────────────────────────────────────────────────────────────

export const APP_HASHTAG = '#30ActsOfKindness';

// How the caption travels:
//   'image' — an image accompanies it (Instagram, Facebook, TikTok, X, or the
//             share sheet carrying the rendered card). The card embeds the QR,
//             so the caption may tell the reader to scan it.
//   'text'  — SMS. Plain text only. No image, therefore no QR code.
//   'email' — mailto:. Plain text only. No image, therefore no QR code.
export const CHANNELS = ['image', 'text', 'email'];

/** True only for channels where a QR code actually reaches the reader. */
export function channelHasQr(channel) {
  return channel === 'image';
}

/**
 * The numbered "how to join" block.
 * Step 1 mentions the QR code only when one is actually attached, and mentions
 * the link only when there is a link to mention.
 */
export function buildJoinSteps({ channel = 'image', inviteUrl = '' } = {}) {
  const hasQr   = channelHasQr(channel);
  const hasLink = Boolean(inviteUrl);

  let first;
  if (hasQr && hasLink)      first = 'Scan the QR code, or tap the link below';
  else if (hasQr)            first = 'Scan the QR code';
  else if (hasLink)          first = 'Tap the link below';
  else                       first = 'Search for "30 Acts of Kindness" in the App Store';

  return [
    `1. ${first}`,
    '2. Download the free 30 Acts of Kindness app',
    '3. Sign up with your phone number',
    "4. Do one kind act a day — you'll be added to my kindness tree 🌳",
  ].join('\n');
}

/**
 * The caption for sharing a completed act.
 *
 * @param {object}  o
 * @param {number}  o.dayNumber
 * @param {string}  o.actTitle
 * @param {string}  [o.story]      the user's written story, if any
 * @param {string}  [o.inviteUrl]  personal referral link
 * @param {string}  [o.channel]    'image' | 'text' | 'email'
 */
export function buildActShareMessage({
  dayNumber,
  actTitle,
  story = '',
  inviteUrl = '',
  channel = 'image',
} = {}) {
  const trimmed   = (story || '').trim();
  const storyPart = trimmed ? `\n\nHere's what I did:\n"${trimmed}"` : '';
  const linkPart  = inviteUrl ? `\n\n${inviteUrl}` : '';

  return (
    `🕊️ I just completed Day ${dayNumber} of the 30 Acts of Kindness™!` +
    `\n\nMy act today: "${actTitle}"${storyPart}` +
    `\n\n${APP_HASHTAG}` +
    `\n\nWant to join me? Here's how:\n${buildJoinSteps({ channel, inviteUrl })}` +
    linkPart
  );
}
