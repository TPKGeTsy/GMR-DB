/** Planning of who does what on a project: duty presets, day-range helpers and the daily LINE text. */

export const DUTY_PRESETS = [
  "ออกแบบ / เขียนแบบ",
  "จัดซื้อวัสดุ",
  "ตัดเหล็ก",
  "เชื่อม / ประกอบโครง",
  "เดินสายไฟ / ตู้คอนโทรล",
  "เขียนโปรแกรม",
  "ติดตั้งหน้างาน",
  "ทดสอบ / ปรับแต่ง",
  "ส่งมอบ / เอกสาร",
] as const;

export const DAY_MS = 86_400_000;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(s: string): boolean {
  if (!KEY.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export interface TaskLike {
  userId: string;
  startKey: string;
  endKey: string;
}

/** Day keys where a person has more tasks running than their daily capacity. */
export function overloadedDays(tasks: TaskLike[], userId: string, capacity: number): string[] {
  const count = new Map<string, number>();
  for (const t of tasks) {
    if (t.userId !== userId) continue;
    for (let d = t.startKey, i = 0; d <= t.endKey && i < 800; d = addDays(d, 1), i++) count.set(d, (count.get(d) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n > capacity).map(([d]) => d).sort();
}

export function isActiveOn(t: { startKey: string; endKey: string }, dayKey: string): boolean {
  return t.startKey <= dayKey && dayKey <= t.endKey;
}

export interface ReminderTask {
  projectName: string;
  duty: string;
  note: string | null;
  endKey: string;
}

/** The "what to do today" LINE message, grouped by project. Null when there is nothing. */
export function dailyTaskMessage(tasks: ReminderTask[]): string | null {
  if (tasks.length === 0) return null;
  const byProject = new Map<string, ReminderTask[]>();
  for (const t of tasks) byProject.set(t.projectName, [...(byProject.get(t.projectName) ?? []), t]);
  const lines = ["📋 งานของคุณวันนี้"];
  for (const [project, list] of byProject) {
    lines.push("", `📁 ${project}`);
    for (const t of list) lines.push(`• ${t.duty}${t.note ? ` (${t.note})` : ""} — ถึง ${t.endKey.split("-").reverse().join("/")}`);
  }
  return lines.join("\n");
}

export interface EveningTask {
  projectName: string;
  duty: string;
  note: string | null;
  startKey: string;
  endKey: string;
  /** The day (Bangkok) it was ticked done, or null while it is open. */
  doneKey: string | null;
}

const dm = (key: string) => key.split("-").reverse().slice(0, 2).join("/");

/** The evening LINE text: what got done today, what is past its date, what is still open today and what starts tomorrow.
 *  Null when there is nothing to say. */
export function eveningTaskMessage(tasks: EveningTask[], todayKey: string): string | null {
  const tomorrow = addDays(todayKey, 1);
  const line = (t: EveningTask, tail: string) => `• ${t.projectName} — ${t.duty}${t.note ? ` (${t.note})` : ""}${tail}`;
  const doneToday = tasks.filter((t) => t.doneKey === todayKey);
  const open = tasks.filter((t) => t.doneKey === null);
  const overdue = open.filter((t) => t.endKey < todayKey);
  const today = open.filter((t) => t.startKey <= todayKey && t.endKey >= todayKey);
  const next = open.filter((t) => t.startKey === tomorrow);
  if (doneToday.length + overdue.length + today.length + next.length === 0) return null;

  const out = ["🌆 สรุปงานของคุณวันนี้"];
  if (doneToday.length > 0) out.push("", `✅ เสร็จวันนี้ ${doneToday.length} งาน`, ...doneToday.map((t) => line(t, "")));
  if (overdue.length > 0) out.push("", "⚠️ เลยกำหนดแล้วยังไม่เสร็จ", ...overdue.map((t) => line(t, ` (ครบ ${dm(t.endKey)})`)));
  if (today.length > 0) out.push("", "🔶 ยังไม่เสร็จของวันนี้", ...today.map((t) => line(t, ` — ถึง ${dm(t.endKey)}`)));
  if (next.length > 0) out.push("", "📅 เริ่มพรุ่งนี้", ...next.map((t) => line(t, "")));
  out.push("", "ติ๊กงานที่เสร็จแล้วได้ที่หน้าโปรเจกต์ (Gantt)");
  return out.join("\n");
}
