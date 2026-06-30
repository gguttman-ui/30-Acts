#!/usr/bin/env node
/**
 * import-acts.js
 *
 * Reads acts_of_kindness.csv (the file you exported earlier) and rewrites
 * the ACT_CATEGORIES array in src/constants/index.js.
 *
 * Usage:
 *   node import-acts.js [path/to/csv] [--dry-run]
 *
 * Flags:
 *   --dry-run    Show what would change without writing any files.
 *
 * If no CSV path is given, defaults to ./acts_of_kindness.csv
 *
 * CSV columns expected:
 *   id, title, category, timeMinutes, costDollars
 *
 * Behavior:
 *   - Rows missing from the CSV are DELETED (not in output)
 *   - Rows with a blank id are treated as NEW; an id is auto-generated
 *     using the category's prefix and the next available number
 *   - Existing rows keep their id; only title/time/cost can change
 *   - Categories preserve their original order and metadata (label, emoji);
 *     only the acts array inside each category is rewritten
 *   - Acts within each category are sorted by id (stable order)
 */

const fs   = require('fs');
const path = require('path');

// ── Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvArg = args.find(a => !a.startsWith('--'));

const CSV_PATH = csvArg
  ? path.resolve(csvArg)
  : path.join(process.cwd(), 'acts_of_kindness.csv');
const CONSTANTS_PATH = path.join(process.cwd(), 'src', 'constants', 'index.js');

// Map category label → id prefix
const CATEGORY_PREFIX = {
  'Kind Words':           'kw',
  'Generous Giving':      'gg',
  'Helping Hands':        'hh',
  'Listening & Presence': 'lp',
  'Mending Bridges':      'mb',
  'Self-Kindness':        'sk',
  'World Kindness':       'wk',
};

// ── CSV parsing (handles quoted fields, escaped quotes, commas) ──────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') {
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; i++; continue;
    }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// ── Read CSV ─────────────────────────────────────────────────────────────
if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌ CSV not found: ${CSV_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(CONSTANTS_PATH)) {
  console.error(`❌ Constants file not found: ${CONSTANTS_PATH}`);
  console.error(`   Run this script from your project root.`);
  process.exit(1);
}

const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parseCSV(csvText);

if (rows.length < 2) {
  console.error('❌ CSV is empty or has no data rows.');
  process.exit(1);
}

const header = rows[0].map(h => h.trim());
const dataRows = rows.slice(1);

const colId    = header.indexOf('id');
const colTitle = header.indexOf('title');
const colCat   = header.indexOf('category');
const colTime  = header.indexOf('timeMinutes');
const colCost  = header.indexOf('costDollars');

if ([colId, colTitle, colCat, colTime, colCost].some(c => c === -1)) {
  console.error('❌ CSV header must contain: id, title, category, timeMinutes, costDollars');
  console.error('   Got:', header);
  process.exit(1);
}

// ── Group acts by category ───────────────────────────────────────────────
const actsByCategory = {};
const usedIds = new Set();

for (const r of dataRows) {
  if (r.every(c => !c || !c.trim())) continue;

  const id    = (r[colId]    || '').trim();
  const title = (r[colTitle] || '').trim();
  const cat   = (r[colCat]   || '').trim();
  const time  = parseInt((r[colTime] || '0').trim(), 10);
  const cost  = parseInt((r[colCost] || '0').trim(), 10);

  if (!title) {
    console.warn(`⚠️  Skipping row with no title: ${r.join(',')}`);
    continue;
  }
  if (!CATEGORY_PREFIX[cat]) {
    console.warn(`⚠️  Skipping row with unknown category "${cat}": ${title}`);
    continue;
  }
  if (id) usedIds.add(id);

  if (!actsByCategory[cat]) actsByCategory[cat] = [];
  actsByCategory[cat].push({
    id,
    title,
    timeMinutes: isNaN(time) ? 0 : time,
    costDollars: isNaN(cost) ? 0 : cost,
  });
}

