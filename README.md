# GMR AssetManager

Internal tool for GMR: equipment/inventory tracking, face-scan attendance, car
booking, leave requests, project & wiring-diagram management — plus a LINE
bot for borrowing items, attendance reminders, and approvals on the go.

- **Live**: https://gmr-db.vercel.app
- **Repo**: https://github.com/TPKGeTsy/GMR-DB

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Server Actions) |
| UI | React 19, Tailwind CSS 4 |
| Database | PostgreSQL — Prisma ORM 6.19.3 (`@prisma/adapter-pg`) |
| Auth | NextAuth v5 (beta), Credentials provider (username + bcrypt password) |
| Face recognition | face-api.js (client-side, browser) |
| Diagrams / circuit sandbox | `@xyflow/react` (React Flow) |
| File storage | Vercel Blob (`@vercel/blob`) |
| Tests | Vitest |
| Chat bot | LINE Messaging API webhook |
| AI (LINE bot only) | Groq API (`qwen/qwen3.8-27b`, OpenAI-compatible endpoint) |
| Hosting | Vercel |

> ⚠️ Next.js 16 renamed `middleware.ts` → `proxy.ts`. This repo already uses
> `proxy.ts` — don't add a `middleware.ts` file, the two conflict and crash
> the dev server.

## Getting started

```bash
npm install
npx prisma generate
npm run dev
```

Open http://localhost:3000. You'll need a `.env` file (see below) — ask an
admin for one, or set up your own dev database (Neon free tier works fine).

## Environment variables

