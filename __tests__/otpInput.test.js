// Sign-in code boxes: paste/autofill anywhere fills all six (Moto G75, 26 Oct 2026).
import { applyOtpInput } from '../src/lib/otpInput';
const fs = require('fs');
const path = require('path');

const EMPTY = ['', '', '', '', '', ''];

describe('sign-in code boxes', () => {
  test('a pasted code fills all six boxes, whichever box it lands in', () => {
    expect(applyOtpInput(EMPTY, 0, '482913')).toEqual({ code: ['4', '8', '2', '9', '1', '3'], next: null });
    expect(applyOtpInput(EMPTY, 3, '482913')).toEqual({ code: ['4', '8', '2', '9', '1', '3'], next: null });
  });

  test('pasting over a digit already in the box keeps the new code', () => {
    expect(applyOtpInput(['7', '', '', '', '', ''], 0, '7482913').code).toEqual(['4', '8', '2', '9', '1', '3']);
  });

  test('spaces or dashes in a pasted code are ignored', () => {
    expect(applyOtpInput(EMPTY, 0, '482-913').code.join('')).toBe('482913');
  });

  test('typing one digit fills the box and moves on', () => {
    expect(applyOtpInput(EMPTY, 0, '4')).toEqual({ code: ['4', '', '', '', '', ''], next: 1 });
    expect(applyOtpInput(['4', '8', '2', '9', '1', ''], 5, '3')).toEqual({ code: ['4', '8', '2', '9', '1', '3'], next: null });
  });

  test('typing over a digit replaces it', () => {
    expect(applyOtpInput(['4', '', '', '', '', ''], 0, '45').code[0]).toBe('5');
  });

  test('deleting empties the box and stays put', () => {
    expect(applyOtpInput(['4', '8', '', '', '', ''], 1, '')).toEqual({ code: ['4', '', '', '', '', ''], next: 1 });
  });

  test('every box accepts a whole code (no maxLength 1 boxes)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.js'), 'utf8');
    expect(src).not.toMatch(/maxLength=\{i === 0 \? 6 : 1\}/);
    expect(src).toMatch(/applyOtpInput\(otpCode, index, text\)/);
  });
});
