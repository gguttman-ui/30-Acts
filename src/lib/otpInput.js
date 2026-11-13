// otpInput.js -- the sign-in code on the code screen.
//
// History:
// - 26 Oct 2026 (Moto G75, item 91): pasting filled one box because every box
//   but the first had maxLength 1, so Android cut the paste to one digit.
// - 13 Nov 2026 (Moto G75, Play build, item 105): tapping the code in Messages
//   to copy it and pasting still left only the LAST digit. Some Android paths
//   deliver a paste as one change per digit; with six separate boxes every
//   digit landed in the same box before focus could move on.
//
// Fix (105): the screen has ONE hidden text field holding the whole code; the
// six boxes only display it. Whatever Android sends - one change or six,
// typed, pasted, autofilled or the whole text message - ends up in one field,
// and this function turns that field's text into the code.
// No maxLength on the field: Android trims a paste to maxLength BEFORE the app
// sees it, which would cut "Your 30 Acts verification code is: 917615".

export const OTP_LENGTH = 6;

/**
 * @param {string} text  the hidden field's whole text
 * @returns {string}     0-6 digits, in order
 */
export function normalizeOtpText(text) {
  const raw = String(text || '');
  // A whole code inside other text (the whole message pasted): take the
  // 6-digit run, not every digit (the "30" in the message is not the code).
  // A longer run (a code pasted after digits already typed) keeps its last six.
  const runs = raw.match(/\d{6,}/g);
  if (runs) return runs[runs.length - 1].slice(-OTP_LENGTH);
  // Otherwise digits as typed (spaces or dashes ignored), at most six.
  return raw.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
}

/** The six boxes to display for a code string. */
export function otpBoxes(code) {
  const c = String(code || '');
  return Array.from({ length: OTP_LENGTH }, (_, i) => c[i] || '');
}
