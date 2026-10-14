# 🎭 Birthday Theatre — Remote Birthday Celebration

An organizer creates a theatre-style birthday surprise at **`/organize`**, gets a link like
`https://your-app.vercel.app/birthday/k3m9x2pq7d`, and sends it to the birthday person.

The link works for **1 hour**. Opening or refreshing it replays the whole show. After 1 hour, everything
(details, photos, music) is **deleted automatically**.

**The show, step by step**

1. Closed red velvet curtains → the birthday person **drags the golden rope down**
2. Curtains part sideways → stage is dark → **spotlight flickers on**
3. Stage layout: `Photo 1 · Messages · Photo 2` / `Photo 3 · Cake · Photo 4`
4. Messages appear one by one: **Happy Birthday {name}** → **{God} Bless You** → optional personal message
5. **Make a wish & blow the candles** (flames go out, smoke rises) → **the birthday song starts and loops**
   (default: [public/audio/happy-birthday.mp3](public/audio/happy-birthday.mp3); an organizer-uploaded song replaces it)
6. **Cut the Cake** → a knife follows the cursor → **hold RIGHT-click and drag down** through the cake
   (phones: press and drag a finger)
7. Crumbs fall from the blade while cutting → a flash runs down the cut → the halves swing open and crumbs
   spill onto the plate → **the surprise image rises out of the middle** (only if the organizer uploaded one; otherwise a cake slice) with sparkles → confetti + fireworks → "Watch the show again"

---

## 1. How it works (architecture)

```
ORGANIZER (/organize)                           BIRTHDAY PERSON (/birthday/:id)
     │                                                   │
     │ 1. POST /api/celebrations (name, god, msg)        │ GET /api/celebrations/:id
     ▼                                                   ▼
┌──────────────────────── Vercel (free) ─────────────────────────┐
│  React app (static)        /api/* serverless functions          │
│                            • uses SUPABASE_SERVICE_ROLE_KEY     │
│                            • checks expiry on every request     │
└────────────────────────────────┬────────────────────────────────┘
     │ 2. signed upload URLs     │ row + short-lived signed photo URLs
     ▼                           ▼
┌──────────────────────── Supabase (free) ───────────────────────┐
│  Postgres: celebrations table (RLS on, no public access)        │
│  Storage:  private "celebrations" bucket (photos + music)       │
│  pg_cron:  every 10 min → calls /api/cleanup                    │
└─────────────────────────────────────────────────────────────────┘
```

**Creating a show takes 3 steps** (see [src/lib/api.ts](src/lib/api.ts)):

1. **POST `/api/celebrations`**: the server saves the text as a `pending` row with `expires_at = now + 1h`.
   It returns a **signed upload URL** for each file, plus a secret **manage token**.
2. The **browser uploads the files directly to Supabase Storage** using those signed URLs.
   Photos are compressed in the browser first (~150–300 KB each). Uploading directly avoids
   Vercel's 4.5 MB request-body limit.
3. **PATCH `/api/celebrations/:id`**: the server checks that every file arrived, then marks the row `ready`.

**Why the organizer's browser is special:** only the manage token can end a show early.
That token is stored **only in the organizer's browser** (localStorage), and the server keeps only its SHA-256 hash.
Anyone with the share link can *watch* the show, but only the organizer's browser can *end* it.

### How the 1-hour expiry and deletion work

| Layer | When | What it does |
|---|---|---|
| **Expiry check** | every page load | The API returns `410 Gone` once `expires_at` has passed, so the link stops working at exactly 1 hour |
| **Signed URLs** | every page load | Photo/music URLs are signed to expire at the same moment as the show |
| **pg_cron → `/api/cleanup`** | every 10 min | Deletes files, then the row, for every expired show |
| **Cleanup on create** | each new show | Also removes up to 10 expired shows (in case the cron job ever stops) |
| **Vercel Cron** | once a day | Backup cleanup (the Hobby plan allows daily cron only) |

