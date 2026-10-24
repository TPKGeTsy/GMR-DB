"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { canManageUsers } from "@/lib/roles";
import { createActivityLog } from "./auth";
import { validateSchedule, type ScheduleRow } from "@/lib/modbusSchedule";

// Everyone logged in can see the timers; creating / changing them is ADMIN /
// OPERATOR, like the other /modbus configuration.

async function requireConfigRole() {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) return null;
  return { id: session.user.id, username: session.user.username ?? null };
}

export type ScheduleListResult =
  | { success: true; schedules: ScheduleRow[] }
  | { success: false; error: string };

export type ScheduleActionResult = { success: true; schedules: ScheduleRow[] } | { success: false; error: string };

const toRow = (r: {
  id: string;
  title: string;
  time: string;
  days: number[];
  action: string;
  channels: number[];
  enabled: boolean;
  lastRunDateKey: string | null;
}): ScheduleRow => ({
  id: r.id,
  title: r.title,
  time: r.time,
  days: r.days,
  action: r.action === "OFF" ? "OFF" : "ON",
  channels: r.channels,
  enabled: r.enabled,
  lastRunDateKey: r.lastRunDateKey,
});

async function list(): Promise<ScheduleRow[]> {
  const rows = await prisma.modbusSchedule.findMany({ orderBy: [{ time: "asc" }, { createdAt: "asc" }] });
  return rows.map(toRow);
}

const TABLE_HINT = "ตาราง modbus_schedules อาจยังไม่ได้สร้าง — รัน migration";

export async function getSchedules(): Promise<ScheduleListResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Unauthorized" };
  try {
    return { success: true, schedules: await list() };
  } catch (error) {
    logError("Modbus schedules read failed:", error);
    return { success: false, error: `อ่านรายการตั้งเวลาไม่สำเร็จ (${TABLE_HINT})` };
  }
}

export async function createSchedule(input: {
  title: string;
  time: string;
  days: number[];
  action: "ON" | "OFF";
  channels: number[];
}): Promise<ScheduleActionResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  const checked = validateSchedule(input);
  if (!checked.ok) return { success: false, error: checked.error };
  const v = checked.value;
  try {
    await prisma.modbusSchedule.create({
      data: { title: v.title, time: v.time, days: v.days, action: v.action, channels: v.channels, createdBy: user.username },
    });
    await createActivityLog(
      "MODBUS_SCHEDULE",
      `เพิ่มเวลา ${v.time} ${v.action} ช่อง ${v.channels.map((c) => c + 1).join(",")}${v.title ? ` (${v.title})` : ""}`
    );
    return { success: true, schedules: await list() };
  } catch (error) {
    logError("Modbus schedule create failed:", error);
    return { success: false, error: `บันทึกไม่สำเร็จ (${TABLE_HINT})` };
  }
}

export async function updateSchedule(
  id: string,
  input: { title: string; time: string; days: number[]; action: "ON" | "OFF"; channels: number[] }
): Promise<ScheduleActionResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  const checked = validateSchedule(input);
  if (!checked.ok) return { success: false, error: checked.error };
  const v = checked.value;
  try {
    // Editing the time re-arms it for today (clears "already ran today").
    await prisma.modbusSchedule.update({
      where: { id },
      data: { title: v.title, time: v.time, days: v.days, action: v.action, channels: v.channels, lastRunDateKey: null },
    });
    await createActivityLog("MODBUS_SCHEDULE", `แก้เวลา ${v.time} ${v.action} ช่อง ${v.channels.map((c) => c + 1).join(",")}`);
    return { success: true, schedules: await list() };
  } catch (error) {
    logError("Modbus schedule update failed:", error);
    return { success: false, error: "แก้ไขไม่สำเร็จ (อาจถูกลบไปแล้ว)" };
  }
}

export async function setScheduleEnabled(id: string, enabled: boolean): Promise<ScheduleActionResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  try {
    await prisma.modbusSchedule.update({ where: { id }, data: { enabled: !!enabled } });
    await createActivityLog("MODBUS_SCHEDULE", `${enabled ? "เปิด" : "ปิด"}ใช้งานเวลา ${id}`);
    return { success: true, schedules: await list() };
  } catch (error) {
    logError("Modbus schedule toggle failed:", error);
    return { success: false, error: "เปลี่ยนสถานะไม่สำเร็จ" };
  }
}

export async function deleteSchedule(id: string): Promise<ScheduleActionResult> {
  const user = await requireConfigRole();
  if (!user) return { success: false, error: "ต้องเป็น ADMIN หรือ OPERATOR" };
  try {
    await prisma.modbusSchedule.delete({ where: { id } });
    await createActivityLog("MODBUS_SCHEDULE", `ลบเวลา ${id}`);
    return { success: true, schedules: await list() };
  } catch (error) {
    logError("Modbus schedule delete failed:", error);
    return { success: false, error: "ลบไม่สำเร็จ (อาจถูกลบไปแล้ว)" };
  }
}
