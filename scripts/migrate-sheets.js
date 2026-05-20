// HTSyndicate — Google Sheets → Supabase Migration
// Usage:
//   node scripts/migrate-sheets.js --preview          ← 5-row sample per tab
//   node scripts/migrate-sheets.js --closer-analysis  ← show unmatched Closer rows
//   node scripts/migrate-sheets.js --import           ← full import after confirmation

import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── Sheet IDs ─────────────────────────────────────────────────────────────
const INSTAGRAM_SHEET_ID = '1onur9DhLRWHkAKnfPZaD_8SbqB9VRLMUXvQV85pgd38';
const WHOP_SHEET_ID      = '1Wjy0swzX-EOamlfVU6LGSf2Z0p-wURovtVUEgauvVzw';
const TARGET_SHEET_ID    = '1sXtllFsf8nVut-8TYOCTuXMtXRiuIetLRH2GuWJwDHo';
const CREDS_PATH         = path.join(ROOT, 'google-credentials.json');

// ─── Google Auth ────────────────────────────────────────────────────────────
function getAuth() {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Read a sheet tab ────────────────────────────────────────────────────────
async function readTab(sheets, spreadsheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'`,
  });
  const all = res.data.values || [];
  if (all.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = all;
  return { headers: headers.map(h => (h || '').trim()), rows };
}

// ─── Column finders ──────────────────────────────────────────────────────────

// Returns first matching column index (exact then partial)
function findCol(headers, ...aliases) {
  const lower = aliases.map(a => a.toLowerCase().trim());
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().trim();
    if (lower.includes(h)) return i;
  }
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().trim();
    if (lower.some(a => h.includes(a) || a.includes(h))) return i;
  }
  return -1;
}

// Returns ALL matching column indices (for duplicate header names)
function findAllCols(headers, ...aliases) {
  const lower = aliases.map(a => a.toLowerCase().trim());
  const result = [];
  // Exact pass
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().trim();
    if (lower.includes(h)) result.push(i);
  }
  if (result.length > 0) return result;
  // Partial pass
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().trim();
    if (lower.some(a => h.includes(a) || a.includes(h))) result.push(i);
  }
  return result;
}

function get(row, idx) {
  if (idx < 0 || idx === undefined) return '';
  return (row[idx] || '').toString().trim();
}

// ─── Phone normalizer ────────────────────────────────────────────────────────
function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0'))  return digits.slice(1);
  return digits;
}

// ─── Instagram profile → stable placeholder ID ────────────────────────────
// Used when no phone number exists (DM-only outreach)
function igPlaceholder(profile) {
  const clean = (profile || '')
    .replace(/https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[^a-zA-Z0-9._]/g, '')
    .slice(0, 30);
  return clean ? `IG-${clean}` : '';
}

