# TubeForge

Faceless **and** avatar YouTube videos on autopilot — **your keys, your channel, pennies per render.**

This is the cost-effective rebuild of the "Claude + YouTube = $X/mo" creator stack: same assembly line (idea → script → voice → visuals → captions → assemble → publish), but every paid tool the gurus shill is swapped for an open model rented **per-second** from Replicate. No HeyGen, no ElevenLabs subscription, no Submagic, no Pictory. Built BYO-keys and tenant-ready so it can become a product.

## The swap (what it replaces)

| Stage | Shilled tool | TubeForge uses | Cost |
|---|---|---|---|
| Script | Jasper / prompt packs | **Claude** (Anthropic API) | cents |
| Voice | ElevenLabs $99/mo | **XTTS-v2** voice clone (Replicate) | per-sec |
| Avatar | HeyGen $89/mo | **Sonic** audio-driven talking head (Replicate) | per-sec |
| B-roll | Storyblocks sub | **Pexels + Pixabay** APIs | free |
| Images | Midjourney | **Flux** (Replicate) | ~$0.003 |
| Captions | Submagic $16/mo | **Whisper** (Replicate) → FFmpeg burn-in | per-sec |
| Edit/assembly | Pictory $25/mo | **FFmpeg** on a $7 Render worker | flat |
| Publish | their dashboard | **YouTube Data API** | free |

**Per video:** faceless ≈ $0.15–0.40 · avatar ≈ $1–4 (only the talking-head call is pricey, so avatar mode renders hero intro/outro segments and uses B-roll for the body). **Fixed infra:** ~$8–30/mo.

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

Neon (Postgres) · Vercel (+ Blob) · Render · Replicate · Anthropic · Pexels + Pixabay (free) · a Google Cloud OAuth client with the **YouTube Data API v3** enabled.

## Local setup

```bash
pnpm install
cp .env.example .env            # fill in keys
pnpm db:push                    # create tables in Neon
brew install ffmpeg             # worker dev only (Render image bakes it in)
pnpm web:dev                    # dashboard at http://localhost:3000
pnpm worker:dev                 # the pipeline worker
```

In the dashboard: **Connect YouTube** (one-time OAuth, stores a refresh token), then queue a topic, pick **Faceless** or **Avatar**, and the worker builds + publishes it.

For avatar / personal-brand mode, set the channel's `defaults.voiceRefUrl` (a ~10s clip of your voice) and `defaults.avatarImageUrl` (a portrait). For faceless, set `STOCK_VOICE_REF_URL` to any neutral narrator clip.

## Deploy

**Vercel** (dashboard): import the repo, set **Root Directory = `apps/web`**, add the env vars. `vercel.json` already kills preview builds and registers the hourly cron.

**Render** (worker): "New → Blueprint", point at this repo — `render.yaml` provisions the Docker worker. Add the same env vars in the Render dashboard.

Both planes share the one `DATABASE_URL` (Neon pooled) and `BLOB_READ_WRITE_TOKEN`.

## Toggle: faceless ⟷ avatar

Set per video in the dashboard (or `mode` on the job). `faceless` = stock/Flux B-roll. `avatar` = your cloned face + voice on the hero scenes. Same pipeline, one flag.

## Roadmap

- **Autopilot**: content-plan table → `/api/cron/tick` auto-enqueues N videos/day from a backlog.
- **Multi-tenant**: auth + per-customer encrypted `channels.secrets` (schema already supports it) + Stripe billing on the orchestration.
- **Shorts**: auto-cut 9:16 clips from each long-form master.
