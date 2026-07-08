# Suede Cinema (formerly TubeForge / Producer)

Faceless **and** avatar YouTube videos on autopilot — **your keys, your channel, pennies per render.**

_Codebase name stays `producer` (package names, repo, `producer.suedeai.ai` domain) — this is a display-name rebrand only._

This is the cost-effective rebuild of the "Claude + YouTube = $X/mo" creator stack: same assembly line (idea → script → voice → visuals → captions → assemble → publish), but every paid tool the gurus shill is swapped for a model rented **per call**. No HeyGen, no ElevenLabs subscription, no Submagic, no Pictory. Built BYO-keys and tenant-ready so it can become a product.

## The swap (what it replaces)

| Stage | Shilled tool | Suede Cinema uses | Cost |
|---|---|---|---|
| Script | Jasper / prompt packs | **Claude** (Anthropic API) | cents |
| Scene video | Runway/Pika subs $30–95/mo | **Kie.ai** generative video (per clip) | cents/scene |
| Voice | ElevenLabs $99/mo | **XTTS-v2** voice clone (Replicate) | per-sec |
| Avatar | HeyGen $89/mo | **SadTalker** audio-driven talking head (Replicate) | per-sec |
| B-roll fallback | Storyblocks sub | **Pexels + Pixabay** APIs | free |
| Images | Midjourney | **Flux** (Replicate) | ~$0.003 |
| Captions | Submagic $16/mo | **Whisper** (Replicate) → FFmpeg burn-in | per-sec |
| Edit/assembly | Pictory $25/mo | **FFmpeg** on a $7 Render worker | flat |
| Publish | their dashboard | **YouTube Data API** | free |

**Per video:** faceless ≈ $0.15–0.40 with stock visuals, or add roughly a dollar of Kie.ai AI-generated scenes · avatar ≈ $1–4 (only the talking-head call is pricey, so avatar mode renders hero intro/outro segments and uses scene video for the body). **Fixed infra:** ~$8–30/mo.

## Generative AI visuals (Kie.ai)

Set `KIE_API_KEY` (kie.ai → API Keys, prepaid credits, 1 credit = $0.005) and every faceless scene gets a **bespoke cinematic AI shot** generated from the script's per-scene `visualPrompt`, instead of generic stock footage. Every AI-scene failure degrades gracefully: Kie → stock B-roll → Flux still with Ken Burns. Per-job opt-out: pick **Stock B-roll** in the dashboard's Visuals select.

The engine is one env var — `KIE_VIDEO_MODEL` — so you can chase the current best price/quality model without touching code (verified Jul 2026):

| Model | `KIE_VIDEO_MODEL` | Per clip | Why |
|---|---|---|---|
| **Seedance 1.0 Lite** (default) | `bytedance/v1-lite-text-to-video` | **$0.11** / 5s @720p | cheapest solid text-to-video on Kie |
| Kling 2.1 Standard | `kling/v2-1-standard` | $0.125 / 5s | better motion |
| Veo 3.1 Fast | `veo3_fast` | $0.30 / 8s | best-looking, native audio, 1080p |

A typical 6-minute faceless video runs ~8–12 scenes, so AI visuals add roughly **$0.90–1.30 per video** on the default engine. Clips are downloaded to Blob-backed storage during the render (Kie result URLs expire).

## Architecture

```
┌── Vercel ──────────────┐        ┌── Neon Postgres ──┐        ┌── Render (Docker) ─────────┐
│ Next.js dashboard      │        │ users · channels  │        │ worker loop                │
│  • queue topics        │──────▶ │ jobs  · assets    │ ◀──────│  claim queued job          │
│  • faceless/avatar     │ enqueue│ (the shared brain)│  poll  │  → script → voice → visuals│
│  • review / approve    │        └───────────────────┘        │  → assemble (FFmpeg)       │
│ /api/cron/tick (sched) │                 ▲                   │  → captions → thumbnail    │
│ /api/youtube/oauth     │                 │ status/assets     │  → publish to YouTube      │
└────────────────────────┘                 └───────────────────┤  GPU calls → Replicate     │
                                                                └────────────────────────────┘
```

- **Vercel** = control plane (dashboard, cron, OAuth) — CPU, cheap/free.
- **Render** = the heavy worker (FFmpeg + orchestration) — CPU only; **no GPU owned**.
- **Replicate** = all GPU work, billed by the second.
- **Neon** = the queue + state both planes read/write.
- **Vercel Blob** = every artifact (audio, clips, thumbnail, final MP4).

## Repo layout

```
packages/core      the sellable engine (providers, pipeline, db schema)
apps/web           Next.js dashboard + cron + YouTube OAuth  → Vercel
apps/worker        polling worker that drains the job queue  → Render (Docker, FFmpeg)
```

