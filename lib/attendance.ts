import { bangkokDateKey } from "./datetime";

export interface CheckInEvent {
  type: string;
  location: string;
  createdAt: Date;
  // Overrides where OT/hour-math for the session this IN opens starts
  // counting from (e.g. 09:00 for someone who checked in early but told the
  // bot they weren't actually working yet) — the raw createdAt is still
  // what's displayed as the check-in time, only the hour math shifts.
  otStartOverride?: Date | null;
}

export interface DailySummaryRow {
  dateKey: string; // YYYY-MM-DD, Asia/Bangkok calendar day
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
  stillWorking: boolean;
  // The still-open IN's timestamp when stillWorking is true, else null —
  // lets a caller compute a live "hours so far" instead of the frozen
  // totalHours below, which only counts sessions that have already closed.
  openSince: Date | null;
  totalHours: number;
  regularHours: number;
  otHours: number;
}

export const REGULAR_HOURS_CAP = 8;
// Lunch isn't tracked as its own check-out/in, so a single IN→OUT session
// spanning a full workday silently includes an untracked lunch break inside
// it. Any session longer than a full 8h workday must have had one, so we
// subtract it before counting hours — e.g. check in→out across 9 elapsed
// hours (8 work + 1 lunch) should read as 8 worked hours, not 9.
export const LUNCH_BREAK_HOURS = 1;
// Below this, "OT" is almost always just checking out a few minutes late,
// not real overtime — not worth flagging (and it clutters the OT summary).
// totalHours still reflects the true elapsed time; only the otHours flag/count
// gets zeroed out.
export const MIN_OT_HOURS = 1;

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

interface Session {
  start: Date; // raw check-in time, for display
  hoursStart: Date; // start, or its otStartOverride — what hour/OT math uses
  end: Date | null; // null = still open (no matching OUT yet)
  location: string;
}

/** Pairs IN events with the next OUT chronologically, across the *entire*
 *  event list — deliberately not scoped to a single calendar day, so an
 *  overnight session (IN one day, OUT the next) stays one session instead
 *  of having its OUT silently stranded in a different day's bucket with no
 *  open IN to close, which used to drop that whole session's hours. */
function pairSessions(checkIns: CheckInEvent[]): Session[] {
  const sorted = [...checkIns].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const sessions: Session[] = [];
  let openStart: Date | null = null;
  let openHoursStart: Date | null = null;
  let openLocation: string | null = null;
  for (const event of sorted) {
    if (event.type === "IN") {
      if (!openStart) {
        openStart = event.createdAt;
        openHoursStart = event.otStartOverride ?? event.createdAt;
        openLocation = event.location;
      }
    } else if (event.type === "OUT" && openStart) {
      sessions.push({ start: openStart, hoursStart: openHoursStart!, end: event.createdAt, location: openLocation! });
      openStart = null;
      openHoursStart = null;
      openLocation = null;
    }
  }
  if (openStart) {
    sessions.push({ start: openStart, hoursStart: openHoursStart!, end: null, location: openLocation! });
  }

  return sessions;
}

/** Groups check-in/out events by local calendar day and computes worked hours.
 *  Sums every completed IN→OUT session that day (so a lunch break or a
 *  second check-in/out cycle is counted correctly, not just first-in to
 *  last-out), then splits anything past REGULAR_HOURS_CAP into overtime.
 *  A session is attributed to the day it *started* — so an overnight OT
 *  shift's hours show up entirely on the day it began, not split (or lost)
 *  across the midnight boundary. */
export function buildDailySummary(checkIns: CheckInEvent[]): DailySummaryRow[] {
  const sessions = pairSessions(checkIns);

  const byDate = new Map<string, Session[]>();
  for (const session of sessions) {
    const dateKey = bangkokDateKey(session.start);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(session);
  }

  const rows: DailySummaryRow[] = [];
  for (const [dateKey, daySessions] of byDate) {
    let totalMs = 0;
    for (const session of daySessions) {
      if (session.end === null) continue;
      let sessionMs = session.end.getTime() - session.hoursStart.getTime();
      if (sessionMs > REGULAR_HOURS_CAP * 3_600_000) {
        sessionMs -= LUNCH_BREAK_HOURS * 3_600_000;
      }
      totalMs += sessionMs;
    }

    const totalHours = totalMs / 3_600_000;
    const regularHours = Math.min(totalHours, REGULAR_HOURS_CAP);
    const rawOtHours = Math.max(0, totalHours - REGULAR_HOURS_CAP);
    const otHours = rawOtHours < MIN_OT_HOURS ? 0 : rawOtHours;

    const lastSession = daySessions[daySessions.length - 1];
    const stillWorking = lastSession.end === null;

    rows.push({
      dateKey,
      startTime: daySessions[0].start,
      endTime: stillWorking ? null : lastSession.end,
      location: daySessions[0].location,
      stillWorking,
      openSince: stillWorking ? lastSession.hoursStart : null,
      totalHours,
      regularHours,
      otHours,
    });
  }

  return rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export interface IdentifiedCheckInEvent extends CheckInEvent {
  id: string;
}

/** Row ids (IN and its matching OUT, if any) for every session whose
 *  *start* falls on the given Bangkok calendar day — the same "attributed
 *  to the day it started" rule buildDailySummary uses, but returning the
 *  underlying check-in row ids instead of computed hours. For an admin
 *  editing or deleting a manually-recorded day: a session that spills past
 *  midnight (e.g. a large OT entry) has its OUT on the *next* calendar day,
 *  which a plain "delete everything created on this day" query would miss
 *  and leave stranded as an orphan row. */
export function findSessionRowIdsStartingOn(checkIns: IdentifiedCheckInEvent[], dateKey: string): string[] {
  const sorted = [...checkIns].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const matchedIds: string[] = [];
  let openStart: Date | null = null;
  let openIds: string[] = [];
  for (const event of sorted) {
    if (event.type === "IN") {
      if (!openStart) {
        openStart = event.createdAt;
        openIds = [event.id];
      }
    } else if (event.type === "OUT" && openStart) {
      openIds.push(event.id);
      if (bangkokDateKey(openStart) === dateKey) matchedIds.push(...openIds);
      openStart = null;
      openIds = [];
    }
  }
  if (openStart && bangkokDateKey(openStart) === dateKey) {
    matchedIds.push(...openIds);
  }

  return matchedIds;
}
