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
// detail (e.g. "ออกหน้างาน: Aisin") can be surfaced in the wage report, and
// outsideStartAt/outsideEndAt — set only on a manually-entered day that
// recorded a specific outside-excursion sub-range distinct from the
// overall work time (see resolveOutsideExcursion in app/actions/checkin.ts).
export type WageCheckInEvent = CheckInEvent & {
  note?: string | null;
  outsideStartAt?: Date | null;
  outsideEndAt?: Date | null;
  tripId?: string | null;
};

export interface DailyWageRow {
  dateKey: string;
  wentOutside: boolean;
  otHours: number;
  // Grade whose rates were used for this day (can differ between days when the
  // person's grade changed during the range).
  grade: string;
  // Hours inside the regular 8 (what the base pay is prorated on), the full
  // day rate before proration, and the base pay actually earned for those
  // hours: baseRate = round(dayRate / 8 * regularHours).
  regularHours: number;
  dayRate: number;
  baseRate: number;
  otPay: number;
  rate: number; // baseRate + otPay
  // The first non-empty note from an OUTSIDE check-in that day, if any —
  // usually where the person went (see Attendance's "went outside" note).
  note: string | null;
  // The day's overall work session — first check-in to last check-out
  // (ISO strings — same convention as getRecentOutsideTrips — so this
  // crosses the server action boundary without relying on RSC's Date
  // handling).
  workStartTime: string | null;
  workEndTime: string | null;
  // The specific outside-excursion sub-range *within* the work day, if the
  // day was entered with one (e.g. left the office 13:00, back 15:00).
  // Null when the day has no such recorded sub-range — for a real
  // full-day outside trip that just means the whole work session was the
  // outside period, i.e. workStartTime/workEndTime already cover it.
  outsideStartTime: string | null;
  outsideEndTime: string | null;
  // Set when this day's outside work is tied to an OutsideWorkTrip record
  // — lets the UI link the outside-time text through to that trip's
  // /outside-trip/[id] detail page.
  tripId: string | null;
  // Set by the caller (getWageReport), not by buildDailyWages itself, when
  // an admin has manually overridden this day's pay — buildDailyWages stays
  // a pure grade-math function and knows nothing about WageOverride rows.
  overridden: boolean;
  // The grade-computed rate before the override, kept for context when
  // overridden is true; null otherwise.
  originalRate: number | null;
  overrideNote: string | null;
}

export const OT_MULTIPLIER = 1.5;
export const REGULAR_HOURS_PER_DAY = 8;
// Worked 7.3 on the timesheet (= 7 h 30 min, each ".1" is 10 min) or more
// counts as a full 8 for base pay; below that it is prorated by the hours.
export const ROUND_UP_TO_FULL_DAY_MINUTES = 7.5 * 60;

/** One row per calendar day a graded intern worked. Base pay is prorated by
 *  the hours actually worked, up to the regular 8: dayRate / 8 * hours (6 h at
 *  a 400/day rate = 300), but 7 h 30 min or more counts as the full 8. The day rate is the grade's outsideRate instead of
 *  onsiteRate if any of that day's check-ins were OUTSIDE. Hours past 8 are OT
 *  (computed the same way as the Attendance page, including the
 *  untracked-lunch subtraction and midnight-crossing handling), paid at
 *  dayRate/8 * 1.5 per hour. Everything rounds to the nearest baht.
 *
 *  `grade` can be a function of the day so a mid-range grade change (A until
 *  31 Aug, A+ from 1 Sep) prices each day with the grade in force that day. */
export function buildDailyWages(
  checkIns: WageCheckInEvent[],
  grade: WageGradeRate | ((dateKey: string) => WageGradeRate | null)
): DailyWageRow[] {
  const gradeFor = typeof grade === "function" ? grade : () => grade;
  const outsideByDate = new Map<string, boolean>();
  const noteByDate = new Map<string, string>();
  const outsideStartByDate = new Map<string, Date>();
  const outsideEndByDate = new Map<string, Date>();
  const tripIdByDate = new Map<string, string>();
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
    if (c.outsideStartAt && c.outsideEndAt && !outsideStartByDate.has(dateKey)) {
      outsideStartByDate.set(dateKey, c.outsideStartAt);
      outsideEndByDate.set(dateKey, c.outsideEndAt);
    }
    if (c.tripId && !tripIdByDate.has(dateKey)) {
      tripIdByDate.set(dateKey, c.tripId);
    }
  }

  const summaryRows = buildDailySummary(checkIns);

  return summaryRows
    .flatMap((row) => {
      const dayGrade = gradeFor(row.dateKey);
      return dayGrade ? [{ row, dayGrade }] : [];
    })
    .map(({ row, dayGrade }) => {
      const wentOutside = outsideByDate.get(row.dateKey) ?? false;
      const dayRate = wentOutside ? dayGrade.outsideRate : dayGrade.onsiteRate;
      const workedRegular = Math.min(row.regularHours, REGULAR_HOURS_PER_DAY);
      const regularHours = Math.round(workedRegular * 60) >= ROUND_UP_TO_FULL_DAY_MINUTES ? REGULAR_HOURS_PER_DAY : workedRegular;
      const baseRate = Math.round((dayRate / REGULAR_HOURS_PER_DAY) * regularHours);
      const otPay = Math.round(row.otHours * (dayRate / REGULAR_HOURS_PER_DAY) * OT_MULTIPLIER);
      const outsideStart = outsideStartByDate.get(row.dateKey);
      const outsideEnd = outsideEndByDate.get(row.dateKey);
      return {
        dateKey: row.dateKey,
        wentOutside,
        otHours: row.otHours,
        grade: dayGrade.code,
        regularHours,
        dayRate,
        baseRate,
        otPay,
        rate: baseRate + otPay,
        note: noteByDate.get(row.dateKey) ?? null,
        workStartTime: row.startTime ? row.startTime.toISOString() : null,
        workEndTime: row.endTime ? row.endTime.toISOString() : null,
        outsideStartTime: outsideStart ? outsideStart.toISOString() : null,
        outsideEndTime: outsideEnd ? outsideEnd.toISOString() : null,
        tripId: tripIdByDate.get(row.dateKey) ?? null,
        overridden: false,
        originalRate: null,
        overrideNote: null,
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
