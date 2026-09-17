# Multi-stage build producing a minimal runtime image via Next.js's
# `output: "standalone"` (next.config.ts) — only the files actually needed
# to run the app get copied into the final stage, not the whole node_modules.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The Neon/Prisma Postgres database is unchanged by this deploy — `npm run
# build` runs `prisma migrate deploy` against it as its first step, so these
# need to be real, reachable connection strings at build time, not
# placeholders. Pass them via `docker compose build` (see docker-compose.yml,
# which reads them from .env.production) or `docker build --build-arg`.
ARG DATABASE_URL
ARG DIRECT_URL
ENV DATABASE_URL=${DATABASE_URL}
ENV DIRECT_URL=${DIRECT_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Next's standalone file-tracer follows static `require`/`import`s, but
# Prisma's query engine is loaded by a dynamic path it can miss — copying
# the generated client explicitly here is the standard fix (this is
# .prisma/client, the *generated* code + engine binary, not the `prisma`
# CLI package, which isn't needed at runtime since migrations already ran
# at build time above).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
