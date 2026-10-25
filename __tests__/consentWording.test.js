// Item 89 (25 Oct 2026): one reminder a day, so the consent text says "the
// time you choose". "Up to 2 per day" stays: it is the ceiling Twilio approved.
import { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from '../src/constants';
const fs = require('fs');
const path = require('path');

const LEGAL = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'LegalScreen.js'), 'utf8');

describe('reminder consent wording', () => {
  test('says "the time you choose", not "the times"', () => {
    expect(SMS_CONSENT_TEXT).toMatch(/at the time you choose/);
    expect(SMS_CONSENT_TEXT).not.toMatch(/the times you choose/);
  });

  test('keeps the approved "up to 2 per day" ceiling', () => {
    expect(SMS_CONSENT_TEXT).toMatch(/up to 2 per day/);
  });

  test('consent version was bumped for the new wording', () => {
    expect(SMS_CONSENT_VERSION).toBe('2026-10-25');
  });

  test('the privacy policy says the same', () => {
    expect(LEGAL).toMatch(/up to two per day, at the time you choose\./);
    expect(LEGAL).not.toMatch(/at the times you choose/);
  });
});
