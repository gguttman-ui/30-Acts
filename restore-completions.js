#!/usr/bin/env node
/**
 * restore-completions.js
 *
 * Turns a JSON export of the `completions` table into SQL you can paste into
 * the Supabase SQL Editor.
 *
 * Usage:
 *   node restore-completions.js completions-backup.json
 *   node restore-completions.js completions-backup.json --overwrite
 *
 * Flags:
 *   --overwrite   Existing rows with the same id are UPDATED to match the
 *                 backup. Without this flag, existing rows are left alone
 *                 (safe default: only missing rows are inserted).
 *
 * Output:
 *   restore-completions.sql  — open it, read it, then paste into the
 *                              Supabase SQL Editor and run it.
 *
 * The script never touches the database itself. It only writes a .sql file,
 * so you get to look at exactly what will run before anything happens.
 */

const fs = require('fs');
const path = require('path');

// Columns on the completions table, in insert order.
// user_email is deliberately excluded — it is null in exports and is not a
// column the app ever writes.
const COLUMNS = [
  'id',
  'day_number',
  'act_title',
  'completed_at',
  'proof_type',
  'notes',
  'review_status',
  'reviewed_by',
  'reviewed_at',
  'from_list',
  'has_media',
  'user_phone',
  'fulfillment_choice',
  'is_sponsor_act',
  'recipient',
  'time_minutes',
  'cost_cents',
  'local_date',
];

const args = process.argv.slice(2);
const overwrite = args.includes('--overwrite');
const inputArg = args.find((a) => !a.startsWith('--'));

if (!inputArg) {
  console.error('Usage: node restore-completions.js <backup.json> [--overwrite]');
  process.exit(1);
}

const INPUT = path.resolve(inputArg);
if (!fs.existsSync(INPUT)) {
  console.error(`File not found: ${INPUT}`);
  process.exit(1);
}

// ── Read and parse ───────────────────────────────────────────────────────────
let rows;
try {
  const raw = fs.readFileSync(INPUT, 'utf8').trim();
  rows = JSON.parse(raw);
} catch (e) {
  console.error('Could not parse that file as JSON.');
  console.error('If you pasted it out of an email, make sure the file starts');
  console.error('with [ and ends with ] and has no extra text around it.');
  console.error('\nParser said: ' + e.message);
  process.exit(1);
}

if (!Array.isArray(rows)) {
  console.error('Expected a JSON array of rows (starting with [ ).');
  process.exit(1);
}
if (rows.length === 0) {
  console.error('That file has no rows in it.');
  process.exit(1);
}

// ── SQL literal formatting ───────────────────────────────────────────────────
const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  // Everything else is text: single-quote it, doubling any internal quotes.
  return "'" + String(v).replace(/'/g, "''") + "'";
};

// ── Sanity checks before writing anything ────────────────────────────────────
const phones = new Set();
let missingId = 0;
const unknownColumns = new Set();

for (const r of rows) {
  if (!r || typeof r !== 'object') {
    console.error('Found an entry that is not a row object. Aborting.');
    process.exit(1);
  }
  if (!r.id) missingId++;
  if (r.user_phone) phones.add(r.user_phone);
  for (const k of Object.keys(r)) {
    if (!COLUMNS.includes(k) && k !== 'user_email') unknownColumns.add(k);
  }
}

if (missingId) {
  console.error(`${missingId} row(s) have no id. Aborting — ids are needed to`);
  console.error('avoid creating duplicates on a re-run.');
  process.exit(1);
}

if (unknownColumns.size) {
  console.warn('Note: these fields are in the backup but are not columns this');
  console.warn('script writes, so they will be skipped:');
  console.warn('  ' + [...unknownColumns].join(', '));
  console.warn('');
}

// ── Build the SQL ────────────────────────────────────────────────────────────
const out = [];
out.push('-- Restore of the completions table');
out.push(`-- Source: ${path.basename(INPUT)}`);
out.push(`-- Generated: ${new Date().toISOString()}`);
out.push(`-- Rows: ${rows.length}`);
out.push(`-- Phone number(s): ${[...phones].join(', ') || '(none)'}`);
out.push(`-- Mode: ${overwrite ? 'OVERWRITE existing rows' : 'insert missing rows only'}`);
out.push('--');
out.push('-- Read this before running it. It is wrapped in a transaction, so if');
out.push('-- any statement fails, nothing is changed.');
out.push('');
out.push('BEGIN;');
out.push('');
out.push('INSERT INTO public.completions (');
out.push('  ' + COLUMNS.join(', '));
out.push(') VALUES');

const values = rows.map((r) => '  (' + COLUMNS.map((c) => lit(r[c])).join(', ') + ')');
out.push(values.join(',\n'));

if (overwrite) {
  const sets = COLUMNS.filter((c) => c !== 'id').map((c) => `  ${c} = EXCLUDED.${c}`);
  out.push('ON CONFLICT (id) DO UPDATE SET');
  out.push(sets.join(',\n') + ';');
} else {
  out.push('ON CONFLICT DO NOTHING;');
}

out.push('');
out.push('-- Check the result before committing:');
out.push(`SELECT count(*) AS rows_now FROM public.completions`);
out.push(`WHERE user_phone IN (${[...phones].map(lit).join(', ') || 'NULL'});`);
out.push('');
out.push('COMMIT;');
out.push('');

const OUTPUT = path.join(process.cwd(), 'restore-completions.sql');
fs.writeFileSync(OUTPUT, out.join('\n'), 'utf8');

console.log(`Read  ${rows.length} rows from ${path.basename(INPUT)}`);
console.log(`Phone ${[...phones].join(', ')}`);
console.log(`Wrote ${OUTPUT}`);
console.log('');
console.log('Next: open that .sql file, read it, then paste it into the');
console.log('Supabase SQL Editor and run it.');
if (!overwrite) {
  console.log('');
  console.log('Rows that already exist will be left untouched. Re-run with');
  console.log('--overwrite if you want the backup to win instead.');
}
