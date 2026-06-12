# Render worker image — Node 22 + FFmpeg (the only thing the CPU box needs;
# all GPU work is offloaded to Replicate). Build context is the repo root.
FROM node:22-bookworm-slim

# FFmpeg + ffprobe for assembly/captions
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Install deps using the workspace manifests (better layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --filter @producer/worker... --frozen-lockfile=false

# Source + build
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/worker apps/worker

WORKDIR /app/apps/worker
RUN pnpm build

CMD ["node", "dist/worker.cjs"]
