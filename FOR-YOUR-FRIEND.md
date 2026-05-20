# HTSyndicate Dashboard — Handoff Brief

Hi! A friend asked you to help set this up. Here's everything you need.

## TL;DR

A complete React dashboard for an Indian sales/operations company is built and ready in this zip. You need to:

1. Deploy it to the internet
2. Connect it to a real database
3. Hand back a URL their team can install on phones (PWA)

**Estimated time:** 1–2 hours of your time.
**Cost to them:** ₹0 (free tiers, no credit card needed anywhere).
**What they need to do:** Sign up for accounts you'll create on their behalf; install the final URL on team phones.

---

## What's been built

A working dashboard at `src/App.jsx` (~2,000 lines) with:

- Login + signup with role-based access (admin / sales setter / sales closer / finance / tech)
- Sales: dual setter/closer pipelines, drag-and-drop kanban, multi-pipeline support (Instagram, Whop, LinkedIn, etc.), call logging, payment tracking, lead detail with full history, hot/warm/cold heat states
- Finance: invoice generation with GST split, professional invoice preview (PDF-ready), bank feed view, recurring clients
- Automations: 12 workflows with pause/resume
- Tasks: kanban with dept filters
- Attendance: 5 views (today, history, calendar heatmap, monthly summary, per-person)
- Leaves: request flow + admin approval
- Team management: admin can change roles, remove members
- Integrations page: Google Sheets + Whop setup (UI ready, sync logic pending real backend)
- Responsive: works on mobile, drawer-nav on phones
- PWA-ready: vite-plugin-pwa already configured, manifest in vite.config.js

Tech: React 18 + Vite, no UI lib (custom components), no external CSS framework (inline styles).
Currently uses in-memory `useState` — needs Supabase backing for real persistence.

---

## Suggested path

### Step 1 — Local sanity check (5 min)

```bash
cd htsyndicate-app
npm install
npm run dev
```

Visit `localhost:5173`. Try logging in with `boss@htsyndicate.com` / `admin123`. Confirm everything renders.

### Step 2 — Get them to create accounts (15 min, on a call together)

Hop on a call with your friend. Have them create accounts on:

1. **GitHub** — github.com (they'll need this anyway for ownership)
2. **Supabase** — supabase.com (no card needed for free tier)
3. **Netlify** — netlify.com (hosting; no card for free tier)

Have them give you collaborator/owner access to the Supabase project. For Netlify, easiest is they share the deploy URL after first deploy.

### Step 3 — Wire up Supabase (45 min in Claude Code)

The dashboard uses these data shapes (all in App.jsx, easy to grep):
- `users`, `leads`, `invoices`, `tasks`, `automations`, `punch_records`
- `pipelines`, `setter_stages`, `closer_stages`
- `leaves`, `bank_payments`, `notifications`

In Claude Code from this folder, prompt:

```
Add Supabase as the backend. Here are my credentials:
URL: <project URL>
Anon key: <anon key>

Tasks:
1. npm install @supabase/supabase-js
2. Create src/supabase.js with the client
3. Generate supabase-schema.sql for all tables with proper foreign keys, RLS policies (everyone authenticated can read; admins can write all; sales role can write leads/calls/payments; finance can write invoices/bank_payments)
4. Replace USERS array with Supabase Auth — signup form maps to a `profiles` table with name/role/subrole/dept
5. Replace each useState mock with a Supabase query + realtime subscription. Keep the UI exactly the same.
6. For the LoginPage Google button, use supabase.auth.signInWithOAuth({provider:'google'}) — instruct me how to enable Google provider in Supabase dashboard
7. Show me the SQL to run in Supabase SQL Editor

Don't refactor the UI. Don't add new components. Just data layer.
```

Run the generated SQL in Supabase SQL Editor. Update App.jsx with the changes Claude Code proposes. Test signup → confirm row appears in `profiles` table → confirm leads persist across refresh.

### Step 4 — Deploy to Netlify (15 min)

Connect the repo to Netlify (or use `netlify deploy --prod`). Add env vars:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Build command: `npm run build`. Publish dir: `dist`.

PWA manifest is already configured in `vite.config.js` via `vite-plugin-pwa`. After deploy, the install prompt works on Android Chrome and iOS Safari (via Add to Home Screen).

### Step 5 — Generate app icons (5 min)

```
Generate proper PWA icons from public/favicon.svg using sharp:
- public/icon-192.png (192x192)
- public/icon-512.png (512x512)  
- public/icon-512-maskable.png (512x512 with 10% safe-zone padding for iOS)

Then rebuild and redeploy.
```

### Step 6 — Optional: Google Sheets sync (1 hour)

User has two sheets they want bidirectional sync with:
- Instagram: https://docs.google.com/spreadsheets/d/1R70QYLiZskmeyGW8HTa7KUVJPbs8LeaL470njVeIqlM/edit
- Whop: https://docs.google.com/spreadsheets/d/1lmHyBfLzGXaFRfslY44aUZT66mpoX1_JLUp9kpM4ZD4/edit

Recommended: Netlify Functions + Google Sheets API with a service account. Run on cron via Netlify scheduled functions (every 5 min pull, plus on-write push). The IntegrationsP component in App.jsx already has the UI — just needs the API endpoints wired.

User does NOT have Google Cloud set up yet. Walk them through service account creation + sheet sharing.

---

## Things to know about this user

- **Zero technical background.** They asked great product questions but can't write code or use a terminal.
- **They run a sales org in Mumbai.** Sales is the #1 priority; everything else is supporting.
- **Don't over-engineer.** They asked for minimal UI multiple times. Keep changes focused on what they asked for.
- **The dashboard already has thoughtful demo data** — keep it during dev, but the final deploy should start clean.
- **Stages, pipelines, lead fields are user-editable in the UI.** Don't hardcode anything from the demo into schema.
- **They want this on their team's phones as a PWA**, not an App Store app. Add to Home Screen flow is enough.

---

## Files in this zip

- `src/App.jsx` — the entire dashboard (don't refactor unless something is broken)
- `src/main.jsx` — React mount point
- `index.html` — entry HTML with viewport + PWA meta
- `vite.config.js` — Vite + PWA plugin configured
- `package.json` — dependencies
- `electron.js` — desktop wrapper (ignore for now; not needed for PWA)
- `public/favicon.svg` — placeholder logo (HT in amber)
- `PROMPTS.md` — original copy-paste prompts from Claude (use these or your own)
- `INTEGRATIONS.md` — extra prompts for Sheets/Whop/Google login
- `PLAYBOOK.md` — long walkthrough I wrote for the user; you can skim or skip

---

## When you're done, hand them back

1. **The live URL** (e.g. `https://htsyndicate.netlify.app`)
2. **Their Supabase project URL** (so they can manage data later)
3. **A quick text** showing iPhone & Android team how to install:
   - iPhone: open URL in Safari → Share → Add to Home Screen
   - Android: open URL in Chrome → menu → Install app

That's it. They should be able to onboard their team themselves from there.

---

## If you want to be a hero

Add these later (each is one focused Claude Code prompt):

- Real Google OAuth via Supabase Auth (replaces the demo prompt-based handler in LoginPage)
- Whop API integration (Webhook + cron sync to api.whop.com/api/v1/memberships)
- Razorpay webhook for auto-invoice on bank payment
- Slack notification for new leads
- WhatsApp Business API alerts

All of these are wired up in the UI already — just need backend endpoints.

Thanks for helping! 🙏
