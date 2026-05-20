// HTSyndicate — Master sheet consolidator
// Reads migration-leads.sql + update-closer.sql + webinar-leads.sql → writes to master Google Sheet
//
// Usage:
//   node scripts/consolidate-sheet.js --preview   ← counts only, no write
//   node scripts/consolidate-sheet.js --write     ← clear + write master sheet

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MASTER_SHEET_ID = '1sXtllFsf8nVut-8TYOCTuXMtXRiuIetLRH2GuWJwDHo';
const CREDS_PATH      = path.join(ROOT, 'google-credentials.json');

// ─── Google Auth ──────────────────────────────────────────────────────────────
function getAuth() {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Display name maps ────────────────────────────────────────────────────────
const PIPELINE = {
  'instagram-outbound': 'Instagram Outbound',
  'instagram-inbound':  'Instagram Inbound',
  'whop-course-buyer':  'Whop Leads',
  'miscellaneous':      'Miscellaneous',
  'webinar':            'Webinar',
};

const STAGE = {
  'new':           'New',
  'call_booked':   'Booked',
  'showup':        'Show',
  'no_showup':     'No Show',
  'follow_up':     'Follow-up',
  'qualified':     'Qualified',
  'not_qualified': 'Not Qualified',
  'won':           'Won',
  'lost':          'Lost',
};

// Sort order for pipeline and stage columns
const PIPELINE_ORDER = ['Whop Leads', 'Instagram Inbound', 'Instagram Outbound', 'Webinar', 'Miscellaneous'];
const STAGE_ORDER    = ['Won', 'Qualified', 'Show', 'Booked', 'Follow-up', 'New', 'No Show', 'Not Qualified', 'Lost'];

// ─── SQL parser — works on full file content, handles multi-line values ───────
// Parses a single field starting at position i in string s.
function parseField(s, i) {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;

  if (s.slice(i, i + 4) === 'NULL') return { value: null, end: i + 4 };

  if (s[i] === "'") {
    i++;
    let val = '';
    while (i < s.length) {
      if (s[i] === "'" && s[i + 1] === "'") { val += "'"; i += 2; }
      else if (s[i] === "'") { i++; break; }
      else val += s[i++];
    }
    return { value: val, end: i };
  }

  // Number or bare literal — stop at comma, closing paren, or whitespace
  let start = i;
  while (i < s.length && s[i] !== ',' && s[i] !== ')' && s[i] !== ' ' && s[i] !== '\n') i++;
  const raw = s.slice(start, i).trim();
  return { value: raw === '' ? null : isNaN(raw) ? raw : Number(raw), end: i };
}

// Parse a VALUES tuple starting at '(' in content string at position start.
// Returns { fields, end } where end is the position after the closing ')'.
function parseTuple(content, start) {
  let i = start;
  if (content[i] !== '(') return null;
  i++;

  const fields = [];
  while (i < content.length) {
    while (i < content.length && (content[i] === ' ' || content[i] === '\t' || content[i] === '\n' || content[i] === '\r')) i++;
    if (content[i] === ')') { i++; break; }
    const { value, end } = parseField(content, i);
    fields.push(value);
    i = end;
    // Skip whitespace and comma
    while (i < content.length && (content[i] === ' ' || content[i] === '\t' || content[i] === ',' || content[i] === '\n' || content[i] === '\r')) i++;
  }
  return { fields, end: i };
}

// ─── Parse INSERT rows from SQL file ─────────────────────────────────────────
// Column order: id, name, email, phone, source, setter_stage, closer_stage,
//               notes, value, setter, closer, created_at, payments
// Operates on the full file content to handle multi-line note values.
function parseInserts(sqlPath) {
  const content = readFileSync(sqlPath, 'utf8');
  const leads = [];

  let pos = 0;
  while (true) {
    // Find next ('lead_ tuple
    const marker = content.indexOf("('lead_", pos);
    if (marker === -1) break;

    const result = parseTuple(content, marker);
    if (!result) { pos = marker + 1; continue; }

    const { fields, end } = result;
    pos = end;

    if (fields.length < 12) continue;

    leads.push({
      id:           fields[0],
      name:         fields[1],
      email:        fields[2],
      phone:        fields[3],
      source:       fields[4],
      setter_stage: fields[5],
      closer_stage: fields[6],
      notes:        fields[7],
      value:        fields[8] || 0,
      setter:       fields[9],
      closer:       fields[10],
      created_at:   fields[11],
    });
  }
  return leads;
}

// ─── Parse UPDATE statements from update-closer.sql ──────────────────────────
// Returns Map<leadId, {closer_stage, closer, value, notes}>
// Multiple UPDATEs for same lead are merged: later fields overwrite earlier,
// notes are accumulated.
function parseUpdates(sqlPath) {
  const content = readFileSync(sqlPath, 'utf8');
  const updates = new Map();

  // Split on UPDATE keyword boundaries
  const stmts = content.split(/(?=-- \[)/).filter(s => s.includes('WHERE id ='));

  for (const stmt of stmts) {
    const idMatch = stmt.match(/WHERE id = '([^']+)'/);
    if (!idMatch) continue;
    const id = idMatch[1];

    const prev = updates.get(id) || {};
    const u = { ...prev };

    const csMatch = stmt.match(/closer_stage = '([^']+)'/);
    if (csMatch) u.closer_stage = csMatch[1];

    const cMatch = stmt.match(/\bcloser = '((?:[^']|'')*)'/);
    if (cMatch) u.closer = cMatch[1].replace(/''/g, "'");

    const vMatch = stmt.match(/GREATEST\(COALESCE\(value,\s*0\),\s*(\d+)\)/);
    if (vMatch) u.value = Math.max(u.value || 0, parseInt(vMatch[1]));

    const nMatch = stmt.match(/COALESCE\(notes \|\| ' \| ', ''\) \|\| '((?:[^']|'')*)'/);
    if (nMatch) {
      const note = nMatch[1].replace(/''/g, "'");
      u.notes_append = u.notes_append ? u.notes_append + ' | ' + note : note;
    }

    updates.set(id, u);
  }
  return updates;
}

