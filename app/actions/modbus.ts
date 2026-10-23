"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { COIL_COUNT, isValidCoilIndex, readAllCoils, setCoil, writeAllCoils } from "@/lib/modbus";
import {
  MODULE_COUNT,
  desiredStates,
  describeModuleStatus,
  displayStates,
  hasAnySaved,
  moduleOfChannel,
  restorableMismatches,
  savedFromRows,
  statesFromSaved,
  type ModuleStatus,
  type SavedStates,
} from "@/lib/relayState";
import { isAgentFresh, parseStoredModules } from "@/lib/agentProtocol";
import { notifyDesiredChanged, waitForReport } from "@/lib/agentBus";
import { getRelaySupervisor, startRelaySupervisor } from "@/lib/relayRuntime";
import { ensureModuleConfig } from "@/lib/moduleConfigStore";
import { createActivityLog } from "./auth";

// Any logged-in user may view and switch the outputs — deliberately no role
// check. The /modbus route itself is already behind login via auth.config.ts.
async function getUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, username: session.user.username ?? null };
}

export type RelayResult =
  | {
      success: true;
      /** Live state of every channel; channels of an unreachable module show their saved state. */
      states: boolean[];
      /** What the web app last told each channel to be (null = never set). */
      saved: SavedStates;
      /** Per module: is an address configured, and did it answer? */
      modules: ModuleStatus[];
      error?: string;
    }
  | { success: false; error: string };

// MODBUS_MODE=direct (default): this server talks to the modules itself, so it
//   must sit on their LAN.
// MODBUS_MODE=agent: the web app runs in the cloud and a Raspberry Pi on the
//   modules' LAN does the talking. The database is the mailbox: this side
//   writes the wanted state, the Pi carries it out and reports the live state
//   back (see agent/ and app/api/modbus-agent/*).
function isAgentMode(): boolean {
  return (process.env.MODBUS_MODE ?? "direct").toLowerCase() === "agent";
}

function describeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const notConfigured = /Module (\d+) is not configured/.exec(msg);
  if (notConfigured) return `โมดูล ${notConfigured[1]} ยังไม่ได้ตั้งค่า (ใส่ IP ในหน้านี้ หรือที่ MODBUS_HOST_${notConfigured[1]})`;
  if (/timed out|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ECONNRESET/i.test(msg)) {
    return "เชื่อมต่อโมดูล I/O ไม่ได้ (ตรวจสอบว่าเซิร์ฟเวอร์อยู่วงเครือข่ายเดียวกับโมดูล)";
  }
  return "สั่งงานโมดูล I/O ไม่สำเร็จ";
}

const offlineModules = (configured: boolean[] = new Array(MODULE_COUNT).fill(true)): ModuleStatus[] =>
  configured.map((c) => ({ configured: c, online: false }));

// Why the first unavailable module is unavailable (for the banner), if any.
function firstProblem(modules: ModuleStatus[]): string | undefined {
  for (let m = 0; m < modules.length; m++) {
    const reason = describeModuleStatus(m, modules[m]);
    if (reason) return reason;
  }
  return undefined;
}

// The saved copy is a convenience: if the database hiccups the outputs must
// still be controllable, so every DB call here degrades instead of throwing.
async function loadSaved(): Promise<SavedStates> {
  try {
    const rows = await prisma.modbusRelayState.findMany();
    return savedFromRows(rows, COIL_COUNT);
  } catch (error) {
    logError("Modbus saved-state read failed:", error);
    return new Array(COIL_COUNT).fill(null);
  }
}

async function saveStates(entries: { channel: number; isOn: boolean }[], username: string | null) {
  try {
    await saveStatesStrict(entries, username);
  } catch (error) {
    logError("Modbus saved-state write failed:", error);
  }
}

// Same write, but errors propagate — in agent mode the database IS the command
// channel, so a failed write must fail the switch.
async function saveStatesStrict(entries: { channel: number; isOn: boolean }[], username: string | null) {
  const upsert = ({ channel, isOn }: { channel: number; isOn: boolean }) =>
    prisma.modbusRelayState.upsert({
      where: { channel },
      create: { channel, isOn, updatedBy: username },
      update: { isOn, updatedBy: username },
    });
  // One channel (the usual button press) is a single statement: skip the
  // BEGIN/COMMIT round trips of a transaction — they were the slowest part of
  // a switch. Several channels still go in together so they land atomically.
  if (entries.length === 1) await upsert(entries[0]);
  else await prisma.$transaction(entries.map(upsert));
  // Wake the Pi's parked long-poll now that the change is committed, so it
  // doesn't have to wait for its next poll.
  notifyDesiredChanged();
}

