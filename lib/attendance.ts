export interface CheckInEvent {
  type: string;
  location: string;
  createdAt: Date;
}

export interface DailySummaryRow {
  dateKey: string; // YYYY-MM-DD, local time
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

/** Groups check-in/out events by local calendar day and computes worked hours,
 *  splitting anything past REGULAR_HOURS_CAP into overtime. */
export function buildDailySummary(checkIns: CheckInEvent[]): DailySummaryRow[] {
  const byDate = new Map<string, CheckInEvent[]>();

  for (const c of checkIns) {
    const dateKey = c.createdAt.toLocaleDateString("en-CA");
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(c);
  }

  const rows: DailySummaryRow[] = [];
  for (const [dateKey, events] of byDate) {
    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstIn = events.find((e) => e.type === "IN");
    const lastOut = [...events].reverse().find((e) => e.type === "OUT");
    const lastEvent = events[events.length - 1];

    const startTime = firstIn?.createdAt || null;
    const endTime = lastOut?.createdAt || null;

    let totalHours = 0;
    if (startTime && endTime && endTime.getTime() > startTime.getTime()) {
      totalHours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
    }
    const regularHours = Math.min(totalHours, REGULAR_HOURS_CAP);
    const otHours = Math.max(0, totalHours - REGULAR_HOURS_CAP);

    rows.push({
      dateKey,
      startTime,
      endTime,
      location: firstIn?.location || lastEvent.location,
      stillWorking: lastEvent.type === "IN",
      totalHours,
      regularHours,
      otHours,
    });
  }

  return rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}
