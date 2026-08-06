// ── Colors ────────────────────────────────────────────────────────────────────
export const C = {
  bg:          '#071a0e',
  card:        '#0f2b18',
  card2:       '#0a2010',
  surface:     '#163d22',
  border:      '#1e5530',
  primary:     '#2ecc71',
  primaryDark: '#27ae60',
  accent:      '#52e090',
  gold:        '#a8e063',
  text:        '#e8f5e9',
  sub:         '#81c784',
  muted:       '#4a7c59',
  success:     '#69f0ae',
  warning:     '#c8e63d',
  error:       '#ff5252',
  missed:      '#ff5252',
};

// IANA mapping for date math. Stored on profiles.iana_timezone so the streak
// engine and grid builder can compute the user's local calendar date consistently
// regardless of where their phone happens to be physically.
export const STATE_IANA_TZ = {
  AL:'America/Chicago', AK:'America/Anchorage', AZ:'America/Phoenix', AR:'America/Chicago',
  CA:'America/Los_Angeles', CO:'America/Denver', CT:'America/New_York', DC:'America/New_York', DE:'America/New_York',
  FL:'America/New_York', GA:'America/New_York', HI:'Pacific/Honolulu', ID:'America/Denver', IL:'America/Chicago',
  IN:'America/New_York', IA:'America/Chicago', KS:'America/Chicago', KY:'America/New_York', LA:'America/Chicago',
  ME:'America/New_York', MD:'America/New_York', MA:'America/New_York', MI:'America/New_York', MN:'America/Chicago',
  MS:'America/Chicago', MO:'America/Chicago', MT:'America/Denver', NE:'America/Chicago', NV:'America/Los_Angeles',
  NH:'America/New_York', NJ:'America/New_York', NM:'America/Denver', NY:'America/New_York', NC:'America/New_York',
  ND:'America/Chicago', OH:'America/New_York', OK:'America/Chicago', OR:'America/Los_Angeles', PA:'America/New_York',
  RI:'America/New_York', SC:'America/New_York', SD:'America/Chicago', TN:'America/Chicago', TX:'America/Chicago',
  UT:'America/Denver', VT:'America/New_York', VA:'America/New_York', WA:'America/Los_Angeles', WV:'America/New_York',
  WI:'America/Chicago', WY:'America/Denver',
};

// Friendly label map — used only for Settings UI display, NOT for date math.

// ── Timezones ─────────────────────────────────────────────────────────────────
// Maps a US state to a valid IANA timezone identifier (e.g. "America/Chicago").
// These MUST be real IANA IDs, not friendly labels — the send-reminders backend
// feeds this value straight into Intl.DateTimeFormat({ timeZone }) to compute the
// user's local time. A friendly label like "Central (CT)" throws there and the
// user gets silently skipped, so no reminder is ever sent. (Fixed 2026-08-06.)
export const STATE_TZ = {
  AL:'America/Chicago',AK:'America/Anchorage',AZ:'America/Phoenix',AR:'America/Chicago',
  CA:'America/Los_Angeles',CO:'America/Denver',CT:'America/New_York',DC:'America/New_York',DE:'America/New_York',
  FL:'America/New_York',GA:'America/New_York',HI:'Pacific/Honolulu',ID:'America/Denver',IL:'America/Chicago',
  IN:'America/New_York',IA:'America/Chicago',KS:'America/Chicago',KY:'America/New_York',LA:'America/Chicago',
  ME:'America/New_York',MD:'America/New_York',MA:'America/New_York',MI:'America/New_York',MN:'America/Chicago',
  MS:'America/Chicago',MO:'America/Chicago',MT:'America/Denver',NE:'America/Chicago',NV:'America/Los_Angeles',
  NH:'America/New_York',NJ:'America/New_York',NM:'America/Denver',NY:'America/New_York',NC:'America/New_York',
  ND:'America/Chicago',OH:'America/New_York',OK:'America/Chicago',OR:'America/Los_Angeles',PA:'America/New_York',
  RI:'America/New_York',SC:'America/New_York',SD:'America/Chicago',TN:'America/Chicago',TX:'America/Chicago',
  UT:'America/Denver',VT:'America/New_York',VA:'America/New_York',WA:'America/Los_Angeles',WV:'America/New_York',
  WI:'America/Chicago',WY:'America/Denver',
};

