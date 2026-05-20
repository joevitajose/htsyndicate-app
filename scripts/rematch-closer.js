// HTSyndicate — Closer tab fuzzy re-matcher
// Recovers the 68 unmatched Closer rows using 4 matching strategies.
//
// Usage:
//   node scripts/rematch-closer.js --preview   ← show matches, don't touch DB
//   node scripts/rematch-closer.js --update    ← generate update-closer.sql

import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const WHOP_SHEET_ID = '1Wjy0swzX-EOamlfVU6LGSf2Z0p-wURovtVUEgauvVzw';
const CREDS_PATH    = path.join(ROOT, 'google-credentials.json');
const SQL_PATH      = path.join(ROOT, 'migration-leads.sql');

// ─── Google Auth ─────────────────────────────────────────────────────────────
function getAuth() {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

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

// ─── Phone normalization ──────────────────────────────────────────────────────
function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // Strip +91 / 91 prefix (12 digits starting with 91)
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  // Strip leading 0 (11 digits starting with 0)
  if (digits.length === 11 && digits.startsWith('0'))  return digits.slice(1);
  // Strip +1 (US) prefix
  if (digits.length === 11 && digits.startsWith('1'))  return digits.slice(1);
  return digits;
}

// Fallback: compare last 10 digits (handles missed country codes)
function last10(phone) {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

// ─── Levenshtein distance ────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let j = 1; j <= n; j++)
    for (let i = 1; i <= m; i++)
      d[i][j] = a[i-1] === b[j-1]
        ? d[i-1][j-1]
        : 1 + Math.min(d[i-1][j-1], d[i-1][j], d[i][j-1]);
  return d[m][n];
}

// ─── Name normalization ───────────────────────────────────────────────────────
function normName(s) {
  return (s || '').toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, '');
}

// Name similarity: returns { score 0-1, reason }
function nameSim(a, b) {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return { score: 0, reason: 'empty' };
  if (na === nb) return { score: 1.0, reason: 'exact' };

  // One name is a full substring of the other ("Priya" ↔ "Priya Sharma")
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na)))
    return { score: 0.93, reason: 'substring' };

  // First token (first name) exact match — e.g. "Jatin" ↔ "Jatin Kumar"
  const tokA = na.split(' '), tokB = nb.split(' ');
  if (tokA[0] === tokB[0] && tokA[0].length >= 3)
    return { score: 0.88, reason: 'first-name' };

  // Last token (last name) match when both have 2+ tokens
  if (tokA.length > 1 && tokB.length > 1 &&
      tokA[tokA.length-1] === tokB[tokB.length-1] &&
      tokA[tokA.length-1].length >= 3)
    return { score: 0.85, reason: 'last-name' };

  // Levenshtein
  const maxLen = Math.max(na.length, nb.length);
  const score  = 1 - levenshtein(na, nb) / maxLen;
  return { score: Math.max(0, score), reason: 'levenshtein' };
}

// ─── Parse migration-leads.sql → [{id, name, phone, source}] ─────────────────
// Lines follow the pattern:
//   ('lead_xxx', 'Name', NULL or 'email', NULL or 'phone', 'source', ...),
function parseLeadsFromSQL(sqlPath) {
  const content = readFileSync(sqlPath, 'utf8');
  const leads = [];

  // Match the first 5 fields of each VALUES row
  // Field order: id, name, email, phone, source
  const re = /\(\s*'(lead_[a-z0-9]+)',\s*'((?:[^']|'')*)',\s*(?:NULL|'(?:[^']|'')*'),\s*(NULL|'(\d+)'),\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    leads.push({
      id:     m[1],
      name:   m[2].replace(/''/g, "'"),
      phone:  m[4] || null,   // null if NULL in SQL
      source: m[5],
    });
  }
  return leads;
}

