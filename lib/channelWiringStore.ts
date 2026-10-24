import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import {
  COIL_COUNT,
  defaultChannelMap,
  sameChannelMap,
  swapIntoLocation,
  validateChannelMap,
  type ChannelMap,
} from "@/lib/relayState";

// Where each channel's output physically is (module + coil address) lives in
// the database, edited on the /modbus page. The web server (direct mode) pushes
// it into lib/modbus.ts through ensureModuleConfig(); the Pi agent downloads
// it from /api/modbus-agent/desired.

/**
 * The wiring in effect: the default wiring with the saved rows laid over it.
 * If the result is somehow inconsistent (a row edited by hand, say) the whole
 * default wiring is used instead and the problem is logged — a half-trusted
 * map could switch the wrong output.
 */
export async function loadChannelMap(): Promise<ChannelMap> {
  const rows = await prisma.modbusChannelWiring.findMany();
  const map = defaultChannelMap();
  for (const row of rows) {
    if (Number.isInteger(row.channel) && row.channel >= 0 && row.channel < COIL_COUNT) {
      map[row.channel] = { module: row.moduleIndex, address: row.address };
    }
  }
  const problem = validateChannelMap(map);
  if (problem) {
    logError("Saved channel wiring is invalid, using the default wiring:", problem);
    return defaultChannelMap();
  }
  return map;
}

export interface WiringChange {
  map: ChannelMap;
  /** The channel that traded places with the one being moved (null if the target was the same channel). */
  displaced: number | null;
}

/**
 * Wire `channel` to (module, address). If another channel already uses that
 * output the two trade places. Throws RangeError for a target that doesn't exist.
 */
export async function saveChannelWiring(
  channel: number,
  module: number,
  address: number,
  username: string | null
): Promise<WiringChange> {
  const current = await loadChannelMap();
  const { map, displaced } = swapIntoLocation(current, channel, module, address);
  const changed = map.map((loc, ch) => ({ loc, ch })).filter(({ loc, ch }) => loc.module !== current[ch].module || loc.address !== current[ch].address);
  if (changed.length > 0) {
    await prisma.$transaction(
      changed.map(({ loc, ch }) =>
        prisma.modbusChannelWiring.upsert({
          where: { channel: ch },
          create: { channel: ch, moduleIndex: loc.module, address: loc.address, updatedBy: username },
          update: { moduleIndex: loc.module, address: loc.address, updatedBy: username },
        })
      )
    );
  }
  return { map, displaced };
}

/** Back to the default wiring (forget every saved row). */
export async function resetChannelWiring(): Promise<ChannelMap> {
  await prisma.modbusChannelWiring.deleteMany();
  return defaultChannelMap();
}

export { sameChannelMap };