## Prerequisites (accounts)

Neon (Postgres) · Vercel (+ Blob) · Render · Replicate · Anthropic · Kie.ai (optional — generative AI scene video) · Pexels + Pixabay (free) · a Google Cloud OAuth client with the **YouTube Data API v3** enabled.

## Local setup

```bash
pnpm install
cp .env.example .env            # fill in keys
pnpm db:push                    # create tables in Neon
brew install ffmpeg             # worker dev only (Render image bakes it in)
pnpm web:dev                    # dashboard at http://localhost:3000
pnpm worker:dev                 # the pipeline worker
```

In the dashboard: queue a topic and pick **Faceless** or **Avatar** + a destination. By default it builds the MP4 for you to **download** (and a 9:16 Short); choose **YouTube** (one-time OAuth) to auto-publish instead.

For avatar / personal-brand mode, set the channel's `defaults.voiceRefUrl` (a ~10s clip of your voice) and `defaults.avatarImageUrl` (a portrait). For faceless, set `STOCK_VOICE_REF_URL` to any neutral narrator clip.

## Deploy

**Vercel** (dashboard): import the repo, set **Root Directory = `apps/web`**, add the env vars. `vercel.json` already kills preview builds and registers the daily autopilot cron.

**Render** (worker): "New → Blueprint", point at this repo — `render.yaml` provisions the Docker worker. Add the same env vars in the Render dashboard.

Both planes share the one `DATABASE_URL` (Neon pooled) and `BLOB_READ_WRITE_TOKEN`.

## Toggle: faceless ⟷ avatar

Set per video in the dashboard (or `mode` on the job). `faceless` = stock/Flux B-roll. `avatar` = your cloned face + voice on the hero scenes. Same pipeline, one flag.

## Autopilot

Create a **Content Plan** at `/plans` in the dashboard: give it a niche, a `videos/day` quota, a format (`faceless` or `avatar`), and a destination (`download` or `youtube`). That's the entire setup.

Every day the Vercel cron fires `/api/cron/tick`, which calls `runAutopilotTick` (the gated wrapper around `runDuePlans`). For each enabled plan that's due it:

1. Checks the topic backlog. If unused topics are fewer than today's quota, asks the LLM to generate a fresh batch from the niche (avoiding topics it's already used).
2. Claims `perDay` topics from the backlog and enqueues one job per topic.
3. Stamps `lastEnqueuedAt` so the plan doesn't double-fire on cron retries.

The always-on Render worker picks up the queued jobs and renders them the same as any manually-queued video. One bad plan never kills the whole tick — errors are captured per-plan.

Set a niche and the system generates topics, enqueues jobs, and renders videos indefinitely. Nothing else to configure.

> **Cadence note:** on Vercel Hobby the cron fires once per day, so plans enqueue once daily. Pro tier unlocks sub-daily crons.

### Controlling the cron

Three independent layers let you control when (and whether) autopilot runs — from coarse to fine:

**1. Schedule** (requires a redeploy) — change the cron expression in `apps/web/vercel.json` and redeploy. On Vercel Hobby the fastest schedule allowed is `0 9 * * *` (once per day at 09:00 UTC). Vercel Pro removes that restriction.

**2. Runtime controls** (no redeploy, live immediately) — the **Autopilot** card on the `/plans` dashboard exposes four knobs:

| Control | What it does |
|---|---|
| **On/Off toggle** | Master switch (`autopilotEnabled`). Cron still fires on schedule but returns `{ ran: false, skipped }` and does nothing. |
| **Min hours between runs** | `cronMinIntervalHours` — if the cron fires more often than this value, the tick is skipped. Useful insurance against accidental cron duplication or a Pro-tier tighter schedule. |
| **Max jobs per tick** | `maxJobsPerTick` — hard cap on how many jobs are enqueued in a single tick across all plans. |
| **Run now** | Fires the tick immediately, bypassing the interval throttle and the per-plan 20-hour gate. Use it to test a new plan or recover from a missed tick. |

When the master toggle is off or the interval hasn't elapsed, the cron route still completes normally and records queue stats — it just returns `{ ran: false, skipped: "…" }` rather than enqueuing any work.

**3. Hard kill** (deploy level) — set `AUTOPILOT_ENABLED=false` as a Vercel environment variable and redeploy. This disables autopilot entirely, overriding all dashboard settings. The `Run now` button on the dashboard also respects this env flag — it cannot override a hard kill.

## Roadmap

- **Multi-tenant / Stripe billing**: auth + per-customer encrypted `channels.secrets` (schema already supports it) + usage-based billing on the orchestration.
- **Shorts**: the `short` asset kind is already in the schema; auto-cutting 9:16 clips from each long-form master is a pipeline addition.
