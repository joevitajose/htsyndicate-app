# Claude Code Prompts (Copy-Paste Ready)

This file is just the prompts. For the full walkthrough, see PLAYBOOK.md.

---

## Prompt 1 — Local setup

```
Install npm dependencies for this project, then start the dev server with `npm run dev`. After it starts, tell me the local URL.
```

---

## Prompt 2 — Supabase backend

Before pasting: get your Supabase URL and anon key from supabase.com → Project Settings → API.

```
Add Supabase as the backend for this dashboard.

My Supabase URL: PASTE_YOUR_URL_HERE
My Supabase anon key: PASTE_YOUR_ANON_KEY_HERE

Do the following:
1. Install @supabase/supabase-js
2. Create a `src/supabase.js` file with the client setup
3. Generate the SQL schema for all the data we use: users, leads, invoices, tasks, automations, punch_records, pipelines, setter_stages, closer_stages, leaves, bank_payments, notifications. Save it as `supabase-schema.sql`
4. Show me the SQL so I can paste it into Supabase SQL Editor
5. Replace the in-memory useState in App.jsx with Supabase queries — keep the UI exactly the same
6. Add real-time subscriptions so when one team member changes data, everyone else sees it within seconds
7. Replace the demo USERS array with Supabase Auth — keep the same signup form fields (name, email, password, role)
8. Test that I can sign up, sign in, and see data persist across refreshes
```

---

## Prompt 3 — Deploy to Vercel

```
Deploy this app to Netlify (NOT Vercel — the user doesn't want to add a credit card and Netlify free tier is card-free).

1. Install the Netlify CLI if it's not installed: npm install -g netlify-cli
2. Walk me through `netlify login` — tell me exactly what to do
3. Initialize the site with `netlify init`, link to GitHub if the user has a repo, otherwise create one fresh
4. Make sure my Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are set in Netlify
5. Run `netlify deploy --prod` 
6. When deployed, give me the production URL and confirm I can sign in there
7. Tell me how to add a custom domain later if I want one
```

---

## Prompt 4 — App icons

```
Generate 192x192 and 512x512 PNG icons from `public/favicon.svg` using a tool like `sharp`. Save them as `public/icon-192.png`, `public/icon-512.png`, and `public/icon-512-maskable.png` (the maskable one should have ~10% padding around the HT logo so it doesn't get cut off when iOS rounds the corners). After saving, rebuild and redeploy to Vercel.
```

---

## Prompt 5 — Google Sheets sync

```
Set up two-way Google Sheets sync for the Sales pipelines.

My Instagram pipeline sheet: https://docs.google.com/spreadsheets/d/1R70QYLiZskmeyGW8HTa7KUVJPbs8LeaL470njVeIqlM/edit
My Whop pipeline sheet: https://docs.google.com/spreadsheets/d/1lmHyBfLzGXaFRfslY44aUZT66mpoX1_JLUp9kpM4ZD4/edit

Do the following:
1. Walk me through creating a Google Cloud project and enabling the Sheets API
2. Help me create a service account, download the JSON key, and share both sheets with the service account email
3. Read the actual column structure from each sheet to understand what data is there
4. Map the columns to my dashboard's lead fields (setter pipeline)
5. Write a Vercel serverless function `/api/sync-sheets` that pulls from both sheets every 5 minutes and updates Supabase
6. Write a second function that pushes changes back to the sheets when leads are edited in the dashboard
7. Make sure the Instagram sheet maps to the "Instagram" pipeline and Whop to the "Whop" pipeline in my dashboard
8. Test by editing a lead in the dashboard and confirming the sheet updates within seconds
```

---

## Prompt 6 — Real Google login (optional)

```
Set up real Google OAuth login replacing the demo prompt-based handler.

1. Use Supabase Auth's built-in Google provider — easier than rolling my own
2. Walk me through enabling Google as an auth provider in Supabase dashboard
3. Help me create OAuth credentials in Google Cloud Console
4. Add the redirect URLs to Google Cloud
5. Update the "Sign in with Google" button in LoginPage to use Supabase Auth's signInWithOAuth
6. When a Google user signs in for the first time, prompt them to complete their profile (name, role, sales sub-role if applicable) before letting them into the dashboard
7. Test that I can sign in with my Google account
```

---

## Prompt 7 — Whop integration (optional, after sheets are working)

```
Wire up the Whop integration so course buyers automatically become leads.

1. Walk me through getting a Whop API key from whop.com/dashboard/developer
2. Add my Whop API key to Vercel env vars (don't put it in code)
3. Create a Vercel serverless function `/api/whop-sync` that calls api.whop.com/api/v1/memberships
4. For each new buyer, create a lead in Supabase with source="Whop (Course Buyer)" and auto-assign to Zoe (Setter)
5. Set up a webhook at `/api/whop-webhook` that receives Whop's live purchase events
6. If a buyer's email matches an existing lead, add it as a payment instead of creating a duplicate
7. Test by either triggering a manual sync or making a real Whop purchase
```

---

## Prompt 8 — WhatsApp / Slack notifications (optional)

```
Set up notifications for new leads.

1. When a new lead enters the dashboard (from sheets, Whop, or manual), send a Slack message or WhatsApp via Twilio
2. Walk me through whichever I prefer (Slack is free, Twilio costs ~₹0.50 per WhatsApp message)
3. Make the message include: lead name, source, deal value, and a link to open them in the dashboard
4. Add a settings page where admin can toggle notifications on/off and configure the channel
```

---

## Troubleshooting prompts

Use these any time something breaks. Just paste the error/screenshot.

**Build/deploy fails:**
```
The deploy failed with this error:
[PASTE ERROR]
Look at the relevant files and tell me how to fix it.
```

**Data not showing:**
```
After my last change, [X] is not showing in the dashboard. Read the relevant code, check the Supabase console output (use mcp Supabase tools if available), and tell me what's wrong.
```

**Real-time not working:**
```
When User A changes a lead, User B has to refresh to see the change. Real-time subscriptions aren't working. Check the Supabase realtime config and the subscription code in App.jsx.
```

**Mobile layout broken:**
```
On phone screens, [describe what's broken]. Inspect the responsive CSS in App.jsx (look for isMobile checks) and fix it.
```