All of these live in `.env` (gitignored, never commit real values). Ask an
admin for the real `.env`, or fill in your own for local dev:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection string (used at runtime) |
| `DIRECT_URL` | Unpooled connection string (required by `prisma migrate`) |
| `AUTH_SECRET` | NextAuth session encryption secret |
| `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage (asset/vehicle/check-in photos) |
| `LINE_CHANNEL_SECRET` | LINE webhook signature verification |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE push/reply message API auth |
| `CRON_SECRET` | Shared secret so only Vercel Cron / the external pinger can trigger `/api/cron/*` |
| `GROQ_API_KEY` | Powers the LINE bot's free-form Q&A + borrow-intent extraction — get one free at [console.groq.com/keys](https://console.groq.com/keys) |

⚠️ **Local dev vs. production are separate databases.** `DATABASE_URL` in
`.env` points at a local/dev Neon branch by default. The real production
database (used by the deployed app) is a separate Prisma Postgres instance —
its connection string is commented out at the top of `.env`. To run any
script against production, override `DATABASE_URL`/`DIRECT_URL` for that one
command only, e.g. (PowerShell):

```bash
$env:DATABASE_URL = '<production connection string>'; npx prisma studio
```

Never edit `DATABASE_URL` itself to point at production — too easy to forget
to change it back.

## npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | `prisma migrate deploy && prisma generate && next build` — used by Vercel |
| `npm start` | Run the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite (`lib/*.test.ts`) |

## Admin / database scripts

- **`npx prisma studio`** — GUI to browse/edit every table in the browser
  (http://localhost:5555). Defaults to the local dev DB; override
  `DATABASE_URL` first to point it at production (see above). The
  in-app "delete row" button has a known client-side bug (`Cannot find
  module` error) — prefer the script below instead of clicking Delete in
  Studio.
- **`node scripts/delete-user.js <username>`** — deletes one user by
  username, including everything that cascades (check-ins, loans, leave
  requests, car bookings). If the user owns an Equipment Template, Wiring
  Diagram, or Project, delete/reassign those first — the database blocks
  the user delete otherwise rather than silently destroying real work. Same
  local-by-default / override-for-production rule as above.

## Database

Schema lives in `prisma/schema.prisma`. To change it:

```bash
npx prisma migrate dev --name <description>   # writes + applies a migration locally
```

Then apply the same migration to production (production does **not**
auto-migrate on deploy — `next build`'s `prisma migrate deploy` step runs,
but has occasionally not taken effect reliably, so always double check):

```bash
$env:DATABASE_URL = '<prod>'; $env:DIRECT_URL = '<prod>'; npx prisma migrate deploy
```

On Windows, `npx prisma generate` can fail with `EPERM: operation not
permitted, rename ... query_engine-windows.dll.node` if a dev server is
already running and holding the file lock. This is harmless — the client's
generated TypeScript types still update; only the (unchanged) native engine
binary fails to re-stage. Safe to ignore, or stop the dev server first if
it bothers you.

⚠️ **After any schema change, restart `npm run dev` if it was already
running.** Node caches the old `@prisma/client` module in memory — the
`prisma generate` step updates the files on disk, but a dev server started
*before* that won't see the new model/fields until restarted, and will
throw `Unknown field '...'` errors on any query touching them.

## Roles & permissions

Three roles, enforced in `auth.config.ts` (page-level) and inside each
Server Action (data-level — belt and suspenders):

- **USER** — check in/out, browse catalog, borrow/return items, request
  leave, book vehicles, view own profile.
- **OPERATOR** — USER, plus manage inventory (`/inventory`: create/edit/
  delete assets, adjust quantity).
- **ADMIN** — everything, plus `/users` (manage accounts, roles, registered
  faces) and `/attendance` (HR data across all employees, CSV export).

## Features by route

| Route | What it's for |
|---|---|
| `/checkin` | Face-scan check-in/out kiosk (liveness check: head-turn detection) |
| `/attendance` | Admin-only attendance table, customizable columns, CSV export |
| `/inventory`, `/catalog` | Equipment stock management / employee-facing browse & borrow |
| `/my-loans` | An employee's currently-borrowed items |
| `/carbook` | Vehicle booking, admin approval |
| `/leave` | Leave requests, admin approval |
| `/projects`, `/work-schedule` | Project tracking and scheduling — projects can have images, PDFs, and 3D/CAD files (STEP, STL, OBJ, IGES) attached, up to 50MB each |
| `/diagrams`, `/circuit` | Wiring diagram templates + free-form circuit sandbox (React Flow) |
| `/users` | Admin-only: accounts, roles, face registration |
| `/dashboard` | Overview landing page |

## LINE bot

Webhook: `app/api/line/webhook/route.ts`. Employees link their account once
(1:1 chat only, username + password) via `lib/line.ts`, then can:

- **Borrow items** — flexible natural language (`"ยืม สว่าน 2"`, or just
  `"ขอสว่านหน่อย"` and the bot asks what's missing next), with tap-to-pick
  Quick Reply buttons when a name matches multiple items.
- **Ask free-form questions** about their own attendance/loans/leave/car
  bookings (never anyone else's data) — answered by the Groq-powered
  assistant in `lib/lineAssistant.ts`.
- **Leave / car booking approvals** — routed to admins as a LINE push with
  tap-to-approve buttons; the requester gets notified of the outcome.
  Borrow/return stays self-service; admins just get an FYI push.
- **End-of-day / OT flow** — 15 min before 8 worked hours, a heads-up; at 8
  hours, asks "finish up or do OT?". Choosing OT asks for a reason (saved to
  that day's attendance note); choosing to finish checks them out immediately
  via LINE (no photo needed). If nobody responds by midnight, auto checks
  them out backdated to 18:00; if OT was confirmed, asks once more whether
  they're still at it.

AI model: **Groq** (`qwen/qwen3.8-27b`, OpenAI-compatible chat completions
API) — chosen over Gemini's free tier, which caps at 20 requests/day.

## Cron jobs

- **`/api/cron/cleanup-checkin-photos`** — runs once daily via
  `vercel.json` (Vercel Hobby plan allows one cron schedule). Purges
  check-in webcam snapshots to bound storage growth (the `CheckIn` record
  itself is kept — attendance math needs it).
- **`/api/cron/checkin-reminders`** — needs to run every few minutes, which
  Hobby's cron doesn't support. Triggered instead by an external pinger
  (cron-job.org) hitting the endpoint every 5 minutes with an
  `Authorization: Bearer <CRON_SECRET>` header. Handles the 15-min warning,
  8-hour OT prompt, and the midnight auto-checkout/re-ask described above.

Both routes check `CRON_SECRET` so they can't be triggered by anyone who
just finds the URL.

## Deployment

Push to `main` → Vercel auto-deploys. `npm run build` runs
`prisma migrate deploy` first, but this has occasionally not applied
migrations reliably on Vercel's build — after any schema change, verify (or
manually re-run `prisma migrate deploy` against production, see above)
rather than assuming it worked.

## Timezone

All check-in/attendance/leave/booking timestamps are stored as UTC instants
but every display and business-hour calculation pins `Asia/Bangkok`
explicitly (`lib/datetime.ts`) — the production server itself runs in UTC,
so anything using the ambient server timezone shows times ~7 hours off.
Always use the helpers in `lib/datetime.ts` rather than raw
`toLocaleString()`/`Date` timezone-dependent calls.
