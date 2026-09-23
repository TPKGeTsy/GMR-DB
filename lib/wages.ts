import { bangkokDateKey } from "./datetime";

export interface WageGradeRate {
  code: string;
  onsiteRate: number;
  outsideRate: number;
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

/** One row per calendar day a graded intern checked in: a flat day-rate (no
 *  partial-day proration — any check-in that day counts the whole day),
 *  using the grade's outsideRate instead of onsiteRate if any of that day's
 *  check-ins were OUTSIDE. Both rates are set directly by an admin per
 *  grade — no formula (allowance, flat bump, etc.) tying them together, so
 *  any grade can be shaped however HR wants. */
export function buildDailyWages(checkIns: WageCheckInEvent[], grade: WageGradeRate): DailyWageRow[] {
  const byDate = new Map<string, boolean>(); // dateKey -> wentOutside that day
  for (const c of checkIns) {
    const dateKey = bangkokDateKey(c.createdAt);
    const wentOutside = (byDate.get(dateKey) ?? false) || c.location === "OUTSIDE";
    byDate.set(dateKey, wentOutside);
  }

  const rows: DailyWageRow[] = [];
  for (const [dateKey, wentOutside] of byDate) {
    rows.push({ dateKey, wentOutside, rate: wentOutside ? grade.outsideRate : grade.onsiteRate });
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
