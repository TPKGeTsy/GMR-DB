// Raspberry Pi agent: sits on the same LAN as the ETH-Modbus-IO16T module and
// does what the cloud web app can't — keep talking to the module.
//
//   cloud web app  --(database)-->  /api/modbus-agent/desired  -->  this agent  --Modbus TCP-->  module
//                  <--(database)--  /api/modbus-agent/report   <--  this agent  <--------------  module
//
// The module forgets every output ~2 s after the last Modbus request, so this
// process polls it constantly while anything is ON and re-applies the wanted
// state after any drop. It only makes OUTGOING connections (HTTPS to the web
// app, Modbus to the module): no port forwarding, and no database password on
// the Pi — just MODBUS_AGENT_TOKEN.
//
// If the internet goes away the agent keeps enforcing the last wanted state
// (cached in agent/desired.json, also used after a Pi reboot), so lights that
// were ON stay ON. See agent/README.md for setup.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COIL_COUNT, MODULE_COUNT, closeModbus, readAllCoils, reconcileCoils, setModuleOverrides } from "../lib/modbus";
import { normalizeDesired } from "../lib/agentProtocol";
import { createSupervisor } from "../lib/relaySupervisor";
import { normalizeOverrides, type ModuleOverride } from "../lib/moduleSettings";
import type { ModuleStatus, SavedStates } from "../lib/relayState";

const cloudUrl = (process.env.CLOUD_URL ?? "").replace(/\/+$/, "");
const token = process.env.MODBUS_AGENT_TOKEN ?? "";
// How often to ask the web app for new commands, and how often the main loop
// ticks (applies a change to the module / reports the result). Together they
// set how fast a button press reaches the lights: pickup ≤ poll + tick, then
// the report goes back within a tick. Lower = snappier but more requests.
const pollMs = Math.max(250, Number(process.env.AGENT_POLL_MS ?? 1000));
const tickMs = Math.max(100, Number(process.env.AGENT_TICK_MS ?? 400));
const reportEveryMs = Number(process.env.AGENT_REPORT_MS ?? 5000);
const cacheFile = process.env.AGENT_CACHE_FILE ?? join(__dirname, "desired.json");

if (!cloudUrl || !token) {
  console.error("CLOUD_URL and MODBUS_AGENT_TOKEN must be set (see agent/env.example).");
  process.exit(1);
}

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);
const lastLogged: Record<string, number> = {};
function logThrottled(scope: string, message: string) {
  const now = Date.now();
  if (now - (lastLogged[scope] ?? 0) < 60_000) return;
  lastLogged[scope] = now;
  log(`${scope}: ${message}`);
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const authHeaders = { authorization: `Bearer ${token}`, "content-type": "application/json" };

// What the Pi remembers between runs: the wanted state and the module
// addresses entered on the web page. Old files held just the state array.
interface Cache {
  desired: SavedStates;
  modules: (ModuleOverride | null)[];
}

function readCache(): Cache | null {
  try {
    const raw = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (Array.isArray(raw)) return { desired: normalizeDesired(raw, COIL_COUNT), modules: normalizeOverrides(null, MODULE_COUNT) };
    return {
      desired: normalizeDesired(raw.desired, COIL_COUNT),
      modules: normalizeOverrides(raw.modules, MODULE_COUNT),
    };
  } catch {
    return null;
  }
}

function writeCache(cache: Cache) {
  try {
    writeFileSync(cacheFile, JSON.stringify(cache));
  } catch (e) {
    logThrottled("cache", `could not write ${cacheFile}: ${errMsg(e)}`);
  }
}

// Module addresses last received from the web app. Until the first successful
// download they come from the cache, so a reboot during an internet outage
// still talks to the right modules. Without any, lib/modbus.ts falls back to
// this Pi's own .env.
let knownModules: (ModuleOverride | null)[] | null = readCache()?.modules ?? null;
if (knownModules) setModuleOverrides(knownModules);

// Wanted state from the cloud; falls back to the last good copy when the
// cloud is unreachable, so an internet outage never changes the lights.
async function loadDesired(): Promise<SavedStates> {
  try {
    const res = await fetch(`${cloudUrl}/api/modbus-agent/desired`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const desired = normalizeDesired(body.desired, COIL_COUNT);
    // `modules` is null when the web app couldn't read its settings table:
    // keep using what we already have rather than snapping back to .env.
    if (Array.isArray(body.modules)) {
      const incoming = normalizeOverrides(body.modules, MODULE_COUNT);
      if (JSON.stringify(incoming) !== JSON.stringify(knownModules)) {
        log(`module addresses from the web app: ${incoming.map((m, i) => `#${i + 1} ${m ? `${m.host}:${m.port}` : "(from .env)"}`).join(", ")}`);
      }
      knownModules = incoming;
      setModuleOverrides(incoming);
    }
    writeCache({ desired, modules: knownModules ?? normalizeOverrides(null, MODULE_COUNT) });
    return desired;
  } catch (e) {
    const cached = readCache();
    if (cached) {
      logThrottled("cloud", `unreachable (${errMsg(e)}), enforcing the last known state`);
      return cached.desired;
    }
    throw e;
  }
}

const supervisor = createSupervisor({
  channelCount: COIL_COUNT,
  loadDesired,
  reconcile: async (getDesired) => {
    const { restored, errors } = await reconcileCoils(getDesired);
    return { restored, errors };
  },
  intervalMs: tickMs,
  refreshMs: pollMs,
  onRestore: (channels) => log(`applied saved state to channel(s) ${channels.map((c) => c + 1).join(", ")}`),
  onError: (scope, error) => logThrottled(scope, errMsg(error)),
});

// Report the live state: right away when it changes, otherwise every few
// seconds as a heartbeat (the web app calls the agent offline if this stops).
// Each module is reported separately, so one being unplugged (or not
// installed yet) doesn't hide the other.
let lastPosted: { states: boolean[]; modules: ModuleStatus[] } | null = null;
let lastPostAt = 0;
let reporting = false;

async function report() {
  if (reporting) return;
  reporting = true;
  try {
    const snap = await readAllCoils();
    snap.errors.forEach((e, i) => {
      if (e) logThrottled(`module ${i + 1}`, errMsg(e));
    });
    const prev = lastPosted;
    const changed =
      !prev ||
      snap.states.some((v, i) => v !== prev.states[i]) ||
      snap.modules.some((m, i) => m.online !== prev.modules[i]?.online || m.configured !== prev.modules[i]?.configured);
    if (!changed && Date.now() - lastPostAt < reportEveryMs) return;
    const res = await fetch(`${cloudUrl}/api/modbus-agent/report`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ states: snap.states, modules: snap.modules }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    lastPosted = { states: snap.states, modules: snap.modules };
    lastPostAt = Date.now();
  } catch (e) {
    logThrottled("report", errMsg(e)); // cloud unreachable; retry next tick
  } finally {
    reporting = false;
  }
}

function shutdown(signal: string) {
  log(`${signal} received, stopping (outputs will drop within ~2 s once the agent is gone)`);
  supervisor.stop();
  closeModbus();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

log(
  `agent started: module 1 ${process.env.MODBUS_HOST ?? "192.168.1.12"}, module 2 ${process.env.MODBUS_HOST_2 || "(not configured)"}, cloud ${cloudUrl}`
);
supervisor.start();
setInterval(() => void report(), tickMs);
void report();
