# TubeForge — Account & Setup Runbook

You create the accounts (I can't accept ToS or verify email/phone/payment as you). This is the exact click-path for each, the free-tier pick, what to paste into `.env`, and the **gotchas that will bite you** — researched live June 2026.

## ⚠️ Read these three first — they change what's possible

1. **YouTube locks API-uploaded videos to PRIVATE until your Google Cloud project passes a compliance audit.** Setting `privacyStatus: "public"` returns HTTP 200 but YouTube silently forces it private. Public/unlisted publishing is impossible until you pass the audit (4–8+ weeks). **v1 reality: every video uploads private; you flip it public by hand in YouTube Studio, or wait for the audit.** TubeForge already defaults uploads to private.
2. **Google "Testing"-mode OAuth refresh tokens expire after 7 days.** Your channel connection silently dies weekly until you either re-connect or publish+verify the app. Plan to re-click "Connect YouTube" weekly until verified.
3. **Vercel Hobby cron fires at most once per day.** TubeForge's cron is set to daily (`0 9 * * *`) so it deploys on the free plan. The Render worker runs continuously anyway, so this only affects future auto-enqueue scheduling. Sub-daily cron needs Vercel Pro.

---

## 1. Anthropic (script brain)

1. [console.anthropic.com](https://console.anthropic.com) → Sign up → verify email.
2. **Settings → API Keys → Create Key** → copy the `sk-ant-...` (shown once).
3. **Settings → Billing** — new accounts get **$5 free credit**; add a card when it runs out (prepaid credits, auto-reload optional).

`ANTHROPIC_API_KEY=sk-ant-...` · `ANTHROPIC_MODEL=claude-fable-5`

**Cost lever:** `claude-fable-5` is $10/$50 per MTok (~$0.20/script). For a content farm, switch `ANTHROPIC_MODEL` to **`claude-sonnet-4-6`** ($3/$15) or **`claude-haiku-4-5`** ($1/$5) — 3–10× cheaper, plenty for scripts.

## 2. Replicate (all GPU, per-second)

1. [replicate.com](https://replicate.com) → sign up (GitHub) → a token is auto-created.
2. [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) → copy the `r8_...`.
3. [replicate.com/account/billing](https://replicate.com/account/billing) → add a card (required for inference models).

`REPLICATE_API_TOKEN=r8_...`

**Models are already wired and verified** in `packages/core/src/config.ts` — XTTS-v2 (voice), SadTalker (avatar), Flux-schnell (images), Whisper (captions). Nothing to set.

## 3. Neon (Postgres — the shared brain)

1. [console.neon.tech/signup](https://console.neon.tech/signup) → create a Project. Free tier: 0.5 GB + 100 compute-hrs/mo — ample.
2. **Connect** → toggle **Connection pooling ON** → copy that string (host has `-pooler`) → `DATABASE_URL`.
3. Toggle pooling OFF → copy the direct string (no `-pooler`) → `DATABASE_URL_UNPOOLED` (used only by `pnpm db:push`).

Both need `?sslmode=require`. Run `pnpm db:push` once to create the tables.

## 4. Vercel + Blob (dashboard, cron, storage)

1. [vercel.com](https://vercel.com) → sign up with GitHub → **Add New → Project** → import the repo.
2. **Set Root Directory = `apps/web`** (Edit on the import screen). Vercel auto-detects the pnpm workspace.
3. **Storage tab → Create Database → Blob** → it injects `BLOB_READ_WRITE_TOKEN` automatically.
4. Add all the other env vars (Settings → Environment Variables). `CRON_SECRET` = any long random string; Vercel auto-sends it as `Authorization: Bearer …` to the cron route.

Hobby tier: Blob 5 GB + 100 GB transfer/mo; functions cap at 300s (our heavy work is on Render, so fine).

## 5. Render (the worker)

1. [dashboard.render.com](https://dashboard.render.com) → sign up → connect GitHub.
2. **New → Blueprint** → pick the repo → Render reads `render.yaml`.
3. It prompts for every `sync: false` secret (DATABASE_URL, BLOB_READ_WRITE_TOKEN, ANTHROPIC_API_KEY, REPLICATE_API_TOKEN, PEXELS/PIXABAY) → paste them → **Deploy**.
4. **No free tier for workers — Starter is ~$7/mo** (billed per-second of uptime). No port/health-check needed.

## 6. Google OAuth + YouTube Data API (the fiddly one)

1. [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate) → new project (pick a billing account; quota usage is free).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → User Type **External** → fill app name + support/dev emails → add yourself under **Test users**. (See gotchas #1/#2 above re: Testing mode.)
4. **Credentials → Create Credentials → OAuth client ID → Web application.** Authorized redirect URIs:
   - `http://localhost:3000/api/youtube/callback` (dev)
   - `https://<your-vercel-url>/api/youtube/callback` (prod)
   Exact match — no trailing slash. Copy `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
5. Scopes used: `youtube.upload` + `youtube.readonly` (TubeForge requests `access_type=offline` + `prompt=consent` to force a refresh token).

`GOOGLE_CLIENT_ID=…` · `GOOGLE_CLIENT_SECRET=…` · `GOOGLE_OAUTH_REDIRECT=https://<app>/api/youtube/callback`

**Quota (Jun 2026):** ~100 uploads/day default. Raising it = the same compliance audit as the public-video unlock.

## 7. Pexels + Pixabay (free B-roll)

- **Pexels:** [pexels.com/api](https://www.pexels.com/api/) → Get Started → key goes in the `Authorization` header (no `Bearer`). Free: 200 req/hr, 20k/mo. No attribution required for monetized use; your video must add original value (voiceover/edit), not repost raw clips.
- **Pixabay:** [pixabay.com/api/docs](https://pixabay.com/api/docs/) → key shown on the docs page when logged in (passed as `?key=`). Free: 100 req/min; **cache responses 24h** (Terms). No attribution required. *Music* (not clips) may carry Content ID — irrelevant since we only pull video.

`PEXELS_API_KEY=…` · `PIXABAY_API_KEY=…`

---

## Order of operations

Accounts → fill `.env` → `pnpm install` → `pnpm db:push` → deploy web (Vercel) + worker (Render) → open the app → **Connect YouTube** → queue a video. First renders land **private** on your channel (gotcha #1).

---

## Autopilot — no extra setup

Autopilot rides the same daily cron already wired in step 4. No additional accounts, no new env vars, no extra Render services. Once the stack is deployed, go to **`/plans`** in the dashboard and create a Content Plan (niche + videos/day + format + destination). The next cron tick refills the topic backlog from the niche via the LLM and enqueues the day's jobs; the Render worker renders them as normal.

Because Hobby cron fires **once per day**, each plan enqueues its `perDay` quota once every 24 hours. If you need more frequent ticks, upgrade to Vercel Pro and tighten the cron schedule in `vercel.json`.

**Pausing and throttling** — to pause autopilot without touching a deploy, flip the on/off toggle in the **Autopilot** card at `/plans`. The cron still fires on schedule but skips all work and returns harmlessly. For a hard stop that survives any dashboard change, set `AUTOPILOT_ENABLED=false` in the Vercel environment and redeploy. The same `/plans` card also lets you set a minimum hours between runs (throttle), a max jobs per tick cap, and a **Run now** button that fires the tick immediately regardless of the interval.
