# For Your Developer Friend

Hey! Your friend asked me to build them a custom internal dashboard for their company (HTSyndicate). It's complete and working as a single React file. They want **your help to deploy it as a real app their team uses on their phones.**

Here's everything you need to know.

---

## What this is

A **2,000+ line single-file React dashboard** covering:
- Multi-pipeline sales CRM (setter + closer with separate stages, drag-and-drop)
- Finance with GST invoicing and bank feed
- Tasks (Kanban)
- Attendance tracker with Google Sheets sync
- Automations dashboard
- Leave requests with approval flow
- Notifications system
- Role-based auth (admin / sales setter / sales closer / finance / tech)
- Mobile-responsive (already works on phones)

It's in `src/App.jsx`. Don't be intimidated by the size — it's all self-contained, uses inline styles, no external CSS or component libraries beyond React.

**What's NOT done yet:**
- Real backend (currently all `useState` in memory)
- Real authentication (currently hardcoded USERS array)
- Real Google Sheets sync (currently UI only)
- Real Whop integration (currently UI only)
- Deployment to a URL

**That's what you're helping with.**

---

## The deal

Your friend has zero technical knowledge. They've agreed to give you their login credentials when needed (Supabase, Netlify/Vercel, GitHub) and you'll do the actual setup.

**Your role:** Get this from "files on disk" to "live URL their team uses on phones".

**Time estimate:** ~3 hours of focused work if you use Claude Code. Maybe 6-8 hours without.

---

## Path of least resistance (recommended)

