import { bangkokDateKey } from "./datetime";

export type InternGrade = "A" | "B" | "C";

export interface WageSettingsValues {
  gradeARate: number;
  gradeBRate: number;
  gradeCRate: number;
  outsideFlatRate: number;
  gradeAOutsideAllowance: number;
}

export interface WageCheckInEvent {
  location: string;
  createdAt: Date;
}

export interface DailyWageRow {
  dateKey: string;
  wentOutside: boolean;
  rate: number;
}

const GRADE_RATE_KEY: Record<InternGrade, keyof WageSettingsValues> = {
  A: "gradeARate",
  B: "gradeBRate",
  C: "gradeCRate",
};

/** One row per calendar day a graded intern checked in: a flat day-rate (no
 *  partial-day proration — any check-in that day counts the whole day),
 *  bumped to the outside rate if any of that day's check-ins were OUTSIDE.
 *  Grade A's outside rate is its normal rate plus a configurable allowance;
 *  B/C's outside rate replaces their (lower) normal rate with one flat
 *  amount instead of adding an allowance. */
export function buildDailyWages(
  checkIns: WageCheckInEvent[],
  grade: InternGrade,
  settings: WageSettingsValues
): DailyWageRow[] {
  const byDate = new Map<string, boolean>(); // dateKey -> wentOutside that day
  for (const c of checkIns) {
    const dateKey = bangkokDateKey(c.createdAt);
    const wentOutside = (byDate.get(dateKey) ?? false) || c.location === "OUTSIDE";
    byDate.set(dateKey, wentOutside);
  }

  const baseRate = settings[GRADE_RATE_KEY[grade]];
  const rows: DailyWageRow[] = [];
  for (const [dateKey, wentOutside] of byDate) {
    const rate = wentOutside
      ? grade === "A"
        ? baseRate + settings.gradeAOutsideAllowance
        : settings.outsideFlatRate
      : baseRate;
    rows.push({ dateKey, wentOutside, rate });
  }

  return rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Distinct Bangkok calendar days with at least one OUTSIDE check-in — the
 *  "accumulated meals" count shown on a profile, one per person per day they
 *  went out ("คนละมื้อ"). Applies to everyone, not just graded interns. */
export function countMealDays(checkIns: WageCheckInEvent[]): number {
  const days = new Set<string>();
  for (const c of checkIns) {
    if (c.location === "OUTSIDE") days.add(bangkokDateKey(c.createdAt));
  }
  return days.size;
}
