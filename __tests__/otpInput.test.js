// Sign-in code: one hidden field behind six display boxes.
// Item 91 (26 Oct 2026) and item 105 (13 Nov 2026, Moto G75 Play build:
// tap-to-copy code then paste left only the last digit).
import { normalizeOtpText, otpBoxes, OTP_LENGTH } from '../src/lib/otpInput';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.js'), 'utf8');
const codeScreen = src.slice(src.indexOf('Check your texts'), src.indexOf('label="Verify"'));

// Simulate Android delivering a paste one digit at a time into ONE field.
function typeEach(chars) {
  let field = '';
  for (const ch of chars) field = normalizeOtpText(field + ch);
  return field;
}

describe('sign-in code text', () => {
  test('a pasted code is the code', () => {
    expect(normalizeOtpText('482913')).toBe('482913');
  });

  test('item 105: a paste arriving one digit per change still gives all six', () => {
    expect(typeEach('482913')).toBe('482913');
  });

  test('the whole text message pasted: only the 6-digit code is used', () => {
    expect(normalizeOtpText('Your 30 Acts verification code is: 917615')).toBe('917615');
  });

  test('a code pasted after digits already typed keeps the new code', () => {
    expect(normalizeOtpText('7482913')).toBe('482913');
  });

  test('spaces or dashes are ignored', () => {
    expect(normalizeOtpText('482-913')).toBe('482913');
    expect(normalizeOtpText('482 913')).toBe('482913');
  });

  test('typing and deleting', () => {
    expect(normalizeOtpText('48')).toBe('48');
    expect(normalizeOtpText('4')).toBe('4');
    expect(normalizeOtpText('')).toBe('');
  });

  test('never more than six digits', () => {
    expect(normalizeOtpText('12345 678').length).toBeLessThanOrEqual(OTP_LENGTH);
  });

  test('boxes show the code digit by digit', () => {
    expect(otpBoxes('482')).toEqual(['4', '8', '2', '', '', '']);
    expect(otpBoxes('482913')).toEqual(['4', '8', '2', '9', '1', '3']);
  });
});

describe('code screen', () => {
  test('exactly one text field for the code', () => {
    expect((codeScreen.match(/<TextInput/g) || []).length).toBe(1);
    expect(codeScreen).toMatch(/onChangeText=\{handleOtpText\}/);
  });

  test('the field has no maxLength (Android trims a paste to it)', () => {
    expect(codeScreen).not.toMatch(/maxLength/);
  });

  test('keeps SMS autofill on both platforms', () => {
    expect(codeScreen).toMatch(/textContentType="oneTimeCode"/);
    expect(codeScreen).toMatch(/autoComplete="sms-otp"/);
  });
});