// ── Assign IDs to new (blank-id) rows ────────────────────────────────────
function nextIdFor(prefix) {
  let n = 1;
  while (true) {
    const candidate = `${prefix}-${String(n).padStart(3, '0')}`;
    if (!usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
    n++;
  }
}

const newActs = [];
for (const cat of Object.keys(actsByCategory)) {
  const prefix = CATEGORY_PREFIX[cat];
  for (const act of actsByCategory[cat]) {
    if (!act.id) {
      act.id = nextIdFor(prefix);
      newActs.push({ category: cat, ...act });
    }
  }
}

// ── Sort acts within each category by id ─────────────────────────────────
for (const cat of Object.keys(actsByCategory)) {
  actsByCategory[cat].sort((a, b) => a.id.localeCompare(b.id));
}

// ── Read constants/index.js and parse existing acts for diff ─────────────
const src = fs.readFileSync(CONSTANTS_PATH, 'utf8');

// Extract current state from constants for diff comparison
function parseExistingActs(srcText) {
  const existing = {};   // id → { title, timeMinutes, costDollars, category }
  const re = /\{\s*id:\s*'([a-z]{2})-(\d+)'\s*,\s*title:\s*'((?:[^'\\]|\\.)*)'\s*,\s*timeMinutes:\s*(\d+)\s*,\s*costDollars:\s*(\d+)\s*\}/g;
  const prefixToCat = Object.fromEntries(
    Object.entries(CATEGORY_PREFIX).map(([label, prefix]) => [prefix, label])
  );
  let m;
  while ((m = re.exec(srcText)) !== null) {
    const [, prefix, num, title, t, c] = m;
    const id = `${prefix}-${num}`;
    existing[id] = {
      title: title.replace(/\\'/g, "'"),
      timeMinutes: parseInt(t, 10),
      costDollars: parseInt(c, 10),
      category: prefixToCat[prefix] || '',
    };
  }
  return existing;
}

const existingActs = parseExistingActs(src);
const newActsById = {};
for (const cat of Object.keys(actsByCategory)) {
  for (const a of actsByCategory[cat]) {
    newActsById[a.id] = { ...a, category: cat };
  }
}

// Compute diff
const added = [];
const removed = [];
const changed = [];
for (const id of Object.keys(newActsById)) {
  const next = newActsById[id];
  const prev = existingActs[id];
  if (!prev) {
    added.push(next);
  } else if (
    prev.title !== next.title ||
    prev.timeMinutes !== next.timeMinutes ||
    prev.costDollars !== next.costDollars ||
    prev.category !== next.category
  ) {
    changed.push({ id, prev, next });
  }
}
for (const id of Object.keys(existingActs)) {
  if (!newActsById[id]) removed.push({ id, ...existingActs[id] });
}

