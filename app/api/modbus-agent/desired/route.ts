import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { parseBearer, tokensMatch } from "@/lib/agentProtocol";
import { COIL_COUNT, savedFromRows } from "@/lib/relayState";
import { loadModuleOverrides } from "@/lib/moduleConfigStore";
import type { ModuleOverride } from "@/lib/moduleSettings";

export const dynamic = "force-dynamic";

/**
 * The Raspberry Pi agent polls this for what each channel should be
 * (true / false, or null = never switched from the web). Authenticated with
 * MODBUS_AGENT_TOKEN, not with a user session — /api is outside the login
 * proxy, so the token check below is the only gate.
 */
export async function GET(request: NextRequest) {
  const provided = parseBearer(request.headers.get("authorization"));
  if (!tokensMatch(provided, process.env.MODBUS_AGENT_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await prisma.modbusRelayState.findMany();
    // Module addresses edited on the /modbus page ride along, so the Pi needs
    // no per-module settings of its own. A failure here (e.g. the table isn't
    // migrated yet) must not stop the Pi from getting the desired state.
    let modules: (ModuleOverride | null)[] | null = null;
    try {
      modules = await loadModuleOverrides();
    } catch (error) {
      logError("Modbus agent module-config read failed:", error);
    }
    return NextResponse.json({ desired: savedFromRows(rows, COIL_COUNT), modules });
  } catch (error) {
    logError("Modbus agent desired-state read failed:", error);
    return NextResponse.json({ error: "Failed to read desired state" }, { status: 500 });
  }
}
