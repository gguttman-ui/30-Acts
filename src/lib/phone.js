// Pure phone-number helpers — shared home for logic that used to live inline in
// AuthScreen. Kept dependency-free (no React/React Native imports) so it's trivial
// to unit-test. See __tests__/phone.test.js.
//
// NOTE: AuthScreen currently still has its own copies of these. The clean
// follow-up is to have AuthScreen import from here so there's one source of
// truth — do that as a deliberate, separately-tested change (not right before an
// App Store submission).

// Format raw input as a US phone for display, e.g. "(555) 010-0142".
// Accepts partial input and formats progressively as the user types.
export function prettyFormatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  const ten = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  const d = ten.slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Return the 10 US digits, or null if the input isn't a valid 10-digit number
// (a leading US country code "1" is allowed and stripped).
export function toTenDigits(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

// Convert a display phone to the E.164 form used for auth (+1XXXXXXXXXX), or null.
export function formatPhoneForAuth(display) {
  const ten = toTenDigits(display);
  return ten ? `+1${ten}` : null;
}
