import { bangkokDateKey } from "./datetime";

export interface CheckInEvent {
  type: string;
  location: string;
  createdAt: Date;
}

export interface DailySummaryRow {
  dateKey: string; // YYYY-MM-DD, Asia/Bangkok calendar day
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
  stillWorking: boolean;
  totalHours: number;
  regularHours: number;
  otHours: number;
}

const REGULAR_HOURS_CAP = 8;

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\r\n");
}

/** Groups check-in/out events by local calendar day and computes worked hours.
 *  Sums every completed IN→OUT session that day (so a lunch break or a
 *  second check-in/out cycle is counted correctly, not just first-in to
 *  last-out), then splits anything past REGULAR_HOURS_CAP into overtime. */
export function buildDailySummary(checkIns: CheckInEvent[]): DailySummaryRow[] {
  const byDate = new Map<string, CheckInEvent[]>();

  for (const c of checkIns) {
    const dateKey = bangkokDateKey(c.createdAt);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(c);
  }

  const rows: DailySummaryRow[] = [];
  for (const [dateKey, events] of byDate) {
    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstIn = events.find((e) => e.type === "IN");
    const lastOut = [...events].reverse().find((e) => e.type === "OUT");
    const lastEvent = events[events.length - 1];

    let totalMs = 0;
    let openIn: Date | null = null;
    for (const event of events) {
      if (event.type === "IN") {
        if (!openIn) openIn = event.createdAt;
      } else if (event.type === "OUT" && openIn) {
        totalMs += event.createdAt.getTime() - openIn.getTime();
        openIn = null;
      }
    }

    const totalHours = totalMs / 3_600_000;
    const regularHours = Math.min(totalHours, REGULAR_HOURS_CAP);
    const otHours = Math.max(0, totalHours - REGULAR_HOURS_CAP);

    rows.push({
      dateKey,
      startTime: firstIn?.createdAt || null,
      endTime: lastOut?.createdAt || null,
      location: firstIn?.location || lastEvent.location,
      stillWorking: openIn !== null,
      totalHours,
      regularHours,
      otHours,
    });
  }

  return rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}