// ─── Extract tags from notes ──────────────────────────────────────────────────
function extractTags(notes) {
  if (!notes) return '';
  const m = notes.match(/Tags:\s*([^\n|]+)/i);
  return m ? m[1].trim() : '';
}

// ─── Format date ─────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mode = process.argv[2] || '--preview';
  const W = 74;

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  Master Sheet Consolidator — ${mode}`);
  console.log(`${'═'.repeat(W)}`);

  // ── Step 1: Parse all three SQL files ──────────────────────────────────
  console.log(`\n📂 Parsing SQL files...`);

  const migrationLeads = parseInserts(path.join(ROOT, 'migration-leads.sql'));
  console.log(`   migration-leads.sql  → ${migrationLeads.length} leads`);

  const webinarLeads = parseInserts(path.join(ROOT, 'webinar-leads.sql'));
  console.log(`   webinar-leads.sql    → ${webinarLeads.length} leads`);

  const closerUpdates = parseUpdates(path.join(ROOT, 'update-closer.sql'));
  console.log(`   update-closer.sql    → ${closerUpdates.size} unique lead updates`);

  // ── Step 2: Apply closer updates to migration leads ─────────────────────
  for (const lead of migrationLeads) {
    const u = closerUpdates.get(lead.id);
    if (!u) continue;
    if (u.closer_stage !== undefined) lead.closer_stage = u.closer_stage;
    if (u.closer       !== undefined) lead.closer       = u.closer;
    if (u.value        !== undefined) lead.value        = Math.max(lead.value || 0, u.value);
    if (u.notes_append) {
      lead.notes = lead.notes ? lead.notes + ' | ' + u.notes_append : u.notes_append;
    }
  }

  // ── Step 3: Merge all leads ─────────────────────────────────────────────
  const allLeads = [...migrationLeads, ...webinarLeads];
  console.log(`\n   Total leads: ${allLeads.length}`);

  // ── Step 4: Build display rows ──────────────────────────────────────────
  const rows = allLeads.map(l => {
    const pipeline     = PIPELINE[l.source] || l.source || '';
    const setterStage  = STAGE[l.setter_stage] || l.setter_stage || '';
    const closerStage  = l.closer_stage ? (STAGE[l.closer_stage] || l.closer_stage) : '';
    const tags         = extractTags(l.notes);
    const notesClean   = l.notes ? l.notes.replace(/\s*\|\s*Tags:[^|]*/i, '').trim() : '';

    return {
      pipeline,
      name:        l.name       || '',
      phone:       l.phone      || '',
      email:       l.email      || '',
      stage:       setterStage,
      source:      l.source     || '',
      setter_stage: setterStage,
      closer_stage: closerStage,
      payment:     l.value > 0 ? l.value : '',
      notes:       notesClean,
      tags,
      setter:      l.setter     || '',
      closer:      l.closer     || '',
      created:     fmtDate(l.created_at),
    };
  });

  // ── Step 5: Sort by Pipeline → Stage → Name ─────────────────────────────
  rows.sort((a, b) => {
    const pA = PIPELINE_ORDER.indexOf(a.pipeline);
    const pB = PIPELINE_ORDER.indexOf(b.pipeline);
    if (pA !== pB) return (pA === -1 ? 99 : pA) - (pB === -1 ? 99 : pB);

    const sA = STAGE_ORDER.indexOf(a.setter_stage);
    const sB = STAGE_ORDER.indexOf(b.setter_stage);
    if (sA !== sB) return (sA === -1 ? 99 : sA) - (sB === -1 ? 99 : sB);

    return a.name.localeCompare(b.name);
  });

  // ── Step 6: Pipeline/Stage breakdown ────────────────────────────────────
  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  BREAKDOWN BY PIPELINE`);
  console.log(`${'═'.repeat(W)}`);
  const pCount = {};
  for (const r of rows) pCount[r.pipeline] = (pCount[r.pipeline] || 0) + 1;
  for (const [p, n] of Object.entries(pCount).sort((a,b) => b[1]-a[1]))
    console.log(`  ${p.padEnd(22)} ${n}`);

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  BREAKDOWN BY SETTER STAGE`);
  console.log(`${'═'.repeat(W)}`);
  const sCount = {};
  for (const r of rows) sCount[r.setter_stage] = (sCount[r.setter_stage] || 0) + 1;
  for (const [s, n] of Object.entries(sCount).sort((a,b) => b[1]-a[1]))
    console.log(`  ${(s||'(blank)').padEnd(22)} ${n}`);

  const withCloser = rows.filter(r => r.closer_stage).length;
  console.log(`\n  Leads with closer data: ${withCloser}`);
  console.log(`  Leads without closer:   ${rows.length - withCloser}`);

  if (mode === '--preview') {
    console.log(`\n  Run with --write to clear + write master sheet`);
    console.log(`${'═'.repeat(W)}\n`);
    return;
  }

  // ── Step 7: Write to Google Sheet ───────────────────────────────────────
  if (mode !== '--write') { console.log('Use --preview or --write'); process.exit(1); }

  console.log(`\n🔐 Authenticating with Google...`);
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Get sheet metadata (need numeric sheetId for batchUpdate formatting)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
  const sheet = meta.data.sheets[0];
  const sheetId = sheet.properties.sheetId;
  console.log(`   Sheet: "${sheet.properties.title}" (id=${sheetId})`);

  // Clear existing data
  console.log(`\n🗑  Clearing master sheet...`);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: MASTER_SHEET_ID,
    range: sheet.properties.title,
  });

  // Build values array (header + data rows)
  const HEADERS = [
    'Name', 'Phone', 'Email', 'Pipeline', 'Stage',
    'Source', 'Setter Stage', 'Closer Stage', 'Payment Amount',
    'Notes', 'Tags', 'Setter', 'Closer', 'Created Date',
  ];
  const values = [
    HEADERS,
    ...rows.map(r => [
      r.name, r.phone, r.email, r.pipeline, r.stage,
      r.source, r.setter_stage, r.closer_stage, r.payment,
      r.notes, r.tags, r.setter, r.closer, r.created,
    ]),
  ];

  // Write all data
  console.log(`📝 Writing ${rows.length} leads + header row...`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_SHEET_ID,
    range: `${sheet.properties.title}!A1`,
    valueInputOption: 'RAW',
    resource: { values },
  });

  // Format: bold header, freeze row 1, auto-resize columns
  console.log(`🎨 Applying formatting...`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: MASTER_SHEET_ID,
    resource: {
      requests: [
        // Bold + background on header row
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                backgroundColor: { red: 0.18, green: 0.18, blue: 0.18 },
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
          },
        },
        // Freeze row 1
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // Auto-resize all columns
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: HEADERS.length,
            },
          },
        },
      ],
    },
  });

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  ✓ Master sheet updated`);
  console.log(`  Total rows written: ${rows.length}`);
  console.log(`  Pipeline breakdown:`);
  for (const [p, n] of Object.entries(pCount).sort((a,b) => b[1]-a[1]))
    console.log(`    ${p.padEnd(22)} ${n}`);
  console.log(`  Leads with closer data: ${withCloser}`);
  console.log(`\n  Sheet: https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit`);
  console.log(`${'═'.repeat(W)}\n`);
}

main().catch(e => {
  console.error('\n✗ Fatal:', e.message);
  process.exit(1);
});