// ─── Date parser ─────────────────────────────────────────────────────────────
function parseDate(val) {
  if (!val) return null;
  const v = val.trim();
  if (!v) return null;
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString();
  const m = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    const d2 = new Date(`${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    if (!isNaN(d2.getTime())) return d2.toISOString();
  }
  return null;
}

function isDateLike(val) { return parseDate(val) !== null; }

// ─── Has a meaningful value (not empty / dash / 0) ───────────────────────────
function hasValue(v) {
  const s = (v || '').toString().trim().toLowerCase();
  return s !== '' && s !== '-' && s !== 'no' && s !== '0' && s !== 'n/a' && s !== 'na';
}

// ─── Stage mapping: column values → DB setter_stage ID ───────────────────────
// DB stages: new | call_booked | showup | no_showup | follow_up | qualified | not_qualified | won | lost
function mapStageFromCols({ closedVal, wonVal, lostVal, qualVal, showVal, bookedVal, connectVal }) {
  // Won / Lost check (handles both single-column and split won/lost columns)
  const closed = (closedVal || '').toLowerCase().trim();
  if (closed.includes('won') || (wonVal && hasValue(wonVal)))   return 'won';
  if (closed.includes('lost') || (lostVal && hasValue(lostVal))) return 'lost';

  const qual    = (qualVal    || '').toLowerCase().trim();
  const show    = (showVal    || '').toLowerCase().trim();
  const booked  = (bookedVal  || '').toLowerCase().trim();
  const connect = (connectVal || '').toLowerCase().trim();

  if (qual.startsWith('qual'))  return 'qualified';
  if (show === 'show' || show.startsWith('show up') || show === 'showed') return 'showup';
  if (booked === 'booked' || (booked && isDateLike(booked))) return 'call_booked';
  if (connect === 'connected')  return 'follow_up';
  return 'new';
}

// Instagram "Monirul's Note" fallback
function mapInstagramNote(note) {
  const n = (note || '').toLowerCase();
  if (n.includes('not interested') || n.includes('invalid') ||
      n.includes('wrong number')   || n.includes(' n/i')    ||
      n.includes('no interest')    || n === 'n/i')           return 'lost';
  if (n.includes('booked') || n.includes('scheduled'))       return 'call_booked';
  if (n.includes('interested') || n.includes('connected') ||
      n.includes('talked')     || n.includes('replied') ||
      n.includes('responded'))                                return 'follow_up';
  return 'new';
}

// Whop Source column → pipeline source tag
function mapWhopSourceToPipeline(source) {
  const s = (source || '').toLowerCase().trim();
  if (s === 'instagram' || s === 'instagram-outbound') return 'instagram-outbound';
  if (s.includes('inbound'))                            return 'instagram-inbound';
  if (s === 'whop')                                     return 'whop-course-buyer';
  return 'miscellaneous';
}

const PIPELINE_NAMES = {
  'instagram-outbound': 'Instagram Outbound',
  'instagram-inbound':  'Instagram Inbound',
  'whop-course-buyer':  'Whop Leads',
  'miscellaneous':      'Miscellaneous',
};

function parseAmount(val) {
  if (!val) return 0;
  const n = parseFloat((val || '').toString().replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

// ─── Process Instagram "Numbers Received" tab ──────────────────────────────
function processInstagram({ headers, rows }) {
  const iName    = findCol(headers, 'full name', 'name', 'client name', 'client');
  // Profile column (column B typically) — used as placeholder ID when no phone
  const iProfile = findCol(headers, 'profile', 'instagram', 'handle', 'username', 'url');

  // Phone: there are TWO columns named "Number" — user confirmed column E (second one) is the phone.
  // Use the LAST matched "Number" column.
  const numberCols = findAllCols(headers, 'number', 'phone', 'mobile', 'contact no', 'whatsapp', 'ph no');
  const iPhone = numberCols.length > 1
    ? numberCols[numberCols.length - 1]  // second/last "Number" = phone
    : numberCols[0] ?? -1;

  const iEmail   = findCol(headers, 'email', 'e-mail', 'mail');
  const iDate    = findCol(headers, 'date', 'date added', 'created', 'timestamp', 'date received');

  // Instagram has SEPARATE "Closed (won)" and "Closed (lost)" columns
  const iClosedWon  = findCol(headers, 'closed (won)',  'won',  'closed won',  'close won');
  const iClosedLost = findCol(headers, 'closed (lost)', 'lost', 'closed lost', 'close lost');
  // Also try generic closed column as fallback
  const iClosed     = iClosedWon === -1 && iClosedLost === -1
    ? findCol(headers, 'closed', 'won/lost', 'deal', 'close status') : -1;

  const iQual    = findCol(headers, 'qualified', 'qual');
  const iShow    = findCol(headers, 'show', 'show up', 'showup', 'showed');
  const iBooked  = findCol(headers, 'booked', 'booking', 'call booked', 'book');
  const iConnect = findCol(headers, 'connect', 'connected');
  const iNote    = findCol(headers, "monirul's note", "monirul note", "monirul", "note", "notes", "remarks", "outcome");
  const iCash    = findCol(headers, 'cash collected', 'cash', 'collected');
  const iRev     = findCol(headers, 'revenue', 'amount', 'value', 'deal value', 'rev');

  const leads = [];
  const skipped = [];

  for (const row of rows) {
    const name    = get(row, iName);
    const rawPhone = get(row, iPhone);
    const phone   = normalizePhone(rawPhone);
    const profile = get(row, iProfile);

    if (!name && !phone && !profile) {
      skipped.push({ reason: 'No name AND no phone AND no profile', preview: row.slice(0, 6).join(' | ') });
      continue;
    }

    // Unique identifier: phone if available, else IG-{profile}
    const uniqueId = phone || igPlaceholder(profile);

    // Stage: check split won/lost columns first, then fall back to note
    const wonVal  = get(row, iClosedWon);
    const lostVal = get(row, iClosedLost);
    let stage;

    if (hasValue(wonVal)) {
      stage = 'won';
    } else if (hasValue(lostVal)) {
      stage = 'lost';
    } else {
      // Try other stage columns if present
      const fromCols = mapStageFromCols({
        closedVal:  get(row, iClosed),
        wonVal:     null,
        lostVal:    null,
        qualVal:    get(row, iQual),
        showVal:    get(row, iShow),
        bookedVal:  get(row, iBooked),
        connectVal: get(row, iConnect),
      });
      if (fromCols !== 'new') {
        stage = fromCols;
      } else {
        // Fall back to note keywords
        stage = mapInstagramNote(get(row, iNote));
      }
    }

    const cash = parseAmount(get(row, iCash));
    const rev  = parseAmount(get(row, iRev));

    leads.push({
      name:          name || profile,
      phone:         uniqueId,      // IG-{handle} when no real phone
      realPhone:     phone || null, // actual digits only, for dedup
      profile,
      email:         get(row, iEmail),
      source:        'instagram-outbound',
      pipeline:      'Instagram Outbound',
      stage,
      dateAdded:     parseDate(get(row, iDate)) || new Date().toISOString(),
      notes:         get(row, iNote),
      cashCollected: cash,
      revenue:       rev,
      value:         rev || cash,
      setter:        '',
      closer:        '',
      closerStage:   null,
      lastUpdated:   new Date().toISOString(),
    });
  }

  return { leads, skipped, headers, meta: { iClosedWon, iClosedLost, iPhone, iProfile } };
}

// ─── Process Whop "Setter" tab ────────────────────────────────────────────
function processWhopSetter({ headers, rows }) {
  const iName    = findCol(headers, 'client name', 'name', 'full name', 'lead name');
  const iPhoneAll = findAllCols(headers, 'contact number', 'contact no', 'contact', 'phone', 'mobile', 'whatsapp', 'number');
  const iPhone   = iPhoneAll[0] ?? -1;
  const iEmail   = findCol(headers, 'email', 'email id', 'e-mail', 'mail');
  const iSource  = findCol(headers, 'source', 'lead source', 'src');
  const iDate    = findCol(headers, 'date', 'date added', 'date booked', 'created', 'date assigned');

  // Stage columns
  const iClosed  = findCol(headers, 'closed', 'won/lost', 'deal closed', 'close');
  const iQual    = findCol(headers, 'qualified', 'qual');
  const iShow    = findCol(headers, 'show', 'show up', 'showup', 'showed');
  const iBooked  = findCol(headers, 'booked', 'booking', 'call booked', 'book date', 'booking date');
  const iConnect = findCol(headers, 'connect', 'connected', 'contacted');

  // Additional columns
  const iNotes  = findCol(headers, 'note', 'notes', 'remarks', 'comment', 'setter notes', 'setter note');
  const iCash   = findCol(headers, 'cash collected', 'cash', 'collected', 'amount received');
  const iRev    = findCol(headers, 'revenue', 'amount', 'value', 'deal value', 'rev', 'total');
  const iSetter = findCol(headers, 'setter', 'setter name', 'assigned setter', 'assigned to');
  const iCallStage = findCol(headers, 'call stage', 'stage', 'call status');

  const leads = [];
  const skipped = [];

  for (const row of rows) {
    const name  = get(row, iName);
    const phone = normalizePhone(get(row, iPhone));

    if (!name && !phone) {
      skipped.push({ reason: 'No name AND no phone', preview: row.slice(0, 8).join(' | ') });
      continue;
    }

    const sourceRaw = get(row, iSource);
    const sourceTag = mapWhopSourceToPipeline(sourceRaw);

    // Stage: try standard columns, also cross-check with Call Stage
    const stage = mapStageFromCols({
      closedVal:  get(row, iClosed),
      wonVal:     null,
      lostVal:    null,
      qualVal:    get(row, iQual),
      showVal:    get(row, iShow),
      bookedVal:  get(row, iBooked),
      connectVal: get(row, iConnect),
    });

    const cash = parseAmount(get(row, iCash));
    const rev  = parseAmount(get(row, iRev));

    // Combine note fields
    const noteVal = [get(row, iNotes), get(row, iCallStage)]
      .filter(v => v && v.toLowerCase() !== sourceRaw.toLowerCase())
      .join(' | ');

    leads.push({
      name, phone,
      realPhone:    phone,
      email:        get(row, iEmail),
      source:       sourceTag,
      sourceRaw,
      pipeline:     PIPELINE_NAMES[sourceTag] || 'Miscellaneous',
      stage,
      dateAdded:    parseDate(get(row, iDate)) || new Date().toISOString(),
      notes:        noteVal,
      cashCollected: cash,
      revenue:       rev,
      value:         rev || cash,
      setter:        get(row, iSetter),
      closer:        '',
      closerStage:   null,
      lastUpdated:   new Date().toISOString(),
    });
  }

  return { leads, skipped, headers };
}

// ─── Process Whop "Closer" tab ────────────────────────────────────────────
function processWhopCloser({ headers, rows }) {
  const iName    = findCol(headers, 'client name', 'name', 'full name', 'lead name');
  const iPhoneAll = findAllCols(headers, 'contact number', 'contact no', 'contact', 'phone', 'mobile', 'whatsapp', 'number');
  const iPhone   = iPhoneAll[0] ?? -1;
  const iCloser  = findCol(headers, 'closer', 'closer name', 'closed by', 'assigned closer');
  const iStatus  = findCol(headers, 'status', 'deal status', 'outcome', 'stage', 'closer stage');
  const iShow    = findCol(headers, 'show', 'show/ no show', 'show/no show', 'showup', 'showed');
  const iQual    = findCol(headers, 'qualified', 'qual', 'qualified/ dis-qualified', 'qualified/dis-qualified');
  const iClosed  = findCol(headers, 'closed', 'won/lost', 'deal closed', 'close');
  const iNotes   = findCol(headers, 'notes', 'note', 'closer notes', 'remarks', 'objection');
  const iCash    = findCol(headers, 'cash collected', 'cash', 'collected');
  const iRev     = findCol(headers, 'revenue', 'amount', 'value', 'deal value', 'rev');
  const iDate    = findCol(headers, 'meeting date', 'date', 'close date', 'last updated');

  const closerData = [];

  for (const row of rows) {
    const name  = get(row, iName);
    const phone = normalizePhone(get(row, iPhone));
    if (!name && !phone) continue;

    // Closer stage
    const closedVal  = get(row, iClosed).toLowerCase();
    const statusVal  = get(row, iStatus).toLowerCase();
    const showVal    = get(row, iShow).toLowerCase();
    const qualVal    = get(row, iQual).toLowerCase();
    let closerStage  = 'new';

    if (closedVal.includes('won')  || statusVal.includes('won'))  closerStage = 'won';
    else if (closedVal.includes('lost') || statusVal.includes('lost')) closerStage = 'lost';
    else if (qualVal.includes('qual') && !qualVal.includes('dis')) closerStage = 'qualified';
    else if (qualVal.includes('dis') || qualVal.includes('not qual')) closerStage = 'not_qualified';
    else if (showVal.includes('show') && !showVal.includes('no')) closerStage = 'showup';
    else if (showVal.includes('no show')) closerStage = 'no_showup';
    else if (statusVal.includes('follow')) closerStage = 'follow_up';
    else if (statusVal.includes('book'))   closerStage = 'call_booked';

    closerData.push({
      name, phone,
      closer:      get(row, iCloser),
      closerStage,
      cash:        parseAmount(get(row, iCash)),
      revenue:     parseAmount(get(row, iRev)),
      notes:       get(row, iNotes),
      meetingDate: parseDate(get(row, iDate)),
      lastUpdated: parseDate(get(row, iDate)) || new Date().toISOString(),
    });
  }

  return { closerData, headers };
}

// ─── Merge closer data into setter leads ─────────────────────────────────────
function mergeCloserData(leads, closerData) {
  // Index by phone (normalized) and by cleaned name
  const byPhone = new Map();
  const byName  = new Map();
  leads.forEach((l, i) => {
    if (l.realPhone) byPhone.set(l.realPhone, i);
    if (l.name)  byName.set(l.name.toLowerCase().trim(), i);
  });

  let matched = 0;
  const unmatched = [];

  for (const cd of closerData) {
    let idx = cd.phone ? byPhone.get(cd.phone) : undefined;
    if (idx === undefined && cd.name) idx = byName.get(cd.name.toLowerCase().trim());

    if (idx !== undefined) {
      const l = leads[idx];
      if (cd.closer)  l.closer = cd.closer;
      l.closerStage = cd.closerStage;
      if (cd.cash    > 0) l.cashCollected = cd.cash;
      if (cd.revenue > 0) { l.revenue = cd.revenue; l.value = cd.revenue; }
      if (cd.notes)  l.notes = [l.notes, cd.notes].filter(Boolean).join(' | ');
      matched++;
    } else {
      unmatched.push(cd);
    }
  }

  return { leads, matched, unmatched };
}

// ─── Deduplicate by phone ─────────────────────────────────────────────────────
function deduplicateByPhone(leads) {
  // Key on realPhone (actual digits). IG-placeholder leads are never dupes of each other.
  const seen = new Map();
  const result = [];
  let dupes = 0;

  for (const lead of leads) {
    const key = lead.realPhone || null;
    if (key && seen.has(key)) {
      const idx = seen.get(key);
      const existing = result[idx];
      const existingDate = new Date(existing.dateAdded || 0).getTime();
      const newDate      = new Date(lead.dateAdded || 0).getTime();
      if (newDate > existingDate) {
        result[idx] = {
          ...lead,
          closer:        lead.closer      || existing.closer,
          closerStage:   lead.closerStage || existing.closerStage,
          cashCollected: Math.max(lead.cashCollected || 0, existing.cashCollected || 0),
          revenue:       Math.max(lead.revenue       || 0, existing.revenue       || 0),
        };
      }
      dupes++;
    } else {
      if (key) seen.set(key, result.length);
      result.push({ ...lead });
    }
  }

  return { leads: result, dupes };
}

// ─── Generate lead ID ─────────────────────────────────────────────────────────
function genLeadId() {
  return 'lead_' + Math.random().toString(36).slice(2, 9);
}

// ─── SQL string escaping ──────────────────────────────────────────────────────
function sq(val) {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// ─── Generate SQL ─────────────────────────────────────────────────────────────
function generateSQL(leads) {
  const lines = [];
  lines.push(`-- HTSyndicate Google Sheets Migration`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Total leads: ${leads.length}`);
  lines.push(`-- Paste into: Supabase → SQL Editor → New Query → Run`);
  lines.push('');

  lines.push('-- ─── Step 1: Add new pipelines ──────────────────────────────────────────');
  lines.push(`INSERT INTO pipelines (id, name, sources, color, icon, sort_order) VALUES`);
  lines.push(`  ('instagram-outbound', 'Instagram Outbound', '["instagram-outbound"]', '#e1306c', 'link', 10),`);
  lines.push(`  ('instagram-inbound',  'Instagram Inbound',  '["instagram-inbound"]',  '#833AB4', 'link', 11),`);
  lines.push(`  ('whop-leads',         'Whop Leads',         '["whop-course-buyer"]',  '#a07cf5', 'whop', 12),`);
  lines.push(`  ('miscellaneous',      'Miscellaneous',      '["miscellaneous"]',       '#9a9caa', 'users', 13)`);
  lines.push(`ON CONFLICT (id) DO NOTHING;`);
  lines.push('');

  lines.push('-- ─── Step 2: Insert leads ────────────────────────────────────────────────');
  lines.push(`INSERT INTO leads`);
  lines.push(`  (id, name, email, phone, source, setter_stage, closer_stage, notes, value, setter, closer, created_at, payments)`);
  lines.push(`VALUES`);

  const rowSQLs = leads.map((l, idx) => {
    const paymentEntries = [];
    if (l.cashCollected > 0) paymentEntries.push({ type: 'cash_collected', amount: l.cashCollected, at: l.lastUpdated });
    if (l.revenue > 0 && l.revenue !== l.cashCollected) paymentEntries.push({ type: 'revenue', amount: l.revenue, at: l.lastUpdated });

    const noteParts = [l.notes];
    if (l.cashCollected > 0) noteParts.push(`Cash Collected: ₹${l.cashCollected}`);
    if (l.revenue > 0 && l.revenue !== l.cashCollected) noteParts.push(`Revenue: ₹${l.revenue}`);
    const combinedNotes = noteParts.filter(Boolean).join(' | ') || null;

    // Use realPhone for the DB phone field (not the IG- placeholder)
    const dbPhone = l.realPhone || null;

    const comma = idx < leads.length - 1 ? ',' : '';
    return `  (${[
      sq(genLeadId()),
      sq(l.name || 'Unknown'),
      l.email   ? sq(l.email)   : 'NULL',
      dbPhone   ? sq(dbPhone)   : 'NULL',
      sq(l.source),
      sq(l.stage || 'new'),
      l.closerStage ? sq(l.closerStage) : 'NULL',
      combinedNotes ? sq(combinedNotes) : 'NULL',
      l.value || 0,
      l.setter ? sq(l.setter) : 'NULL',
      l.closer ? sq(l.closer) : 'NULL',
      sq(l.dateAdded || new Date().toISOString()),
      sq(JSON.stringify(paymentEntries)),
    ].join(', ')})${comma}`;
  });

  lines.push(rowSQLs.join('\n'));
  lines.push(`ON CONFLICT DO NOTHING;`);
  return lines.join('\n');
}

