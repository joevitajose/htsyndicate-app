# HTSyndicate Dashboard → Real App

You have a complete, working dashboard. This guide takes it from "file on your computer" to **"my whole team uses it on their phones."**

---

## What's in this folder

```
htsyndicate-app/
├── PLAYBOOK.md         ← YOU ARE HERE — read this end to end
├── PROMPTS.md          ← Copy-paste prompts for Claude Code
├── INTEGRATIONS.md     ← Sheet sync, Whop, Google login (when ready)
├── QUICKSTART.md       ← For developers who want to skip ahead
├── package.json        ← npm dependencies (don't edit)
├── vite.config.js      ← Web bundler config (don't edit)
├── electron.js         ← Desktop app wrapper (don't edit)
├── index.html          ← Web entry point (don't edit)
├── src/
│   ├── App.jsx         ← Your entire dashboard, 2000+ lines
│   └── main.jsx        ← React mount point
└── public/
    └── favicon.svg     ← App icon
```

The only files you'll read are: **PLAYBOOK.md** and **PROMPTS.md**.

---

## What you'll have when finished

After ~3 hours total following this playbook:

✓ Real website live at a URL like `https://htsyndicate.vercel.app`
✓ Your team types that URL on their phones, taps "Add to Home Screen", and now it's an app icon on their phone
✓ Real signup/login that remembers users
✓ All data saved in a real database (not lost on refresh)
✓ Multiple people can use it at the same time and see each other's updates
✓ Free or near-free (~₹0-1,500/month for a small team)

---

## Before you start: install these (5 minutes)

### 1. Node.js
Go to https://nodejs.org → download the **LTS version** → install it.

To verify it worked, open Terminal (Mac) or PowerShell (Windows) and type:
```
node --version
```
You should see something like `v20.x.x`.

### 2. Claude Code
Go to https://docs.claude.com/en/docs/claude-code/quickstart and follow the install steps for your OS.

Verify it worked:
```
claude --version
```

### 3. A code editor (recommended)
Install VS Code from https://code.visualstudio.com. Free, works everywhere.

---

## Step 1: Open this folder in Claude Code (2 minutes)

1. Move this `htsyndicate-app` folder somewhere you'll find it. Desktop is fine.
2. Open Terminal/PowerShell.
3. Navigate to the folder:
   ```
   cd ~/Desktop/htsyndicate-app
   ```
   (Replace path if you put it somewhere else.)
4. Start Claude Code:
   ```
   claude
   ```

You should see Claude Code initialize and tell you it can see the files in this folder.

---

## Step 2: Get the dashboard running locally (5 minutes)

In Claude Code, paste this prompt:

> **Prompt 1:** Install npm dependencies for this project, then start the dev server with `npm run dev`. After it starts, tell me the local URL.

Claude Code will run `npm install` (takes 1-2 minutes), then start the server. It'll give you a URL like `http://localhost:5173`.

Open that URL in your browser. **You should see the login page.**

Sign in with one of the demo accounts (admin/admin works) and verify everything looks right. This is your dashboard, running on your computer.

Press `Ctrl+C` in the terminal to stop the server when you're done looking.

---

## Step 3: Add a real database (45 minutes)

The dashboard currently keeps data in memory — it resets on refresh. We need a real database so data persists and multiple team members can share it.

**3a.** Create a free Supabase account:
1. Go to https://supabase.com
2. Click **Start your project** → sign in with GitHub or Google
3. Click **New project**:
   - Name: `htsyndicate`
   - Database password: generate one and **save it somewhere safe**
   - Region: pick the one closest to you (Mumbai for India)
4. Wait ~2 minutes for it to provision
5. Once it's ready, click **Project Settings** (gear icon) → **API** in the sidebar
6. Copy the **Project URL** and the **anon public key** — you'll need these in a moment

**3b.** Back in Claude Code, paste this prompt:

> **Prompt 2:** Add Supabase as the backend for this dashboard.
> 
> My Supabase URL: `paste-your-url-here`
> My Supabase anon key: `paste-your-anon-key-here`
> 
> Do the following:
> 1. Install @supabase/supabase-js
> 2. Create a `src/supabase.js` file with the client setup
> 3. Generate the SQL schema for all the data we use: users, leads, invoices, tasks, automations, punch_records, pipelines, setter_stages, closer_stages, leaves, bank_payments, notifications. Save it as `supabase-schema.sql`
> 4. Show me the SQL so I can paste it into Supabase SQL Editor
> 5. Replace the in-memory useState in App.jsx with Supabase queries — keep the UI exactly the same
> 6. Add real-time subscriptions so when one team member changes data, everyone else sees it within seconds
> 7. Replace the demo USERS array with Supabase Auth — keep the same signup form fields (name, email, password, role)
> 8. Test that I can sign up, sign in, and see data persist across refreshes

