// Pure logic for the "ตั้งเวลา" (timer) tab of /modbus: validating a schedule
// and deciding whether one is due. No server imports — the client form, the
// cron route and the tests all use these.
//
// A schedule says: at HH:mm (Bangkok time), on these weekdays, switch these
// channels ON or OFF. An external cron job calls /api/cron/modbus-schedule every
// minute; a schedule runs at most once per day (lastRunDateKey), and one whose
// minute was missed by a few minutes (cron lagging, server restarting) still
// runs, within CATCH_UP_MINUTES, instead of being silently skipped.

import { COIL_COUNT } from "./relayState";

export type ScheduleAction = "ON" | "OFF";

/** A cron tick up to this many minutes after the scheduled time still triggers it. */
export const CATCH_UP_MINUTES = 5;

export const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]; // 0 = Sunday
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export interface ScheduleInput {
  title: string;
  /** "HH:mm", 24-hour, Bangkok time. */
  time: string;
  /** Weekdays it runs on, 0 = Sunday … 6 = Saturday. */
  days: number[];
  action: ScheduleAction;
  /** 0-based global channels to switch. */
  channels: number[];
}

export interface ScheduleRow extends ScheduleInput {
  id: string;
  enabled: boolean;
  /** Bangkok date (YYYY-MM-DD) it last ran, so it runs once per day. */
  lastRunDateKey: string | null;
}

/** Minutes since midnight for a strict "HH:mm", or null when it isn't one. */
export function parseTime(time: unknown): number | null {
  if (typeof time !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type ScheduleValidation = { ok: true; value: ScheduleInput } | { ok: false; error: string };

/** Validate what the form submits; the returned value is cleaned (trimmed, sorted, de-duplicated). */
export function validateSchedule(input: {
  title?: unknown;
  time?: unknown;
  days?: unknown;
  action?: unknown;
  channels?: unknown;
}): ScheduleValidation {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length > 60) return { ok: false, error: "หัวข้อยาวเกิน 60 ตัวอักษร" };

  const minutes = parseTime(input.time);
  if (minutes === null) return { ok: false, error: "เวลาต้องเป็นรูปแบบ HH:mm เช่น 18:30" };
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  if (!Array.isArray(input.days) || input.days.length === 0) return { ok: false, error: "เลือกอย่างน้อยหนึ่งวัน" };
  if (!input.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return { ok: false, error: "วันไม่ถูกต้อง" };
  const days = [...new Set(input.days as number[])].sort((a, b) => a - b);

  if (input.action !== "ON" && input.action !== "OFF") return { ok: false, error: "เลือกเปิดหรือปิด" };

  if (!Array.isArray(input.channels) || input.channels.length === 0) return { ok: false, error: "เลือกอย่างน้อยหนึ่งช่อง" };
  if (!input.channels.every((c) => Number.isInteger(c) && c >= 0 && c < COIL_COUNT)) return { ok: false, error: "ช่องไม่ถูกต้อง" };
  const channels = [...new Set(input.channels as number[])].sort((a, b) => a - b);

  return { ok: true, value: { title, time, days, action: input.action, channels } };
}

/** Bangkok wall-clock facts about an instant (Thailand has no DST: a fixed +7 h). */
export function bangkokClock(now: Date): { dateKey: string; minutes: number; weekday: number } {
  const local = new Date(now.getTime() + 7 * 3_600_000);
  return {
    dateKey: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
  };
}

/**
 * Should this schedule fire at `now`? Only if it's enabled, today is one of its
 * days, it hasn't already run today, and we're at its time or up to
 * CATCH_UP_MINUTES after it (never before it).
 */
export function isDue(schedule: ScheduleRow, now: Date): boolean {
  if (!schedule.enabled) return false;
  const at = parseTime(schedule.time);
  if (at === null) return false;
  const clock = bangkokClock(now);
  if (!schedule.days.includes(clock.weekday)) return false;
  if (schedule.lastRunDateKey === clock.dateKey) return false;
  const late = clock.minutes - at;
  return late >= 0 && late <= CATCH_UP_MINUTES;
}

/** "ทุกวัน", "จันทร์–ศุกร์", "เสาร์–อาทิตย์" or the listed days, for the table. */
export function describeDays(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "ทุกวัน";
  const key = [...set].sort((a, b) => a - b).join(",");
  if (key === "1,2,3,4,5") return "จ.–ศ.";
  if (key === "0,6") return "ส.–อา.";
  // Monday-first order reads more naturally than Sunday-first.
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.has(d)).map((d) => WEEKDAY_LABELS[d]).join(" ");
}
