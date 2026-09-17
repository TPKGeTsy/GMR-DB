# Deploying to the office server (Docker)

Moving off Vercel to run on the company's own machine. The **database
(Neon/Prisma Postgres) and file storage (Vercel Blob) stay exactly where
they are** — nothing to migrate there, you're only moving where the Next.js
app itself runs. Vercel Blob works fine from anywhere as long as you keep
using the same token; it's not tied to hosting on Vercel.

## What you need before starting

- [ ] SSH/remote access to the server, with Docker + Docker Compose installed
      (`docker --version` and `docker compose version` both work)
- [ ] The domain already pointing at the server's public IP (an A record) —
      confirm with `nslookup yourdomain.com` from your own laptop
- [ ] Ports 80 and 443 open/forwarded to the server (Caddy needs both —
      80 for the Let's Encrypt HTTP challenge, 443 for HTTPS itself)
- [ ] The real values for every variable in `.env.production.example`
      (same DB/Blob/LINE/Groq values already in use — ask whoever has the
      current Vercel project's env vars, or pull them from there)

## Steps

1. **Get the code onto the server**
   ```bash
   git clone https://github.com/TPKGeTsy/GMR-DB.git
   cd GMR-DB
   ```

2. **Create the env file**
   ```bash
   cp .env.production.example .env.production
   ```
   Fill in every value in `.env.production` (real DB connection strings,
   secrets, and `DOMAIN=yourdomain.com` — no `https://`, no trailing slash).

3. **Build and start**
   ```bash
   docker compose --env-file .env.production build
   docker compose --env-file .env.production up -d
   ```
   First build takes a few minutes (also runs `prisma migrate deploy`
   against the database as part of `npm run build` — if it fails here,
   double-check `DATABASE_URL`/`DIRECT_URL` in `.env.production` before
   anything else). Caddy will request its HTTPS certificate automatically
   on first start; give it a minute.

4. **Check it's actually up**
   ```bash
   docker compose logs -f app     # watch for "Ready" / errors
   docker compose logs -f caddy   # watch for the certificate being issued
   curl -I https://yourdomain.com
   ```
   Then open `https://yourdomain.com` in a browser and log in for real.

5. **Point the LINE bot at the new server** — in the
   [LINE Developers Console](https://developers.line.biz/console/), under
   your channel's Messaging API settings, change the Webhook URL to
   `https://yourdomain.com/api/line/webhook` and hit **Verify**.

6. **Fix the cron jobs.** Vercel's own cron (`vercel.json`) only runs on
   Vercel, so it no longer does anything once you're off it — replace it
   with the same external-pinger approach already used for the 5-minute
   reminder job, at [cron-job.org](https://cron-job.org) (or any similar
   service):
   - Update the **existing** job (currently hitting
     `.../api/cron/checkin-reminders` every 5 min) to point at
     `https://yourdomain.com/api/cron/checkin-reminders` instead.
   - **Add a new job**, once daily, hitting
     `https://yourdomain.com/api/cron/cleanup-checkin-photos` — this is
     what `vercel.json` used to trigger.
   - Both need the header `Authorization: Bearer <CRON_SECRET>`, using the
     same `CRON_SECRET` value you put in `.env.production`.

7. **Keep Vercel around for a bit** as a fallback (don't delete the
   project) until you're confident the new server is stable — just make
   sure step 5 and 6 above are pointed at the *new* domain so there's no
   confusion about which deployment is "live."

## Redeploying after a code change

```bash
git pull
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

## If something's wrong

- `docker compose logs -f app` — most application errors show up here.
  This is the same place to check for the "migrate deploy against
  production didn't take effect" issue this project has hit before on
  Vercel — here it runs at build time, so a failed build (not a silently
  stale one) is the visible symptom instead.
- Login/session weirdness (redirect loops, "unauthorized" right after
  logging in) → check `AUTH_TRUST_HOST=true` is actually set in
  `.env.production`; without it, NextAuth doesn't trust Caddy's forwarded
  headers.
- Certificate not issuing → re-check the DNS A record and that ports 80/443
  are actually reaching the container (not blocked by a firewall) —
  `docker compose logs -f caddy` will say why it failed.
