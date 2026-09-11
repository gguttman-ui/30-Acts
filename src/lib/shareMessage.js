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

// X's limit is the tightest of any channel, so the social caption is built to
// fit it and every platform then gets the same words. xIntent owns the counting
// because X counts a link as a flat 23 characters, not its real length.
import { X_MAX_CHARS, xPostLength } from './xIntent';

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
// WHAT EVERY SHARE SAYS
//
// Two things, always, on every channel:
//   1. the act being shared - which day, and what it was
//   2. an invitation to join
//
// The card picture carries both visually. The caption has to carry them too,
// because the caption is what travels on its own: it is the text of an X post,
// what gets pasted into Instagram, what a text message shows before the
// attachment loads. A caption that only says "I'm doing 30 Acts of Kindness"
// makes the reader work out what they are looking at.
//
// THE ACT LEADS. It is the news; the challenge is the context. Putting the act
// first is also what makes the whole thing fit X - see buildSocialMessage.
// ─────────────────────────────────────────────────────────────────────────────

const CHALLENGE_LINE = 'One kind act a day for 30 days in a row.';

/** Same line, folded into the middle of a sentence. */
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// Titles the app fills in for itself when the person did not pick an act from
// the catalogue. They are fine as screen headings but meaningless in a post —
// "Day 12: 'My Story'" tells a reader nothing about what was actually done.
// When the title is one of these, the person's own story leads instead.
const PLACEHOLDER_TITLES = ['my story', 'my act', 'untitled'];

/** True when a title is real content rather than the app's own filler. */
export function isRealActTitle(actTitle = '') {
  const t = (actTitle || '').trim();
  if (!t) return false;
  if (PLACEHOLDER_TITLES.includes(t.toLowerCase())) return false;
  // "Day 12 act" is generated in DailyActScreen when nothing was chosen.
  if (/^day\s+\d+\s+act$/i.test(t)) return false;
  return true;
}

/**
 * What this share is ABOUT, in the person's own words: the act they picked, or
 * failing that the story they wrote. One of the two is almost always present —
 * a completion with neither is not worth describing, so the caption falls back
 * to naming the challenge alone.
 */
export function buildLead({ actTitle = '', story = '' } = {}) {
  if (isRealActTitle(actTitle)) return actTitle.trim();
  return (story || '').trim();
}

/**
 * The opening block: what was done, then the challenge line under it.
 *
 * The lead is introduced as "my act of kindness" rather than dropped in bare.
 * `Day 79: "This is the fourth try..."` leaves a reader guessing what the
 * quoted words are; saying what they are costs about twenty characters and
 * removes the guess.
 *
 * Falls back gracefully - a share with nothing to describe (the certificate)
 * still says what the challenge is, it just has no act to lead with.
 */
function buildOpening({ dayNumber, lead = '', completedAll = false } = {}) {
  const l = (lead || '').trim();

  if (l && dayNumber) return `My act of kindness for Day ${dayNumber}:\n"${l}"\n${CHALLENGE_LINE}`;
  if (l)              return `My act of kindness today:\n"${l}"\n${CHALLENGE_LINE}`;
  if (completedAll)   return `I completed all 30 Acts of Kindness — ${lower(CHALLENGE_LINE)}`;
  if (dayNumber)      return `Day ${dayNumber} of 30 Acts of Kindness — ${lower(CHALLENGE_LINE)}`;
  return `I'm doing 30 Acts of Kindness — ${lower(CHALLENGE_LINE)}`;
}

/**
 * Shorten `text` to at most `max` characters, cutting at a word boundary so the
 * result reads as a phrase rather than a stump. Returns '' when `max` leaves
 * too little to mean anything - better to say nothing about the act than to
 * post 'Paid for the c…'.
 */
