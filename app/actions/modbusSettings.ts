"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { canManageUsers } from "@/lib/roles";
import { effectiveModuleAddress } from "@/lib/modbus";
import { ensureModuleConfig, loadModuleOverrides } from "@/lib/moduleConfigStore";
import { validateModuleSettings, type ModuleOverride } from "@/lib/moduleSettings";
import { COILS_PER_MODULE, COIL_COUNT, MODULE_COUNT, defaultChannelMap, type ChannelMap } from "@/lib/relayState";
import { loadChannelMap, resetChannelWiring, saveChannelWiring } from "@/lib/channelWiringStore";
import { notifyDesiredChanged } from "@/lib/agentBus";
import { createActivityLog } from "./auth";

// Editing a module's network address is a configuration change, not an
// everyday switch, so unlike /modbus itself it's limited to ADMIN / OPERATOR.
async function requireConfigRole() {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) return null;
  return { id: session.user.id, username: session.user.username ?? null };
}

export interface ModuleSettingsInfo {
  moduleIndex: number;
  /** What's saved from this page (null = nothing saved, env/default applies). */
  saved: ModuleOverride | null;
  /**
   * The address this web server itself would use (direct mode only — in agent
   * mode the Pi decides and its own .env is unknown here).
   */
  effective: { host: string | null; port: number; unitId: number; source: "page" | "env" | "default" | "none" } | null;
}

export type ModuleSettingsResult =
  | { success: true; mode: "direct" | "agent"; modules: ModuleSettingsInfo[] }
  | { success: false; error: string };

const isAgentMode = () => (process.env.MODBUS_MODE ?? "direct").toLowerCase() === "agent";

async function currentSettings(): Promise<ModuleSettingsResult> {
  const agent = isAgentMode();
  const saved = await loadModuleOverrides();
  if (!agent) await ensureModuleConfig(true);
  return {
    success: true,
    mode: agent ? "agent" : "direct",
    modules: saved.map((s, moduleIndex) => ({
      moduleIndex,
      saved: s,
      effective: agent ? null : effectiveModuleAddress(moduleIndex),
    })),
  };
}

function validIndex(moduleIndex: number): boolean {
  return Number.isInteger(moduleIndex) && moduleIndex >= 0 && moduleIndex < MODULE_COUNT;
}

export async function getModuleSettings(): Promise<ModuleSettingsResult> {
  if (!(await requireConfigRole())) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  try {
    return await currentSettings();
  } catch (error) {
    logError("Modbus settings read failed:", error);
    return { success: false, error: "อ่านการตั้งค่าไม่สำเร็จ (ตาราง modbus_module_config อาจยังไม่ได้สร้าง — รัน migration)" };
  }
}

export async function saveModuleSettings(
  moduleIndex: number,
  input: { host: string; port: string; unitId: string }
): Promise<ModuleSettingsResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  if (!validIndex(moduleIndex)) return { success: false, error: "ไม่พบโมดูลนี้" };

  const checked = validateModuleSettings(input);
  if (!checked.ok) return { success: false, error: checked.error };
  const { host, port, unitId } = checked.value;

  try {
    await prisma.modbusModuleConfig.upsert({
      where: { moduleIndex },
      create: { moduleIndex, host, port, unitId, updatedBy: user.username },
      update: { host, port, unitId, updatedBy: user.username },
    });
    notifyDesiredChanged(); // the Pi's long-poll carries module addresses too
    await createActivityLog("MODBUS_CONFIG", `โมดูล ${moduleIndex + 1} -> ${host}:${port} (unit ${unitId})`);
    return await currentSettings();
  } catch (error) {
    logError("Modbus settings save failed:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

/** Forget the address saved from this page, so the env var / default applies again. */
export async function clearModuleSettings(moduleIndex: number): Promise<ModuleSettingsResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  if (!validIndex(moduleIndex)) return { success: false, error: "ไม่พบโมดูลนี้" };

  try {
    await prisma.modbusModuleConfig.deleteMany({ where: { moduleIndex } });
    notifyDesiredChanged();
    await createActivityLog("MODBUS_CONFIG", `โมดูล ${moduleIndex + 1} -> ล้างค่า (กลับไปใช้ค่าจาก env)`);
    return await currentSettings();
  } catch (error) {
    logError("Modbus settings clear failed:", error);
    return { success: false, error: "ล้างค่าไม่สำเร็จ" };
  }
}


// ------------------------------ channel wiring ------------------------------
// Which module / coil address each channel drives. Reading it is open to every
// logged-in user (the summary tab shows it); changing it is ADMIN / OPERATOR.

export type ChannelWiringResult =
  | { success: true; channelMap: ChannelMap; message?: string }
  | { success: false; error: string };

export async function getChannelWiring(): Promise<ChannelWiringResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Unauthorized" };
  try {
    return { success: true, channelMap: await loadChannelMap() };
  } catch (error) {
    logError("Modbus channel-wiring read failed:", error);
    // The table may not exist yet (migration pending): the default wiring is what's in use.
    return { success: true, channelMap: defaultChannelMap() };
  }
}

/** Wire `channel` (0-based) to `module` (0-based) / coil `address`; the channel already there trades places with it. */
export async function setChannelWiring(channel: number, module: number, address: number): Promise<ChannelWiringResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  if (!Number.isInteger(channel) || channel < 0 || channel >= COIL_COUNT) {
    return { success: false, error: `ช่องต้องอยู่ระหว่าง 1-${COIL_COUNT}` };
  }
  if (!validIndex(module)) return { success: false, error: "ไม่พบโมดูลนี้" };
  if (!Number.isInteger(address) || address < 0 || address >= COILS_PER_MODULE) {
    return { success: false, error: `Address ต้องเป็นเลข 0-${COILS_PER_MODULE - 1}` };
  }

  try {
    const { map, displaced } = await saveChannelWiring(channel, module, address, user.username);
    if (!isAgentMode()) await ensureModuleConfig(true); // apply to this server's own connection now
    notifyDesiredChanged(); // the Pi's long-poll carries the wiring too
    await createActivityLog(
      "MODBUS_WIRING",
      `ช่อง ${channel + 1} -> โมดูล ${module + 1} address ${address}` +
        (displaced !== null ? ` (สลับกับช่อง ${displaced + 1})` : "")
    );
    return {
      success: true,
      channelMap: map,
      message:
        displaced !== null
          ? `ช่อง ${channel + 1} ใช้โมดูล ${module + 1} address ${address} แล้ว — ช่อง ${displaced + 1} ถูกสลับไปใช้ที่อยู่เดิมของช่อง ${channel + 1}`
          : undefined,
    };
  } catch (error) {
    logError("Modbus channel-wiring save failed:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ (ตาราง modbus_channel_wiring อาจยังไม่ได้สร้าง — รัน migration)" };
  }
}

/** Forget every custom wiring: channel n goes back to the n-th output, module by module. */
export async function resetChannelWiringAction(): Promise<ChannelWiringResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  try {
    const map = await resetChannelWiring();
    if (!isAgentMode()) await ensureModuleConfig(true);
    notifyDesiredChanged();
    await createActivityLog("MODBUS_WIRING", "ล้างการตั้งที่อยู่รายช่อง (กลับไปค่าเริ่มต้น)");
    return { success: true, channelMap: map };
  } catch (error) {
    logError("Modbus channel-wiring reset failed:", error);
    return { success: false, error: "ล้างค่าไม่สำเร็จ" };
  }
}
