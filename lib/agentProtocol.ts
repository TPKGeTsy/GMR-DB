import { timingSafeEqual } from "node:crypto";
import type { ModuleStatus, SavedStates } from "./relayState";

// Shared by the web app's /api/modbus-agent/* routes, the cloud-mode actions
// and the Raspberry Pi agent. Plain functions, no framework imports.
//
// Protocol (all requests carry `Authorization: Bearer <MODBUS_AGENT_TOKEN>`):
//   GET  /api/modbus-agent/desired -> { desired: (boolean|null)[] }
//   POST /api/modbus-agent/report  <- { states: boolean[], modules: { configured, online }[] }

/** Agent counts as offline when its last report is older than this. */
export const AGENT_STALE_MS = 10_000;

export function isAgentFresh(reportedAt: Date | null | undefined, now: number = Date.now(), staleMs = AGENT_STALE_MS): boolean {
  return !!reportedAt && now - reportedAt.getTime() <= staleMs;
}

export function parseBearer(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return m ? m[1].trim() : null;
}

/** Constant-time comparison; false when either side is missing. */
export function tokensMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What the agent reports: every channel's state plus which modules answered. */
export interface AgentReport {
  states: boolean[];
  modules: ModuleStatus[];
}

/**
 * Validate a report body: exactly `channelCount` booleans plus one
 * `{ configured, online }` entry per module. Null when anything is off.
 */
export function parseReport(body: unknown, channelCount: number, moduleCount: number): AgentReport | null {
  if (typeof body !== "object" || body === null) return null;
  const { states, modules } = body as { states?: unknown; modules?: unknown };

  if (!Array.isArray(states) || states.length !== channelCount) return null;
  if (!states.every((s) => typeof s === "boolean")) return null;

  if (!Array.isArray(modules) || modules.length !== moduleCount) return null;
  const parsed: ModuleStatus[] = [];
  for (const m of modules) {
    if (typeof m !== "object" || m === null) return null;
    const { configured, online } = m as { configured?: unknown; online?: unknown };
    if (typeof configured !== "boolean" || typeof online !== "boolean") return null;
    parsed.push({ configured, online });
  }
  return { states: states as boolean[], modules: parsed };
}

/** Read back the `modules` JSON stored with the agent's last report (null if missing/malformed). */
export function parseStoredModules(value: unknown, moduleCount: number): ModuleStatus[] | null {
  if (!Array.isArray(value) || value.length !== moduleCount) return null;
  const out: ModuleStatus[] = [];
  for (const m of value) {
    if (typeof m !== "object" || m === null) return null;
    const { configured, online } = m as { configured?: unknown; online?: unknown };
    if (typeof configured !== "boolean" || typeof online !== "boolean") return null;
    out.push({ configured, online });
  }
  return out;
}

/** Coerce a `desired` payload into SavedStates; anything odd becomes null. */
export function normalizeDesired(value: unknown, channelCount: number): SavedStates {
  const arr = Array.isArray(value) ? value : [];
  return Array.from({ length: channelCount }, (_, i) => (typeof arr[i] === "boolean" ? (arr[i] as boolean) : null));
}