// ---------- agent mode (web in the cloud, Raspberry Pi on the LAN) ----------

const AGENT_WAIT_MS = 7000;
// Fallback poll while waiting for the Pi's confirmation. Normally the report
// route wakes us the moment it arrives (see lib/agentBus.ts); this only matters
// when the report is handled by a different process.
const AGENT_POLL_MS = 250;
const AGENT_OFFLINE_MESSAGE =
  "ไม่ได้รับสถานะจาก Raspberry Pi ในออฟฟิศ (Pi ปิดอยู่ ไม่มีอินเทอร์เน็ต หรือต่อโมดูลไม่ได้)";

async function loadAgentStatus(): Promise<{ states: boolean[]; modules: ModuleStatus[]; reportedAt: Date } | null> {
  try {
    const row = await prisma.modbusAgentStatus.findUnique({ where: { id: 1 } });
    if (!row || row.states.length !== COIL_COUNT) return null;
    const modules =
      parseStoredModules(row.modules, MODULE_COUNT) ?? new Array(MODULE_COUNT).fill({ configured: true, online: true });
    return { states: row.states, modules, reportedAt: row.reportedAt };
  } catch (error) {
    logError("Modbus agent status read failed:", error);
    return null;
  }
}

async function agentStates(): Promise<RelayResult> {
  const [saved, status] = await Promise.all([loadSaved(), loadAgentStatus()]);
  if (status && isAgentFresh(status.reportedAt)) {
    return {
      success: true,
      states: displayStates(status.states, status.modules, saved),
      saved,
      modules: status.modules,
      error: firstProblem(status.modules),
    };
  }
  // Nothing remembered yet → nothing useful to show.
  if (!hasAnySaved(saved)) return { success: false, error: AGENT_OFFLINE_MESSAGE };
  // The Pi has gone quiet: show the saved copy, keeping what we last knew about which modules exist.
  const modules = offlineModules(status?.modules.map((m) => m.configured));
  return { success: true, states: statesFromSaved(saved), saved, modules, error: AGENT_OFFLINE_MESSAGE };
}

async function setRelayViaAgent(index: number, on: boolean, username: string | null): Promise<RelayResult> {
  const current = await agentStates();
  if (!current.success) return { success: false, error: AGENT_OFFLINE_MESSAGE };
  const m = moduleOfChannel(index);
  const problem = describeModuleStatus(m, current.modules[m]);
  if (problem) return { success: false, error: current.modules.some((x) => x.online) ? problem : AGENT_OFFLINE_MESSAGE };

  const previous = current.saved[index];
  const requestedAt = Date.now();
  await saveStatesStrict([{ channel: index, isOn: on }], username);

  // The Pi picks the change up within a couple of seconds, applies it and
  // reports back; wait for a report newer than this request that agrees.
  while (Date.now() - requestedAt < AGENT_WAIT_MS) {
    await waitForReport(AGENT_POLL_MS);
    const status = await loadAgentStatus();
    if (status && status.reportedAt.getTime() >= requestedAt && status.states[index] === on) {
      await createActivityLog("MODBUS_RELAY", `ช่อง ${index + 1} -> ${on ? "ON" : "OFF"}`);
      const saved = await loadSaved();
      return { success: true, states: displayStates(status.states, status.modules, saved), saved, modules: status.modules };
    }
  }

  // No confirmation: undo the request so the Pi doesn't apply it later, out of
  // the blue, after the user has been told it failed.
  try {
    if (previous === null) await prisma.modbusRelayState.deleteMany({ where: { channel: index } });
    else await saveStatesStrict([{ channel: index, isOn: previous }], username);
  } catch (error) {
    logError("Modbus agent request rollback failed:", error);
  }
  return { success: false, error: "สั่งแล้วแต่ยังไม่ได้รับการยืนยันจากโมดูล (Raspberry Pi อาจตอบช้า) กรุณาลองใหม่" };
}

// ---------------------------------- actions ----------------------------------

