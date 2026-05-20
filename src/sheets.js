/* ─── Google Sheets Sync Engine ─────────────────────────────────────────────
 * Uses Web Crypto API (RS256 JWT) to authenticate as a service account.
 * Set VITE_GOOGLE_CLIENT_EMAIL and VITE_GOOGLE_PRIVATE_KEY in .env.local.
 * Private key value: copy the "private_key" field from google-credentials.json.
 * ─────────────────────────────────────────────────────────────────────────── */

const CLIENT_EMAIL = import.meta.env.VITE_GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY   = import.meta.env.VITE_GOOGLE_PRIVATE_KEY;

export const MASTER_SHEET_ID = '1sXtllFsf8nVut-8TYOCTuXMtXRiuIetLRH2GuWJwDHo';
export const INSTAGRAM_SHEET_ID = '1onur9DhLRWHkAKnfPZaD_8SbqB9VRLMUXvQV85pgd38';
export const WHOP_SHEET_ID = '1Wjy0swzX-EOamlfVU6LGSf2Z0p-wURovtVUEgauvVzw';

export const MASTER_SHEET_NAME = 'Master';

/* Column order in master sheet (0-indexed):
   A=Name, B=Phone, C=Email, D=Pipeline, E=Stage, F=Source,
   G=Setter Stage, H=Closer Stage, I=Payment Amount, J=Notes,
   K=Tags, L=Setter, M=Closer, N=Created Date, O=lead_id, P=last_synced */
const COL = {
  name:0, phone:1, email:2, pipeline:3, stage:4, source:5,
  setterStage:6, closerStage:7, payment:8, notes:9, tags:10,
  setter:11, closer:12, created:13, leadId:14, lastSynced:15,
};
const RANGE = `${MASTER_SHEET_NAME}!A:P`;

const PIPELINE_MAP = {
  'instagram-outbound':'Instagram Outbound','instagram-inbound':'Instagram Inbound',
  'whop-course-buyer':'Whop Leads','webinar':'Webinar','miscellaneous':'Miscellaneous',
};
const STAGE_MAP = {
  new:'New',call_booked:'Booked',showup:'Show',no_showup:'No Show',
  follow_up:'Follow-up',qualified:'Qualified',not_qualified:'Not Qualified',
  won:'Won',lost:'Lost',
};

/* ─── JWT / Auth ─────────────────────────────────────────────────────────── */
function b64url(obj) {
  return btoa(JSON.stringify(obj)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlRaw(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

let _cryptoKey = null;
async function getCryptoKey() {
  if (_cryptoKey) return _cryptoKey;
  if (!PRIVATE_KEY) throw new Error('VITE_GOOGLE_PRIVATE_KEY not set in .env.local');
  const pem = PRIVATE_KEY.replace(/\\n/g,'\n');
  const body = pem.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
  const binary = atob(body);
  const buf = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i++) buf[i]=binary.charCodeAt(i);
  _cryptoKey = await crypto.subtle.importKey(
    'pkcs8', buf.buffer,
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},
    false, ['sign']
  );
  return _cryptoKey;
}

let _token = null;
let _tokenExp = 0;

export async function getAccessToken() {
  if (_token && Date.now() < _tokenExp - 30000) return _token;
  if (!CLIENT_EMAIL) throw new Error('VITE_GOOGLE_CLIENT_EMAIL not set in .env.local');
  const key = await getCryptoKey();
  const now = Math.floor(Date.now()/1000);
  const header = {alg:'RS256',typ:'JWT'};
  const payload = {
    iss:CLIENT_EMAIL,
    scope:'https://www.googleapis.com/auth/spreadsheets',
    aud:'https://oauth2.googleapis.com/token',
    iat:now, exp:now+3600,
  };
  const sigInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput));
  const jwt = `${sigInput}.${b64urlRaw(new Uint8Array(sig))}`;
  const res = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Auth failed: '+(data.error_description||data.error||JSON.stringify(data)));
  _token = data.access_token;
  _tokenExp = Date.now() + data.expires_in*1000;
  return _token;
}

