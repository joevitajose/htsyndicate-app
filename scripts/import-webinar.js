// HTSyndicate — Webinar attendee importer
// Reads Google Sheet → dedupes against migration-leads.sql → generates webinar-leads.sql
//
// Usage:
//   node scripts/import-webinar.js --preview   ← show first 5 rows + summary, no file written
//   node scripts/import-webinar.js --import    ← generate webinar-leads.sql

import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const WEBINAR_SHEET_ID = '1u-TZ0Ye772Ht8d2ft7TyvcYx5wAeVxFq-DnJBBTojoY';
const CREDS_PATH       = path.join(ROOT, 'google-credentials.json');
const SQL_PATH         = path.join(ROOT, 'migration-leads.sql');
const OUT_PATH         = path.join(ROOT, 'webinar-leads.sql');

// ─── Google Auth ──────────────────────────────────────────────────────────────
function getAuth() {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function readSheet(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A:E',
  });
  return res.data.values || [];
}

// ─── Phone normalization ──────────────────────────────────────────────────────
function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0'))  return digits.slice(1);
  if (digits.length === 11 && digits.startsWith('1'))  return digits.slice(1);
  return digits;
}

// ─── Date formatting (keep original string, just trim time portion) ───────────
function fmtDate(raw) {
  if (!raw) return '';
  // "07 May 2026 7:00 PM" → "07 May 2026"
  // "01/05/2026 11:48:34 AM" → "01/05/2026"
  return raw.trim().split(' ')[0] + (raw.includes('May') ? ' ' + raw.trim().split(' ')[1] + ' ' + raw.trim().split(' ')[2] : '');
}

function fmtWebinarDate(raw) {
  if (!raw) return '';
  // "07 May 2026 7:00 PM" → "07 May 2026"
  const parts = raw.trim().split(' ');
  if (parts.length >= 3 && isNaN(parseInt(parts[1]))) return `${parts[0]} ${parts[1]} ${parts[2]}`;
  return parts[0]; // fallback: just date part
}

function fmtRegDate(raw) {
  if (!raw) return '';
  // "01/05/2026 11:48:34 AM" → "01/05/2026"
  return raw.trim().split(' ')[0];
}

// ─── ID generator (same pattern as migration script) ─────────────────────────
function makeId() {
  return 'lead_' + crypto.randomBytes(4).toString('hex').slice(0, 7);
}

// ─── Parse existing phones from migration-leads.sql ───────────────────────────
function parseExistingPhones(sqlPath) {
  const content = readFileSync(sqlPath, 'utf8');
  const phones = new Set();
  const re = /\(\s*'lead_[a-z0-9]+',\s*'(?:[^']|'')*',\s*(?:NULL|'(?:[^']|'')*'),\s*'(\d+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    phones.add(m[1]);
  }
  return phones;
}

