// fonts.js - David's fix 10 (19 Nov 2026): the website's fonts.
// Bricolage Grotesque for headings, Hanken Grotesk for body text.
// Each weight is its own font file, so a style uses FONT.x (which sets the
// family AND fontWeight 'normal' - on iPhone a fontWeight on top of a custom
// family can swap it back to the system font).
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';

export const FONT_ASSETS = {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  HankenGrotesk_400Regular,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
};

const f = (fontFamily) => ({ fontFamily, fontWeight: 'normal' });

export const FONT = {
  heading:   f('BricolageGrotesque_800ExtraBold'),
  headingMd: f('BricolageGrotesque_700Bold'),
  body:      f('HankenGrotesk_400Regular'),
  semi:      f('HankenGrotesk_600SemiBold'),
  bold:      f('HankenGrotesk_700Bold'),
  heavy:     f('HankenGrotesk_800ExtraBold'),
};