### 1. Install Claude Code if you don't have it
```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Open this folder in Claude Code
```bash
cd htsyndicate-app
claude
```

### 3. Use the prompts in `PROMPTS.md`

The prompts there are battle-tested and walk Claude Code through the whole stack:

- **Prompt 1** — Get it running locally
- **Prompt 2** — Add Supabase backend (database + auth + real-time sync)
- **Prompt 3** — Deploy to Vercel
- **Prompt 4** — Generate proper app icons
- **Prompt 5** — Google Sheets two-way sync (two specific sheets baked into the prompt)
- **Prompt 6** — Real Google OAuth (optional)
- **Prompt 7** — Whop integration (optional)
- **Prompt 8** — Slack/WhatsApp notifications (optional)

Read `PLAYBOOK.md` for the full walkthrough with context.

---

## Card-free constraint

Your friend doesn't want to put credit cards on anything. Good news: you don't need to.

- **Supabase free tier**: no card required, 500MB Postgres + 50K MAU + real-time + auth — plenty for a small team
- **Netlify free tier**: no card required for hosting (use this instead of Vercel which now asks for a card sometimes)
- **GitHub**: free, no card

For Step 3 in `PROMPTS.md` — instead of Vercel, use Netlify. Tell Claude Code:

> Deploy to Netlify instead of Vercel. Connect via GitHub. Make sure Supabase env vars are set.

---

## What your friend needs to provide

When you get to certain steps, ask them for:

1. **GitHub email/password** — to push code to a repo
   *(Or they can create the GitHub account fresh when you ask)*

2. **Supabase project credentials** — they sign up, give you the URL + anon key from Project Settings → API
   *(Walk them through this on a screenshare, takes 5 minutes)*

3. **Netlify login** — they sign up with their GitHub account, give you access

4. **Google Cloud setup access** — for Sheets API. They'll need to be logged into their Google account while you do this together. About 15 minutes on a screenshare.

5. **The two Google Sheet URLs** for sales pipeline data:
   - Instagram: https://docs.google.com/spreadsheets/d/1R70QYLiZskmeyGW8HTa7KUVJPbs8LeaL470njVeIqlM/edit
   - Whop: https://docs.google.com/spreadsheets/d/1lmHyBfLzGXaFRfslY44aUZT66mpoX1_JLUp9kpM4ZD4/edit

**Important:** Tell your friend to share these sheets with the service account email Claude Code generates during Google Cloud setup.

---

## Data model gotchas

If you read `src/App.jsx`, you'll see the data shapes you need in Supabase:

- `leads` — `{ id, name, company, email, phone, source, setterStage, closerStage, priority, value, setter, closer, product, city, industry, notes, createdAt, tokenPaidAt, firstPaidAt, calls, callLogs[], followUps[], setterHistory[{stage, at, by}], closerHistory[{stage, at, by}], payments[{amount, date, what, type}], dialed }`
- `invoices` — standard fields with items[] line items, status enum
- `pipelines` — `{ id, name, sources[], color, icon }` — user-defined
- `setter_stages` and `closer_stages` — `{ id, l (label), c (color), position }` — user-defined order
- `tasks` — Kanban with `{ status: todo/in_progress/done }`
- `punch_records` — daily attendance with hist[] of entries
- `leaves` — `{ from, to, type, reason, status: pending/approved/rejected, by, submittedAt, decidedAt, decidedBy }`
- `bank_payments` — incoming bank webhook data with `linkedLeadId`, `linkedInvoiceId`
- `notifications` — `{ type, msg, at, read, for, forUser, linkTo }`

The Supabase schema gen in Prompt 2 should generate all of this. Sanity check it before applying.

---

## Architecture decisions worth knowing

1. **Icons are pure SVG path strings** in an `ICON_PATHS` object. The `<Ic t="..." />` component is a thin wrapper. This avoids React fragment issues in the artifact environment that originally hosted it. You can leave this alone — works fine in a real Vite project too.

2. **No external icon library, no Tailwind** — all inline styles with a `T` (theme) constant. Easier to migrate to a CSS-in-JS library later if you want.

3. **The `calcHeat()` function** uses a hardcoded `NOW_TS` — replace with `Date.now()` once real-time data is flowing.

4. **Drag-and-drop** uses native HTML5 drag events — no library. Mobile drag-and-drop is limited; if the friend wants mobile drag, you'll need `@dnd-kit/core`.

5. **Dual pipeline flow**: when setter marks a lead as "call_booked", it auto-creates that lead in the closer pipeline at "new" stage. See `moveSetter` function. Replicate this server-side as a database trigger or in your client code.

6. **PWA**: `vite-plugin-pwa` is already in `vite.config.js`. Service worker auto-registers on prod build. Tested working as installable PWA.

---

## Optional architectural upgrades you might want to suggest

After it's working:
- Replace HTML5 drag-and-drop with `@dnd-kit/core` for mobile DnD
- Replace inline styles with Tailwind for easier theming
- Add `react-router-dom` instead of the single-state `pg` page state
- Add Sentry for error tracking
- Add a CI pipeline (GitHub Actions) so deploys happen on every push

None of these are required to launch. Skip them initially.

---

## If something breaks

Just talk to Claude Code. Paste errors, ask questions. It can read every file in this folder and run commands.

---

## Files reference

```
htsyndicate-app/
├── README.md             ← Entry point
├── PLAYBOOK.md           ← Full walkthrough (read this end-to-end first)
├── PROMPTS.md            ← Copy-paste prompts (most important file)
├── INTEGRATIONS.md       ← Detail on Sheets/Whop/Google OAuth
├── QUICKSTART.md         ← Bare-minimum dev start
├── FOR_YOUR_DEVELOPER.md ← YOU ARE HERE
├── package.json          ← Vite + React 18 + electron-builder (for desktop)
├── vite.config.js        ← Has PWA plugin pre-configured
├── electron.js           ← Desktop wrapper (use later if needed)
├── index.html            ← Vite entry
├── .env.example          ← Template for SUPABASE keys
├── src/
│   ├── App.jsx           ← The entire dashboard
│   └── main.jsx          ← React mount
└── public/
    └── favicon.svg
```

---

## What to deliver back to your friend

When you're done, hand them:

1. **The live URL** — e.g. `https://htsyndicate.netlify.app`
2. **A short text** telling them:
   - This is your dashboard URL
   - Open in Safari (iPhone) or Chrome (Android), tap "Add to Home Screen"
   - Sign up with email + password the first time
   - Anyone else on the team can sign up the same way
3. **A note about Google Sheets sync** — explain how often it pulls and how to trigger a manual sync
4. **Their Supabase admin login** — so they can see all the data, export to CSV if needed, etc.

---

## Thanks

This dashboard took a lot of care to build. Your friend trusted you with the last mile. Make it work, and they'll have a real tool their team uses every day.

If you have questions about the dashboard architecture or any part of the code, you can open Claude Code right in this folder and just ask. It can read everything and explain.

Good luck 🚀
