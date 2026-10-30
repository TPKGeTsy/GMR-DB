#!/usr/bin/env bash
# One-shot installer for the GMR Modbus agent on a Raspberry Pi (Raspberry Pi OS / Debian).
# Safe to run again: it updates the code, keeps your .env, and restarts the service.
#
#   bash setup-pi.sh                    # asks for the web address and the agent token
#
# Optional (skip the questions / run unattended):
#   CLOUD_URL=https://wp.gmr.co.th MODBUS_AGENT_TOKEN=... bash setup-pi.sh
#
# What it does: installs Node.js 20 (if missing), clones the project from GitHub,
# installs the agent's two dependencies, writes agent/.env (mode 600), checks that the
# web app accepts the token, and installs a systemd service so the agent starts at boot.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/TPKGeTsy/GMR-DB.git}"
REPO_DIR="${REPO_DIR:-$HOME/GMR-DB}"
SERVICE="gmr-modbus-agent"
DEFAULT_CLOUD_URL="https://wp.gmr.co.th"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run this as your normal user (not root / not with sudo); it uses sudo itself where needed."
command -v sudo >/dev/null || die "sudo is required."

say "1/6  System packages"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates

say "2/6  Node.js 20+"
node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }
if ! command -v node >/dev/null || [ "$(node_major)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"
echo "node $(node -v) at $NODE_BIN"

say "3/6  Project code ($REPO_URL -> $REPO_DIR)"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi
AGENT_DIR="$REPO_DIR/agent"
[ -f "$AGENT_DIR/index.ts" ] || die "agent/index.ts not found in $REPO_DIR — has the agent been pushed to GitHub yet?"

say "4/6  Agent dependencies"
( cd "$AGENT_DIR" && npm install --no-audit --no-fund )

say "5/6  Settings ($AGENT_DIR/.env)"
ENV_FILE="$AGENT_DIR/.env"
if [ -f "$ENV_FILE" ] && [ -z "${CLOUD_URL:-}" ] && [ -z "${MODBUS_AGENT_TOKEN:-}" ]; then
  echo "Keeping the existing .env (delete it and re-run to change the web address or token)."
else
  if [ -z "${CLOUD_URL:-}" ]; then
    [ -t 0 ] || die "No terminal to ask on: set CLOUD_URL and MODBUS_AGENT_TOKEN in the environment."
    read -r -p "Web app address [$DEFAULT_CLOUD_URL]: " CLOUD_URL
    CLOUD_URL="${CLOUD_URL:-$DEFAULT_CLOUD_URL}"
  fi
  if [ -z "${MODBUS_AGENT_TOKEN:-}" ]; then
    [ -t 0 ] || die "No terminal to ask on: set MODBUS_AGENT_TOKEN in the environment."
    read -r -s -p "Agent token (the web server's MODBUS_AGENT_TOKEN; typing is hidden): " MODBUS_AGENT_TOKEN
    echo
  fi
  [ -n "$MODBUS_AGENT_TOKEN" ] || die "The token can't be empty."
  CLOUD_URL="${CLOUD_URL%/}"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Written by setup-pi.sh. Module addresses (IP / port / unit) are set on the web page
# (/modbus -> "ตั้งค่าโมดูล (IP)") and downloaded by the agent; the lines below are only
# fallbacks until the web app has sent them. See env.example for every option.
CLOUD_URL=$CLOUD_URL
MODBUS_AGENT_TOKEN=$MODBUS_AGENT_TOKEN
# MODBUS_HOST=
# MODBUS_HOST_2=
EOF
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE"
fi

# Does the web app accept this token? (the agent keeps retrying either way)
set -a; . "$ENV_FILE"; set +a
code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Authorization: Bearer $MODBUS_AGENT_TOKEN" "${CLOUD_URL%/}/api/modbus-agent/desired" || true)"
case "$code" in
  200) echo "Web app check: OK (token accepted)." ;;
  401) warn "Web app check: 401 — the token doesn't match MODBUS_AGENT_TOKEN on the web server (or that isn't set there yet)." ;;
  404) warn "Web app check: 404 — the web server doesn't have the agent API yet (deploy the latest code)." ;;
  000) warn "Web app check: no answer — is this Pi online, and is CLOUD_URL right? ($CLOUD_URL)" ;;
  *)   warn "Web app check: HTTP $code — look at the web server's logs." ;;
esac

say "6/6  Start at boot (systemd service '$SERVICE')"
sudo timedatectl set-timezone Asia/Bangkok || warn "Couldn't set the timezone (not important)."
sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null <<EOF
[Unit]
Description=GMR Modbus agent
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$AGENT_DIR
EnvironmentFile=$ENV_FILE
# The shared code in ../lib resolves modbus-serial from the agent's node_modules.
Environment=NODE_PATH=$AGENT_DIR/node_modules
ExecStart=$NODE_BIN node_modules/tsx/dist/cli.mjs index.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null
sudo systemctl restart "$SERVICE"
sleep 4

say "Status"
systemctl is-active "$SERVICE" || true
journalctl -u "$SERVICE" -n 15 --no-pager || true

cat <<EOF

Done.
  live log     : journalctl -u $SERVICE -f
  restart      : sudo systemctl restart $SERVICE
  update later : bash $AGENT_DIR/setup-pi.sh
Next: set each module's IP on the web page (/modbus -> "ตั้งค่าโมดูล (IP)").
The module must be on the same network as this Pi ($(hostname -I | awk '{print $1}')).
EOF