Claude Code will work through this. Follow its instructions when it asks you to paste the SQL into Supabase (it'll tell you exactly where to click).

When done, refresh your dashboard. Sign up as a real user. Add a lead. Refresh again. **The lead should still be there.** That's your real database working.

---

## Step 4: Deploy it to the internet (15 minutes)

Now we put it online so your team can reach it.

**4a.** Sign up for Vercel (free):
1. Go to https://vercel.com
2. Click **Sign Up** → use the same GitHub/Google account you used for Supabase if possible
3. That's it. You don't need a paid plan.

**4b.** In Claude Code:

> **Prompt 3:** Deploy this app to Vercel.
> 
> 1. Install the Vercel CLI if I don't have it
> 2. Walk me through `vercel login` — tell me exactly what to do
> 3. Run `vercel --prod` and let me approve each step
> 4. Make sure my Supabase environment variables are set in Vercel
> 5. When deployed, give me the production URL and confirm I can sign in there
> 6. Tell me how to add a custom domain later if I want one

Claude Code will guide you through. When done, you'll have a URL like:
```
https://htsyndicate-dashboard.vercel.app
```

**Open that URL on your phone right now.** Sign in. Confirm it works on mobile.

---

## Step 5: Turn it into a phone app (15 minutes)

Your team types the URL, taps "Add to Home Screen", and now it's an app icon on their phone. No App Store needed.

**5a.** Generate proper app icons:

> **Prompt 4:** Generate 192x192 and 512x512 PNG icons from `public/favicon.svg` using a tool like `sharp`. Save them as `public/icon-192.png`, `public/icon-512.png`, and `public/icon-512-maskable.png` (the maskable one should have ~10% padding around the HT logo so it doesn't get cut off when iOS rounds the corners). After saving, rebuild and redeploy to Vercel.

**5b.** Show your team how to install:

**iPhone team members:**
1. Open the Vercel URL in **Safari** (must be Safari, not Chrome on iOS)
2. Tap the Share button (square with arrow up)
3. Scroll down → tap **Add to Home Screen**
4. Tap **Add**
5. The HTSyndicate icon now appears on their home screen like any app

**Android team members:**
1. Open the URL in **Chrome**
2. Tap the menu (3 dots top right)
3. Tap **Install app** or **Add to Home screen**
4. Confirm
5. Icon appears on home screen

**On both platforms, when they tap the icon:** the app opens full-screen with no browser bar. Looks and feels like a native app. Works offline (basic). Sends push notifications (with more setup).

---

## Step 6: Bring in your real Sales data (1 hour)

You have those two Google Sheets. Let's wire them up.

> **Prompt 5:** Set up two-way Google Sheets sync for the Sales pipelines.
> 
> My Instagram pipeline sheet: https://docs.google.com/spreadsheets/d/1R70QYLiZskmeyGW8HTa7KUVJPbs8LeaL470njVeIqlM/edit
> My Whop pipeline sheet: https://docs.google.com/spreadsheets/d/1lmHyBfLzGXaFRfslY44aUZT66mpoX1_JLUp9kpM4ZD4/edit
> 
> Do the following:
> 1. Walk me through creating a Google Cloud project and enabling the Sheets API
> 2. Help me create a service account, download the JSON key, and share both sheets with the service account email
> 3. Read the actual column structure from each sheet to understand what data is there
> 4. Map the columns to my dashboard's lead fields (setter pipeline)
> 5. Write a Vercel serverless function `/api/sync-sheets` that pulls from both sheets every 5 minutes and updates Supabase
> 6. Write a second function that pushes changes back to the sheets when leads are edited in the dashboard
> 7. Make sure the Instagram sheet maps to the "Instagram" pipeline and Whop to the "Whop" pipeline in my dashboard
> 8. Test by editing a lead in the dashboard and confirming the sheet updates within seconds

Claude Code will guide you through Google Cloud setup. The first time is the slowest — it gets easier.

---

## Step 7: Real Google Login (30 minutes, optional)

Right now login is email + password. To enable "Sign in with Google" properly:

> **Prompt 6:** Set up real Google OAuth login replacing the demo prompt-based handler.
> 
> 1. Use Supabase Auth's built-in Google provider — easier than rolling my own
> 2. Walk me through enabling Google as an auth provider in Supabase dashboard
> 3. Help me create OAuth credentials in Google Cloud Console
> 4. Add the redirect URLs to Google Cloud
> 5. Update the "Sign in with Google" button in LoginPage to use Supabase Auth's signInWithOAuth
> 6. When a Google user signs in for the first time, prompt them to complete their profile (name, role, sales sub-role if applicable) before letting them into the dashboard
> 7. Test that I can sign in with my Google account

---

## You're done

At this point your team has:
- A real working web app at a URL they can bookmark
- A "real app" icon on their phones via Add to Home Screen
- Real-time data sync — when Zoe books a call, Arjun sees it instantly
- Real authentication
- Their actual Sales data flowing in from Google Sheets

---

## Common questions

**"What if I get stuck?"**
Just tell Claude Code what's wrong. It can read your files, run commands, and debug. Examples:
- "The signup page shows 'Invalid email or password' even though I just signed up — what's wrong?"
- "Vercel deploy failed with this error: [paste error]"
- "My team can't see real-time updates — they have to refresh"

**"How much will this cost?"**
- Vercel free tier: handles small teams forever
- Supabase free tier: 500MB database, 50k monthly active users — fine for most companies
- Google Cloud: free tier covers Sheets API for normal usage
- **Total: ₹0/month for a team under ~10 people**

If you grow past free tiers later: Vercel Pro is ~$20/month, Supabase Pro is $25/month. So worst case ~₹4,000/month.

**"Will my team need to download anything?"**
No. They just open the URL on their phone or computer and use it. The "Add to Home Screen" is optional but recommended.

**"What if I want a real native app in the App Store / Play Store?"**
After everything above is working, you can wrap the web app with Capacitor.js for native iOS/Android. That's another guide and requires Apple Developer account ($99/year) for iOS. Most teams don't need this.

**"What about backups?"**
Supabase automatically backs up your database daily on the free tier. You can also export to CSV anytime from the Supabase dashboard.

**"Can I edit the dashboard after deploying?"**
Yes. Edit `src/App.jsx`, run `vercel --prod` again, and changes go live in ~30 seconds.

---

## Need help mid-way?

Each prompt in PROMPTS.md is standalone — if something goes wrong, you can re-run that section without redoing the earlier ones. And Claude Code is built to debug live; just tell it what you see.

You've got this. 🚀
