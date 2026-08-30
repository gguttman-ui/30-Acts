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

// ─────────────────────────────────────────────────────────────────────────────
// The invitation that goes out with a Text or Email share.
//
// Social shares stay picture-only — the card speaks for itself there. Text and
// email are different: they are sent to one person you know, and they deserve a
// line saying why. They also need the tappable link, because a reader looking
// at the card ON their phone cannot scan a QR code off their own screen.
// ─────────────────────────────────────────────────────────────────────────────
export function buildInviteMessage({ inviteUrl = '' } = {}) {
  const opening =
    "I'm doing 30 Acts of Kindness — one kind act a day for 30 days in a row.";

  const body = inviteUrl
    ? "I'm sharing this because I'd love you to join me. Scan the code in the "
      + "picture, or tap the link below, and we'll make the world a kinder "
      + 'place together.'
    : "I'm sharing this because I'd love you to join me. Scan the code in the "
      + "picture and we'll make the world a kinder place together.";

  const link = inviteUrl ? `\n\n${inviteUrl}` : '';

  return `${opening}\n\n${body}${link}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The caption for a social post (Instagram, Facebook, TikTok, X).
//
// Different from the Text/Email invitation: that one is written to a single
// person you know ("I'm sharing this because I'd love YOU to join me"). A post
// is addressed to a room, so it reads as an open invitation and carries the
// hashtag.
//
// How it actually reaches the post varies by platform, and none of it is in the
// app's gift:
//   X        — accepts prefilled text through its compose intent.
//   Facebook — refuses prefilled text from third-party apps, by policy.
//   Instagram, TikTok — no text API at all.
// So for everything except X this goes on the clipboard and the person pastes
// it. That is the ceiling for all of them, not a shortcut.
// ─────────────────────────────────────────────────────────────────────────────
export function buildSocialMessage({ inviteUrl = '' } = {}) {
  const opening =
    "I'm doing 30 Acts of Kindness — one kind act a day for 30 days in a row.";

  const body = inviteUrl
    ? 'Join me and help make the world a kinder place. Scan the code in the '
      + 'picture, or tap the link:'
    : 'Join me and help make the world a kinder place. Scan the code in the '
      + 'picture to start.';

  const link = inviteUrl ? `\n${inviteUrl}` : '';

  return `${opening}\n\n${body}${link}\n\n${APP_HASHTAG}`;
}