// ── Locate ACT_CATEGORIES block and rewrite each `acts: [...]` ───────────
const catStartRe = /export const ACT_CATEGORIES\s*=\s*\[/;
const catStartMatch = src.match(catStartRe);
if (!catStartMatch) {
  console.error('❌ Could not locate `export const ACT_CATEGORIES = [` in constants/index.js');
  process.exit(1);
}

const ID_PREFIX_TO_CATEGORY_KEY = {
  kw: 'kind_words',
  gg: 'generous_giving',
  hh: 'helping_hands',
  lp: 'listening_presence',
  mb: 'mending_bridges',
  sk: 'self_kindness',
  wk: 'world_kindness',
};
const CATEGORY_LABEL_TO_KEY = {};
for (const [label, prefix] of Object.entries(CATEGORY_PREFIX)) {
  CATEGORY_LABEL_TO_KEY[label] = ID_PREFIX_TO_CATEGORY_KEY[prefix];
}

function findMatchingBracket(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const blockOpen = catStartMatch.index + catStartMatch[0].length - 1;
const blockClose = findMatchingBracket(src, blockOpen);
if (blockClose === -1) {
  console.error('❌ Could not find closing ] for ACT_CATEGORIES.');
  process.exit(1);
}

const before = src.slice(0, blockOpen + 1);
const block  = src.slice(blockOpen + 1, blockClose);
const after  = src.slice(blockClose);

function escapeStringForJS(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatActsArray(acts) {
  if (acts.length === 0) return '[]';
  const lines = acts.map(a =>
    `      { id: '${a.id}', title: '${escapeStringForJS(a.title)}', timeMinutes: ${a.timeMinutes}, costDollars: ${a.costDollars} },`
  );
  return '[\n' + lines.join('\n') + '\n    ]';
}

let updatedBlock = block;
const replacedCategories = [];

for (const [label, acts] of Object.entries(actsByCategory)) {
  const catKey = CATEGORY_LABEL_TO_KEY[label];
  if (!catKey) continue;

  const idRe = new RegExp(`id:\\s*'${catKey}'`);
  const idMatch = updatedBlock.match(idRe);
  if (!idMatch) {
    console.warn(`⚠️  Category "${label}" (id: '${catKey}') not found in constants — skipping.`);
    continue;
  }

  const fromIdIdx = idMatch.index;
  const actsKey = updatedBlock.indexOf('acts:', fromIdIdx);
  if (actsKey === -1) continue;
  const actsOpen = updatedBlock.indexOf('[', actsKey);
  if (actsOpen === -1) continue;
  const actsClose = findMatchingBracket(updatedBlock, actsOpen);
  if (actsClose === -1) continue;

  const newArrayLiteral = formatActsArray(acts);
  updatedBlock =
    updatedBlock.slice(0, actsOpen) +
    newArrayLiteral +
    updatedBlock.slice(actsClose + 1);

  replacedCategories.push({ label, count: acts.length });
}

const updated = before + updatedBlock + after;

// ── Print diff summary ───────────────────────────────────────────────────
function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

console.log('');
if (dryRun) console.log('🔍 DRY RUN — no files will be written\n');

console.log('📋 Changes summary');
console.log('   ───────────────────');
console.log(`   Added:    ${added.length}`);
console.log(`   Removed:  ${removed.length}`);
console.log(`   Changed:  ${changed.length}`);
console.log(`   Unchanged: ${Object.keys(newActsById).length - added.length - changed.length}`);
console.log('');

if (added.length > 0) {
  console.log(`➕ ADDED (${added.length})`);
  for (const a of added) {
    console.log(`   ${a.id}  [${a.category}]  ${truncate(a.title, 60)}`);
  }
  console.log('');
}

if (removed.length > 0) {
  console.log(`➖ REMOVED (${removed.length})`);
  for (const a of removed) {
    console.log(`   ${a.id}  [${a.category}]  ${truncate(a.title, 60)}`);
  }
  console.log('');
}

if (changed.length > 0) {
  console.log(`✏️  CHANGED (${changed.length})`);
  for (const { id, prev, next } of changed) {
    console.log(`   ${id}`);
    if (prev.title !== next.title) {
      console.log(`     title:  "${truncate(prev.title, 50)}"`);
      console.log(`         →  "${truncate(next.title, 50)}"`);
    }
    if (prev.timeMinutes !== next.timeMinutes) {
      console.log(`     time:   ${prev.timeMinutes} → ${next.timeMinutes}`);
    }
    if (prev.costDollars !== next.costDollars) {
      console.log(`     cost:   $${prev.costDollars} → $${next.costDollars}`);
    }
    if (prev.category !== next.category) {
      console.log(`     cat:    ${prev.category} → ${next.category}`);
    }
  }
  console.log('');
}

console.log('📦 Categories after import:');
for (const { label, count } of replacedCategories) {
  console.log(`   ${label.padEnd(22)} ${count} acts`);
}
console.log('');

// ── Write or skip ────────────────────────────────────────────────────────
if (dryRun) {
  console.log('✅ Dry run complete — no files changed.');
  console.log('   Re-run without --dry-run to apply these changes.\n');
} else {
  const backupPath = CONSTANTS_PATH + '.backup-' + Date.now();
  fs.copyFileSync(CONSTANTS_PATH, backupPath);
  fs.writeFileSync(CONSTANTS_PATH, updated, 'utf8');
  console.log('✅ Import complete');
  console.log(`   Backup:  ${backupPath}`);
  console.log(`   Updated: ${CONSTANTS_PATH}\n`);
}
