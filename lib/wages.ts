import { bangkokDateKey } from "./datetime";
import { buildDailySummary, type CheckInEvent } from "./attendance";

export interface WageGradeRate {
  code: string;
  onsiteRate: number;
  outsideRate: number;
}

// Extends CheckInEvent (needs `type` for buildDailySummary to pair IN/OUT
// sessions correctly, including ones spanning past midnight) rather than
// just {location, createdAt}.
export type WageCheckInEvent = CheckInEvent;

export interface DailyWageRow {
  dateKey: string;
  wentOutside: boolean;
  otHours: number;
  baseRate: number;
  otPay: number;
  rate: number; // baseRate + otPay
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
  for (const c of checkIns) {
    const dateKey = bangkokDateKey(c.createdAt);
    const wentOutside = (outsideByDate.get(dateKey) ?? false) || c.location === "OUTSIDE";
    outsideByDate.set(dateKey, wentOutside);
  }

  const summaryRows = buildDailySummary(checkIns);

  return summaryRows
    .map((row) => {
      const wentOutside = outsideByDate.get(row.dateKey) ?? false;
      const baseRate = wentOutside ? grade.outsideRate : grade.onsiteRate;
      const otPay = Math.round(row.otHours * (baseRate / REGULAR_HOURS_PER_DAY) * OT_MULTIPLIER);
      return { dateKey: row.dateKey, wentOutside, otHours: row.otHours, baseRate, otPay, rate: baseRate + otPay };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Distinct Bangkok calendar days with at least one OUTSIDE check-in — the
 *  "accumulated meals" count shown on a profile, one per person per day they
 *  went out ("คนละมื้อ"). Applies to everyone, not just graded interns. */
export function countMealDays(checkIns: { location: string; createdAt: Date }[]): number {
  const days = new Set<string>();
  for (const c of checkIns) {
    if (c.location === "OUTSIDE") days.add(bangkokDateKey(c.createdAt));
  }
  return days.size;
}
