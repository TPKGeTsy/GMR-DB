import { bangkokDateKey } from "./datetime";
import { buildDailySummary, type CheckInEvent } from "./attendance";

export interface WageGradeRate {
  code: string;
  onsiteRate: number;
  outsideRate: number;
}

// Extends CheckInEvent (needs `type` for buildDailySummary to pair IN/OUT
// sessions correctly, including ones spanning past midnight) rather than
// just {location, createdAt}, plus `note` so an outside day's location
// detail (e.g. "ออกหน้างาน: Aisin") can be surfaced in the wage report.
export type WageCheckInEvent = CheckInEvent & { note?: string | null };

export interface DailyWageRow {
  dateKey: string;
  wentOutside: boolean;
  otHours: number;
  baseRate: number;
  otPay: number;
  rate: number; // baseRate + otPay
  // The first non-empty note from an OUTSIDE check-in that day, if any —
  // usually where the person went (see Attendance's "went outside" note).
  note: string | null;
  // First check-in / last check-out of the day, for showing what time an
  // outside-work day actually ran (ISO strings — same convention as
  // getRecentOutsideTrips — so this crosses the server action boundary
  // without relying on RSC's Date handling).
  startTime: string | null;
  endTime: string | null;
}

const OT_MULTIPLIER = 1.5;
const REGULAR_HOURS_PER_DAY = 8;

/** One row per calendar day a graded intern worked: a flat day-rate (no
 *  partial-day proration for the base pay) using the grade's outsideRate
 *  instead of onsiteRate if any of that day's check-ins were OUTSIDE, plus
 *  OT pay on top — OT hours (computed the same way as the Attendance page,
 *  including the untracked-lunch subtraction and midnight-crossing
 *  handling) times an hourly rate derived from that day's own rate
 *  (rate/8 * 1.5), rounded to the nearest baht. */
export function buildDailyWages(checkIns: WageCheckInEvent[], grade: WageGradeRate): DailyWageRow[] {
  const outsideByDate = new Map<string, boolean>();
  const noteByDate = new Map<string, string>();
  for (const c of checkIns) {
    const dateKey = bangkokDateKey(c.createdAt);
    const wentOutside = (outsideByDate.get(dateKey) ?? false) || c.location === "OUTSIDE";
    outsideByDate.set(dateKey, wentOutside);
    if (c.location === "OUTSIDE" && c.note?.trim() && !noteByDate.has(dateKey)) {
      // The manual-entry note is prefixed with the hours summary (e.g.
      // "แก้ไขโดยแอดมิน: 8.0 ชม. — ออกหน้างาน: Aisin") — strip that down to
      // just the location detail. A trip/kiosk note has no such prefix, so
      // it's used as-is.
      const raw = c.note.trim();
      const marker = "ออกหน้างาน: ";
      const markerIndex = raw.indexOf(marker);
      noteByDate.set(dateKey, markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw);
    }
  }

  const summaryRows = buildDailySummary(checkIns);

  return summaryRows
    .map((row) => {
      const wentOutside = outsideByDate.get(row.dateKey) ?? false;
      const baseRate = wentOutside ? grade.outsideRate : grade.onsiteRate;
      const otPay = Math.round(row.otHours * (baseRate / REGULAR_HOURS_PER_DAY) * OT_MULTIPLIER);
      return {
        dateKey: row.dateKey,
        wentOutside,
        otHours: row.otHours,
        baseRate,
        otPay,
        rate: baseRate + otPay,
        note: noteByDate.get(row.dateKey) ?? null,
        startTime: row.startTime ? row.startTime.toISOString() : null,
        endTime: row.endTime ? row.endTime.toISOString() : null,
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Distinct Bangkok calendar days with at least one *meal-counted* OUTSIDE
 *  check-in — the "accumulated meals" count shown on a profile, one per
 *  person per day they went out ("คนละมื้อ"). Applies to everyone, not just
 *  graded interns. `mealCounted` defaults to true (every outside day earns
 *  a meal) — an admin can turn it off per day from the Attendance table for
 *  a trip that didn't actually include one; a day only drops out once every
 *  OUTSIDE check-in on it has been turned off. */
export function countMealDays(checkIns: { location: string; createdAt: Date; mealCounted?: boolean }[]): number {
  const anyCountedByDate = new Map<string, boolean>();
  for (const c of checkIns) {
    if (c.location !== "OUTSIDE") continue;
    const dateKey = bangkokDateKey(c.createdAt);
    const counted = (c.mealCounted ?? true) || (anyCountedByDate.get(dateKey) ?? false);
    anyCountedByDate.set(dateKey, counted);
  }
  return Array.from(anyCountedByDate.values()).filter(Boolean).length;
}
