// Backlog item 41, fixed 23 Sep 2026.
//
// On 23 Sep item 55 locked delete_user, send_sms_notification, and the admins
// and reviewers tables to signed-in admins (and reviewers, for texts). Calls
// made with the public anon key (REST_HEADERS / raw fetch to /rest/v1/) are now
// refused, so the Admin and Review screens must use the supabase client, which
// sends the signed-in session. These screens import native modules, so this
// asserts against the source, like the other screen tests in this folder.

const fs   = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', f), 'utf8');
const admin    = read('AdminScreen.js');
const reviewer = read('ReviewerScreen.js');

// Code only: drop // comments so the explanatory notes do not count.
const code = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe.each([['AdminScreen', admin], ['ReviewerScreen', reviewer]])('%s uses the signed-in session', (name, src) => {
  test('no raw REST calls with the public key', () => {
    expect(code(src)).not.toMatch(/REST_HEADERS/);
    expect(code(src)).not.toMatch(/\/rest\/v1\//);
    expect(code(src)).not.toMatch(/SUPABASE_ANON_KEY/);
  });

  test('imports the supabase client', () => {
    expect(src).toMatch(/import \{ supabase \} from '\.\.\/lib\/supabase';/);
  });
});

describe('AdminScreen calls go through the client', () => {
  test.each([
    ["admins read",      /supabase\.from\('admins'\)\.select\(/],
    ["reviewers read",   /supabase\.from\('reviewers'\)\.select\(/],
    ["admin add",        /supabase\.from\('admins'\)\.insert\(/],
    ["admin remove",     /supabase\.from\('admins'\)\.delete\(\)/],
    ["reviewer add",     /supabase\.from\('reviewers'\)\.insert\(/],
    ["reviewer remove",  /supabase\.from\('reviewers'\)\.delete\(\)/],
    ["delete user",      /supabase\.rpc\('delete_user'/],
    ["terms text",       /supabase\.rpc\('send_sms_notification'/],
  ])('%s', (_, re) => {
    expect(admin).toMatch(re);
  });
});

describe('ReviewerScreen calls go through the client', () => {
  test('reads completions with the session', () => {
    expect(reviewer).toMatch(/supabase\.from\('completions'\)\.select\(/);
  });
  test('updates review status with the session', () => {
    expect(reviewer).toMatch(/supabase\.from\('completions'\)\.update\(/);
  });
  test('adds to the catalogue with the session', () => {
    expect(reviewer).toMatch(/supabase\.from\('custom_acts'\)\.insert\(/);
  });
  test('texts via rpc, never the disabled email function', () => {
    expect(reviewer).toMatch(/supabase\.rpc\('send_sms_notification'/);
    expect(code(reviewer)).not.toMatch(/send_email_notification/);
  });
});
