// Items 27 and 28 — one reminder a day, and stop reminding people who have
// drifted away.
//
// ITEM 28: two texts a day was the single largest running cost in the project,
// about 80 cents per participant over a 30-day run. One a day halves it and
// reads as less naggy.
//
// ITEM 27: someone who signs up, logs a few acts and stops used to keep getting
// a text every day for the rest of their run. Nobody benefits, it costs money,
// and it is the pattern that produces STOP replies and spam complaints — which
// is what carrier reputation is judged on.
//
// The Edge Function is Deno and reads Deno.env at module load, so jest cannot
// import it. These are source assertions, the same approach certificateShare
// takes for handlers that are all I/O — EXCEPT the SMS copy checks below, which
// extract the real string literals and test them for real. That is deliberate:
// the encoding trap is the one that has actually cost money.
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FN       = fs.readFileSync(path.join(root, 'supabase', 'functions', 'send-reminders', 'index.ts'), 'utf8');
const SETTINGS = fs.readFileSync(path.join(root, 'src', 'screens', 'SettingsScreen.js'), 'utf8');

// Pull a top-level `const NAME = "..."` or "..." + "..." string out of the source.
function literal(src, name) {
  const m = src.match(new RegExp(`const ${name} =\\s*([\\s\\S]*?);`));
  if (!m) return null;
  const parts = m[1].match(/(["'])(?:\\.|(?!\1)[^\\])*\1/g) || [];
  return parts.map(p => p.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"')).join('');
}

describe('item 28 — one reminder a day', () => {
  test('the sender no longer builds a second slot', () => {
    // The exact line that used to schedule slot 2.
    expect(FN).not.toMatch(/slots\.push\(\{\s*idx:\s*2/);
    expect(FN).not.toMatch(/typeof meta\.reminder2_hour === 'number'/);
  });

  test('the sender still builds the first slot', () => {
    // Guards the assertion above from passing because reminders were deleted.
    expect(FN).toMatch(/slots\.push\(\{\s*idx:\s*1/);
    expect(FN).toContain("typeof meta.reminder_hour === 'number'");
  });

  test('Settings no longer renders a second reminder control', () => {
    expect(SETTINGS).not.toContain('SECOND REMINDER<');
    expect(SETTINGS).not.toMatch(/toggleReminder\('second'/);
    expect(SETTINGS).not.toMatch(/setReminder2(Hour|Minute|Period|Enabled)\(/);
  });

  test('Settings still renders the one reminder', () => {
    expect(SETTINGS).toMatch(/toggleReminder\('first'/);
    expect(SETTINGS).toContain('REMINDER TIME');
  });

  test('stale reminder2_* metadata is actively cleared, not just ignored', () => {
    // There is no UI left to clear these, so an account that had a second
    // reminder scheduled would otherwise keep it in metadata forever. The
    // sender no longer reads them, but leaving live-looking values behind is
    // how a future change quietly resurrects them.
    for (const field of ['reminder2_enabled', 'reminder2_hour', 'reminder2_minute', 'reminder2_period']) {
      expect(SETTINGS).toMatch(new RegExp(`${field}:\\s*(null|false)`));
    }
  });

  test('the card no longer advertises two a day', () => {
    // The card shows one time now, so "up to 2 per day" reads as simply wrong.
    // NOTE the legal and consent copy deliberately still says "up to two per
    // day" — that is a ceiling, it stays true, and changing it would force an
    // SMS_CONSENT_VERSION bump for no compliance gain.
    const card = SETTINGS.match(/Text me a daily reminder[\s\S]{0,400}/);
    expect(card).not.toBeNull();
    expect(card[0]).not.toMatch(/up to 2|2 per day/);
  });
});

describe('item 27 — the inactivity cutoff', () => {
  test('activity is loaded once per run, not once per user', () => {
    // This function already walks every user on every five-minute tick. A
    // per-user activity query would multiply that by the whole user base.
    expect(FN).toContain('async function loadActivePhones');
    expect(FN).toMatch(/const activePhones\s*=\s*await loadActivePhones\(/);
    // One call site, outside the user loop.
    expect((FN.match(/await loadActivePhones\(/g) || []).length).toBe(1);
  });

  test('a failed activity query disables the check rather than guessing', () => {
    // THE DANGEROUS FAILURE. An empty Set would make every user look inactive,
    // so one transient query error would text the entire user base a shutoff
    // notice and switch everyone's reminders off — and afterwards there is no
    // way to tell who had chosen what. Null means "unknown", and the caller
    // skips the check.
    const fn = FN.match(/async function loadActivePhones[\s\S]*?\n\}/);
    expect(fn).not.toBeNull();
    // Scope this to the error branch itself. Matching loosely from `if (error)`
    // runs on to the function's own successful `return set` and passes either
    // way, which is how a test like this quietly stops testing anything.
    const errBranch = fn[0].match(/if \(error\) \{[\s\S]*?\n  \}/);
    expect(errBranch).not.toBeNull();
    expect(errBranch[0]).toContain('return null;');
    expect(errBranch[0]).not.toContain('return set;');
    // And the guard is actually read before the branch runs.
    expect(FN).toMatch(/if \(activePhones && !activePhones\.has\(phone\)\)/);
  });

  test('someone who has never completed an act is measured from signup', () => {
    // Otherwise a brand-new user who turns reminders on and does not log an act
    // that first day has no completion to measure from, looks inactive
    // immediately, and is shut off before they have begun.
    expect(FN).toContain('u.created_at');
    expect(FN).toMatch(/Number\.isFinite\(createdMs\)/);
  });

  test('the shutoff slot is one the table will actually accept', () => {
    // reminder_sends carries CHECK (slot = ANY (ARRAY[1, 2])). Slot 0 was
    // rejected outright, and because recordSend discarded its insert result the
    // row vanished silently and the idempotency guard stopped working. It cost
    // half an hour of testing against staging on 2026-09-22 before anyone read
    // the constraint.
    //
    // This assertion cannot see the constraint — nothing at source level can —
    // so it pins the accepted values here instead. If the constraint is ever
    // widened, this changes deliberately rather than by accident.
    const m = FN.match(/const SHUTOFF_SLOT = (\d+);/);
    expect(m).not.toBeNull();
    expect([1, 2]).toContain(Number(m[1]));
    expect(FN).toMatch(/alreadySent\(u\.id, dateStr, SHUTOFF_SLOT\)/);
  });

  test('a failed reminder_sends insert is logged, not swallowed', () => {
    // recordSend was fire-and-forget, and supabase-js returns errors rather
    // than throwing — which is exactly why the rejected row above was
    // invisible. This table IS the idempotency guard, so a silent write
    // failure means someone can be texted again tomorrow with no record of it.
    const fn = FN.match(/async function recordSend\([\s\S]*?\n\}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/const \{ error: insertError \}/);
    expect(fn[0]).toMatch(/if \(insertError\)/);
    expect(fn[0]).toContain('console.error');
  });

  test('sending the notice and switching reminders off happen together', () => {
    // Sending without disabling texts them again tomorrow; disabling without
    // sending is the silent stop the item exists to avoid.
    const branch = FN.match(/if \(activePhones && !activePhones\.has\(phone\)\)[\s\S]*?\n        \}/);
    expect(branch).not.toBeNull();
    expect(branch[0]).toContain('SHUTOFF_TEXT');
    expect(branch[0]).toContain('disableReminders(u.id, meta)');
  });

  test('switching off clears the schedule, not just the master flag', () => {
    const fn = FN.match(/async function disableReminders[\s\S]*?\n\}/);
    expect(fn[0]).toMatch(/reminder_enabled:\s*false/);
    expect(fn[0]).toMatch(/reminder_hour:\s*null/);
  });

  test('the window errs wide, never short', () => {
    // completions.local_date is a local calendar date and can sit either side
    // of the UTC date. Worst case must be one extra reminder, not cutting
    // someone off a day early.
    const fn = FN.match(/function activeSinceDate[\s\S]*?\n\}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/days \+ 1/);
  });
});

describe('SMS copy stays on one GSM-7 segment', () => {
  // A single non-GSM character — a curly quote, an em dash — flips the whole
  // message to Unicode and cuts the segment from 160 characters to 70, which
  // silently doubles the per-message cost.
  const texts = {
    REMINDER_TEXT: literal(FN, 'REMINDER_TEXT'),
    SHUTOFF_TEXT:  literal(FN, 'SHUTOFF_TEXT'),
  };

  for (const [name, body] of Object.entries(texts)) {
    describe(name, () => {
      test('was found in the source', () => {
        expect(typeof body).toBe('string');
        expect(body.length).toBeGreaterThan(20);
      });

      test('is plain ASCII', () => {
        const offenders = [...body].filter(c => c.charCodeAt(0) > 127);
        expect(offenders).toEqual([]);
      });

      test('fits one segment', () => {
        expect(body.length).toBeLessThanOrEqual(160);
      });

      test('names the program and carries STOP and HELP', () => {
        expect(body).toContain('30 Acts of Kindness');
        expect(body).toContain('STOP');
        expect(body).toContain('HELP');
      });
    });
  }

  test('the two messages are different', () => {
    expect(texts.SHUTOFF_TEXT).not.toBe(texts.REMINDER_TEXT);
  });
});