/* ─── Read all rows from master sheet ───────────────────────────────────── */
async function readAllRows(token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}/values/${RANGE}`,
    {headers:{Authorization:`Bearer ${token}`}}
  );
  const data = await res.json();
  if (data.error) throw new Error('Sheets read error: '+data.error.message);
  return data.values || [];
}

/* Build the row values array for a lead */
function buildRow(lead) {
  const totalPaid = (lead.payments||[]).reduce((a,p)=>a+p.amount,0);
  return [
    lead.name||'', lead.phone||'', lead.email||'',
    PIPELINE_MAP[lead.source]||lead.source||'',
    STAGE_MAP[lead.setterStage]||lead.setterStage||'',
    lead.source||'',
    STAGE_MAP[lead.setterStage]||'',
    STAGE_MAP[lead.closerStage]||'',
    totalPaid>0?totalPaid:'',
    lead.notes||'',
    lead.heat||'',
    lead.setter||'',
    lead.closer||'',
    lead.createdAt?new Date(lead.createdAt).toISOString().split('T')[0]:'',
    lead.id||'',
    new Date().toISOString(),
  ];
}

/* ─── Sync a single lead ─────────────────────────────────────────────────── */
async function doSyncLead(lead, token, rows) {
  const rowData = buildRow(lead);
  const phone = (lead.phone||'').replace(/\D/g,'');
  let rowIdx = -1;

  // Find by lead_id first, then phone
  for (let i=1;i<rows.length;i++) {
    const rid = (rows[i][COL.leadId]||'').trim();
    if (rid === lead.id) { rowIdx = i; break; }
  }
  if (rowIdx<0 && phone.length>=10) {
    for (let i=1;i<rows.length;i++) {
      const rp = (rows[i][COL.phone]||'').replace(/\D/g,'');
      if (rp.slice(-10) === phone.slice(-10)) { rowIdx = i; break; }
    }
  }

  const rowNum = rowIdx+1;
  if (rowIdx>0) {
    // Update existing row
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}/values/${MASTER_SHEET_NAME}!A${rowNum}:P${rowNum}?valueInputOption=RAW`,
      {method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
       body:JSON.stringify({values:[rowData]})}
    );
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
  } else {
    // Append new row
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}/values/${MASTER_SHEET_NAME}!A:P:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
       body:JSON.stringify({values:[rowData]})}
    );
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
  }
}

/* ─── Sync queue (rate-limit: max 1 req/1.2s) ───────────────────────────── */
const queue = [];
let running = false;

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length>0) {
    const {lead,resolve,reject} = queue.shift();
    try {
      const token = await getAccessToken();
      const rows = await readAllRows(token);
      await doSyncLead(lead,token,rows);
      resolve({ok:true});
    } catch(e) {
      reject(e);
    }
    if (queue.length>0) await new Promise(r=>setTimeout(r,1200));
  }
  running = false;
}

export function syncLeadToSheet(lead) {
  return new Promise((resolve,reject)=>{
    queue.push({lead,resolve,reject});
    processQueue();
  });
}

export async function syncAllLeadsToSheet(leads,onProgress) {
  const token = await getAccessToken();
  const rows = await readAllRows(token);
  const results = [];
  for (let i=0;i<leads.length;i++) {
    const lead = leads[i];
    try {
      await doSyncLead(lead,token,rows);
      results.push({id:lead.id,ok:true});
    } catch(e) {
      results.push({id:lead.id,ok:false,err:e.message});
    }
    if (onProgress) onProgress(i+1,leads.length);
    if (i<leads.length-1) await new Promise(r=>setTimeout(r,1200));
  }
  return results;
}

export async function retryFailedSyncs(leads,failedIds,onProgress) {
  const failed = leads.filter(l=>failedIds.includes(l.id));
  return syncAllLeadsToSheet(failed,onProgress);
}

/* ─── Check for new leads in a sheet ────────────────────────────────────── */
export async function checkForNewLeads(sheetId,sheetName,lastKnownRow) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/'${sheetName}'!A:N`,
    {headers:{Authorization:`Bearer ${token}`}}
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const rows = data.values || [];
  if (rows.length<=1) return {newRows:[],totalRows:0};

  const startIdx = Math.max(1, lastKnownRow||1);
  const newRows = [];
  for (let i=startIdx;i<rows.length;i++) {
    const row = rows[i];
    const hasLeadId = row.length>14 && (row[14]||'').trim();
    const hasData = (row[0]||'').trim() || (row[1]||'').trim();
    if (!hasLeadId && hasData) {
      newRows.push({rowIndex:i,row});
    }
  }
  return {newRows,totalRows:rows.length-1};
}

/* Convert a sheet row to a lead object */
export function rowToLead(row,sheetSource) {
  return {
    name:(row[0]||'').trim(),
    phone:(row[1]||'').trim(),
    email:(row[2]||'').trim(),
    source:sheetSource||'webinar',
    setterStage:'new',
    closerStage:'',
    notes:(row[9]||row[4]||'').trim(),
    setter:(row[11]||'').trim(),
    closer:(row[12]||'').trim(),
    createdAt:row[13]?new Date(row[13]).toISOString():new Date().toISOString(),
    priority:'warm',
    value:0,
    payments:[],
    callLogs:[],
    followUps:[],
    setterHistory:[],
    closerHistory:[],
  };
}

export function isConfigured() {
  return !!(CLIENT_EMAIL && PRIVATE_KEY);
}
