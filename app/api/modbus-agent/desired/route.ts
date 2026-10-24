import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { parseBearer, tokensMatch } from "@/lib/agentProtocol";
import { COIL_COUNT, savedFromRows } from "@/lib/relayState";
import { loadModuleOverrides } from "@/lib/moduleConfigStore";
import type { ModuleOverride } from "@/lib/moduleSettings";
import { loadChannelMap } from "@/lib/channelWiringStore";
import type { ChannelMap } from "@/lib/relayState";
import { waitForDesiredChange } from "@/lib/agentBus";

export const dynamic = "force-dynamic";

// A parked request is released by an in-process signal when someone presses a
// button. This is only the safety net for changes made by another process
// (e.g. the Vercel copy of the site writing to the same database).
const DB_RECHECK_MS = 1000;
const MAX_WAIT_MS = 25_000;

async function readDesired() {
  // Both reads at once (one database round trip instead of two). Module
  // addresses edited on the /modbus page ride along, so the Pi needs no
  // per-module settings of its own. A failure reading them (e.g. the table
  // isn't migrated yet) must not stop the Pi from getting the desired state.
  const [rows, modules, channelMap] = await Promise.all([
    prisma.modbusRelayState.findMany(),
    loadModuleOverrides().catch((error): (ModuleOverride | null)[] | null => {
      logError("Modbus agent module-config read failed:", error);
      return null;
    }),
    // Which module/coil each channel drives. null = couldn't be read: the Pi
    // keeps the wiring it already has instead of snapping back to the default.
    loadChannelMap().catch((error): ChannelMap | null => {
      logError("Modbus agent channel-wiring read failed:", error);
      return null;
    }),
  ]);
  const desired = savedFromRows(rows, COIL_COUNT);
  // A short fingerprint of everything the agent acts on: it echoes it back as
  // `since`, and we only keep the request parked while it is still current.
  const version = createHash("sha1").update(JSON.stringify({ desired, modules, channelMap })).digest("hex").slice(0, 16);
  return { desired, modules, channelMap, version };
}

/**
 * The Raspberry Pi agent asks this for what each channel should be
 * (true / false, or null = never switched from the web). Authenticated with
 * MODBUS_AGENT_TOKEN, not with a user session — /api is outside the login
 * proxy, so the token check below is the only gate.
 *
 * Plain GET answers at once. With `?wait=<ms>&since=<version>` it is a long
 * poll: if nothing has changed since `since`, the request is held (up to
 * `wait`, max 25 s) and answered the moment a button is pressed — that is what
 * makes a switch reach the lights in a fraction of a second.
 */
export async function GET(request: NextRequest) {
  const provided = parseBearer(request.headers.get("authorization"));
  if (!tokensMatch(provided, process.env.MODBUS_AGENT_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const waitMs = Math.min(Math.max(Number(params.get("wait")) || 0, 0), MAX_WAIT_MS);
  const since = params.get("since") ?? "";

  try {
    let current = await readDesired();
    const deadline = Date.now() + waitMs;
    while (waitMs > 0 && since !== "" && current.version === since && Date.now() < deadline && !request.signal.aborted) {
      await waitForDesiredChange(Math.min(DB_RECHECK_MS, deadline - Date.now()));
      current = await readDesired();
    }
    return NextResponse.json(current);
  } catch (error) {
    logError("Modbus agent desired-state read failed:", error);
    return NextResponse.json({ error: "Failed to read desired state" }, { status: 500 });
  }
}
