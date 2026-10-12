# Deploy on CloudPanel (no Docker) — wp.gmr.co.th

Server: Nginx (CloudPanel) terminates HTTPS and proxies to the app on
127.0.0.1:3417, which PM2 keeps running. DB/Blob/LINE stay as they are.

## One-time setup
1. DNS: A record `wp.gmr.co.th` -> server IP (check: `nslookup wp.gmr.co.th`).
2. CloudPanel -> Sites -> Add Site -> Node.js: domain `wp.gmr.co.th`,
   Node 22, **App Port 3417** (not 80), site user e.g. `gmr-asset`.
3. Site -> SSL/TLS -> New Let's Encrypt Certificate (after DNS resolves).
4. SSH as the site user:
   ```bash
   cd ~/htdocs/wp.gmr.co.th
   git clone https://github.com/TPKGeTsy/GMR-DB.git .   # dir must be empty; remove CloudPanel's placeholder files first
   cp .env.production.example .env.production           # fill every value; keep PORT=3417, AUTH_TRUST_HOST=true
   npm i -g pm2                                         # if pm2 missing (CloudPanel usually ships it)
   bash deploy/deploy.sh
   pm2 startup                                          # run the printed command once, so PM2 survives reboot
   ```
5. Cron: CloudPanel -> Site -> Cron Jobs, add the 2 lines in `deploy/crontab.txt`
   (use CRON_SECRET). Disable the old cron-job.org job.
6. LINE console -> Webhook URL `https://wp.gmr.co.th/api/line/webhook` -> Verify.
7. Rich menu: `SITE_URL=https://wp.gmr.co.th node scripts/setup-line-rich-menu.js`
8. Keep Vercel as fallback 1-2 weeks.

## Update later
```bash
bash ~/htdocs/wp.gmr.co.th/deploy/deploy.sh
```

## Troubleshooting
- 502 Bad Gateway: `pm2 logs gmr-asset` ; check PORT in .env.production == App Port.
- `EADDRINUSE`/`EACCES`: port taken or <1024. Use 3417 (try 3418).
- Build can't reach DB: `nc -zv db.prisma.io 5432` from the server (firewall).
- Login loops: `AUTH_TRUST_HOST=true` missing.
