// otpInput.js -- the six code boxes on the sign-in screen.
//
// Android (Moto G75, 26 Oct 2026): pasting the texted code filled only one
// box. Every box but the first had maxLength 1, so Android cut the paste to a
// single digit before the app saw it, and only the FIRST box, when EMPTY,
// accepted a whole code. Now every box takes the full text and this function
// decides what it was: a whole code (paste or autofill) fills all six boxes
// from wherever it landed; anything else is one typed digit.

/**
 * @param {string[]} code   current six digits ('' for empty)
 * @param {number}   index  the box that changed
 * @param {string}   text   that box's new text
 * @returns {{ code: string[], next: number | null }}
 *   next = box to focus, or null when all six are filled.
 */
export function applyOtpInput(code, index, text) {
  const digits = String(text || '').replace(/[^0-9]/g, '');

  // A whole code - pasted, autofilled, or pasted over a digit already there.
  if (digits.length >= 6) {
    return { code: digits.slice(-6).split(''), next: null };
  }

  // Part of a code (3-5 digits pasted): fill forward from this box.
  if (digits.length >= 3) {
    const out = [...code];
    let i = index;
    for (const d of digits) { if (i > 5) break; out[i] = d; i += 1; }
    return { code: out, next: i > 5 ? null : i };
  }

  // One typed digit (or a digit typed over an existing one), or a deletion.
  const out = [...code];
  out[index] = digits.slice(-1);
  if (!out[index]) return { code: out, next: index };
  return { code: out, next: index < 5 ? index + 1 : null };
}
