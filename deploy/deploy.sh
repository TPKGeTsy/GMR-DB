#!/usr/bin/env bash
# One-command update on the CloudPanel server. Run as the site user,
# from anywhere:  bash ~/htdocs/wp.gmr.co.th/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.production ] || { echo "Missing .env.production (copy .env.production.example)"; exit 1; }

echo "==> Pull latest code"
git pull --ff-only

echo "==> Install dependencies"
npm ci

echo "==> Build (runs prisma migrate deploy + next build)"
set -a; . ./.env.production; set +a
npm run build

echo "==> Copy static assets into the standalone bundle"
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "==> (Re)start with PM2"
if pm2 describe gmr-asset >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.js --update-env
else
  pm2 start deploy/ecosystem.config.js
fi
pm2 save

echo "==> Done. Health check:"
sleep 3
curl -s -o /dev/null -w "HTTP %{http_code} from http://127.0.0.1:${PORT:-3417}\n" "http://127.0.0.1:${PORT:-3417}/login" || true
