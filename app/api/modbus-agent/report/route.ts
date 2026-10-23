import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { parseBearer, parseReport, tokensMatch } from "@/lib/agentProtocol";
import { COIL_COUNT, MODULE_COUNT } from "@/lib/relayState";
import { notifyReported } from "@/lib/agentBus";

export const dynamic = "force-dynamic";

/**
 * The Raspberry Pi agent posts the module's live state here. The web app
 * (running in the cloud) can't reach the module itself, so this row is what
 * the /modbus page shows; it going stale means the agent or module is down.
 */
export async function POST(request: NextRequest) {
  const provided = parseBearer(request.headers.get("authorization"));
  if (!tokensMatch(provided, process.env.MODBUS_AGENT_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const report = parseReport(body, COIL_COUNT, MODULE_COUNT);
  if (!report) {
    return NextResponse.json(
      { error: `Expected { states: boolean[${COIL_COUNT}], modules: { configured, online }[${MODULE_COUNT}] }` },
      { status: 400 }
    );
  }

  try {
    const { states } = report;
    const modules = report.modules.map((m) => ({ configured: m.configured, online: m.online }));
    await prisma.modbusAgentStatus.upsert({
      where: { id: 1 },
      create: { id: 1, states, modules, reportedAt: new Date() },
      update: { states, modules, reportedAt: new Date() },
    });
    // Wake any server action that is waiting to confirm a button press.
    notifyReported();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("Modbus agent report failed:", error);
    return NextResponse.json({ error: "Failed to store report" }, { status: 500 });
  }
}
