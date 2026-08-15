import { prettyFormatPhone, toTenDigits, formatPhoneForAuth } from '../src/lib/phone';

describe('toTenDigits', () => {
  test('accepts a plain 10-digit number', () => {
    expect(toTenDigits('5550100142')).toBe('5550100142');
  });
  test('strips formatting characters', () => {
    expect(toTenDigits('(555) 010-0142')).toBe('5550100142');
  });
  test('drops a leading US country code', () => {
    expect(toTenDigits('15550100142')).toBe('5550100142');
    expect(toTenDigits('+1 (555) 010-0142')).toBe('5550100142');
  });
  test('rejects too short, too long, and empty input', () => {
    expect(toTenDigits('12345')).toBeNull();
    expect(toTenDigits('255501001420')).toBeNull(); // 12 digits, no leading 1
    expect(toTenDigits('')).toBeNull();
    expect(toTenDigits(null)).toBeNull();
    expect(toTenDigits(undefined)).toBeNull();
  });
});

describe('prettyFormatPhone', () => {
  test('formats progressively as digits are typed', () => {
    expect(prettyFormatPhone('555')).toBe('(555');
    expect(prettyFormatPhone('555010')).toBe('(555) 010');
    expect(prettyFormatPhone('5550100142')).toBe('(555) 010-0142');
  });
  test('strips a leading 1 and non-digit characters', () => {
    expect(prettyFormatPhone('1-555-010-0142')).toBe('(555) 010-0142');
  });
  test('empty / null input returns an empty string', () => {
    expect(prettyFormatPhone('')).toBe('');
    expect(prettyFormatPhone(null)).toBe('');
  });
  test('never shows more than 10 digits', () => {
    expect(prettyFormatPhone('55501001429999')).toBe('(555) 010-0142');
  });
});

describe('formatPhoneForAuth', () => {
  test('produces E.164 for a valid number', () => {
    expect(formatPhoneForAuth('(555) 010-0142')).toBe('+15550100142');
  });
  test('matches the built-in test number', () => {
    expect(formatPhoneForAuth('5550100142')).toBe('+15550100142');
  });
  test('returns null for an invalid number', () => {
    expect(formatPhoneForAuth('555')).toBeNull();
    expect(formatPhoneForAuth('')).toBeNull();
  });
});
