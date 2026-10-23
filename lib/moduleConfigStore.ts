import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { MODULE_COUNT } from "@/lib/relayState";
import { normalizeOverrides, type ModuleOverride } from "@/lib/moduleSettings";
import { setModuleOverrides } from "@/lib/modbus";

// Module addresses edited on the /modbus page live in the database. The web
// server (direct mode) pushes them into lib/modbus.ts through
// ensureModuleConfig(); the Pi agent downloads them from /api/modbus-agent/desired.

/** One entry per module; null = nothing saved for it (use env / default). */
export async function loadModuleOverrides(): Promise<(ModuleOverride | null)[]> {
  const rows = await prisma.modbusModuleConfig.findMany();
  const raw: (ModuleOverride | null)[] = new Array(MODULE_COUNT).fill(null);
  for (const row of rows) {
    if (row.moduleIndex >= 0 && row.moduleIndex < MODULE_COUNT) {
      raw[row.moduleIndex] = { host: row.host, port: row.port, unitId: row.unitId };
    }
  }
  // Re-validated on the way out: a row edited by hand in the database must not
  // be able to point the server at a non-private address.
  return normalizeOverrides(raw, MODULE_COUNT);
}

const REFRESH_MS = 10_000;
const RETRY_AFTER_FAILURE_MS = 60_000;
const g = globalThis as unknown as { __moduleConfigNextLoad?: number };

/**
 * Make sure lib/modbus.ts is using the addresses saved in the database.
 * Cheap to call before every Modbus operation: it only re-reads every few
 * seconds (or immediately with `force`, after a save). If the database can't
 * be read, whatever was applied before stays in effect.
 */
export async function ensureModuleConfig(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now < (g.__moduleConfigNextLoad ?? 0)) return;
  try {
    setModuleOverrides(await loadModuleOverrides());
    g.__moduleConfigNextLoad = now + REFRESH_MS;
  } catch (error) {
    g.__moduleConfigNextLoad = now + RETRY_AFTER_FAILURE_MS;
    logError("Modbus module-config read failed:", error);
  }
}
