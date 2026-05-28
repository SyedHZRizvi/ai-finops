# Multi-stage production Dockerfile for AI FinOps.
# Works on any container host: Render, Fly.io, Railway, AWS, GCP, on-prem.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app app \
 && mkdir -p /data && chown -R app:app /data

# Next.js standalone output
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma

USER app
EXPOSE 3000

# /data is a persistent volume; the SQLite DB lives there on platforms that
# support volumes (Render, Fly, Railway). For Postgres, override DATABASE_URL.
ENV DATABASE_URL=file:/data/ai-finops.db

# Apply migrations on startup (idempotent for SQLite db push).
CMD npx prisma db push --skip-generate --accept-data-loss && node server.js
