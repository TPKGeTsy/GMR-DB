import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { COIL_COUNT, reconcileCoils } from "@/lib/modbus";
import { savedFromRows } from "@/lib/relayState";
import { createSupervisor, type Supervisor } from "@/lib/relaySupervisor";
import { ensureModuleConfig } from "@/lib/moduleConfigStore";

// Real wiring for the relay supervisor (database + Modbus modules). The logic
// itself lives in lib/relaySupervisor.ts so it can be tested with fakes.
//
// One supervisor per server process, kept on globalThis so `next dev` hot
// reloads and the separate server-action / route-handler bundles share it.

const g = globalThis as unknown as { __relaySupervisor?: Supervisor; __relayErrorLog?: Record<string, number> };

// A module that is unplugged would otherwise log an error every few seconds.
function logErrorThrottled(scope: string, error: unknown) {
  const last = (g.__relayErrorLog ??= {});
  const now = Date.now();
  if (now - (last[scope] ?? 0) < 60_000) return;
  last[scope] = now;
  logError(`Modbus ${scope}:`, error);
}

export function getRelaySupervisor(): Supervisor {
  return (g.__relaySupervisor ??= createSupervisor({
    channelCount: COIL_COUNT,
    loadDesired: async () => savedFromRows(await prisma.modbusRelayState.findMany(), COIL_COUNT),
    reconcile: async (getDesired) => {
      await ensureModuleConfig(); // addresses edited on the /modbus page
      const { restored, errors } = await reconcileCoils(getDesired);
      return { restored, errors };
    },
    intervalMs: Number(process.env.MODBUS_SUPERVISE_MS ?? 3000),
    refreshMs: Number(process.env.MODBUS_SUPERVISE_REFRESH_MS ?? 60_000),
    onRestore: (channels) =>
      console.warn(
        JSON.stringify({
          level: "warn",
          scope: "modbus-restore",
          message: `Restored channel(s) ${channels.map((c) => c + 1).join(", ")} from the saved state`,
          timestamp: new Date().toISOString(),
        })
      ),
    onError: logErrorThrottled,
  }));
}

/**
 * Start the background check that re-applies the saved state after a server
 * restart or network drop. Safe to call repeatedly. Opt out with
 * MODBUS_AUTO_RESTORE=off. Never runs on Vercel: a serverless instance can't
 * reach the LAN modules and wouldn't stay alive to keep them fed anyway.
 */
export function startRelaySupervisor() {
  if (process.env.VERCEL) return;
  // Agent mode: the Raspberry Pi does the supervising, not this web server.
  if ((process.env.MODBUS_MODE ?? "direct").toLowerCase() === "agent") return;
  if ((process.env.MODBUS_AUTO_RESTORE ?? "on").toLowerCase() === "off") return;
  getRelaySupervisor().start();
}
