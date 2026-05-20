# Integration Setup Guide

After deploying the dashboard (see README.md), use these prompts in Claude Code to wire up real integrations.

---

## Real Google Authentication

The Sign in with Google button in the dashboard currently does a demo flow. To make it real:

```
Set up Google OAuth for this app:
1. Walk me through creating a project at console.cloud.google.com
2. Enable Google Identity Services and get a Client ID
3. Add @react-oauth/google library
4. Replace the demo Google sign-in handler in LoginPage with real OAuth
5. When a user signs in with Google, look them up in Supabase by email,
   and create them if they don't exist
6. Store the Google access token so we can call Sheets API later
```

You'll need:
- Free Google Cloud account
- Add `http://localhost:5173` and your production URL to OAuth allowed origins
- ~30 minutes of setup time

---

## Real Google Sheets Sync

```
Wire up the Google Sheets integration in the IntegrationsP page:

1. When admin connects a sheet, request Sheets API permission via OAuth
2. Use the Sheets API to read rows from the connected sheet
3. Map columns (Name | Company | Email | Phone | Source | Value | Notes) 
   to lead records and insert them into Supabase
4. When a lead changes in the dashboard, push the change back to the sheet
5. Make "Sync Now" actually fetch + apply changes
6. Add a webhook so the sheet syncs automatically every 5 minutes
```

This requires the Sheets API to be enabled in your Google Cloud project.

---

## Real Whop Integration

Whop has both a REST API and webhooks for real-time updates.

```
Wire up the Whop integration:

1. When admin connects with their API key, store it encrypted in Supabase
2. Create a backend endpoint that calls api.whop.com/api/v1/memberships
   to list course buyers
3. For each new buyer, create a lead with source="Whop (Course Buyer)"
   and auto-assign to the default setter (currently Zoe)
4. Set up a webhook endpoint at /api/webhooks/whop that receives 
   purchase events live (Whop sends POST requests when someone buys)
5. Make "Sync Now" trigger a manual fetch from Whop API
6. Add logic: if a Whop buyer's email matches an existing lead, 
   add them as a payment instead of creating a duplicate
```

Whop API docs: https://docs.whop.com
Webhook events you want: `membership.went_valid`, `membership.cancel_at_period_end_changed`

You'll need:
- A Whop creator account
- API key from whop.com/dashboard/developer
- Server endpoint that Whop can POST to (Vercel serverless function works)

---

## Why these need Claude Code (not just artifact edits)

All three integrations need:
- **OAuth callback URL** that Google can redirect to → needs a server
- **API key storage** that's encrypted → needs a database (Supabase)
- **CORS-proof API calls** → most external APIs block direct browser calls, so calls have to go through a backend
- **Webhook receivers** → Whop POSTs events to your server, not to a browser
- **Background sync jobs** → "every 5 minutes pull from sheets" needs a cron job, not a tab being open

The dashboard UI is ready for all of this — the IntegrationsP page has the connect/disconnect/sync buttons wired up. Claude Code just needs to make the buttons call real APIs instead of the simulated stubs.

---

## Recommended order

1. Get the dashboard deployed and Supabase set up (main README)
2. Add real Google OAuth (above)
3. Wire up Google Sheets sync
4. Add Whop integration (most impactful for sales)
5. Then add Slack notifications, Razorpay, etc. as needed

Each step is 2-4 hours of Claude Code work.