> Supabase does **not** delete rows by itself when a timestamp passes, which is why the cleanup job exists.
> Deleting is safe to repeat: if a run fails halfway, the next run finishes the job.

---

## 2. Tech stack (all free)

| Part | Technology | Free-tier notes |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | — |
| Styling | Tailwind CSS v4 | — |
| Animations | Motion (formerly Framer Motion) | curtains, spotlight, messages, cake split |
| Cake + knife | Hand-drawn SVG + Pointer Events | right-click / touch drag detection |
| Confetti | canvas-confetti | — |
| Backend API | Vercel Serverless Functions (`/api`) | Hobby plan, free |
| Database | Supabase Postgres | 500 MB |
| File storage | Supabase Storage (private bucket) | 1 GB |
| Scheduled cleanup | Supabase pg_cron + pg_net | included |
| Hosting | Vercel | free Hobby plan |

**Built-in guards to stay free:** at most 100 live shows at a time ([api/_lib/supabase.ts](api/_lib/supabase.ts)),
music ≤ 8 MB, files ≤ 10 MB (bucket limit), and photos compressed in the browser.

---

## 3. Project structure

```
api/                         ← Vercel serverless functions (Node)
  _lib/supabase.ts             server Supabase client (service role) + constants
  _lib/http.ts                 ids, manage-token hashing, error helpers
  _lib/cleanup.ts              delete files + row; delete all expired
  celebrations/index.ts        POST   create (returns signed upload URLs)
  celebrations/[id].ts         GET watch · PATCH finalize · DELETE end now
  cleanup.ts                   GET/POST cron endpoint (needs CRON_SECRET)
src/
  pages/OrganizePage.tsx       /organize - form, preview, share card
  pages/CelebrationPage.tsx    /birthday/:id - loads data, countdown badge
  components/experience/       the show: Curtains, Stage, Cake, Knife, confetti
  components/organize/         PhotoSlots, ShareCard, MyCelebrations
  lib/                         api client, image compression, localStorage, countdown
public/audio/happy-birthday.mp3  default song (served as a static file)
supabase/
  01_setup.sql                 table + RLS + private bucket
  02_cleanup_cron.sql          every-10-minutes cleanup job
vite.config.ts                 includes a small dev plugin that runs /api locally
vercel.json                    SPA routing + daily backup cron
```

---

## 4. Setup — step by step

### Step 1: Create the Supabase project

1. Go to <https://supabase.com> → sign in → **New project** (Free plan). Save the database password somewhere safe.
2. When the project is ready, open **SQL Editor → New query**, paste the whole of
   [supabase/01_setup.sql](supabase/01_setup.sql), and click **Run**.
   - ✅ Expected: `Success. No rows returned`
   - This creates the `celebrations` table, locks it down with RLS, and creates the private `celebrations` bucket
     (check **Storage** in the sidebar).
3. Open **Project Settings → API Keys** (or **API**) and copy:
   - **Project URL**: `https://xxxx.supabase.co`
   - **anon / publishable key**: public, used in the browser
   - **service_role / secret key**: ⚠️ **private, server only**

### Step 2: Environment variables

| Variable | Where it's used | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | Project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | anon / publishable key |
| `SUPABASE_URL` | `/api` (server) | Project URL (same as above) |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api` (server) | service_role / secret key |
| `CRON_SECRET` | `/api/cleanup` | any long random string (see below) |

> **Why two kinds of keys?** Vite puts every `VITE_*` variable **into the public JavaScript bundle**, so anyone can see it.
> The anon key is designed to be public (RLS blocks it from doing anything here).
> The service_role key bypasses RLS, so it must **never** start with `VITE_`.

Generate a `CRON_SECRET` (run in any terminal):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Run it locally (optional but recommended)

In the project folder, create a file named **`.env.local`** containing the 5 variables:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-random-string
```

Then, in the project folder:

```powershell
npm install      # installs dependencies (first time only)
npm run dev      # starts the app AND the /api functions
```