// ─── Write merged data to target Google Sheet ─────────────────────────────────
async function writeTargetSheet(sheets, leads) {
  const HEADERS = [
    'Full Name', 'Phone', 'Email', 'Source Tag', 'Pipeline', 'Stage',
    'Date Added', 'Notes', 'Cash Collected', 'Revenue', 'Closer Name', 'Last Updated'
  ];
  const rows = leads.map(l => [
    l.name || '',
    l.realPhone || (l.phone?.startsWith('IG-') ? '' : l.phone) || '',
    l.email || '',
    l.source || '',
    l.pipeline || '',
    l.stage || '',
    l.dateAdded ? new Date(l.dateAdded).toLocaleDateString('en-IN') : '',
    l.notes || '',
    l.cashCollected || '',
    l.revenue || '',
    l.closer || '',
    new Date(l.lastUpdated).toLocaleDateString('en-IN'),
  ]);

  await sheets.spreadsheets.values.clear({ spreadsheetId: TARGET_SHEET_ID, range: 'Sheet1' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: TARGET_SHEET_ID,
    range: 'Sheet1!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS, ...rows] },
  });
}

// ─── Console preview helpers ───────────────────────────────────────────────────
const W = 74;
function ruler() { return '═'.repeat(W); }

function showPreview(label, leads, totalRows, skipped, headers, meta = {}) {
  console.log(`\n${ruler()}`);
  console.log(`  ${label}`);
  console.log(`  Headers: ${headers.slice(0, 10).join(' | ')}${headers.length > 10 ? ` (+${headers.length - 10} more)` : ''}`);
  if (meta.iClosedWon !== undefined) {
    console.log(`  Column mapping: phone@col${meta.iPhone}  profile@col${meta.iProfile}  closedWon@col${meta.iClosedWon}  closedLost@col${meta.iClosedLost}`);
  }
  console.log(`  Rows: ${totalRows} total  |  ${skipped.length} skipped  |  ${leads.length} valid`);
  console.log(ruler());

  for (const [i, l] of leads.slice(0, 5).entries()) {
    console.log(`\n  ── Row ${i + 1} ──`);
    console.log(`    Name:     ${l.name || '(empty)'}`);
    if (l.profile) console.log(`    Profile:  ${l.profile}`);
    console.log(`    Phone:    ${l.realPhone || '(no phone — DM only)'}${l.phone?.startsWith('IG-') ? `  [IG ID: ${l.phone}]` : ''}`);
    console.log(`    → Pipeline: ${l.pipeline}${l.sourceRaw ? ` (raw: "${l.sourceRaw}")` : ''}`);
    console.log(`    → Stage:    ${l.stage}`);
    if (l.dateAdded) console.log(`    Date:     ${new Date(l.dateAdded).toLocaleDateString('en-IN')}`);
    if (l.cashCollected || l.revenue) console.log(`    Cash: ₹${l.cashCollected || 0}   Revenue: ₹${l.revenue || 0}`);
    if (l.notes) console.log(`    Notes:    ${l.notes.slice(0, 88)}${l.notes.length > 88 ? '…' : ''}`);
    if (l.setter) console.log(`    Setter:   ${l.setter}`);
    if (l.closer) console.log(`    Closer:   ${l.closer} (stage: ${l.closerStage})`);
  }

  if (leads.length > 5) console.log(`\n  ... and ${leads.length - 5} more rows`);

  if (skipped.length > 0) {
    console.log(`\n  Skipped (first 3):`);
    skipped.slice(0, 3).forEach(s => console.log(`    • ${s.preview.slice(0, 70)}`));
  }
}

