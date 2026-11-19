// actIdeas.js - David's UX fix 3 (18 Nov 2026): "Today's idea" on Home.
//
// Every act in the list is written in the past tense ("Bought a coffee for a
// stranger") because it is what you DID. The Today card suggests one to DO, so
// each act gets a present-tense version ("Buy a coffee for a stranger"). The
// rules below do the conversion; IDEA_OVERRIDES covers the few that read
// badly. Each person gets one idea a day, the same all day.

import { ALL_ACTS } from '../constants';

const VERBS = {
  Acknowledged: 'Acknowledge', Adopted: 'Adopt', Apologized: 'Apologize', Asked: 'Ask',
  Assisted: 'Assist', Babysat: 'Babysit', Booked: 'Book', Bought: 'Buy', Brought: 'Bring',
  Built: 'Build', Called: 'Call', Carried: 'Carry', Checked: 'Check', Cleaned: 'Clean',
  Complimented: 'Compliment', Contributed: 'Contribute', Cooked: 'Cook', Covered: 'Cover',
  Created: 'Create', Delivered: 'Deliver', Donated: 'Donate', Drank: 'Drink', Drove: 'Drive',
  Fixed: 'Fix', Forgave: 'Forgive', Gave: 'Give', Got: 'Get', Held: 'Hold', Helped: 'Help',
  Introduced: 'Introduce', Joined: 'Join', Left: 'Leave', Lent: 'Lend', Let: 'Let',
  Listened: 'Listen', Made: 'Make', Meditated: 'Meditate', Mediated: 'Mediate',
  Mentored: 'Mentor', Mowed: 'Mow', Offered: 'Offer', Organized: 'Organize', Owned: 'Own',
  Paid: 'Pay', Participated: 'Participate', Picked: 'Pick', Planned: 'Plan', Planted: 'Plant',
  Plowed: 'Plow', Praised: 'Praise', Put: 'Put', Reached: 'Reach', Recognized: 'Recognize',
  Reconnected: 'Reconnect', Released: 'Release', Remembered: 'Remember', Rescued: 'Rescue',
  Ran: 'Run', Said: 'Say', Sat: 'Sit', Sent: 'Send', Set: 'Set', Shared: 'Share',
  Shoveled: 'Shovel', Smiled: 'Smile', Spent: 'Spend', Started: 'Start', Stayed: 'Stay',
  Stretched: 'Stretch', Supported: 'Support', Surprised: 'Surprise', Talked: 'Talk',
  Taught: 'Teach', Threw: 'Throw', Told: 'Tell', Took: 'Take', Tutored: 'Tutor',
  Visited: 'Visit', Volunteered: 'Volunteer', Watched: 'Watch', Watered: 'Water',
  Welcomed: 'Welcome', Wrote: 'Write',
  // second verbs after "and" / "or"
  ate: 'eat', made: 'make', planted: 'plant', waited: 'wait', showed: 'show',
  moved: 'move', covered: 'cover', sat: 'sit',
};

const PRONOUNS = [
  [/\bmyself\b/g, 'yourself'], [/\bmy\b/g, 'your'], [/\bme\b/g, 'you'],
  [/\bI've\b/g, "you've"], [/\bI'd\b/g, "you'd"], [/\bI\b/g, 'you'],
];

export const IDEA_OVERRIDES = {
  'lp-003': 'Put your phone away and be fully present with family',
  'lp-004': "Call someone you haven't talked to in months",
  'lp-015': 'Smile at every stranger you pass today',
  'mb-007': "Let go of a grudge you've been carrying",
  'sk-008': "Book a doctor's or dentist's appointment you've been putting off",
  'sk-017': 'Buy yourself something small that makes you happy',
  'hh-018': 'Hold the door open for people',
  'gg-023': 'Give snacks to someone who looks hungry',
  'gg-025': "Anonymously pay for a table's meal at a restaurant",
  'hh-009': 'Babysit for a parent who needs a break',
  'hh-019': 'Help someone find what they are looking for',
  'hh-023': 'Lend tools to a neighbor who needs them',
  'hh-024': "Water a neighbor's plants while they are away",
  'hh-045': "Cover a coworker's shift so they can rest",
  'lp-009': 'Sit with someone who is grieving',
  'sk-002': 'Say no to something that drains you',
};

export function ideaText(act) {
  if (!act) return '';
  if (IDEA_OVERRIDES[act.id]) return IDEA_OVERRIDES[act.id];
  const words = String(act.title || '').split(' ');
  if (VERBS[words[0]]) words[0] = VERBS[words[0]];
  for (let i = 1; i < words.length; i++) {
    if ((words[i - 1] === 'and' || words[i - 1] === 'or') && VERBS[words[i]]
        && words[i][0] === words[i][0].toLowerCase()) {
      words[i] = VERBS[words[i]];
    }
  }
  let t = words.join(' ');
  for (const [re, to] of PRONOUNS) t = t.replace(re, to);
  return t;
}

/** The acts the Today card picks from: the same list as "Browse acts". */
export const IDEA_ACTS = ALL_ACTS.filter(
  (a) => a.categoryId !== 'sponsor' && a.categoryLabel !== 'Company'
);

// Small stable hash, so a person + date always gives the same number.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Today's idea for this person: the same all day. `skip` counts taps on
 * "Show me another idea" (each tap moves to a different act).
 */
export function dailyIdea(who, dateStr, skip = 0, acts = IDEA_ACTS) {
  if (!acts.length) return null;
  const start = hash(`${who || ''}|${dateStr || ''}`) % acts.length;
  // Step by a number that shares no factor with the list size, so taps walk
  // through different acts instead of bouncing between two.
  let step = 37;
  while (gcd(step, acts.length) !== 1) step++;
  return acts[(start + skip * step) % acts.length];
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
