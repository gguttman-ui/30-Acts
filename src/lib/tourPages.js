// First-run tour (items 101 + 102, 9 Nov 2026). Shown on first launch and
// after sign-up ("Mission"), and again from Help > "How it works".
// Kept as plain data so the wording can be checked by tests and changed
// in one place.
export const TOUR_PAGES = [
  {
    key: 'welcome',
    kind: 'welcome',
    title: 'Welcome to\n30 Acts of Kindness',
    body: "We're building a movement to inspire a kinder world - through simple, everyday acts.",
    note: 'The idea is simple: do one act of kindness a day for 30 days. Small acts add up - in you, and in the people around you.',
    button: 'Show me how',
  },
  {
    key: 'pick',
    kind: 'pick',
    title: "Pick or write\ntoday's act",
    body: 'Each day, tap Today on your calendar. Choose an act from our ideas...',
    examples: ['Hold the door and smile', 'Send a thank-you note', "Call someone who's lonely"],
    body2: '...or write your own - a sentence or two about the kindness you did. Tap the mic to speak it instead of typing.',
    sample: 'Carried the boxes up to the 4th floor for my neighbor Patti.',
    note: 'Then share it with friends if you like.',
    button: 'Next',
  },
  {
    key: 'days',
    kind: 'days',
    title: 'Fill your 30 days',
    body: 'Each act fills in a day on your calendar. Keep going day after day to build your streak.',
    body2: 'Reach 30 days in a row and you become a Certified Kind Person - with a certificate and an optional wristband.',
    note: "Miss a day? No problem - you can add yesterday's act, or start a new streak any time.",
    button: 'Next',
  },
  {
    key: 'tree',
    kind: 'tree',
    title: 'Grow your Kindness Tree',
    body: 'Every act you do helps your tree grow.',
    stages: [
      { label: 'Sapling', range: '1-10 acts' },
      { label: 'Young Tree', range: '11-20 acts' },
      { label: 'Mature Tree', range: '21+ acts' },
    ],
    note: "It's not just you. When friends join through your invite, they become part of your tree - and you'll see how many acts your whole tree has done together.",
    button: 'Next',
  },
  {
    key: 'invite',
    kind: 'invite',
    title: 'Kindness is contagious',
    body: 'Invite friends and family with your personal link or QR code (in Me). Start a group for your school, team or workplace and do 30 days together.',
    note: 'Ready? Your first act is waiting.',
    button: "Let's get started",
  },
];

export const isLastPage = (i) => i >= TOUR_PAGES.length - 1;
export const showSkip = (i) => !isLastPage(i);
