// PM2 process definition for the CloudPanel (no Docker) deployment.
// Port/host come from .env.production (PORT=3417, HOSTNAME=127.0.0.1) —
// this must match the "App Port" set on the CloudPanel site.
module.exports = {
  apps: [
    {
      name: "gmr-asset",
      cwd: __dirname + "/..",
      // Load .env.production into the environment, then start the
      // standalone server (it does not read env files by itself).
      script: "bash",
      args: ["-c", "set -a; . ./.env.production; set +a; exec node .next/standalone/server.js"],
      autorestart: true,
      max_memory_restart: "1G",
    },
  ],
};
