import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase env vars. Check .env.local");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── Field-name converters (DB snake_case ↔ App camelCase) ─── */

export const leadFromDb = (r) => ({
  id: r.id,
  name: r.name,
  company: r.company,
  email: r.email,
  phone: r.phone,
  source: r.source,
  pipeline: r.pipeline,  // ← ADD THIS LINE
  setterStage: r.setter_stage,
  closerStage: r.closer_stage,
  priority: r.priority,
  value: r.value,
  setter: r.setter,
  closer: r.closer,
  product: r.product,
  city: r.city,
  industry: r.industry,
  notes: r.notes,
  createdAt: r.created_at,
  tokenPaidAt: r.token_paid_at,
  firstPaidAt: r.first_paid_at,
  calls: r.calls ?? 0,
  callLogs: r.call_logs ?? [],
  followUps: r.follow_ups ?? [],
  setterHistory: r.setter_history ?? [],
  closerHistory: r.closer_history ?? [],
  payments: r.payments ?? [],
});

export const leadToDb = (l) => ({
  id: l.id,
  name: l.name,
  company: l.company,
  email: l.email,
  phone: l.phone,
  source: l.source,
  pipeline: l.pipeline,  // ← ADD THIS LINE
  setter_stage: l.setterStage,
  closer_stage: l.closerStage,
  priority: l.priority,
  value: l.value,
  setter: l.setter,
  closer: l.closer,
  product: l.product,
  city: l.city,
  industry: l.industry,
  notes: l.notes,
  created_at: l.createdAt,
  token_paid_at: l.tokenPaidAt,
  first_paid_at: l.firstPaidAt,
  calls: l.calls ?? 0,
  call_logs: l.callLogs ?? [],
  follow_ups: l.followUps ?? [],
  setter_history: l.setterHistory ?? [],
  closer_history: l.closerHistory ?? [],
  payments: l.payments ?? [],
});

export const leaveFromDb = (r) => ({
  id: r.id,
  by: r.by_name,
  from: r.from_date,
  to: r.to_date,
  type: r.type,
  reason: r.reason,
  status: r.status,
  submittedAt: r.submitted_at,
  decidedAt: r.decided_at,
  decidedBy: r.decided_by,
});

export const leaveToDb = (l) => ({
  id: l.id,
  by_name: l.by,
  from_date: l.from,
  to_date: l.to,
  type: l.type,
  reason: l.reason,
  status: l.status,
  submitted_at: l.submittedAt,
  decided_at: l.decidedAt,
  decided_by: l.decidedBy,
});

export const bankPaymentFromDb = (r) => ({
  id: r.id,
  amount: r.amount,
  from: r.from_name,
  remarks: r.remarks,
  receivedAt: r.received_at,
  method: r.method,
  txnId: r.txn_id,
  status: r.status,
  linkedLeadId: r.linked_lead_id,
  linkedInvoiceId: r.linked_invoice_id,
  bankAccount: r.bank_account,
});

export const bankPaymentToDb = (p) => ({
  id: p.id,
  amount: p.amount,
  from_name: p.from,
  remarks: p.remarks,
  received_at: p.receivedAt,
  method: p.method,
  txn_id: p.txnId,
  status: p.status,
  linked_lead_id: p.linkedLeadId,
  linked_invoice_id: p.linkedInvoiceId,
  bank_account: p.bankAccount,
});

export const notifFromDb = (r) => ({
  id: r.id,
  type: r.type,
  msg: r.msg,
  at: r.at,
  read: r.read,
  for: r.for_role,
  forUser: r.for_user,
  linkTo: r.link_to,
});

export const notifToDb = (n) => ({
  id: n.id,
  type: n.type,
  msg: n.msg,
  at: n.at,
  read: n.read,
  for_role: n.for,
  for_user: n.forUser,
  link_to: n.linkTo,
});

export const profileFromDb = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  subrole: r.subrole,
  dept: r.dept,
  provider: r.provider,
  createdAt: r.created_at,
  password: "••••••",  // never stored client-side
});

export const punchStateFromDb = (rows, histRows) => {
  // rows = punch_state table rows
  // histRows = punch_records table rows
  const result = {};
  rows.forEach((r) => {
    result[r.person_name] = {
      in: r.clocked_in,
      inT: r.in_time,
      outT: r.out_time,
      tasks: r.tasks_today,
      calls: r.calls_today,
      hrs: r.hours_today,
      prod: r.productivity,
      dept: r.dept,
      hist: histRows
        .filter((h) => h.person_name === r.person_name)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((h) => ({
          d: h.date,
          i: h.punch_in,
          o: h.punch_out,
          h: h.hours,
          t: h.tasks,
          c: h.calls,
          p: h.productivity,
          status: h.status,
          late: h.late,
        })),
    };
  });
  return result;
};