// ─── SQL escaping ─────────────────────────────────────────────────────────────
function sq(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mode = process.argv[2] || '--preview';
  const W = 74;

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  Webinar Importer — ${mode}`);
  console.log(`${'═'.repeat(W)}`);

  // ── Load existing phones from migration SQL ─────────────────────────────
  console.log(`\n📂 Loading existing leads from migration-leads.sql...`);
  const existingPhones = parseExistingPhones(SQL_PATH);
  console.log(`   ${existingPhones.size} existing phones loaded`);

  // ── Read sheet ──────────────────────────────────────────────────────────
  console.log(`\n🔐 Authenticating with Google...`);
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`📊 Reading Webinar sheet...`);
  const allRows = await readSheet(sheets, WEBINAR_SHEET_ID);
  if (allRows.length < 2) { console.log('No data rows found.'); process.exit(1); }

  const [headers, ...dataRows] = allRows;
  console.log(`   ${dataRows.length} data rows found\n`);

  // ── Column indices ──────────────────────────────────────────────────────
  const iWebinarDate = headers.findIndex(h => /webinar/i.test(h) && /date/i.test(h));
  const iRegDate     = headers.findIndex(h => /registration/i.test(h) || /reg/i.test(h));
  const iName        = headers.findIndex(h => /name/i.test(h));
  const iEmail       = headers.findIndex(h => /email/i.test(h));
  const iPhone       = headers.findIndex(h => /phone/i.test(h) || /number/i.test(h));

  // ── Preview first 5 rows ────────────────────────────────────────────────
  console.log(`${'═'.repeat(W)}`);
  console.log(`  FIRST 5 ROWS (raw from sheet)`);
  console.log(`${'═'.repeat(W)}`);
  console.log(`\n  ${'Name'.padEnd(22)} ${'Phone (raw)'.padEnd(16)} ${'Phone (norm)'.padEnd(14)} Email`);
  console.log(`  ${'─'.repeat(70)}`);
  for (const row of dataRows.slice(0, 5)) {
    const rawPhone  = (row[iPhone] || '').trim();
    const normPhone = normalizePhone(rawPhone);
    const name      = (row[iName]  || '').trim();
    const email     = (row[iEmail] || '').trim();
    console.log(`  ${name.slice(0, 21).padEnd(22)} ${rawPhone.padEnd(16)} ${normPhone.padEnd(14)} ${email}`);
  }

  if (mode === '--preview') {
    console.log(`\n  (Run with --import to process all ${dataRows.length} rows and generate webinar-leads.sql)`);
    console.log(`${'═'.repeat(W)}\n`);
    return;
  }

  // ── Process all rows ────────────────────────────────────────────────────
  const toInsert   = [];
  const skipped    = { blank: [], dup: [] };
  const seenPhones = new Set(); // self-dedup within the sheet

  for (const row of dataRows) {
    const name       = (row[iName]    || '').trim();
    const rawPhone   = (row[iPhone]   || '').trim();
    const email      = (row[iEmail]   || '').trim() || null;
    const webinarDt  = (row[iWebinarDate] || '').trim();
    const regDt      = (row[iRegDate] || '').trim();
    const phone      = normalizePhone(rawPhone);

    // Skip blank name or blank phone
    if (!name || !phone) {
      skipped.blank.push({ name: name || '(blank)', phone: rawPhone || '(blank)', reason: !name ? 'no name' : 'no phone' });
      continue;
    }

    // Skip obvious test rows
    const nameLower = name.toLowerCase();
    if (nameLower === 'test' || nameLower === 'test test' || (email || '').toLowerCase().endsWith('@test.com')) {
      skipped.blank.push({ name, phone, reason: 'test row' });
      continue;
    }

    // Skip if phone already exists in migration SQL
    if (existingPhones.has(phone)) {
      skipped.dup.push({ name, phone, reason: 'exists in migration-leads.sql' });
      continue;
    }

    // Skip if phone already seen within this sheet (sheet-level dedup)
    if (seenPhones.has(phone)) {
      skipped.dup.push({ name, phone, reason: 'duplicate within webinar sheet' });
      continue;
    }
    seenPhones.add(phone);

    const notes = `Registered: ${fmtRegDate(regDt)}, Webinar: ${fmtWebinarDate(webinarDt)} | Tags: from-webinar, whop-access`;

    toInsert.push({
      id:    makeId(),
      name,
      email,
      phone,
      notes,
      createdAt: new Date().toISOString(),
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  IMPORT SUMMARY`);
  console.log(`${'═'.repeat(W)}`);
  console.log(`\n  Total rows in sheet:     ${dataRows.length}`);
  console.log(`  New leads to import:     ${toInsert.length}`);
  console.log(`  Duplicates skipped:      ${skipped.dup.length}`);
  console.log(`  Skipped (blank):         ${skipped.blank.length}`);

  if (skipped.blank.length > 0) {
    console.log(`\n  Blank rows skipped:`);
    for (const s of skipped.blank) {
      console.log(`    "${s.name}"  phone="${s.phone}"  — ${s.reason}`);
    }
  }

  if (skipped.dup.length > 0) {
    console.log(`\n  Duplicates skipped (for your review):`);
    console.log(`  ${'Name'.padEnd(22)} ${'Phone'.padEnd(14)} Reason`);
    console.log(`  ${'─'.repeat(60)}`);
    for (const d of skipped.dup) {
      console.log(`  ${d.name.slice(0, 21).padEnd(22)} ${d.phone.padEnd(14)} ${d.reason}`);
    }
  }

  if (toInsert.length === 0) {
    console.log(`\n  Nothing to import — all rows are duplicates or blank.`);
    return;
  }

  // ── Generate SQL ─────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`-- HTSyndicate: Webinar leads import`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Total new leads: ${toInsert.length}`);
  lines.push(`-- Paste into: Supabase → SQL Editor → New Query → Run`);
  lines.push(`-- WARNING: Do not run twice — no unique constraint on phone`);
  lines.push(``);

  lines.push(`-- ─── Step 1: Add Webinar pipeline (safe if already exists) ──────────`);
  lines.push(`INSERT INTO pipelines (id, name, sources, color, icon, sort_order) VALUES`);
  lines.push(`  ('webinar', 'Webinar', '["webinar"]', '#f59e0b', 'video', 14)`);
  lines.push(`ON CONFLICT (id) DO NOTHING;`);
  lines.push(``);

  lines.push(`-- ─── Step 2: Insert webinar leads ───────────────────────────────────`);
  lines.push(`INSERT INTO leads`);
  lines.push(`  (id, name, email, phone, source, setter_stage, closer_stage, notes, value, setter, closer, created_at, payments)`);
  lines.push(`VALUES`);

  const rows = toInsert.map((l, i) => {
    const comma = i < toInsert.length - 1 ? ',' : '';
    return `  (${sq(l.id)}, ${sq(l.name)}, ${sq(l.email)}, ${sq(l.phone)}, 'webinar', 'new', NULL, ${sq(l.notes)}, 0, NULL, NULL, ${sq(l.createdAt)}, '[]')${comma}`;
  });
  lines.push(...rows);
  lines.push(`ON CONFLICT (id) DO NOTHING;`);
  lines.push(``);

  writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  ✓ webinar-leads.sql generated (${toInsert.length} INSERT rows + 1 pipeline)`);
  console.log(`    → Supabase → SQL Editor → paste → Run`);
  console.log(`${'═'.repeat(W)}\n`);
}

main().catch(e => {
  console.error('\n✗ Fatal:', e.message);
  process.exit(1);
});