export function trimToWords(text = '', max = 0, min = 12) {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  if (max < min) return '';

  const cut = t.slice(0, max - 1);              // -1 leaves room for the ellipsis
  const lastSpace = cut.lastIndexOf(' ');
  const body = (lastSpace >= min ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, '');
  return body.length >= min ? `${body}…` : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// The invitation that goes out with a Text or Email share.
//
// Sent to one person you know, so it says why they are getting it. It also
// needs the tappable link: a reader looking at the card ON their phone cannot
// scan a QR code off their own screen.
//
// No length limit here - neither SMS nor email has one worth designing around,
// so this is the one caption that can carry the whole story.
// ─────────────────────────────────────────────────────────────────────────────
export function buildInviteMessage({
  dayNumber,
  actTitle = '',
  story = '',
  inviteUrl = '',
  completedAll = false,
} = {}) {
  const lead    = buildLead({ actTitle, story });
  const opening = buildOpening({ dayNumber, lead, completedAll });

  // Only add the story block when the story is not already the lead — a
  // story-only day would otherwise print the same words twice.
  const trimmedStory = (story || '').trim();
  const storyPart = trimmedStory && trimmedStory !== lead
    ? `\n\nHere's what I did:\n"${trimmedStory}"`
    : '';

  const body = inviteUrl
    ? "I'm sharing this because I'd love you to join me. Scan the code in the "
      + "picture, or tap the link below, and we'll make the world a kinder "
      + 'place together.'
    : "I'm sharing this because I'd love you to join me. Scan the code in the "
      + "picture and we'll make the world a kinder place together.";

  const link = inviteUrl ? `\n\n${inviteUrl}` : '';

  return `${opening}${storyPart}\n\n${body}${link}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The caption for a social post (Instagram, Facebook, TikTok, X).
//
// Different from the Text/Email invitation: that one is written to a single
// person you know ("I'd love YOU to join me"). A post is addressed to a room,
// so it reads as an open invitation and carries the hashtag.
//
// How it actually reaches the post varies by platform, and none of it is in the
// app's gift:
//   X        — accepts prefilled text through its compose intent.
//   Facebook — refuses prefilled text from third-party apps, by policy.
//   Instagram, TikTok — no text API at all.
// So for everything except X this goes on the clipboard and the person pastes
// it. That is the ceiling for all of them, not a shortcut.
//
// ONE CAPTION FOR ALL FOUR, AND IT MUST FIT X. X caps a post at 280 characters
// and counts every link as 23 whatever its real length. The other three have no
// limit worth worrying about, so building to X's ceiling gives every platform
// the same words - which is the whole point.
//
// This is why the act leads. The old shape repeated the challenge as a full
// sentence AND added an act line, which left about 53 characters for the title;
// the longest act in acts_of_kindness.csv is 63, and roughly one title in five
// was over the line. Leading with the act and putting the challenge on its own
// short line underneath buys about 40 characters back, which fits every act in
// the catalogue with room for a person's own wording. trimToWords is the safety
// net for anything longer still.
//
// The story appears here ONLY when there is no real act to name - on a
// story-only day it is the whole content of the share, so leaving it out would
// leave the post saying nothing. When there IS an act, the act leads and the
// story stays on the card, where it does not crowd out the invitation.
// ─────────────────────────────────────────────────────────────────────────────
export function buildSocialMessage({
  dayNumber,
  actTitle = '',
  story = '',
  inviteUrl = '',
  completedAll = false,
  maxLength = X_MAX_CHARS,
} = {}) {
  const body = inviteUrl
    ? 'Join me and help make the world a kinder place. Scan the code in the '
      + 'picture, or tap the link:'
    : 'Join me and help make the world a kinder place. Scan the code in the '
      + 'picture to start.';

  const link = inviteUrl ? `\n${inviteUrl}` : '';

  const assemble = (lead) =>
    `${buildOpening({ dayNumber, lead, completedAll })}`
    + `\n\n${body}${link}\n\n${APP_HASHTAG}`;

  const lead = buildLead({ actTitle, story });
  const full = assemble(lead);
  if (xPostLength(full) <= maxLength) return full;

  // Too long — a written story can run to 300 characters. Give the lead exactly
  // the room that is left and let trimToWords decide whether what survives is
  // still worth saying.
  const room = lead.length - (xPostLength(full) - maxLength);
  return assemble(trimToWords(lead, room));
}
