// The wordlist must reject abuse WITHOUT rejecting ordinary kindness stories.
//
// Why this file exists: the filter used to match every banned word as a plain
// substring. That was survivable while it only ran on the retired DailyAct
// screen, and became a real defect on 2026-09-02 when it started screening the
// story field that every user writes in. "I bought grapes for my neighbour"
// was rejected, because "grapes" contains "rape".
//
// A false positive tells someone their act of kindness contains language that
// is "not allowed". That is worse than letting a rude word into a private
// story, so these clean cases are the more important half of the file.
const { containsProfanity } = require('../src/lib/moderation');

describe('ordinary stories are never rejected', () => {
  // Every one of these was blocked by the old substring matching.
  const REGRESSIONS = [
    'I bought grapes for my neighbour',
    'I changed my attitude and apologised',
    'I helped title the newsletter',
    'I signed a petition for the food bank',
    'I helped a new mother with breastfeeding',
    'I scraped ice off a stranger car',
    'I read Dickens to my grandmother',
    'I fed the peacock at the sanctuary',
    'I entered a competition to raise money',
    'I donated to the local constitution drive',
  ];

  // Ordinary kindness writing that shares letters with the list.
  const CLEAN = [
    'I walked five miles for breast cancer research',
    'I passed my class and helped a classmate pass hers',
    'I brought a casserole to the Cassidy family',
    'I helped at the raptor rescue centre',
    'I wrote a thank you note to Massachusetts General',
    'I gave my seat to a woman on crutches',
    'I assisted an elderly man with his shopping bags',
    'I cleaned up the scrap wood behind the shed',
    'I volunteered at the animal shelter and walked six dogs',
    'I helped my neighbour reinstate her library card',
    'I paid for the coffee of the person behind me',
    'I taught my grandson to tie his shoelaces',
    'I sent flowers to a colleague on her last day',
    'I picked up litter along the canal path',
  ];

  for (const story of [...REGRESSIONS, ...CLEAN]) {
    test(`clean: "${story}"`, () => {
      expect(containsProfanity(story)).toBe(false);
    });
  }
});

describe('genuine profanity is still rejected', () => {
  const BLOCKED = [
    // Reported as getting through on the phone, 2026-09-02. It does NOT get
    // through this function -- "shit" is a stem, matched anywhere -- which is
    // how we knew the filter was not running on the device at all.
    'This app is bullshit',
    'bullshit',
    'this is fucking stupid',
    'what a load of shit',
    'you stupid bitch',
    'go f u c k yourself'.replace(/ /g, ''),   // still one word
    'send me nudes',
    'she was naked',
    'look at her tits',
    'total dick move',
    'suck my cock',
    'porn site',
    'you retarded idiot',
    'she is a slut',
    'kiss my ass',
    'that is total crap',
    'sex tape',
  ];

  for (const text of BLOCKED) {
    test(`blocked: "${text}"`, () => {
      expect(containsProfanity(text)).toBe(true);
    });
  }
});

describe('the shape of the check', () => {
  test('empty and non-string input is safe', () => {
    expect(containsProfanity('')).toBe(false);
    expect(containsProfanity(null)).toBe(false);
    expect(containsProfanity(undefined)).toBe(false);
  });

  test('matching is case-insensitive', () => {
    expect(containsProfanity('WHAT THE FUCK')).toBe(true);
    expect(containsProfanity('Tits')).toBe(true);
  });

  test('a banned word inside a longer innocent word does not match', () => {
    // The whole point of the split list.
    expect(containsProfanity('attitude')).toBe(false);
    expect(containsProfanity('grapes')).toBe(false);
    expect(containsProfanity('peacock')).toBe(false);
    expect(containsProfanity('classic')).toBe(false);
    // ...while the stems still match anywhere, so inflections need no listing.
    expect(containsProfanity('bullshitting')).toBe(true);
  });
});