- ✅ Expected: `Local: http://localhost:5173/`. Open <http://localhost:5173/organize>.
- **👀 Preview** works even without Supabase: it plays the show with your local photos and nothing is uploaded.
- **✨ Create share link** needs Supabase. Without the env vars you'll see *"Server is not configured…"*.

`.env.local` is in `.gitignore`, so it never gets committed.

### Step 4: Push to GitHub

```powershell
git init
git add .
git commit -m "Birthday Theatre"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

### Step 5: Deploy on Vercel (free)

1. Go to <https://vercel.com> → **Add New → Project** → import your GitHub repo.
2. Framework preset: **Vite** (auto-detected). Leave build settings at their defaults
   (`npm run build`, output `dist`).
3. Under **Environment Variables**, add **all 5 variables** from Step 2.
4. Click **Deploy**. ✅ You get a URL like `https://birthday-theatre.vercel.app`.
5. Open `https://<your-app>.vercel.app/` and it redirects to `/organize`.

> If you change any `VITE_*` variable later, **redeploy**. Those values are baked in at build time.

### Step 6: Turn on automatic cleanup (every 10 minutes)

1. Open [supabase/02_cleanup_cron.sql](supabase/02_cleanup_cron.sql) and replace:
   - `YOUR-APP.vercel.app` → your real Vercel domain
   - `YOUR_CRON_SECRET` → the same `CRON_SECRET` value you put in Vercel
2. Paste it into the Supabase **SQL Editor** and click **Run**.
3. Check it after ~10 minutes:
   ```sql
   select * from cron.job_run_details order by start_time desc limit 5;   -- status = succeeded
   select status_code, content from net._http_response order by created desc limit 5;  -- 200 {"checked":..,"deleted":..}
   ```

### Step 7: Test the whole flow

1. `/organize` → fill in the form → **Create share link**
2. Open the link in a **different browser or an incognito window** (like the birthday person would)
3. Pull the rope → messages → blow the candles → hold right-click and drag down to cut the cake
4. Refresh → the whole show starts again ✅
5. Back on `/organize` → **End this show now** → the link now shows "No show found" ✅

---

## 5. API reference

| Method & path | Who | Body / headers | Response |
|---|---|---|---|
| `POST /api/celebrations` | organizer | `{ birthdayName, godName, customMessage, photoTypes[4], surprise?: {type}, audio?: {type,size} }` | `201 { id, manageToken, expiresAt, uploads[] }` |
| `PATCH /api/celebrations/:id` | organizer | header `x-manage-token` | `200` (show is live) |
| `GET /api/celebrations/:id` | anyone with link | — | `200 { birthdayName, godName, customMessage, photos[4], surprise, audio, expiresAt }` · `404` · `410` expired |
| `DELETE /api/celebrations/:id` | organizer | header `x-manage-token` | `204` |
| `GET\|POST /api/cleanup` | cron | `Authorization: Bearer <CRON_SECRET>` | `200 { checked, deleted }` |

---

## 6. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| "Server is not configured" | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing in Vercel (or `.env.local`) → add them and redeploy |
| "Supabase is not configured" | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing at **build** time → add them and redeploy |
| Upload fails with "Bucket not found" | `01_setup.sql` wasn't run (or failed) |
| Upload fails with "mime type not supported" | The file isn't an image/audio file |
| `/api/cleanup` returns 401 | `CRON_SECRET` in the SQL doesn't exactly match the one in Vercel |
| Music doesn't play | Browsers allow sound only after a user gesture. It starts on the "blow the candles" click; if blocked, a **▶ Play music** button appears |
| Cake doesn't cut | Hold the RIGHT mouse button (not left) and drag down through the cake. The gold bar under the cake shows progress; you can cut in several drags |
| Surprise image doesn't appear | It's shown only when the organizer uploads one in "Surprise inside the cake". Without an upload, a cake slice rises (there is no default image) |
| "column surprise_path does not exist" | Your table was created before this feature → re-run `supabase/01_setup.sql` (it's safe to re-run) |
| Supabase project "paused" | Free projects pause after a long period of inactivity → open the dashboard and click **Restore** |