// ── US States ─────────────────────────────────────────────────────────────────
export const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DC','Washington D.C.'],['DE','Delaware'],['FL','Florida'],
  ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],
  ['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],
  ['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
  ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],
  ['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],
  ['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],
  ['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
  ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];

// ── Time / Cost slider ranges ────────────────────────────────────────────────
export const TIME_RANGE = { min: 5, max: 60, step: 5 };
export const COST_RANGE = { min: 0, max: 100, step: 1 };

// ── Time buckets — derived from a minute value ───────────────────────────────
// Boundaries: ≤1, ≤5, ≤15, ≤60, ≤180, >180
export const TIME_BUCKETS = [
  { id: 'immediate',   label: 'Immediate (≤ 1 min)',     test: m => m != null && m <= 1 },
  { id: 'short',       label: 'Short (1–5 min)',         test: m => m != null && m > 1   && m <= 5 },
  { id: 'brief',       label: 'Brief (5–15 min)',        test: m => m != null && m > 5   && m <= 15 },
  { id: 'moderate',    label: 'Moderate (15 min–1 hr)',  test: m => m != null && m > 15  && m <= 60 },
  { id: 'substantial', label: 'Substantial (1–3 hr)',    test: m => m != null && m > 60  && m <= 180 },
  { id: 'major',       label: 'Major (3+ hr)',           test: m => m != null && m > 180 },
];

export function formatTimeLabel(minutes) {
  if (minutes == null) return '—';
  if (minutes <= 1)   return '≤ 1 min';
  if (minutes <= 5)   return '1–5 min';
  if (minutes <= 15)  return '5–15 min';
  if (minutes <= 60)  return '15 min–1 hr';
  if (minutes <= 180) return '1–3 hr';
  return '3+ hr';
}

// ── Cost buckets — derived from a dollar value ───────────────────────────────
// Boundaries: 0, ≤5, ≤25, ≤100, ≤500, >500
export const COST_BUCKETS = [
  { id: 'free',        label: 'Free ($0)',              test: d => d != null && d === 0 },
  { id: 'small',       label: 'Small ($1–$5)',          test: d => d != null && d >= 1   && d <= 5 },
  { id: 'modest',      label: 'Modest ($5–$25)',        test: d => d != null && d > 5    && d <= 25 },
  { id: 'generous',    label: 'Generous ($25–$100)',    test: d => d != null && d > 25   && d <= 100 },
  { id: 'significant', label: 'Significant ($100–$500)', test: d => d != null && d > 100 && d <= 500 },
  { id: 'major',       label: 'Major ($500+)',          test: d => d != null && d > 500 },
];

export function formatCostLabel(dollars) {
  if (dollars == null) return '—';
  if (dollars === 0)  return '$0';
  if (dollars <= 5)   return '$1–$5';
  if (dollars <= 25)  return '$5–$25';
  if (dollars <= 100) return '$25–$100';
  if (dollars <= 500) return '$100–$500';
  return '$500+';
}

// Default icon for completed acts whose title isn't in the canned list.
export const DEFAULT_ACT_ICON = require('../assets/categories/KindWords.png');

// ── Act Categories ───────────────────────────────────────────────────────────
// `emoji` field now holds an image module ID (the result of require()),
// not a unicode emoji string. Renderers must use <Image source={cat.emoji} />,
// not <Text>{cat.emoji}</Text>. Field name kept for backward compatibility.
export const ACT_CATEGORIES = [
  {
    id: 'kind_words',
    label: 'Kind Words',
    emoji: require('../assets/categories/KindWords.png'),
    acts: [
      { id: 'kw-001', title: 'Gave a heartfelt compliment to a stranger',          timeMinutes: 1,   costDollars: 0 },
      { id: 'kw-002', title: 'Wrote a thank-you note to a teacher',                timeMinutes: 10,  costDollars: 1 },
      { id: 'kw-003', title: 'Sent an encouraging message to a friend',            timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-004', title: 'Told a coworker they\'re appreciated',               timeMinutes: 2,   costDollars: 0 },
      { id: 'kw-005', title: 'Left a kind note for my mail carrier',               timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-006', title: 'Complimented a cashier sincerely',                   timeMinutes: 1,   costDollars: 0 },
      { id: 'kw-007', title: 'Wrote a positive review for a small business',       timeMinutes: 10,  costDollars: 0 },
      { id: 'kw-008', title: 'Sent a thank-you card to a mentor',                  timeMinutes: 15,  costDollars: 3 },
      { id: 'kw-009', title: 'Told a parent they\'re doing a great job',           timeMinutes: 1,   costDollars: 0 },
      { id: 'kw-010', title: 'Shared an uplifting story with someone',             timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-011', title: 'Acknowledged someone\'s hard work publicly',         timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-012', title: 'Wrote an encouraging letter to a stranger',          timeMinutes: 15,  costDollars: 1 },
      { id: 'kw-013', title: 'Left a kind note for a neighbor',                    timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-014', title: 'Praised someone\'s creativity or talent',            timeMinutes: 2,   costDollars: 0 },
      { id: 'kw-015', title: 'Wrote a heartfelt letter to a parent',               timeMinutes: 30,  costDollars: 1 },
      { id: 'kw-016', title: 'Told my loved ones how much they mean to me',        timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-017', title: 'Gave a customer a sincere compliment',               timeMinutes: 1,   costDollars: 0 },
      { id: 'kw-018', title: 'Complimented a friend',                              timeMinutes: 1,   costDollars: 0 },
      { id: 'kw-019', title: 'Complimented a random person',                       timeMinutes: 1,   costDollars: 0 },
      { id: 'kw-020', title: 'Gave a coworker a compliment',                       timeMinutes: 1,   costDollars: 0 },
      { id: 'kw-021', title: 'Wrote a thank-you note to a colleague',              timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-022', title: 'Recognized a coworker publicly',                     timeMinutes: 5,   costDollars: 0 },
      { id: 'kw-023', title: 'Sent an encouraging Slack/Teams message',            timeMinutes: 2,   costDollars: 0 },
    ],
  },
  {
    id: 'generous_giving',
    label: 'Generous Giving',
    emoji: require('../assets/categories/GenerousGiving.png'),
    acts: [
      { id: 'gg-001', title: 'Donated to a local food bank',                       timeMinutes: 15,  costDollars: 25 },
      { id: 'gg-002', title: 'Donated clothes I no longer need',                   timeMinutes: 30,  costDollars: 0 },
      { id: 'gg-003', title: 'Gave supplies to a local shelter',                   timeMinutes: 30,  costDollars: 30 },
      { id: 'gg-004', title: 'Donated books to a library or school',               timeMinutes: 20,  costDollars: 0 },
      { id: 'gg-005', title: 'Donated toys to children in need',                   timeMinutes: 30,  costDollars: 25 },
      { id: 'gg-006', title: 'Donated school supplies to a classroom',             timeMinutes: 30,  costDollars: 25 },
      { id: 'gg-007', title: 'Contributed to a crowdfunding campaign',             timeMinutes: 5,   costDollars: 25 },
      { id: 'gg-008', title: 'Donated pet food to an animal shelter',              timeMinutes: 20,  costDollars: 20 },
      { id: 'gg-009', title: 'Gave hygiene products to a shelter',                 timeMinutes: 30,  costDollars: 30 },
      { id: 'gg-010', title: 'Bought groceries for a food pantry',                 timeMinutes: 30,  costDollars: 40 },
      { id: 'gg-011', title: 'Donated blankets to a homeless shelter',             timeMinutes: 20,  costDollars: 25 },
      { id: 'gg-012', title: 'Supported a local charity fundraiser',               timeMinutes: 10,  costDollars: 25 },
      { id: 'gg-013', title: 'Gave gift cards to a family in need',                timeMinutes: 10,  costDollars: 50 },
      { id: 'gg-014', title: 'Donated household items to a thrift store',          timeMinutes: 30,  costDollars: 0 },
      { id: 'gg-015', title: 'Paid for the person behind me in line',              timeMinutes: 2,   costDollars: 10 },
      { id: 'gg-016', title: 'Bought a coffee for a stranger',                     timeMinutes: 5,   costDollars: 5 },
      { id: 'gg-017', title: 'Left money in a vending machine for the next person', timeMinutes: 1, costDollars: 2 },
      { id: 'gg-018', title: 'Paid for a stranger\'s parking',                     timeMinutes: 2,   costDollars: 5 },
      { id: 'gg-019', title: 'Left flowers on a random car windshield',            timeMinutes: 5,   costDollars: 8 },
      { id: 'gg-020', title: 'Gave a larger tip than expected',                    timeMinutes: 1,   costDollars: 10 },
      { id: 'gg-021', title: 'Bought an umbrella for someone caught in rain',      timeMinutes: 5,   costDollars: 15 },
      { id: 'gg-022', title: 'Gave my last coin to someone at a meter',            timeMinutes: 1,   costDollars: 1 },
      { id: 'gg-023', title: 'Gave snacks to someone who looked hungry',           timeMinutes: 2,   costDollars: 5 },
      { id: 'gg-024', title: 'Gave a bus pass or token to a stranger',             timeMinutes: 2,   costDollars: 5 },
      { id: 'gg-025', title: 'Anonymously paid for a table\'s meal at a restaurant', timeMinutes: 5, costDollars: 60 },
      { id: 'gg-026', title: 'Surprised a friend with their favorite treat',       timeMinutes: 20,  costDollars: 8 },
      { id: 'gg-027', title: 'Sent flowers to a friend unexpectedly',              timeMinutes: 10,  costDollars: 30 },
      { id: 'gg-028', title: 'Gave a thoughtful gift for no occasion',             timeMinutes: 20,  costDollars: 20 },
      { id: 'gg-029', title: 'Brought cookies to a new neighbor',                  timeMinutes: 60,  costDollars: 8 },
      { id: 'gg-030', title: 'Left flowers on a neighbor\'s doorstep',             timeMinutes: 10,  costDollars: 10 },
      { id: 'gg-031', title: 'Shared produce from my garden',                      timeMinutes: 10,  costDollars: 0 },
      { id: 'gg-032', title: 'Brought coffee or treats for the team',              timeMinutes: 20,  costDollars: 25 },
    ],
  },
  {
    id: 'helping_hands',
    label: 'Helping Hands',
    emoji: require('../assets/categories/HelpingHands.png'),
    acts: [
      { id: 'hh-001', title: 'Helped someone carry heavy groceries',               timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-002', title: 'Carried bags for an elderly person',                 timeMinutes: 10,  costDollars: 0 },
      { id: 'hh-003', title: 'Helped a neighbor with yard work',                   timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-004', title: 'Shoveled snow for a neighbor',                       timeMinutes: 45,  costDollars: 0 },
      { id: 'hh-005', title: 'Mowed someone\'s lawn for free',                     timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-006', title: 'Helped someone move furniture',                      timeMinutes: 90,  costDollars: 0 },
      { id: 'hh-007', title: 'Fixed something broken for a friend',                timeMinutes: 45,  costDollars: 0 },
      { id: 'hh-008', title: 'Drove someone to an appointment',                    timeMinutes: 60,  costDollars: 5 },
      { id: 'hh-009', title: 'Babysat for a parent who needed a break',            timeMinutes: 120, costDollars: 0 },
      { id: 'hh-010', title: 'Helped a stranger change a flat tire',               timeMinutes: 30,  costDollars: 0 },
      { id: 'hh-011', title: 'Assisted someone with directions',                   timeMinutes: 2,   costDollars: 0 },
      { id: 'hh-012', title: 'Helped someone with their groceries at the store',   timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-013', title: 'Cooked a meal for a sick friend',                    timeMinutes: 60,  costDollars: 15 },
      { id: 'hh-014', title: 'Delivered food to someone in need',                  timeMinutes: 30,  costDollars: 15 },
      { id: 'hh-015', title: 'Helped someone with their technology',               timeMinutes: 30,  costDollars: 0 },
      { id: 'hh-016', title: 'Taught someone a new skill',                         timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-017', title: 'Offered my seat to someone on transit',              timeMinutes: 1,   costDollars: 0 },
      { id: 'hh-018', title: 'Held the door open for many people',                 timeMinutes: 1,   costDollars: 0 },
      { id: 'hh-019', title: 'Helped someone find what they were looking for',     timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-020', title: 'Assisted a coworker with a difficult task',          timeMinutes: 30,  costDollars: 0 },
      { id: 'hh-021', title: 'Helped a neighbor with their packages',              timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-022', title: 'Watched a neighbor\'s pet for free',                 timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-023', title: 'Lent tools to a neighbor who needed them',           timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-024', title: 'Watered a neighbor\'s plants while they were away',  timeMinutes: 15,  costDollars: 0 },
      { id: 'hh-025', title: 'Brought in a neighbor\'s trash cans',                timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-026', title: 'Helped a neighbor with their shopping',              timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-027', title: 'Helped a neighbor with their kids',                  timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-028', title: 'Plowed a neighbor\'s driveway',                      timeMinutes: 30,  costDollars: 0 },
      { id: 'hh-029', title: 'Helped a lost tourist find their way',               timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-030', title: 'Let someone go ahead of me in line',                 timeMinutes: 1,   costDollars: 0 },
      { id: 'hh-031', title: 'Volunteered at a food bank',                         timeMinutes: 120, costDollars: 0 },
      { id: 'hh-032', title: 'Helped at a community event',                        timeMinutes: 180, costDollars: 0 },
      { id: 'hh-033', title: 'Donated time at a local shelter',                    timeMinutes: 180, costDollars: 0 },
      { id: 'hh-034', title: 'Helped at a school fundraiser',                      timeMinutes: 120, costDollars: 0 },
      { id: 'hh-035', title: 'Volunteered to coach or mentor youth',               timeMinutes: 120, costDollars: 0 },
      { id: 'hh-036', title: 'Assisted at a community garden',                     timeMinutes: 120, costDollars: 0 },
      { id: 'hh-037', title: 'Helped set up or clean up a community event',        timeMinutes: 90,  costDollars: 0 },
      { id: 'hh-038', title: 'Volunteered at a hospital or nursing home',          timeMinutes: 120, costDollars: 0 },
      { id: 'hh-039', title: 'Tutored someone for free',                           timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-040', title: 'Mentored a young professional',                      timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-041', title: 'Donated skills to a nonprofit',                      timeMinutes: 120, costDollars: 0 },
      { id: 'hh-042', title: 'Helped a sibling with something difficult',          timeMinutes: 30,  costDollars: 0 },
      { id: 'hh-043', title: 'Mentored a junior teammate',                         timeMinutes: 60,  costDollars: 0 },
      { id: 'hh-044', title: 'Stayed late to help a coworker meet a deadline',     timeMinutes: 120, costDollars: 0 },
      { id: 'hh-045', title: 'Covered a coworker\'s shift so they could rest',     timeMinutes: 240, costDollars: 0 },
      { id: 'hh-046', title: 'Welcomed a new hire and showed them around',         timeMinutes: 30,  costDollars: 0 },
      { id: 'hh-047', title: 'Cleaned up a shared workspace without being asked',  timeMinutes: 15,  costDollars: 0 },
      { id: 'hh-048', title: 'Donated PTO or covered for a struggling teammate',   timeMinutes: 5,   costDollars: 0 },
      { id: 'hh-049', title: 'Cooked a special dinner for my family',              timeMinutes: 90,  costDollars: 25 },
      { id: 'hh-050', title: 'Planned a fun activity for a friend',                timeMinutes: 30,  costDollars: 15 },
    ],
  },
  {
    id: 'listening_presence',
    label: 'Listening & Presence',
    emoji: require('../assets/categories/Listening.png'),
    acts: [
      { id: 'lp-001', title: 'Listened without interrupting to a friend\'s problem', timeMinutes: 30, costDollars: 0 },
      { id: 'lp-002', title: 'Spent quality time with a family member',            timeMinutes: 60,  costDollars: 0 },
      { id: 'lp-003', title: 'Put my phone away and was fully present with family', timeMinutes: 60, costDollars: 0 },
      { id: 'lp-004', title: 'Called someone I hadn\'t talked to in months',       timeMinutes: 20,  costDollars: 0 },
      { id: 'lp-005', title: 'Checked in on an elderly neighbor',                  timeMinutes: 15,  costDollars: 0 },
      { id: 'lp-006', title: 'Reconnected with an old friend',                     timeMinutes: 30,  costDollars: 0 },
      { id: 'lp-007', title: 'Introduced myself to a new neighbor',                timeMinutes: 10,  costDollars: 0 },
      { id: 'lp-008', title: 'Threw a small celebration for a friend\'s win',      timeMinutes: 60,  costDollars: 25 },
      { id: 'lp-009', title: 'Sat with someone who was grieving',                  timeMinutes: 60,  costDollars: 0 },
      { id: 'lp-010', title: 'Asked a friend "how are you really?" and waited',    timeMinutes: 20,  costDollars: 0 },
      { id: 'lp-011', title: 'Took a walk with someone instead of texting',        timeMinutes: 45,  costDollars: 0 },
      { id: 'lp-012', title: 'Visited a friend in the hospital',                   timeMinutes: 60,  costDollars: 0 },
      { id: 'lp-013', title: 'Sent a "thinking of you" message to someone alone',  timeMinutes: 2,   costDollars: 0 },
      { id: 'lp-014', title: 'Gave a tough customer extra patience and kindness',  timeMinutes: 10,  costDollars: 0 },
      { id: 'lp-015', title: 'Smiled at every stranger I passed today',            timeMinutes: 1,   costDollars: 0 },
    ],
  },
  {
    id: 'mending_bridges',
    label: 'Mending Bridges',
    emoji: require('../assets/categories/MendingBridges.png'),
    acts: [
      { id: 'mb-001', title: 'Forgave someone who wronged me',                     timeMinutes: 15,  costDollars: 0 },
      { id: 'mb-002', title: 'Apologized sincerely to a friend',                   timeMinutes: 10,  costDollars: 0 },
      { id: 'mb-003', title: 'Reached out to someone I had a falling-out with',    timeMinutes: 20,  costDollars: 0 },
      { id: 'mb-004', title: 'Wrote a letter to ask forgiveness',                  timeMinutes: 30,  costDollars: 1 },
      { id: 'mb-005', title: 'Made the first move to repair a strained friendship', timeMinutes: 30, costDollars: 0 },
      { id: 'mb-006', title: 'Owned a mistake at work and made it right',          timeMinutes: 20,  costDollars: 0 },
      { id: 'mb-007', title: 'Let go of a grudge I\'d been carrying',              timeMinutes: 15,  costDollars: 0 },
      { id: 'mb-008', title: 'Apologized to a family member for an old hurt',      timeMinutes: 20,  costDollars: 0 },
      { id: 'mb-009', title: 'Took responsibility instead of making an excuse',    timeMinutes: 5,   costDollars: 0 },
      { id: 'mb-010', title: 'Mediated a disagreement between two friends',        timeMinutes: 45,  costDollars: 0 },
      { id: 'mb-011', title: 'Forgave myself for a past mistake',                  timeMinutes: 20,  costDollars: 0 },
      { id: 'mb-012', title: 'Reached out to a relative I\'ve drifted from',       timeMinutes: 30,  costDollars: 0 },
    ],
  },
  {
    id: 'self_kindness',
    label: 'Self-Kindness',
    emoji: require('../assets/categories/SelfKindness.png'),
    acts: [
      { id: 'sk-001', title: 'Took a full hour to rest without guilt',             timeMinutes: 60,  costDollars: 0 },
      { id: 'sk-002', title: 'Said no to something that drained me',               timeMinutes: 5,   costDollars: 0 },
      { id: 'sk-003', title: 'Wrote down three things I did well today',           timeMinutes: 10,  costDollars: 0 },
      { id: 'sk-004', title: 'Took a walk outside to clear my head',               timeMinutes: 30,  costDollars: 0 },
      { id: 'sk-005', title: 'Drank water and ate a real meal',                    timeMinutes: 20,  costDollars: 10 },
      { id: 'sk-006', title: 'Got 8 hours of sleep on purpose',                    timeMinutes: 1,   costDollars: 0 },
      { id: 'sk-007', title: 'Took a screen-free hour before bed',                 timeMinutes: 60,  costDollars: 0 },
      { id: 'sk-008', title: 'Booked a doctor\'s or dentist\'s appointment I\'d been putting off', timeMinutes: 10, costDollars: 0 },
      { id: 'sk-009', title: 'Spent time on a hobby just for me',                  timeMinutes: 60,  costDollars: 0 },
      { id: 'sk-010', title: 'Let myself cry instead of bottling it up',           timeMinutes: 15,  costDollars: 0 },
      { id: 'sk-011', title: 'Talked to myself the way I\'d talk to a friend',     timeMinutes: 5,   costDollars: 0 },
      { id: 'sk-012', title: 'Wrote in a journal for 10 minutes',                  timeMinutes: 10,  costDollars: 0 },
      { id: 'sk-013', title: 'Meditated or sat quietly',                           timeMinutes: 15,  costDollars: 0 },
      { id: 'sk-014', title: 'Stretched or moved my body gently',                  timeMinutes: 20,  costDollars: 0 },
      { id: 'sk-015', title: 'Forgave myself for something small',                 timeMinutes: 10,  costDollars: 0 },
      { id: 'sk-016', title: 'Asked for help instead of pushing through alone',    timeMinutes: 10,  costDollars: 0 },
      { id: 'sk-017', title: 'Bought myself something small that made me happy',   timeMinutes: 15,  costDollars: 15 },
    ],
  },
  {
    id: 'world_kindness',
    label: 'World Kindness',
    emoji: require('../assets/categories/WorldKindness.png'),
    acts: [
      { id: 'wk-001', title: 'Picked up litter in my neighborhood',                timeMinutes: 30,  costDollars: 0 },
      { id: 'wk-002', title: 'Organized a neighborhood cleanup',                   timeMinutes: 180, costDollars: 0 },
      { id: 'wk-003', title: 'Participated in a neighborhood cleanup',             timeMinutes: 120, costDollars: 0 },
      { id: 'wk-004', title: 'Planted a tree or flowers in a public space',        timeMinutes: 60,  costDollars: 25 },
      { id: 'wk-005', title: 'Cleaned up a park or beach',                         timeMinutes: 90,  costDollars: 0 },
      { id: 'wk-006', title: 'Set up a bird feeder or bath',                       timeMinutes: 30,  costDollars: 25 },
      { id: 'wk-007', title: 'Started a community compost bin',                    timeMinutes: 120, costDollars: 30 },
      { id: 'wk-008', title: 'Picked up trash on my daily walk',                   timeMinutes: 30,  costDollars: 0 },
      { id: 'wk-009', title: 'Donated to an environmental organization',           timeMinutes: 5,   costDollars: 25 },
      { id: 'wk-010', title: 'Built a little free library in my neighborhood',     timeMinutes: 240, costDollars: 75 },
      { id: 'wk-011', title: 'Set up a neighborhood seed exchange',                timeMinutes: 60,  costDollars: 10 },
      { id: 'wk-012', title: 'Cleaned up a local waterway',                        timeMinutes: 180, costDollars: 0 },
      { id: 'wk-013', title: 'Created a pollinator garden',                        timeMinutes: 240, costDollars: 50 },
      { id: 'wk-014', title: 'Organized a recycling awareness effort',             timeMinutes: 240, costDollars: 0 },
      { id: 'wk-015', title: 'Adopted a section of road or trail to keep clean',   timeMinutes: 120, costDollars: 0 },
      { id: 'wk-016', title: 'Rescued an injured animal',                          timeMinutes: 60,  costDollars: 20 },
      { id: 'wk-017', title: 'Donated to an animal rescue organization',           timeMinutes: 5,   costDollars: 25 },
      { id: 'wk-018', title: 'Released butterflies or planted milkweed for monarchs', timeMinutes: 30, costDollars: 15 },
      { id: 'wk-019', title: 'Joined a local clean water or park initiative',      timeMinutes: 180, costDollars: 0 },
      { id: 'wk-020', title: 'Helped register voters in my community',             timeMinutes: 120, costDollars: 0 },
      { id: 'wk-021', title: 'Organized a donation drive',                         timeMinutes: 240, costDollars: 0 },
      { id: 'wk-022', title: 'Left a kind sticky note in a public place',          timeMinutes: 3,   costDollars: 0 },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    emoji: require('../assets/categories/Company.png'),
    acts: [
      { id: 'co-001', title: 'Brought coffee or snack for a coworker',             timeMinutes: 5,   costDollars: 10 },
      { id: 'co-002', title: 'Complimented a coworker',                            timeMinutes: 1,   costDollars: 0 },
      { id: 'co-003', title: 'Covered a coworker\'s shift',                        timeMinutes: 240, costDollars: 0 },
      { id: 'co-004', title: 'Gave a customer a compliment',                       timeMinutes: 1,   costDollars: 0 },
      { id: 'co-005', title: 'Gave a customer a free menu item',                   timeMinutes: 5,   costDollars: 5 },
      { id: 'co-006', title: 'Paid for customer\'s meal that forgot their wallet', timeMinutes: 5,   costDollars: 15 },
      { id: 'co-007', title: 'Ran after customer that left something behind',      timeMinutes: 3,   costDollars: 0 },
      { id: 'co-008', title: 'Mentored a junior team member',                      timeMinutes: 5,   costDollars: 0 },
      { id: 'co-009', title: 'Remembered a regular customer by name',              timeMinutes: 1,   costDollars: 0 },
      { id: 'co-010', title: 'Welcomed a new colleague and made them feel welcomed', timeMinutes: 5, costDollars: 0 },
      { id: 'co-011', title: 'Took on a task to help a coworker',                  timeMinutes: 10,  costDollars: 0 },
    ],
  },
];

// ── Flat list for backward compatibility ──────────────────────────────────────
export const ACT_TITLES = ACT_CATEGORIES.flatMap(c => c.acts.map(a => a.title));

export const ALL_ACTS = ACT_CATEGORIES.flatMap(cat =>
  cat.acts.map(a => ({
    ...a,
    categoryId:    cat.id,
    categoryLabel: cat.label,
    categoryEmoji: cat.emoji,   // image module ID, not a string
  }))
);

const _actById = (() => {
  const map = {};
  for (const a of ALL_ACTS) map[a.id] = a;
  return map;
})();

export function getActById(id) {
  return _actById[id] || null;
}

const _normalizeTitle = (t) =>
  (t || '').toLowerCase().replace(/\s+/g, ' ').trim();

const _actTitleToIcon = (() => {
  const map = {};
  for (const cat of ACT_CATEGORIES) {
    for (const act of cat.acts) {
      map[_normalizeTitle(act.title)] = cat.emoji;  // image module ID
    }
  }
  return map;
})();

const _actByTitle = (() => {
  const map = {};
  for (const a of ALL_ACTS) {
    map[_normalizeTitle(a.title)] = a;
  }
  return map;
})();

export function getActByTitle(title) {
  if (!title) return null;
  return _actByTitle[_normalizeTitle(title)] || null;
}

// Returns the image module ID for a given act title, or DEFAULT_ACT_ICON
// when the title doesn't match any known act. Use with <Image source={...} />.
export function getActIcon(title) {
  if (!title) return DEFAULT_ACT_ICON;
  return _actTitleToIcon[_normalizeTitle(title)] || DEFAULT_ACT_ICON;
}
export const RECIPIENTS = [
  'Myself', 'Family', 'Friend', 'Partner (bf/gf/spouse)',
  'Coworker', 'Neighbor', 'Stranger', 'Charity or Group',
];
// ── Act Prompts ──────────────────────────────────────────────────────────────
export const ACT_PROMPTS = [
  'Buy a coffee for the person behind you','Write a kind note to a neighbor','Help someone carry their groceries',
  'Donate to a local food bank','Call someone you haven\'t spoken to in a while','Leave a generous tip',
  'Compliment a stranger sincerely','Volunteer for an hour','Pick up litter in your neighborhood',
  'Send flowers to someone unexpectedly','Share a skill or knowledge with someone','Donate blood',
  'Leave a positive review for a small business','Cook a meal for someone in need','Let someone merge in traffic',
  'Give a book to someone','Check on an elderly neighbor','Plant something in a community garden',
  'Donate clothes you no longer need','Write a thank-you to a teacher or mentor','Pay for someone\'s parking',
  'Share an inspiring story','Organize a neighborhood cleanup','Give someone a genuine compliment',
  'Donate toys to children in need','Help a stranger with directions','Send an encouraging text',
  'Adopt or foster an animal','Buy supplies for a local shelter','Perform one anonymous act today',
];

// ── Donation info ─────────────────────────────────────────────────────────────
export const DONATIONS = [
  {
    id: 'paypal',
    label: 'PayPal',
    icon: '💙',
    color: '#0070BA',
    value: '30 Acts of Kindness, NFP',
    cta: 'Donate with PayPal',
    action: 'open',
    url: 'https://www.paypal.com/qrcodes/managed/ea84696b-5280-41cd-b68c-f94d11ce4b92?utm_source=payandgetpaid',
    hint: 'Opens PayPal. Enter your amount there. Pay by card or bank.',
  },
  {
    id: 'venmo',
    label: 'Venmo',
    icon: '💚',
    color: '#3D95CE',
    value: '@Actsofkindness30',
    cta: 'Donate with Venmo',
    action: 'open',
    url: 'https://venmo.com/u/Actsofkindness30',
    hint: 'Opens Venmo. Enter your amount in the app.',
  },
  {
    id: 'zelle',
    label: 'Zelle',
    icon: '💜',
    color: '#6D1ED4',
    value: 'donate@30ActsofKindness.org',
    cta: 'Copy Zelle address',
    action: 'copy',
    hint: 'Tap to copy, then send to this email via Zelle in your bank app.',
  },
];

// ── Local-date helper ────────────────────────────────────────────────────────
function _localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildFreshDays(startDayNumber = 1) {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      dayNumber: startDayNumber + i,
      scheduledDate: _localDateStr(d),
      status: 'NOT_SET',
      title: '',
      proofType: null,
    };
  });
}
export function todayStr() {
  return _localDateStr(new Date());
}

// Compute "YYYY-MM-DD" in the given IANA timezone for the current moment
// (or a passed-in Date). Used so completions can lock in the user's local
// calendar date at write time regardless of where their phone is physically.
// Falls back to device local time if tz is null/invalid.
export function localDateInTZ(tz, date = new Date()) {
  if (!tz) return _localDateStr(date);
  try {
    return date.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return _localDateStr(date);
  }
}