// ─── Column finder ────────────────────────────────────────────────────────────
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
function findAllCols(headers, ...aliases) {
  const lower = aliases.map(a => a.toLowerCase().trim());
  const res = [];
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().trim();
    if (lower.includes(h) || lower.some(a => h.includes(a) || a.includes(h))) res.push(i);
  }
  return res;
}
function get(row, idx) {
  if (idx < 0 || idx === undefined) return '';
  return (row[idx] || '').toString().trim();
}
function parseAmount(val) {
  const n = parseFloat((val || '').toString().replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val.trim());
  if (!isNaN(d.getTime())) return d.toISOString();
  const m = val.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    const d2 = new Date(`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    if (!isNaN(d2.getTime())) return d2.toISOString();
  }
  return null;
}

// ─── Process Whop Closer tab ──────────────────────────────────────────────────
function processWhopCloser({ headers, rows }) {
  const iName    = findCol(headers, 'client name', 'name', 'full name', 'lead name');
  const iPhoneAll = findAllCols(headers, 'contact number', 'contact no', 'contact', 'phone', 'mobile', 'whatsapp', 'number');
  const iPhone   = iPhoneAll[0] ?? -1;
  const iCloser  = findCol(headers, 'closer', 'closer name', 'closed by', 'assigned closer');
  const iStatus  = findCol(headers, 'status', 'deal status', 'outcome', 'stage', 'closer stage');
  const iShow    = findCol(headers, 'show', 'show/ no show', 'show/no show', 'showup');
  const iQual    = findCol(headers, 'qualified', 'qual', 'qualified/ dis-qualified', 'qualified/dis-qualified');
  const iClosed  = findCol(headers, 'closed', 'won/lost', 'deal closed', 'close');
  const iNotes   = findCol(headers, 'notes', 'note', 'closer notes', 'objection', 'remarks');
  const iCash    = findCol(headers, 'cash collected', 'cash', 'collected');
  const iRev     = findCol(headers, 'revenue', 'amount', 'value', 'deal value', 'rev');
  const iDate    = findCol(headers, 'meeting date', 'date', 'close date', 'last updated');

  const all = [];
  for (const row of rows) {
    const name  = get(row, iName);
    const phone = normalizePhone(get(row, iPhone));
    if (!name && !phone) continue;

    const closedV = get(row, iClosed).toLowerCase();
    const statusV = get(row, iStatus).toLowerCase();
    const showV   = get(row, iShow).toLowerCase();
    const qualV   = get(row, iQual).toLowerCase();
    let closerStage = 'new';

    if      (closedV.includes('won')  || statusV.includes('won'))   closerStage = 'won';
    else if (closedV.includes('lost') || statusV.includes('lost'))  closerStage = 'lost';
    else if (qualV.includes('qual') && !qualV.includes('dis'))      closerStage = 'qualified';
    else if (qualV.includes('dis') || qualV.includes('not qual'))   closerStage = 'not_qualified';
    else if (showV.includes('no show') || showV === 'no')           closerStage = 'no_showup';
    else if (showV.includes('show')  || showV === 'yes')            closerStage = 'showup';
    else if (statusV.includes('follow'))                            closerStage = 'follow_up';
    else if (statusV.includes('book'))                              closerStage = 'call_booked';

    all.push({
      name, phone,
      closer:      get(row, iCloser),
      closerStage,
      cash:        parseAmount(get(row, iCash)),
      revenue:     parseAmount(get(row, iRev)),
      notes:       get(row, iNotes),
      meetingDate: parseDate(get(row, iDate)),
    });
  }
  return all;
}

// ─── 4-strategy matcher ───────────────────────────────────────────────────────
// Returns { result: 'matched'|'unmatched', strategy, leadId, leadName, leadPhone, confidence, allCandidates }
const FUZZY_THRESHOLD = 0.80; // minimum name similarity to count as a match

function matchCloserToLead(cd, leads, byExactPhone, byExactName) {
  const phone = cd.phone;
  const name  = normName(cd.name);

  // ── Strategy 1: Exact phone + exact name (already done in migration) ───────
  if (phone && byExactPhone.has(phone)) {
    const candidates = byExactPhone.get(phone);
    for (const l of candidates) {
      if (normName(l.name) === name) {
        return { strategy: 1, label: 'exact phone+name', confidence: 'HIGH',
                 leadId: l.id, leadName: l.name, leadPhone: l.phone };
      }
    }
  }
  if (byExactName.has(name)) {
    const l = byExactName.get(name);
    return { strategy: 1, label: 'exact name', confidence: 'HIGH',
             leadId: l.id, leadName: l.name, leadPhone: l.phone };
  }

  // ── Strategy 2: Phone-only (any normalization that yields same last-10) ─────
  if (phone) {
    const l10 = last10(phone);
    for (const l of leads) {
      if (!l.phone) continue;
      if (last10(l.phone) === l10) {
        return { strategy: 2, label: 'phone-only (last-10 match)', confidence: 'HIGH',
                 leadId: l.id, leadName: l.name, leadPhone: l.phone };
      }
    }
  }

  // ── Strategy 3: Fuzzy name match (≥80% similarity) ───────────────────────
  // We exclude instagram-outbound leads (they're DM-only, not relevant for Closer tab)
  const nonIg = leads.filter(l => l.source !== 'instagram-outbound');
  const nameCandidates = [];
  for (const l of nonIg) {
    const sim = nameSim(cd.name, l.name);
    if (sim.score >= FUZZY_THRESHOLD) {
      nameCandidates.push({ ...l, sim });
    }
  }
  if (nameCandidates.length === 1) {
    const l = nameCandidates[0];
    const conf = l.sim.score >= 0.92 ? 'HIGH' : l.sim.score >= 0.87 ? 'MEDIUM' : 'LOW';
    return { strategy: 3, label: `fuzzy name (${(l.sim.score*100).toFixed(0)}% ${l.sim.reason})`,
             confidence: conf, leadId: l.id, leadName: l.name, leadPhone: l.phone,
             allCandidates: nameCandidates };
  }
  if (nameCandidates.length > 1) {
    // Ambiguous — multiple candidates with similar names
    const best = nameCandidates.sort((a, b) => b.sim.score - a.sim.score)[0];
    const conf = best.sim.score >= 0.92 ? 'MEDIUM' : 'LOW'; // downgrade confidence when ambiguous
    return { strategy: 3, label: `fuzzy name AMBIGUOUS (${nameCandidates.length} candidates, best ${(best.sim.score*100).toFixed(0)}%)`,
             confidence: conf, leadId: best.id, leadName: best.name, leadPhone: best.phone,
             ambiguous: true, allCandidates: nameCandidates };
  }

  // ── Strategy 4: First name + last 4 digits of phone ──────────────────────
  if (phone && phone.length >= 4) {
    const firstA = name.split(' ')[0];
    const tail4  = phone.slice(-4);
    for (const l of nonIg) {
      if (!l.phone || l.phone.length < 4) continue;
      const firstB = normName(l.name).split(' ')[0];
      if (firstA === firstB && firstA.length >= 3 && l.phone.slice(-4) === tail4) {
        return { strategy: 4, label: `first-name + last-4 digits`, confidence: 'MEDIUM',
                 leadId: l.id, leadName: l.name, leadPhone: l.phone };
      }
    }
  }

  return { strategy: 0, label: 'no match', confidence: 'NONE', leadId: null };
}

// ─── SQL escaping ─────────────────────────────────────────────────────────────
function sq(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// ─── Generate UPDATE SQL ──────────────────────────────────────────────────────
function generateUpdateSQL(matches) {
  const lines = [];
  lines.push(`-- HTSyndicate: Closer re-match updates`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Updating ${matches.length} leads with closer stage / revenue data`);
  lines.push(`-- Paste into: Supabase → SQL Editor → New Query → Run`);
  lines.push('');

  for (const { cd, result } of matches) {
    if (!result.leadId) continue;
    lines.push(`-- [${result.label}] "${cd.name}" → ${result.leadId} ("${result.name_found}")`);

    const updates = [];
    updates.push(`  closer_stage = ${sq(cd.closerStage)}`);
    if (cd.closer) updates.push(`  closer = ${sq(cd.closer)}`);

    const maxVal = Math.max(cd.cash || 0, cd.revenue || 0);
    if (maxVal > 0) updates.push(`  value = GREATEST(COALESCE(value, 0), ${maxVal})`);

    // Append payment entries to existing payments jsonb
    const pmts = [];
    if (cd.cash    > 0) pmts.push(`{"type":"cash_collected","amount":${cd.cash},"at":"${new Date().toISOString()}"}`);
    if (cd.revenue > 0 && cd.revenue !== cd.cash)
      pmts.push(`{"type":"revenue","amount":${cd.revenue},"at":"${new Date().toISOString()}"}`);
    if (pmts.length > 0) {
      updates.push(`  payments = COALESCE(payments, '[]'::jsonb) || '[${pmts.join(',')}]'::jsonb`);
    }

    // Append notes
    const noteParts = [cd.notes];
    if (cd.cash    > 0) noteParts.push(`Cash Collected: ₹${cd.cash}`);
    if (cd.revenue > 0 && cd.revenue !== cd.cash) noteParts.push(`Revenue: ₹${cd.revenue}`);
    const extraNote = noteParts.filter(Boolean).join(' | ');
    if (extraNote) {
      updates.push(`  notes = COALESCE(notes || ' | ', '') || ${sq(extraNote)}`);
    }

    lines.push(`UPDATE leads SET`);
    lines.push(updates.join(',\n') + '\n');
    lines.push(`WHERE id = ${sq(result.leadId)};\n`);
  }

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mode = process.argv[2] || '--preview';
  const W = 74;

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  Closer Re-matcher — ${mode}`);
  console.log(`${'═'.repeat(W)}`);

  // ── Load DB leads from migration-leads.sql ──────────────────────────────
  console.log(`\n📂 Parsing migration-leads.sql for DB leads...`);
  const dbLeads = parseLeadsFromSQL(SQL_PATH);
  console.log(`   Found ${dbLeads.length} leads in SQL`);

  // Build exact lookups (for strategy 1 fast-path)
  const byExactPhone = new Map();
  const byExactName  = new Map();
  for (const l of dbLeads) {
    if (l.phone) {
      if (!byExactPhone.has(l.phone)) byExactPhone.set(l.phone, []);
      byExactPhone.get(l.phone).push(l);
    }
    const nn = normName(l.name);
    if (nn && !byExactName.has(nn)) byExactName.set(nn, l); // first one wins for exact name
  }

  // ── Read Closer tab ────────────────────────────────────────────────────
  console.log(`\n🔐 Authenticating with Google...`);
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`📊 Reading Whop "Closer" tab...`);
  const closerRaw = await readTab(sheets, WHOP_SHEET_ID, 'Closer');
  const allCloser = processWhopCloser(closerRaw);
  console.log(`   ${allCloser.length} usable Closer rows (after skipping blank rows from ${closerRaw.rows.length} total)`);

  // ── Run matching ───────────────────────────────────────────────────────
  const results = { 1: [], 2: [], 3: [], 4: [], 0: [] };
  const matches = [];

  for (const cd of allCloser) {
    const result = matchCloserToLead(cd, dbLeads, byExactPhone, byExactName);
    results[result.strategy].push({ cd, result });
    if (result.leadId) {
      matches.push({
        cd,
        result: { ...result, name_found: dbLeads.find(l => l.id === result.leadId)?.name || '' }
      });
    }
  }

  // Categorize: already matched (strategy 1) vs newly matched (strategies 2-4)
  const alreadyMatched = results[1];
  const newlyMatched   = [...results[2], ...results[3], ...results[4]];
  const stillUnmatched = results[0];

  // ── PREVIEW ────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  MATCHING RESULTS`);
  console.log(`${'═'.repeat(W)}`);
  console.log(`\n  Closer rows processed: ${allCloser.length}`);
  console.log(`  Strategy 1 (exact — already done in migration): ${alreadyMatched.length}`);
  console.log(`  Strategy 2 (phone-only last-10):                ${results[2].length} NEW`);
  console.log(`  Strategy 3 (fuzzy name ≥80%):                   ${results[3].length} NEW`);
  console.log(`  Strategy 4 (first-name + last 4 digits):        ${results[4].length} NEW`);
  console.log(`  Still unmatched:                                 ${stillUnmatched.length}`);
  console.log(`\n  ────────────────────────────────────────────────`);
  console.log(`  Total new matches recovered: ${newlyMatched.length}`);

  // ── Sample of new matches ──────────────────────────────────────────────
  if (newlyMatched.length > 0) {
    console.log(`\n${'═'.repeat(W)}`);
    console.log(`  SAMPLE OF NEW MATCHES (first ${Math.min(15, newlyMatched.length)})`);
    console.log(`${'═'.repeat(W)}`);
    console.log(`\n  ${'Closer Name'.padEnd(20)} ${'Lead Name (DB)'.padEnd(22)} ${'Strategy'.padEnd(12)} Conf  Stage`);
    console.log(`  ${'─'.repeat(70)}`);

    for (const { cd, result } of newlyMatched.slice(0, 15)) {
      const found = dbLeads.find(l => l.id === result.leadId);
      const conf = result.confidence.padEnd(6);
      const stage = cd.closerStage;
      const strat = `S${result.strategy}`.padEnd(12);
      console.log(`  ${(cd.name || '').slice(0, 19).padEnd(20)} ${(found?.name || '').slice(0, 21).padEnd(22)} ${strat} ${conf} ${stage}`);
      if (result.ambiguous) {
        console.log(`  ${''.padEnd(20)} ⚠ AMBIGUOUS — ${result.allCandidates.length} candidates: ${result.allCandidates.map(c => c.name).slice(0, 3).join(', ')}`);
      }
    }

    if (newlyMatched.length > 15) console.log(`  ... and ${newlyMatched.length - 15} more`);
  }

  // ── Confidence breakdown ───────────────────────────────────────────────
  if (newlyMatched.length > 0) {
    const confBreak = { HIGH: 0, MEDIUM: 0, LOW: 0, AMBIGUOUS: 0 };
    for (const { result } of newlyMatched) {
      if (result.ambiguous) confBreak.AMBIGUOUS++;
      else confBreak[result.confidence] = (confBreak[result.confidence] || 0) + 1;
    }
    console.log(`\n  Confidence breakdown of new matches:`);
    for (const [k, v] of Object.entries(confBreak)) if (v > 0) console.log(`    ${k.padEnd(10)} ${v}`);
  }

  // ── Still unmatched breakdown ──────────────────────────────────────────
  if (stillUnmatched.length > 0) {
    console.log(`\n${'═'.repeat(W)}`);
    console.log(`  STILL UNMATCHED (${stillUnmatched.length} rows)`);
    console.log(`${'═'.repeat(W)}`);
    console.log(`  ${'Name'.padEnd(22)} ${'Phone'.padEnd(14)} Closer         Stage`);
    console.log(`  ${'─'.repeat(60)}`);
    for (const { cd } of stillUnmatched.slice(0, 20)) {
      console.log(`  ${(cd.name || '').slice(0, 21).padEnd(22)} ${(cd.phone || '—').padEnd(14)} ${(cd.closer || '—').padEnd(14)} ${cd.closerStage}`);
    }
    if (stillUnmatched.length > 20) console.log(`  ... and ${stillUnmatched.length - 20} more`);
  }

  if (mode === '--preview') {
    console.log(`\n${'═'.repeat(W)}`);
    console.log(`  PREVIEW COMPLETE`);
    console.log(`  Newly matched: ${newlyMatched.length}  |  High confidence: ${newlyMatched.filter(r=>r.result.confidence==='HIGH').length}`);
    console.log(`  Run with --update to generate update-closer.sql`);
    console.log(`${'═'.repeat(W)}\n`);
    return;
  }

  // ── GENERATE UPDATE SQL ────────────────────────────────────────────────
  if (mode !== '--update') { console.log('Use --preview or --update'); process.exit(1); }

  // Only include non-ambiguous matches at HIGH or MEDIUM confidence
  // (flag LOW confidence / ambiguous for manual review)
  const toUpdate  = newlyMatched.filter(m => !m.result.ambiguous && m.result.confidence !== 'LOW');
  const needReview = newlyMatched.filter(m => m.result.ambiguous || m.result.confidence === 'LOW');

  const sql = generateUpdateSQL(toUpdate);
  const sqlPath = path.join(ROOT, 'update-closer.sql');
  writeFileSync(sqlPath, sql, 'utf8');

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  UPDATE COMPLETE`);
  console.log(`${'═'.repeat(W)}`);
  console.log(`\n  ✓ update-closer.sql generated (${toUpdate.length} UPDATE statements)`);
  console.log(`    → Supabase → SQL Editor → paste → Run`);
  if (needReview.length > 0) {
    console.log(`\n  ⚠ ${needReview.length} matches need manual review (ambiguous or LOW confidence):`);
    for (const { cd, result } of needReview.slice(0, 8)) {
      const found = dbLeads.find(l => l.id === result.leadId);
      console.log(`    "${cd.name}" → "${found?.name}" [${result.label}]`);
    }
  }
  console.log('');
}

main().catch(e => {
  console.error('\n✗ Fatal:', e.message);
  process.exit(1);
});
