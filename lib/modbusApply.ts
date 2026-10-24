import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { notifyDesiredChanged } from "@/lib/agentBus";
import { setCoil } from "@/lib/modbus";
import { ensureModuleConfig } from "@/lib/moduleConfigStore";
import { getRelaySupervisor, startRelaySupervisor } from "@/lib/relayRuntime";

// Switch several channels from server code that has no logged-in user (the
// schedule cron job). Mirrors what a button press does: the saved state is the
// source of truth, and in direct mode the module is switched too.

const isAgentMode = () => (process.env.MODBUS_MODE ?? "direct").toLowerCase() === "agent";

export interface ApplyResult {
  /** 0-based channels switched (agent mode: saved; the Pi carries it out). */
  applied: number[];
  /** 0-based channels that couldn't be switched (direct mode, module unreachable). */
  failed: number[];
}

export async function applyChannels(channels: number[], on: boolean, updatedBy: string): Promise<ApplyResult> {
  if (channels.length === 0) return { applied: [], failed: [] };

  if (isAgentMode()) {
    // Agent mode: the database is the mailbox. Writing the wanted state is the
    // whole job; the Pi (or its cached copy, once it is back online) does the
    // rest, so even a Pi that is offline right now still gets the change later.
    await prisma.$transaction(
      channels.map((channel) =>
        prisma.modbusRelayState.upsert({
          where: { channel },
          create: { channel, isOn: on, updatedBy },
          update: { isOn: on, updatedBy },
        })
      )
    );
    notifyDesiredChanged();
    return { applied: [...channels], failed: [] };
  }

  await ensureModuleConfig(); // addresses + wiring edited on the /modbus page
  startRelaySupervisor();
  const supervisor = getRelaySupervisor();
  await supervisor.ready();

  const applied: number[] = [];
  const failed: number[] = [];
  for (const channel of channels) {
    try {
      // desired state flips first and rolls back if switching or saving fails
      await supervisor.applyChange(channel, on, async () => {
        await setCoil(channel, on);
        await prisma.modbusRelayState.upsert({
          where: { channel },
          create: { channel, isOn: on, updatedBy },
          update: { isOn: on, updatedBy },
        });
      });
      applied.push(channel);
    } catch (error) {
      logError(`Modbus ${updatedBy} failed on channel ${channel + 1}:`, error);
      failed.push(channel);
    }
  }
  return { applied, failed };
}
