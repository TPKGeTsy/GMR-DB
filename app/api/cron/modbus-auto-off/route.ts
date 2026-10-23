import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { readAllCoils, setCoil } from "@/lib/modbus";
import { channelsDueForAutoOff, isAutoOffEnabled, parseAutoOffConfig } from "@/lib/autoOff";
import { getRelaySupervisor, startRelaySupervisor } from "@/lib/relayRuntime";
import { isAgentFresh } from "@/lib/agentProtocol";
import { ensureModuleConfig } from "@/lib/moduleConfigStore";
import { COIL_COUNT } from "@/lib/relayState";

export const dynamic = "force-dynamic";

/**
 * Switches off outputs someone forgot to turn off (see lib/autoOff.ts for the
 * rules and the MODBUS_AUTO_OFF_* settings). Meant to be pinged every few
 * minutes by the same external cron service as the other /api/cron/* jobs.
 *
 * Unlike the other cron routes this one REQUIRES CRON_SECRET to be set — it
 * drives physical outputs, so it must never be triggerable without the secret.
 *
 * Cheap when idle: it only talks to the module if the database says some
 * channel was switched ON from the web, so a quiet building costs one query.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = parseAutoOffConfig(process.env);
  if (!isAutoOffEnabled(config)) {
    return NextResponse.json({ success: true, enabled: false, turnedOff: [] });
  }

  try {
    const rows = await prisma.modbusRelayState.findMany({ where: { isOn: true } });
    if (rows.length === 0) {
      return NextResponse.json({ success: true, enabled: true, turnedOff: [] });
    }

    // Agent mode (web in the cloud): this server can't reach the module, so just
    // flip the saved state to OFF — the Raspberry Pi sees it and switches the
    // output off within a couple of seconds. If the Pi has gone quiet we can't
    // tell what's really ON, so assume the saved ON channels are.
    if ((process.env.MODBUS_MODE ?? "direct").toLowerCase() === "agent") {
      const status = await prisma.modbusAgentStatus.findUnique({ where: { id: 1 } });
      const live = status && isAgentFresh(status.reportedAt) && status.states.length === COIL_COUNT;
      const assumed = live ? status.states : new Array(COIL_COUNT).fill(true);
      const dueViaAgent = channelsDueForAutoOff(assumed, rows, new Date(), config);
      if (dueViaAgent.length > 0) {
        await prisma.modbusRelayState.updateMany({
          where: { channel: { in: dueViaAgent } },
          data: { isOn: false, updatedBy: "auto-off" },
        });
      }
      return NextResponse.json({
        success: true,
        enabled: true,
        mode: "agent",
        agentOnline: !!live,
        turnedOff: dueViaAgent.map((c) => c + 1),
        failed: [],
      });
    }

    await ensureModuleConfig(); // addresses edited on the /modbus page
    // Channels of a module that can't be reached read as OFF here, so they're
    // simply skipped this run and retried on the next.
    const { states: device } = await readAllCoils();
    const due = channelsDueForAutoOff(device, rows, new Date(), config);

    // The supervisor re-applies the saved state after a power/network drop, so
    // a channel being switched off here must also leave the saved state — both
    // happen inside applyChange: if either step fails, the change is undone and
    // the supervisor keeps the channel ON until the next run retries.
    startRelaySupervisor();
    const supervisor = getRelaySupervisor();
    await supervisor.ready();

    const turnedOff: number[] = [];
    const failed: number[] = [];
    for (const channel of due) {
      try {
        await supervisor.applyChange(channel, false, async () => {
          await setCoil(channel, false);
          await prisma.modbusRelayState.update({
            where: { channel },
            data: { isOn: false, updatedBy: "auto-off" },
          });
        });
        turnedOff.push(channel);
      } catch (error) {
        logError(`Modbus auto-off failed on channel ${channel + 1}:`, error);
        failed.push(channel);
      }
    }

    // Channel numbers in the response are 1-based, like the UI.
    return NextResponse.json({
      success: failed.length === 0,
      enabled: true,
      turnedOff: turnedOff.map((c) => c + 1),
      failed: failed.map((c) => c + 1),
    });
  } catch (error) {
    logError("Modbus auto-off run failed:", error);
    return NextResponse.json({ success: false, error: "Auto-off run failed" }, { status: 500 });
  }
}