// ─── Closer analysis mode ─────────────────────────────────────────────────────
function showCloserAnalysis(unmatched, setterLeads) {
  console.log(`\n${ruler()}`);
  console.log(`  CLOSER TAB — UNMATCHED ROW ANALYSIS`);
  console.log(`  ${unmatched.length} Closer rows could not be matched to any Setter lead`);
  console.log(ruler());

  // Build a quick lookup of setter phones for display
  const setterPhones = new Set(setterLeads.filter(l => l.realPhone).map(l => l.realPhone));
  const setterNames  = new Set(setterLeads.filter(l => l.name).map(l => l.name.toLowerCase().trim()));

  console.log('\n  Sample of unmatched Closer rows (first 20):');
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  ${'Name'.padEnd(22)} ${'Phone (normalized)'.padEnd(16)} ${'Closer'.padEnd(14)} Stage`);
  console.log(`  ${'─'.repeat(70)}`);

  for (const cd of unmatched.slice(0, 20)) {
    const phoneMatch = cd.phone && setterPhones.has(cd.phone) ? '✓' : cd.phone ? '✗' : '—';
    const nameMatch  = cd.name && setterNames.has(cd.name.toLowerCase().trim()) ? '✓' : '✗';
    const flag = `phone:${phoneMatch} name:${nameMatch}`;
    console.log(`  ${(cd.name || '(empty)').slice(0, 21).padEnd(22)} ${(cd.phone || '(empty)').padEnd(16)} ${(cd.closer || '—').padEnd(14)} ${cd.closerStage}  [${flag}]`);
  }

  if (unmatched.length > 20) {
    console.log(`  ... and ${unmatched.length - 20} more`);
  }

  // Stats
  const noPhone = unmatched.filter(c => !c.phone).length;
  const hasPhoneNoMatch = unmatched.filter(c => c.phone && !setterPhones.has(c.phone)).length;
  const hasNameNoMatch  = unmatched.filter(c => c.name && !setterNames.has(c.name.toLowerCase().trim())).length;

  console.log(`\n  Analysis:`);
  console.log(`    • No phone at all:             ${noPhone}`);
  console.log(`    • Has phone but no setter match: ${hasPhoneNoMatch}`);
  console.log(`    • Name also doesn't match:       ${hasNameNoMatch}`);

  // Stage breakdown of unmatched
  const stageCounts = {};
  for (const cd of unmatched) {
    stageCounts[cd.closerStage] = (stageCounts[cd.closerStage] || 0) + 1;
  }
  console.log(`\n  Stage breakdown of unmatched:`);
  for (const [s, n] of Object.entries(stageCounts)) {
    console.log(`    ${s.padEnd(20)} ${n}`);
  }
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mode = process.argv[2] || '--preview';

  console.log(`\n${ruler()}`);
  console.log(`  HTSyndicate Sheets Migration — ${mode}`);
  console.log(ruler());

  console.log('\n🔐 Authenticating with Google Sheets API...');
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('📊 Reading Instagram "Numbers Received"...');
  let instagramRaw;
  try {
    instagramRaw = await readTab(sheets, INSTAGRAM_SHEET_ID, 'Numbers Received');
  } catch (e) {
    console.error(`✗ Instagram sheet: ${e.message}`);
    console.error('  Share the sheet with: htsyndicate-sheets-bot@htsyndicate-dashboard.iam.gserviceaccount.com');
    process.exit(1);
  }

  console.log('📊 Reading Whop "Setter"...');
  const whopSetterRaw = await readTab(sheets, WHOP_SHEET_ID, 'Setter').catch(e => {
    console.error(`✗ Whop Setter: ${e.message}`); process.exit(1);
  });

  console.log('📊 Reading Whop "Closer"...');
  const whopCloserRaw = await readTab(sheets, WHOP_SHEET_ID, 'Closer').catch(e => {
    console.error(`✗ Whop Closer: ${e.message}`); process.exit(1);
  });

  // Process
  const { leads: igLeads,  skipped: igSkipped,  headers: igHeaders,  meta: igMeta  } = processInstagram(instagramRaw);
  const { leads: wsLeads,  skipped: wsSkipped,  headers: wsHeaders  } = processWhopSetter(whopSetterRaw);
  const { closerData,                            headers: wcHeaders  } = processWhopCloser(whopCloserRaw);
  const { leads: whopLeads, matched: closerMatched, unmatched } = mergeCloserData(wsLeads, closerData);

  if (mode === '--closer-analysis') {
    showCloserAnalysis(unmatched, wsLeads);
    return;
  }

  // Preview
  showPreview(
    'SOURCE 1: Instagram "Numbers Received" → Instagram Outbound',
    igLeads, instagramRaw.rows.length, igSkipped, igHeaders, igMeta
  );

  showPreview(
    'SOURCE 2: Whop "Setter" → pipeline from Source column',
    whopLeads, whopSetterRaw.rows.length, wsSkipped, wsHeaders
  );

  console.log(`\n${ruler()}`);
  console.log(`  SOURCE 3: Whop "Closer" → merged into Setter leads`);
  console.log(`  Headers: ${wcHeaders.slice(0, 8).join(' | ')}`);
  console.log(`  ${whopCloserRaw.rows.length} Closer rows | ${closerMatched} merged | ${unmatched.length} unmatched (discarded)`);
  console.log(ruler());

  // Summary
  const allLeads = [...igLeads, ...whopLeads];
  const pipelineCounts = {};
  const stageCounts = {};
  for (const l of allLeads) {
    pipelineCounts[l.pipeline] = (pipelineCounts[l.pipeline] || 0) + 1;
    stageCounts[l.stage]       = (stageCounts[l.stage]       || 0) + 1;
  }

  console.log(`\n${ruler()}`);
  console.log(`  OVERALL SUMMARY (before dedup)`);
  console.log(ruler());
  console.log(`\n  Total valid: ${allLeads.length}   Skipped: ${igSkipped.length + wsSkipped.length}`);
  console.log('\n  Pipeline:');
  for (const [p, n] of Object.entries(pipelineCounts)) console.log(`    ${p.padEnd(26)} ${n}`);
  console.log('\n  Stage:');
  for (const [s, n] of Object.entries(stageCounts)) console.log(`    ${s.padEnd(22)} ${n}`);

  if (mode === '--preview') {
    console.log(`\n${ruler()}`);
    console.log(`  PREVIEW DONE — run  node scripts/migrate-sheets.js --closer-analysis`);
    console.log(`  to inspect unmatched Closer rows, then`);
    console.log(`  node scripts/migrate-sheets.js --import  to proceed`);
    console.log(ruler() + '\n');
    return;
  }

  if (mode !== '--import') { console.log('Unknown mode.'); process.exit(1); }

  // ── IMPORT ──
  console.log('\n🔄 Starting import...');
  const { leads: deduped, dupes } = deduplicateByPhone(allLeads);
  console.log(`✓ Dedup: ${allLeads.length} → ${deduped.length} leads (${dupes} removed)`);

  console.log('📝 Writing target Google Sheet...');
  try {
    await writeTargetSheet(sheets, deduped);
    console.log(`✓ ${deduped.length} rows written`);
  } catch (e) {
    console.error(`✗ Sheet write failed: ${e.message}`);
  }

  const sql = generateSQL(deduped);
  const sqlPath = path.join(ROOT, 'migration-leads.sql');
  writeFileSync(sqlPath, sql, 'utf8');

  const finalPipelines = {}, finalStages = {};
  for (const l of deduped) {
    finalPipelines[l.pipeline] = (finalPipelines[l.pipeline] || 0) + 1;
    finalStages[l.stage]       = (finalStages[l.stage]       || 0) + 1;
  }
  const allSkipped = [...igSkipped, ...wsSkipped];

  console.log(`\n${ruler()}`);
  console.log('  IMPORT COMPLETE');
  console.log(ruler());
  console.log(`\n  ✓ ${deduped.length} leads written to target Google Sheet`);
  console.log(`  ✓ migration-leads.sql ready (${deduped.length} INSERT rows + 4 pipelines)`);
  console.log(`    → Supabase Dashboard → SQL Editor → New Query → paste → Run`);
  console.log(`  ✓ ${dupes} phone duplicates removed`);
  console.log('\n  Leads per pipeline:');
  for (const [p, n] of Object.entries(finalPipelines)) console.log(`    ${p.padEnd(26)} ${n}`);
  console.log('\n  Stage breakdown:');
  for (const [s, n] of Object.entries(finalStages)) console.log(`    ${s.padEnd(22)} ${n}`);
  if (allSkipped.length > 0) {
    console.log(`\n  Skipped ${allSkipped.length} rows (no name + no phone):`);
    allSkipped.slice(0, 8).forEach(s => console.log(`    • ${s.preview.slice(0, 65)}`));
    if (allSkipped.length > 8) console.log(`    ... and ${allSkipped.length - 8} more`);
  }
  console.log('');
}

main().catch(e => {
  console.error('\n✗ Fatal:', e.message);
  if (e.errors) e.errors.forEach(err => console.error(' ', err.message));
  process.exit(1);
});