export async function getRelayStates(): Promise<RelayResult> {
  if (!(await getUser())) return { success: false, error: "Unauthorized" };
  if (isAgentMode()) return agentStates();

  startRelaySupervisor();
  await ensureModuleConfig(); // addresses edited on the /modbus page
  const saved = await loadSaved();
  const snap = await readAllCoils();
  const anyOnline = snap.modules.some((m) => m.online);
  const problem = firstProblem(snap.modules);

  if (!anyOnline) {
    if (snap.errors.some(Boolean)) logError("Modbus read failed:", snap.errors.find(Boolean));
    const message = snap.errors.find(Boolean) ? describeError(snap.errors.find(Boolean)) : (problem ?? "ไม่พบโมดูล I/O");
    // Nothing remembered yet → nothing useful to show.
    if (!hasAnySaved(saved)) return { success: false, error: message };
    return { success: true, states: statesFromSaved(saved), saved, modules: snap.modules, error: message };
  }
  return {
    success: true,
    states: displayStates(snap.states, snap.modules, saved),
    saved,
    modules: snap.modules,
    error: problem,
  };
}

export async function setRelay(index: number, on: boolean): Promise<RelayResult> {
  const user = await getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!isValidCoilIndex(index) || typeof on !== "boolean") {
    return { success: false, error: `ช่องต้องอยู่ระหว่าง 1-${COIL_COUNT}` };
  }

  if (isAgentMode()) {
    try {
      return await setRelayViaAgent(index, on, user.username);
    } catch (error) {
      logError("Modbus agent request failed:", error);
      return { success: false, error: "บันทึกคำสั่งไม่สำเร็จ กรุณาลองใหม่" };
    }
  }

  try {
    startRelaySupervisor();
    await ensureModuleConfig();
    const supervisor = getRelaySupervisor();
    await supervisor.ready();
    // The supervisor's desired state flips first (and rolls back if this
    // fails) so its background check can't mistake the switch for a drop.
    const snap = await supervisor.applyChange(index, on, async () => {
      const result = await setCoil(index, on);
      // Remember what the module actually ended up as, not just what was asked.
      await saveStates([{ channel: index, isOn: result.states[index] }], user.username);
      return result;
    });
    await createActivityLog("MODBUS_RELAY", `ช่อง ${index + 1} -> ${on ? "ON" : "OFF"}`);
    const saved = await loadSaved();
    return {
      success: true,
      states: displayStates(snap.states, snap.modules, saved),
      saved,
      modules: snap.modules,
      error: firstProblem(snap.modules),
    };
  } catch (error) {
    logError("Modbus write failed:", error);
    return { success: false, error: describeError(error) };
  }
}

/**
 * Re-apply the saved state to the modules — e.g. after one lost power and
 * every output came back OFF. Only channels that were ever switched from the
 * web are touched; the rest are left as the module has them, and a module
 * that can't be reached is skipped. (In agent mode the Pi does this by itself
 * within seconds, so this just reports the state.)
 */
export async function restoreRelays(): Promise<RelayResult> {
  const user = await getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (isAgentMode()) return agentStates();

  const saved = await loadSaved();
  if (!hasAnySaved(saved)) return { success: false, error: "ยังไม่มีสถานะที่บันทึกไว้ให้กู้คืน" };

  startRelaySupervisor();
  getRelaySupervisor().setAll(saved);
  await ensureModuleConfig();
  try {
    const before = await readAllCoils();
    if (!before.modules.some((m) => m.online)) {
      return { success: false, error: describeError(before.errors.find(Boolean) ?? new Error("")) };
    }
    const changed = restorableMismatches(before.states, before.modules, saved);
    if (changed.length === 0) {
      return {
        success: true,
        states: displayStates(before.states, before.modules, saved),
        saved,
        modules: before.modules,
        error: firstProblem(before.modules),
      };
    }

    const after = await writeAllCoils(desiredStates(before.states, saved));
    await createActivityLog(
      "MODBUS_RESTORE",
      changed.map((i) => `ช่อง ${i + 1} -> ${saved[i] ? "ON" : "OFF"}`).join(", ")
    );
    return {
      success: true,
      states: displayStates(after.states, after.modules, saved),
      saved,
      modules: after.modules,
      error: firstProblem(after.modules),
    };
  } catch (error) {
    logError("Modbus restore failed:", error);
    return { success: false, error: describeError(error) };
  }
}
